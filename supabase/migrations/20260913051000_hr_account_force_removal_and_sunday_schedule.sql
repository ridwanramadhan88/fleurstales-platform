-- HR account administration repair:
-- 1. Keep Sunday on the company schedule by following each branch's hours.
-- 2. Add an explicit force-resolve path for permanent staff removal.
-- 3. Make HR removal scope follow Owner-configured managed roles.

begin;

-- Existing installations already have a persisted scheduling JSON object, so
-- changing the TypeScript default alone would not update them.
update private.internal_settings_state
set scheduling = jsonb_set(
      scheduling,
      '{defaultWeeklySchedule,sunday}',
      coalesce(scheduling #> '{defaultWeeklySchedule,sunday}', '{}'::jsonb)
        || '{"mode":"follow_branch_hours","isWorking":true,"startTime":"09:00","endTime":"18:00"}'::jsonb,
      true
    ),
    revision = revision + 1,
    updated_at = now()
where id = 'primary';

alter table private.staff_removal_requests
  add column if not exists force_resolved boolean not null default false,
  add column if not exists resolved_blockers jsonb not null default '{}'::jsonb;

-- Force resolve is intentionally destructive for the listed employee-linked
-- HR/payroll records. Orders themselves are preserved; only employee-id links
-- are detached while their existing display-name snapshots remain intact.
create or replace function private.force_resolve_employee_removal_blockers(p_employee_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hr_state private.operational_domain_state%rowtype;
  v_payroll_state private.operational_domain_state%rowtype;
  v_hr jsonb;
  v_payroll jsonb;
  v_resolved jsonb := private.employee_removal_blockers(p_employee_id);
begin
  select * into v_hr_state
  from private.operational_domain_state
  where domain = 'hr'
  for update;
  if not found then raise exception 'HR_STATE_NOT_INITIALIZED' using errcode='55000'; end if;

  v_hr := coalesce(v_hr_state.snapshot, '{}'::jsonb);

  v_hr := jsonb_set(v_hr, '{attendance}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_hr->'attendance','[]'::jsonb)) item
    where item->>'employeeId' <> p_employee_id
  ), '[]'::jsonb), true);

  v_hr := jsonb_set(v_hr, '{attendanceReviewCases}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_hr->'attendanceReviewCases','[]'::jsonb)) item
    where item->>'employeeId' <> p_employee_id
  ), '[]'::jsonb), true);

  v_hr := jsonb_set(v_hr, '{employeePointEntries}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_hr->'employeePointEntries','[]'::jsonb)) item
    where item->>'employeeId' <> p_employee_id
  ), '[]'::jsonb), true);

  v_hr := jsonb_set(v_hr, '{employeeDefaultSchedules}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_hr->'employeeDefaultSchedules','[]'::jsonb)) item
    where item->>'employeeId' <> p_employee_id
  ), '[]'::jsonb), true);

  v_hr := jsonb_set(v_hr, '{scheduleOverrides}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_hr->'scheduleOverrides','[]'::jsonb)) item
    where item->>'employeeId' <> p_employee_id
  ), '[]'::jsonb), true);

  v_hr := jsonb_set(v_hr, '{scheduleRevisions}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_hr->'scheduleRevisions','[]'::jsonb)) item
    where item->>'employeeId' <> p_employee_id
  ), '[]'::jsonb), true);

  update private.operational_domain_state
  set snapshot = v_hr,
      revision = revision + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
  where domain = 'hr';

  select * into v_payroll_state
  from private.operational_domain_state
  where domain = 'payroll'
  for update;

  if found then
    v_payroll := coalesce(v_payroll_state.snapshot, '{}'::jsonb);
    v_payroll := jsonb_set(v_payroll, '{employeePayrolls}', coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_payroll->'employeePayrolls','[]'::jsonb)) item
      where item->>'employeeId' <> p_employee_id
    ), '[]'::jsonb), true);
    v_payroll := jsonb_set(v_payroll, '{compensations}', coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_payroll->'compensations','[]'::jsonb)) item
      where item->>'employeeId' <> p_employee_id
    ), '[]'::jsonb), true);

    update private.operational_domain_state
    set snapshot = v_payroll,
        revision = revision + 1,
        updated_by = (select auth.uid()),
        updated_at = now()
    where domain = 'payroll';
  end if;

  delete from public.staff_attendance_records where employee_id = p_employee_id;
  delete from public.employee_point_events where employee_id = p_employee_id;
  delete from public.staff_schedule_defaults where employee_id = p_employee_id;
  delete from public.staff_schedule_overrides where employee_id = p_employee_id;

  update public.orders
  set florist_assigned_employee_id = case when florist_assigned_employee_id = p_employee_id then null else florist_assigned_employee_id end,
      florist_assigned_by_employee_id = case when florist_assigned_by_employee_id = p_employee_id then null else florist_assigned_by_employee_id end,
      admin_handled_employee_id = case when admin_handled_employee_id = p_employee_id then null else admin_handled_employee_id end,
      updated_at = now()
  where florist_assigned_employee_id = p_employee_id
     or florist_assigned_by_employee_id = p_employee_id
     or admin_handled_employee_id = p_employee_id;

  update public.branches
  set manager_employee_id = null,
      updated_at = now()
  where manager_employee_id = p_employee_id;

  perform private.write_business_activity(
    'hr', p_employee_id, null, 'employee_removal_force_resolved',
    'Linked employee records were force-resolved before permanent removal.',
    jsonb_build_object('resolvedBlockers', v_resolved)
  );

  return v_resolved;
