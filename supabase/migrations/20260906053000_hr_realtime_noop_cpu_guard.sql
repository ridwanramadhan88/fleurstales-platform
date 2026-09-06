-- Stop HR save -> employee_point_events -> Realtime CPU amplification.
--
-- Production telemetry showed employee_point_events with only 12 inserted rows
-- but more than 30 million UPDATEs. The HR save pipeline first canonicalizes
-- employeePointEntries from this authoritative table, then v36 UPSERTed those
-- same rows back into the table unconditionally. Because employee_point_events
-- is intentionally published to Supabase Realtime, every no-op UPDATE created
-- WAL and forced Realtime/RLS work even though no business data changed.
--
-- Keep the normalized table and Realtime contract intact. Make the writer
-- idempotent instead:
--   1. exact already-saved HR snapshots return before the expensive writer;
--   2. point UPSERTs physically UPDATE only when the effective row would change.

begin;

create or replace function public.save_hr_operational_state_v36_internal(
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
  v_item jsonb;
  v_points jsonb;
  v_canonical_snapshot jsonb:=coalesce(p_snapshot,'{}'::jsonb);
begin
  -- The normalized table is the persistence authority. The HR JSON array is
  -- rebuilt from it before the legacy operational snapshot is committed.
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'employeePointEntries','[]'::jsonb)) loop
    insert into public.employee_point_events(
      id,employee_id,category,source_order_id,source_order_number,points,
      effective_date,payroll_period_id,status,metadata,created_at,source_type,
      source_id,reason,created_by,reviewed_by,reviewed_at,review_note,
      reversed_by_entry_id
    )
    values(
      v_item->>'id',v_item->>'employeeId',v_item->>'category',
      (select id from public.orders where order_number=v_item->>'orderNumber' limit 1),
      nullif(v_item->>'orderNumber',''),coalesce((v_item->>'points')::integer,0),
      coalesce(nullif(v_item->>'effectiveDate','')::date,timezone('Asia/Jakarta',now())::date),
      coalesce(nullif(v_item->>'payrollPeriodId',''),private.payroll_period_for_date(coalesce(nullif(v_item->>'effectiveDate','')::date,timezone('Asia/Jakarta',now())::date))),
      coalesce(v_item->>'status','pending'),
      coalesce(v_item-'id'-'employeeId'-'category'-'points'-'effectiveDate'-'payrollPeriodId'-'status'-'createdAt'-'sourceType'-'sourceId'-'reason'-'createdBy'-'reviewedBy'-'reviewedAt'-'reviewNote'-'reversedByEntryId'-'orderNumber','{}'::jsonb),
      coalesce(nullif(v_item->>'createdAt','')::timestamptz,now()),
      coalesce(nullif(v_item->>'sourceType',''),'manual'),
      coalesce(nullif(v_item->>'sourceId',''),'entry:'||(v_item->>'id')),
      v_item->>'reason',v_item->>'createdBy',v_item->>'reviewedBy',
      nullif(v_item->>'reviewedAt','')::timestamptz,v_item->>'reviewNote',
      v_item->>'reversedByEntryId'
    )
    on conflict(employee_id,source_id) where source_id is not null do update set
      category=excluded.category,
      source_order_id=coalesce(excluded.source_order_id,public.employee_point_events.source_order_id),
      source_order_number=coalesce(excluded.source_order_number,public.employee_point_events.source_order_number),
      points=excluded.points,effective_date=excluded.effective_date,
      payroll_period_id=excluded.payroll_period_id,status=excluded.status,
      metadata=excluded.metadata,source_type=excluded.source_type,
      reason=excluded.reason,created_by=excluded.created_by,
      reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,
      review_note=excluded.review_note,
      reversed_by_entry_id=excluded.reversed_by_entry_id
    where row(
      public.employee_point_events.category,
      public.employee_point_events.source_order_id,
      public.employee_point_events.source_order_number,
      public.employee_point_events.points,
      public.employee_point_events.effective_date,
      public.employee_point_events.payroll_period_id,
      public.employee_point_events.status,
      public.employee_point_events.metadata,
      public.employee_point_events.source_type,
      public.employee_point_events.reason,
      public.employee_point_events.created_by,
      public.employee_point_events.reviewed_by,
      public.employee_point_events.reviewed_at,
      public.employee_point_events.review_note,
      public.employee_point_events.reversed_by_entry_id
    ) is distinct from row(
      excluded.category,
      coalesce(excluded.source_order_id,public.employee_point_events.source_order_id),
      coalesce(excluded.source_order_number,public.employee_point_events.source_order_number),
      excluded.points,
      excluded.effective_date,
      excluded.payroll_period_id,
      excluded.status,
      excluded.metadata,
      excluded.source_type,
      excluded.reason,
      excluded.created_by,
      excluded.reviewed_by,
      excluded.reviewed_at,
      excluded.review_note,
      excluded.reversed_by_entry_id
    );
  end loop;

  select coalesce(jsonb_agg(private.employee_point_event_json(e) order by e.created_at desc,e.id),'[]'::jsonb)
    into v_points
  from public.employee_point_events e;
  v_canonical_snapshot:=jsonb_set(v_canonical_snapshot,'{employeePointEntries}',v_points,true);
  v_result:=public.save_hr_operational_state_v35_internal(p_expected_revision,v_canonical_snapshot);
  return v_result;
end;
$$;

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

  -- Cheap preflight before attendance canonicalization / point projection.
  select revision, snapshot, updated_at
  into v_current_revision, v_current_snapshot, v_current_updated_at
  from private.operational_domain_state
  where domain='hr';

  if found then
    -- Exact replay is always a no-op, even when the caller has the current
    -- revision. Returning here prevents unnecessary HR projection work and
    -- protects the database from stale/retrying browser sessions.
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

-- Preserve the existing RPC boundary explicitly.
revoke all on function public.save_hr_operational_state(bigint,jsonb) from public, anon;
grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated, service_role;
revoke all on function public.save_hr_operational_state_v36_internal(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.save_hr_operational_state_v36_internal(bigint,jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
