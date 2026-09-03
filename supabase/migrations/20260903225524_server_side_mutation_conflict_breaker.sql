-- Server-side circuit breaker for stale browser clients that repeatedly submit
-- revision-conflicted HR or Order mutations. A session is blocked for 15 minutes
-- after 3 conflicts for the same scope within 5 seconds. Successful writes clear
-- the session/scope streak. This keeps the database safe even before old tabs reload.
-- This migration is intentionally covered by the repository's full Supabase replay gate.

create table private.mutation_conflict_circuits (
  session_hash text not null,
  scope text not null,
  window_started_at timestamptz not null default clock_timestamp(),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (session_hash, scope)
);

revoke all on table private.mutation_conflict_circuits from public, anon, authenticated;

alter function public.save_hr_operational_state(bigint,jsonb)
  rename to save_hr_operational_state_unchecked;
alter function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  rename to save_order_operational_state_unchecked;

revoke all on function public.save_hr_operational_state_unchecked(bigint,jsonb) from public, anon, authenticated;
revoke all on function public.save_order_operational_state_unchecked(text,integer,integer,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_hr_operational_state_unchecked(bigint,jsonb) to service_role;
grant execute on function public.save_order_operational_state_unchecked(text,integer,integer,jsonb,jsonb,jsonb) to service_role;

create or replace function private.current_mutation_session_hash()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(coalesce(
    (select auth.jwt()->>'session_id'),
    (select auth.uid())::text,
    'missing-session'
  ));
$$;

create or replace function private.mutation_conflict_circuit_is_blocked(p_scope text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from private.mutation_conflict_circuits c
    where c.session_hash = private.current_mutation_session_hash()
      and c.scope = p_scope
      and c.blocked_until > clock_timestamp()
  );
$$;

create or replace function private.register_mutation_conflict(p_scope text)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_hash text := private.current_mutation_session_hash();
  v_now timestamptz := clock_timestamp();
  v_row private.mutation_conflict_circuits%rowtype;
begin
  insert into private.mutation_conflict_circuits as c (
    session_hash, scope, window_started_at, conflict_count, blocked_until, updated_at
  ) values (
    v_hash, p_scope, v_now, 1, null, v_now
  )
  on conflict (session_hash, scope) do update
  set
    window_started_at = case
      when c.blocked_until > v_now then c.window_started_at
      when c.window_started_at >= v_now - interval '5 seconds' then c.window_started_at
      else v_now
    end,
    conflict_count = case
      when c.blocked_until > v_now then c.conflict_count
      when c.window_started_at >= v_now - interval '5 seconds' then c.conflict_count + 1
      else 1
    end,
    blocked_until = case
      when c.blocked_until > v_now then c.blocked_until
      when c.window_started_at >= v_now - interval '5 seconds' and c.conflict_count + 1 >= 3
        then v_now + interval '15 minutes'
      else null
    end,
    updated_at = v_now
  returning * into v_row;

  return coalesce(v_row.blocked_until > v_now, false);
end;
$$;

create or replace function private.clear_mutation_conflict(p_scope text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from private.mutation_conflict_circuits
  where session_hash = private.current_mutation_session_hash()
    and scope = p_scope;
$$;

revoke all on function private.current_mutation_session_hash() from public, anon, authenticated;
revoke all on function private.mutation_conflict_circuit_is_blocked(text) from public, anon, authenticated;
revoke all on function private.register_mutation_conflict(text) from public, anon, authenticated;
revoke all on function private.clear_mutation_conflict(text) from public, anon, authenticated;

create or replace function public.save_hr_operational_state(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_scope constant text := 'hr';
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if private.mutation_conflict_circuit_is_blocked(v_scope) then
    raise exception 'MUTATION_CONFLICT_CIRCUIT_OPEN:hr' using errcode='42501';
  end if;

  begin
    v_result := public.save_hr_operational_state_unchecked(p_expected_revision, p_snapshot);
  exception
    when serialization_failure then
      if private.register_mutation_conflict(v_scope) then
        raise exception 'MUTATION_CONFLICT_CIRCUIT_OPEN:hr' using errcode='42501';
      end if;
      raise;
  end;

  perform private.clear_mutation_conflict(v_scope);
  return v_result;
end;
$$;

create or replace function public.save_order_operational_state(
  p_order_id text,
  p_expected_revision integer,
  p_next_revision integer,
  p_state jsonb,
  p_items jsonb default '[]'::jsonb,
  p_payment_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_scope text := 'order:' || coalesce(p_order_id, 'missing');
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if private.mutation_conflict_circuit_is_blocked(v_scope) then
    raise exception 'MUTATION_CONFLICT_CIRCUIT_OPEN:order' using errcode='42501';
  end if;

  begin
    v_result := public.save_order_operational_state_unchecked(
      p_order_id,
      p_expected_revision,
      p_next_revision,
      p_state,
      p_items,
      p_payment_events
    );
  exception
    when serialization_failure then
      if private.register_mutation_conflict(v_scope) then
        raise exception 'MUTATION_CONFLICT_CIRCUIT_OPEN:order' using errcode='42501';
      end if;
      raise;
  end;

  perform private.clear_mutation_conflict(v_scope);
  return v_result;
end;
$$;

revoke all on function public.save_hr_operational_state(bigint,jsonb) from public, anon;
revoke all on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated, service_role;
grant execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