end;
$$;
revoke execute on function private.force_resolve_employee_removal_blockers(text) from public, anon, authenticated;

create or replace function public.prepare_staff_removal(
  p_employee_id text,
  p_reason text,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hr jsonb;
  v_employee jsonb;
  v_blockers jsonb;
  v_resolved jsonb := '{}'::jsonb;
  v_target_user_id uuid;
  v_request private.staff_removal_requests%rowtype;
  v_actor_role text := private.current_staff_role();
  v_hr_managed text[] := private.hr_managed_employee_roles();
begin
  if (select auth.uid()) is null or v_actor_role not in ('owner','hr') then
    raise exception 'HR_OR_OWNER_REQUIRED' using errcode='42501';
  end if;
  if not private.has_action_permission('hr.edit_employee') then
    raise exception 'HR_EDIT_AUTHORITY_REQUIRED' using errcode='42501';
  end if;
  if p_employee_id is null or btrim(p_employee_id) = '' or length(btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'INVALID_STAFF_REMOVAL' using errcode='22023';
  end if;

  select snapshot into v_hr
  from private.operational_domain_state
  where domain = 'hr';

  select item into v_employee
  from jsonb_array_elements(coalesce(v_hr->'employees','[]'::jsonb)) item
  where item->>'id' = p_employee_id
  limit 1;

  if v_employee is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode='P0002'; end if;
  if v_employee->>'systemRole' = 'owner' then raise exception 'OWNER_REMOVAL_FORBIDDEN' using errcode='42501'; end if;
  if v_actor_role = 'hr' and not ((v_employee->>'systemRole') = any(v_hr_managed)) then
    raise exception 'HR_PROTECTED_ROLE' using errcode='42501';
  end if;

  v_blockers := private.employee_removal_blockers(p_employee_id);
  if v_blockers <> '{}'::jsonb and not p_force then
    return jsonb_build_object('allowed', false, 'blockers', v_blockers, 'forceAvailable', true);
  end if;

  if v_blockers <> '{}'::jsonb and p_force then
    v_resolved := private.force_resolve_employee_removal_blockers(p_employee_id);
    v_blockers := private.employee_removal_blockers(p_employee_id);
    if v_blockers <> '{}'::jsonb then
      return jsonb_build_object('allowed', false, 'blockers', v_blockers, 'forceAvailable', true);
    end if;
  end if;

  select user_id into v_target_user_id
  from public.staff_access_profiles
  where employee_id = p_employee_id
  limit 1;

  update public.staff_access_profiles
  set is_active = false, updated_at = now()
  where employee_id = p_employee_id;

  delete from private.staff_runtime_context where user_id = v_target_user_id;

  insert into private.staff_removal_requests(
    employee_id, target_user_id, actor_user_id, reason, status, blockers,
    employee_tombstone, force_resolved, resolved_blockers
  )
  values(
    p_employee_id, v_target_user_id, (select auth.uid()), btrim(p_reason), 'prepared', '{}',
    v_employee, p_force, v_resolved
  )
  on conflict(employee_id) where status='prepared' do update
  set target_user_id = coalesce(excluded.target_user_id, private.staff_removal_requests.target_user_id),
      actor_user_id = excluded.actor_user_id,
      reason = excluded.reason,
      blockers = '{}',
      employee_tombstone = excluded.employee_tombstone,
      force_resolved = excluded.force_resolved,
      resolved_blockers = excluded.resolved_blockers,
      created_at = now()
  returning * into v_request;

  return jsonb_build_object(
    'allowed', true,
    'requestId', v_request.id,
    'targetUserId', v_request.target_user_id,
    'blockers', '{}'::jsonb,
    'forceResolved', v_request.force_resolved,
    'resolvedBlockers', v_request.resolved_blockers
  );
end;
$$;
revoke execute on function public.prepare_staff_removal(text,text,boolean) from public, anon;
grant execute on function public.prepare_staff_removal(text,text,boolean) to authenticated;

-- Backward-compatible strict entry point for callers that do not know about
-- force resolution yet.
create or replace function public.prepare_unused_staff_removal(
  p_employee_id text,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.prepare_staff_removal(p_employee_id, p_reason, false)
$$;
revoke execute on function public.prepare_unused_staff_removal(text,text) from public, anon;
grant execute on function public.prepare_unused_staff_removal(text,text) to authenticated;

create or replace function public.finalize_unused_staff_removal(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request private.staff_removal_requests%rowtype;
  v_state private.operational_domain_state%rowtype;
  v_snapshot jsonb;
  v_blockers jsonb;
  v_actor_role text := private.current_staff_role();
  v_hr_managed text[] := private.hr_managed_employee_roles();
begin
  if (select auth.uid()) is null or v_actor_role not in ('owner','hr') then
    raise exception 'HR_OR_OWNER_REQUIRED' using errcode='42501';
  end if;

  select * into v_request
  from private.staff_removal_requests
  where id = p_request_id and status = 'prepared'
  for update;
  if not found then raise exception 'STAFF_REMOVAL_REQUEST_NOT_FOUND' using errcode='P0002'; end if;

  if v_actor_role = 'hr' and not ((v_request.employee_tombstone->>'systemRole') = any(v_hr_managed)) then
    raise exception 'HR_PROTECTED_ROLE' using errcode='42501';
  end if;

  v_blockers := private.employee_removal_blockers(v_request.employee_id);
  if v_blockers <> '{}'::jsonb then
    update private.staff_removal_requests set blockers = v_blockers where id = v_request.id;
    return jsonb_build_object('removed', false, 'blockers', v_blockers);
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain = 'hr'
  for update;
  if not found then raise exception 'HR_STATE_NOT_INITIALIZED' using errcode='55000'; end if;

  v_snapshot := v_state.snapshot;
  v_snapshot := jsonb_set(v_snapshot, '{employees}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_snapshot->'employees','[]'::jsonb)) item
    where item->>'id' <> v_request.employee_id
  ), '[]'::jsonb), true);
  v_snapshot := jsonb_set(v_snapshot, '{employeeDefaultSchedules}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_snapshot->'employeeDefaultSchedules','[]'::jsonb)) item
    where item->>'employeeId' <> v_request.employee_id
  ), '[]'::jsonb), true);
  v_snapshot := jsonb_set(v_snapshot, '{scheduleOverrides}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_snapshot->'scheduleOverrides','[]'::jsonb)) item
    where item->>'employeeId' <> v_request.employee_id
  ), '[]'::jsonb), true);

  update private.operational_domain_state
  set revision = revision + 1,
      snapshot = v_snapshot,
      updated_by = (select auth.uid()),
      updated_at = now()
  where domain = 'hr';

  delete from private.staff_runtime_context where user_id = v_request.target_user_id;
  delete from public.staff_schedule_defaults where employee_id = v_request.employee_id;
  delete from public.staff_schedule_overrides where employee_id = v_request.employee_id;
  delete from public.staff_access_profiles where employee_id = v_request.employee_id;

  update private.staff_removal_requests
  set status = 'finalized', finalized_at = now(), blockers = '{}'::jsonb
  where id = v_request.id;

  perform private.write_business_activity(
    'hr', v_request.employee_id, null, 'employee_removed',
    case when v_request.force_resolved
      then 'An authorized operator force-resolved linked records and permanently removed an employee account.'
      else 'An authorized operator permanently removed an unused employee account.'
    end,
    jsonb_build_object(
      'reason', v_request.reason,
      'employee', v_request.employee_tombstone,
      'removalRequestId', v_request.id,
      'forceResolved', v_request.force_resolved,
      'resolvedBlockers', v_request.resolved_blockers
    )
  );

  return jsonb_build_object(
    'removed', true,
    'employeeId', v_request.employee_id,
    'forceResolved', v_request.force_resolved
  );
end;
$$;
revoke execute on function public.finalize_unused_staff_removal(uuid) from public, anon;
grant execute on function public.finalize_unused_staff_removal(uuid) to authenticated;

commit;
