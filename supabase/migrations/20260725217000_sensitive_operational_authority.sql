-- Fleurstales V3.2 sensitive operational-domain authority.
-- HR and Finance keep their current aggregate client stores for UI compatibility,
-- but arbitrary generic JSON replacement is no longer a mutation boundary.
-- Dedicated writers diff the authoritative snapshot and enforce the matching
-- configured action/section permission before the revision can advance.

begin;

create or replace function private.persist_validated_operational_snapshot(
  p_domain text,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_previous jsonb;
  v_next_revision bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_EXPECTED_REVISION' using errcode='22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'SNAPSHOT_OBJECT_REQUIRED' using errcode='22023';
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain=p_domain
  for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception 'REVISION_CONFLICT:%:expected=%:actual=0',p_domain,p_expected_revision using errcode='40001';
    end if;
    insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
    values(p_domain,1,p_snapshot,(select auth.uid()),now())
    returning * into v_state;
    v_previous := null;
  else
    if v_state.revision <> p_expected_revision then
      raise exception 'REVISION_CONFLICT:%:expected=%:actual=%',p_domain,p_expected_revision,v_state.revision using errcode='40001';
    end if;
    v_previous := v_state.snapshot;
    v_next_revision := v_state.revision + 1;
    update private.operational_domain_state
    set revision=v_next_revision,snapshot=p_snapshot,updated_by=(select auth.uid()),updated_at=now()
    where domain=p_domain and revision=p_expected_revision
    returning * into v_state;
    if not found then
      raise exception 'REVISION_CONFLICT:%:lost_update',p_domain using errcode='40001';
    end if;
  end if;

  perform private.write_audit_event(
    'operational.'||p_domain||'.save','operational_domain',p_domain,'succeeded',
    p_expected_revision,v_state.revision,v_previous,p_snapshot
  );
  perform private.write_business_activity(
    p_domain,p_domain,null,'updated',
    upper(left(p_domain,1))||substr(p_domain,2)||' operational state updated',
    jsonb_build_object('revision',v_state.revision)
  );

  return jsonb_build_object(
    'domain',v_state.domain,
    'revision',v_state.revision,
    'snapshot',v_state.snapshot,
    'updatedAt',v_state.updated_at
  );
end;
$$;
revoke execute on function private.persist_validated_operational_snapshot(text,bigint,jsonb) from public,anon,authenticated;

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
  v_role text := private.current_staff_role();
  v_previous jsonb := '{}'::jsonb;
  v_key text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('owner','hr') then raise exception 'HR_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'SNAPSHOT_OBJECT_REQUIRED' using errcode='22023'; end if;

  select coalesce(snapshot,'{}'::jsonb) into v_previous
  from private.operational_domain_state where domain='hr';

  for v_key in select jsonb_object_keys(p_snapshot) loop
    if v_key not in (
      'employees','attendance','employeeDefaultSchedules','scheduleOverrides',
      'weeklySchedulePublications','scheduleRevisions','attendanceReviewCases',
      'employeePointEntries','pointRules'
    ) then
      raise exception 'HR_UNKNOWN_STATE_KEY:%',v_key using errcode='22023';
    end if;
  end loop;

  -- PINs are never valid server state, even for Owner/HR.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_snapshot->'employees','[]'::jsonb)) e
    where e ? 'pin'
  ) then
    raise exception 'HR_PIN_MUST_NOT_BE_PERSISTED' using errcode='22023';
  end if;

  if (p_snapshot->'employees') is distinct from (v_previous->'employees') then
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_snapshot->'employees','[]'::jsonb)) n
      where not exists (
        select 1 from jsonb_array_elements(coalesce(v_previous->'employees','[]'::jsonb)) o
        where o->>'id'=n->>'id'
      )
    ) and not private.has_action_permission('hr.create_employee') then
      raise exception 'HR_CREATE_EMPLOYEE_PERMISSION_REQUIRED' using errcode='42501';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_previous->'employees','[]'::jsonb)) o
      where not exists (
        select 1 from jsonb_array_elements(coalesce(p_snapshot->'employees','[]'::jsonb)) n
        where n->>'id'=o->>'id'
      )
    ) then
      raise exception 'HR_EMPLOYEE_DELETE_NOT_PERMITTED' using errcode='42501';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_previous->'employees','[]'::jsonb)) o
      join jsonb_array_elements(coalesce(p_snapshot->'employees','[]'::jsonb)) n
        on n->>'id'=o->>'id'
      where n is distinct from o
    ) and not private.has_action_permission('hr.edit_employee') then
      raise exception 'HR_EDIT_EMPLOYEE_PERMISSION_REQUIRED' using errcode='42501';
    end if;
  end if;

  if (p_snapshot->'attendance') is distinct from (v_previous->'attendance')
    or (p_snapshot->'attendanceReviewCases') is distinct from (v_previous->'attendanceReviewCases')
  then
    if not private.has_action_permission('hr.correct_attendance') then
      raise exception 'HR_ATTENDANCE_PERMISSION_REQUIRED' using errcode='42501';
    end if;
  end if;

  if (p_snapshot->'employeePointEntries') is distinct from (v_previous->'employeePointEntries')
    or (p_snapshot->'pointRules') is distinct from (v_previous->'pointRules')
  then
    if not private.has_action_permission('hr.manage_points') then
      raise exception 'HR_POINTS_PERMISSION_REQUIRED' using errcode='42501';
    end if;
  end if;

  if (p_snapshot->'employeeDefaultSchedules') is distinct from (v_previous->'employeeDefaultSchedules')
    or (p_snapshot->'scheduleOverrides') is distinct from (v_previous->'scheduleOverrides')
    or (p_snapshot->'weeklySchedulePublications') is distinct from (v_previous->'weeklySchedulePublications')
    or (p_snapshot->'scheduleRevisions') is distinct from (v_previous->'scheduleRevisions')
  then
    if not private.has_section_access('scheduling','edit') then
      raise exception 'SCHEDULING_EDIT_PERMISSION_REQUIRED' using errcode='42501';
    end if;
  end if;

  return private.persist_validated_operational_snapshot('hr',p_expected_revision,p_snapshot);
