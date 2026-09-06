-- Second-layer protection against valid-write feedback loops.
--
-- Conflict breakers only stop stale-revision loops. A buggy client can still
-- submit technically valid/current-revision writes fast enough to overload the
-- database. Add two independent backstops:
--   1. suppress physically identical UPDATEs on employee_point_events at the
--      table boundary, regardless of which RPC issues them;
--   2. rate-limit accepted full-state HR/Order saves per auth session/scope.
--
-- Exact no-op HR replays return before consuming the rate budget. Revision
-- conflicts keep their existing conflict-circuit behavior.

begin;

create table if not exists private.mutation_rate_circuits (
  session_hash text not null,
  scope text not null,
  window_started_at timestamptz not null default clock_timestamp(),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (session_hash, scope)
);

revoke all on table private.mutation_rate_circuits from public, anon, authenticated;

create or replace function private.consume_mutation_rate_budget(
  p_scope text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_hash text := private.current_mutation_session_hash();
  v_now timestamptz := clock_timestamp();
  v_blocked_until timestamptz;
  v_window interval;
  v_block interval;
begin
  if p_scope is null or btrim(p_scope) = ''
     or p_limit < 1
     or p_window_seconds < 1
     or p_block_seconds < 1 then
    raise exception 'INVALID_MUTATION_RATE_BUDGET' using errcode='22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);
  v_block := make_interval(secs => p_block_seconds);

  -- Once open, retries stay cheap: one indexed read and no write amplification.
  select blocked_until
  into v_blocked_until
  from private.mutation_rate_circuits
  where session_hash=v_hash and scope=p_scope;

  if found and v_blocked_until > v_now then
    return false;
  end if;

  insert into private.mutation_rate_circuits as c (
    session_hash, scope, window_started_at, accepted_count, blocked_until, updated_at
  ) values (
    v_hash, p_scope, v_now, 1, null, v_now
  )
  on conflict (session_hash, scope) do update
  set
    window_started_at = case
      when c.window_started_at >= v_now - v_window then c.window_started_at
      else v_now
    end,
    accepted_count = case
      when c.window_started_at >= v_now - v_window then c.accepted_count + 1
      else 1
    end,
    blocked_until = case
      when c.window_started_at >= v_now - v_window
       and c.accepted_count + 1 > p_limit
        then v_now + v_block
      else null
    end,
    updated_at = v_now
  returning blocked_until into v_blocked_until;

  return coalesce(v_blocked_until <= v_now, true);
end;
$$;

revoke all on function private.consume_mutation_rate_budget(text,integer,integer,integer)
from public, anon, authenticated;

create or replace function private.skip_identical_row_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new is not distinct from old then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.skip_identical_row_update() from public, anon, authenticated;

drop trigger if exists employee_point_events_skip_identical_update on public.employee_point_events;
create trigger employee_point_events_skip_identical_update
before update on public.employee_point_events
for each row execute function private.skip_identical_row_update();

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
  v_current_revision bigint;
  v_current_snapshot jsonb;
  v_current_updated_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if private.mutation_conflict_circuit_is_blocked(v_scope) then
    raise exception 'MUTATION_CONFLICT_CIRCUIT_OPEN:hr' using errcode='42501';
  end if;

  select revision, snapshot, updated_at
  into v_current_revision, v_current_snapshot, v_current_updated_at
  from private.operational_domain_state
  where domain='hr';

  if found then
    -- Exact replay never reaches the expensive writer and does not consume the
    -- accepted-write budget.
    if v_current_snapshot = p_snapshot then
      return jsonb_build_object(
        'domain','hr',
        'revision',v_current_revision,
        'snapshot',v_current_snapshot,
        'updatedAt',v_current_updated_at
      );
    end if;

    if p_expected_revision is null or v_current_revision <> p_expected_revision then
      raise exception 'REVISION_CONFLICT:hr:expected=%:actual=%',
        p_expected_revision,v_current_revision
        using errcode='40001';
    end if;
  elsif coalesce(p_expected_revision, -1) <> 0 then
    raise exception 'REVISION_CONFLICT:hr:expected=%:actual=0',
      p_expected_revision
      using errcode='40001';
  end if;

  -- Ten accepted full HR writes inside five seconds is already far beyond a
  -- normal human workflow. Block that session/scope for two minutes instead of
  -- letting a valid-revision feedback loop consume CPU indefinitely.
  if not private.consume_mutation_rate_budget(v_scope, 10, 5, 120) then
    raise exception 'MUTATION_RATE_CIRCUIT_OPEN:hr' using errcode='42501';
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
  v_profile public.staff_access_profiles%rowtype;
  v_branch_id text;
  v_actual_revision integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if private.mutation_conflict_circuit_is_blocked(v_scope) then
    raise exception 'MUTATION_CONFLICT_CIRCUIT_OPEN:order' using errcode='42501';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid())
    and is_active=true
  limit 1;

  if not found or v_profile.role not in ('owner','admin','finance','florist') then
    raise exception 'ORDER_WRITE_FORBIDDEN' using errcode='42501';
  end if;

  select branch_id, revision
  into v_branch_id, v_actual_revision
  from public.orders
  where id=p_order_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
  end if;

  if v_profile.role='admin'
     and (private.current_staff_branch_id() is null or private.current_staff_branch_id() <> v_branch_id)
  then
    raise exception 'ORDER_OUTSIDE_BRANCH_SCOPE' using errcode='42501';
  end if;

  if p_expected_revision is null or v_actual_revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT:order:%:expected=%:actual=%',
      p_order_id,p_expected_revision,v_actual_revision
      using errcode='40001';
  end if;

  -- Order editing can legitimately be busier than HR, but twenty accepted
  -- full-state saves for the same order in five seconds is still a feedback loop.
  if not private.consume_mutation_rate_budget(v_scope, 20, 5, 120) then
    raise exception 'MUTATION_RATE_CIRCUIT_OPEN:order' using errcode='42501';
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
grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated, service_role;
revoke all on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
