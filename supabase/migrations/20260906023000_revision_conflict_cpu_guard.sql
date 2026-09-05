-- Revision-conflict CPU guard.
--
-- Production telemetry showed stale HR/order clients repeatedly reaching the
-- expensive authoritative writers before failing with SQLSTATE 40001. Keep
-- optimistic concurrency semantics, but reject obviously stale requests with
-- cheap revision reads before JSON canonicalization, attendance projection,
-- point aggregation, or row-lock contention. The inner writers still perform
-- their original locked revision checks, so this is only a fast-fail layer.

begin;

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

  -- Fast stale-client guard. This deliberately happens before
  -- save_hr_operational_state_unchecked(), whose canonicalization joins
  -- attendance records and rebuilds the employee-point projection.
  select revision, snapshot, updated_at
  into v_current_revision, v_current_snapshot, v_current_updated_at
  from private.operational_domain_state
  where domain='hr';

  if found then
    if p_expected_revision is null or v_current_revision <> p_expected_revision then
      -- Preserve the useful idempotent case without running the expensive
      -- projection pipeline: an exact already-saved snapshot is success.
      if v_current_snapshot = p_snapshot then
        return jsonb_build_object(
          'domain','hr',
          'revision',v_current_revision,
          'snapshot',v_current_snapshot,
          'updatedAt',v_current_updated_at
        );
      end if;

      raise exception 'REVISION_CONFLICT:hr:expected=%:actual=%',
        p_expected_revision,v_current_revision
        using errcode='40001';
    end if;
  elsif coalesce(p_expected_revision, -1) <> 0 then
    raise exception 'REVISION_CONFLICT:hr:expected=%:actual=0',
      p_expected_revision
      using errcode='40001';
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

  -- Mirror the early identity/branch checks from the locked inner writer so
  -- this optimization never reveals revision data beyond the existing write
  -- boundary.
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

  -- Reject stale requests before waiting on FOR UPDATE or parsing complete
  -- order/item/payment JSON snapshots. The inner writer repeats this check
  -- under row lock to preserve race safety.
  if p_expected_revision is null or v_actual_revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT:order:%:expected=%:actual=%',
      p_order_id,p_expected_revision,v_actual_revision
      using errcode='40001';
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

commit;