end;
$$;
revoke execute on function public.save_hr_operational_state(bigint,jsonb) from public,anon;
grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated;

create or replace function public.save_finance_operational_state(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
  v_previous jsonb := '{}'::jsonb;
  v_key text;
  v_old jsonb;
  v_new jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('owner','finance') then raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'SNAPSHOT_OBJECT_REQUIRED' using errcode='22023'; end if;

  select coalesce(snapshot,'{}'::jsonb) into v_previous
  from private.operational_domain_state where domain='finance';

  for v_key in select jsonb_object_keys(p_snapshot) loop
    if v_key not in ('transactions','customCategories','categoryOverrides') then
      raise exception 'FINANCE_UNKNOWN_STATE_KEY:%',v_key using errcode='22023';
    end if;
  end loop;

  if (p_snapshot->'customCategories') is distinct from (v_previous->'customCategories')
    or (p_snapshot->'categoryOverrides') is distinct from (v_previous->'categoryOverrides')
  then
    if not private.has_section_access('finance','edit') then
      raise exception 'FINANCE_CATEGORY_EDIT_PERMISSION_REQUIRED' using errcode='42501';
    end if;
  end if;

  if (p_snapshot->'transactions') is distinct from (v_previous->'transactions') then
    -- Deletion of a ledger transaction is never a valid client operation.
    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_previous->'transactions','[]'::jsonb)) o
      where not exists (
        select 1 from jsonb_array_elements(coalesce(p_snapshot->'transactions','[]'::jsonb)) n
        where n->>'id'=o->>'id'
      )
    ) then
      raise exception 'FINANCE_LEDGER_DELETE_NOT_PERMITTED' using errcode='42501';
    end if;

    -- New rows are controlled by the explicit ledger-create action.
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_snapshot->'transactions','[]'::jsonb)) n
      where not exists (
        select 1 from jsonb_array_elements(coalesce(v_previous->'transactions','[]'::jsonb)) o
        where o->>'id'=n->>'id'
      )
    ) and not private.has_action_permission('finance.create_ledger_entry') then
      raise exception 'FINANCE_LEDGER_CREATE_PERMISSION_REQUIRED' using errcode='42501';
    end if;

    -- Existing rows are append-only apart from the verification decision fields.
    for v_old,v_new in
      select o,n
      from jsonb_array_elements(coalesce(v_previous->'transactions','[]'::jsonb)) o
      join jsonb_array_elements(coalesce(p_snapshot->'transactions','[]'::jsonb)) n
        on n->>'id'=o->>'id'
      where n is distinct from o
    loop
      if (v_new - array['status','actor','updatedAt']) is distinct from (v_old - array['status','actor','updatedAt']) then
        raise exception 'FINANCE_LEDGER_ENTRY_IMMUTABLE:%',coalesce(v_old->>'id','unknown') using errcode='42501';
      end if;
      if coalesce(v_old->>'status','pending') <> 'pending'
        or coalesce(v_new->>'status','') not in ('verified','rejected')
      then
        raise exception 'FINANCE_LEDGER_INVALID_DECISION:%',coalesce(v_old->>'id','unknown') using errcode='22023';
      end if;
      if not private.has_action_permission('finance.verify_ledger_entry') then
        raise exception 'FINANCE_LEDGER_VERIFY_PERMISSION_REQUIRED' using errcode='42501';
      end if;
    end loop;
  end if;

  return private.persist_validated_operational_snapshot('finance',p_expected_revision,p_snapshot);
end;
$$;
revoke execute on function public.save_finance_operational_state(bigint,jsonb) from public,anon;
grant execute on function public.save_finance_operational_state(bigint,jsonb) to authenticated;

-- Sensitive domains are no longer writable through the generic snapshot RPC.
create or replace function private.can_write_operational_domain(p_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_domain
    when 'hr' then false
    when 'payroll' then false
    when 'finance' then false
    when 'stock' then private.feature_enabled('inventory') and private.has_section_access('stock','edit')
    when 'vouchers' then private.has_section_access('finance','edit') or private.has_section_access('orders','edit')
    when 'order_drafts' then private.has_action_permission('orders.create') or private.has_action_permission('orders.edit')
    else false
  end;
end;
$$;
revoke execute on function private.can_write_operational_domain(text) from public,anon,authenticated;

-- Finance operational data is the ledger/category domain, so its read gate uses
-- the explicit ledger-view action. HR read remains section/action driven.
create or replace function private.can_read_operational_domain(p_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_domain
    when 'hr' then private.has_section_access('hr','view')
    when 'payroll' then private.has_action_permission('hr.create_payroll_proposal')
      or private.has_action_permission('hr.edit_payroll_proposal')
      or private.has_action_permission('hr.resolve_rejected_employee')
      or private.has_action_permission('finance.view_payroll')
    when 'finance' then private.has_action_permission('finance.view_ledger')
    when 'stock' then private.feature_enabled('inventory') and private.has_section_access('stock','view')
    when 'vouchers' then private.has_section_access('finance','view') or private.has_section_access('orders','edit')
    when 'order_drafts' then private.has_action_permission('orders.create') or private.has_action_permission('orders.edit')
    else false
  end;
end;
$$;
revoke execute on function private.can_read_operational_domain(text) from public,anon,authenticated;

commit;
