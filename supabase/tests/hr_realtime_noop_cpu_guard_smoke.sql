-- HR Realtime no-op CPU guard contract.
-- Full database replay must keep both the Realtime contract and no-op guards.
--
-- employee_point_events remains intentionally published because the Business OS
-- uses it to refresh the points UI. Therefore the HR persistence path must not
-- manufacture UPDATE/WAL events when neither the HR snapshot nor a point row
-- actually changed.

do $$
declare
  v_wrapper text;
  v_unchecked text;
  v_v36 text;
  v_preflight integer;
  v_exact_noop integer;
  v_revision_guard integer;
  v_expensive_writer integer;
  v_point_authority integer;
  v_v36_call integer;
  v_conflict_update integer;
  v_distinct_guard integer;
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='employee_point_events'
  ) then
    raise exception 'employee_point_events unexpectedly left the Realtime publication';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.save_hr_operational_state_v36_internal(bigint,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'HR v36 internal writer became directly executable by authenticated users';
  end if;

  select lower(pg_get_functiondef('public.save_hr_operational_state(bigint,jsonb)'::regprocedure))
  into v_wrapper;

  v_preflight := position('select revision, snapshot, updated_at' in v_wrapper);
  v_exact_noop := position('if v_current_snapshot = p_snapshot then' in v_wrapper);
  v_revision_guard := position('if p_expected_revision is null or v_current_revision <> p_expected_revision then' in v_wrapper);
  v_expensive_writer := position('v_result := public.save_hr_operational_state_unchecked' in v_wrapper);

  if v_preflight=0 or v_exact_noop=0 or v_revision_guard=0 or v_expensive_writer=0
     or not (v_preflight < v_exact_noop
             and v_exact_noop < v_revision_guard
             and v_revision_guard < v_expensive_writer) then
    raise exception 'Exact HR replay no longer fast-returns before revision/error and expensive writer paths';
  end if;

  select lower(pg_get_functiondef('public.save_hr_operational_state_unchecked(bigint,jsonb)'::regprocedure))
  into v_unchecked;

  v_point_authority := position('from public.employee_point_events e' in v_unchecked);
  v_v36_call := position('return public.save_hr_operational_state_v36_internal' in v_unchecked);
  if v_point_authority=0 or v_v36_call=0 or v_point_authority >= v_v36_call then
    raise exception 'Unchecked HR writer no longer canonicalizes points from the authoritative table before v36';
  end if;

  select lower(pg_get_functiondef('public.save_hr_operational_state_v36_internal(bigint,jsonb)'::regprocedure))
  into v_v36;

  v_conflict_update := position('on conflict(employee_id,source_id)' in v_v36);
  v_distinct_guard := position('is distinct from row(' in v_v36);
  if v_conflict_update=0 or v_distinct_guard=0 or v_distinct_guard <= v_conflict_update then
    raise exception 'employee_point_events UPSERT lost its no-op UPDATE guard';
  end if;

  if position('coalesce(excluded.source_order_id,public.employee_point_events.source_order_id)' in v_v36)=0
     or position('coalesce(excluded.source_order_number,public.employee_point_events.source_order_number)' in v_v36)=0 then
    raise exception 'Point UPSERT no-op guard changed existing source-order preservation semantics';
  end if;
end $$;
