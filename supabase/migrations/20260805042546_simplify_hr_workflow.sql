-- Simplify HR workflow and add recoverable Owner-only removal for unused staff.
begin;

create table if not exists private.staff_removal_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  target_user_id uuid,
  actor_user_id uuid not null,
  reason text not null,
  status text not null default 'prepared' check (status in ('prepared','finalized','cancelled')),
  blockers jsonb not null default '{}'::jsonb,
  employee_tombstone jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create unique index if not exists staff_removal_requests_one_prepared
  on private.staff_removal_requests(employee_id)
  where status='prepared';

revoke all on table private.staff_removal_requests from public, anon, authenticated;

create or replace function private.employee_removal_blockers(p_employee_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_hr jsonb := '{}'::jsonb;
  v_payroll jsonb := '{}'::jsonb;
  v_attendance integer := 0;
  v_reviews integer := 0;
  v_points integer := 0;
  v_orders integer := 0;
  v_payroll_rows integer := 0;
  v_published_schedules integer := 0;
  v_schedule_history integer := 0;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select coalesce(snapshot,'{}'::jsonb) into v_hr
  from private.operational_domain_state where domain='hr';
  select coalesce(snapshot,'{}'::jsonb) into v_payroll
  from private.operational_domain_state where domain='payroll';

  select count(*) into v_attendance
  from jsonb_array_elements(coalesce(v_hr->'attendance','[]'::jsonb)) item
  where item->>'employeeId'=p_employee_id;
  v_attendance := greatest(v_attendance,(
    select count(*) from public.staff_attendance_records
    where employee_id=p_employee_id
  ));

  select count(*) into v_reviews
  from jsonb_array_elements(coalesce(v_hr->'attendanceReviewCases','[]'::jsonb)) item
  where item->>'employeeId'=p_employee_id;

  select count(*) into v_points
  from jsonb_array_elements(coalesce(v_hr->'employeePointEntries','[]'::jsonb)) item
  where item->>'employeeId'=p_employee_id;
  v_points := greatest(v_points,(
    select count(*) from public.employee_point_events
    where employee_id=p_employee_id
  ));

  select count(*) into v_schedule_history
  from jsonb_array_elements(coalesce(v_hr->'scheduleRevisions','[]'::jsonb)) item
  where item->>'employeeId'=p_employee_id;

  v_schedule_history := v_schedule_history + (
    select count(*)
    from jsonb_array_elements(coalesce(v_hr->'scheduleOverrides','[]'::jsonb)) item
    where item->>'employeeId'=p_employee_id
      and nullif(item->>'date','')::date <= v_today
  );
  v_schedule_history := greatest(v_schedule_history,(
    select count(*) from public.staff_schedule_overrides
    where employee_id=p_employee_id and schedule_date<=v_today
  ));

  select count(*) into v_published_schedules
  from jsonb_array_elements(coalesce(v_hr->'scheduleOverrides','[]'::jsonb)) schedule_item
  where schedule_item->>'employeeId'=p_employee_id
    and exists (
      select 1
      from jsonb_array_elements(coalesce(v_hr->'weeklySchedulePublications','[]'::jsonb)) publication
      where publication->>'status' in ('published','published_with_shortage','changed_after_publish')
        and nullif(publication->>'weekStart','')::date <= nullif(schedule_item->>'date','')::date
        and nullif(schedule_item->>'date','')::date <= nullif(publication->>'weekStart','')::date + 6
    );
  v_published_schedules := greatest(v_published_schedules,(
    select count(*)
    from public.staff_schedule_overrides schedule_row
    where schedule_row.employee_id=p_employee_id
      and exists (
        select 1
        from jsonb_array_elements(coalesce(v_hr->'weeklySchedulePublications','[]'::jsonb)) publication
        where publication->>'status' in ('published','published_with_shortage','changed_after_publish')
          and nullif(publication->>'weekStart','')::date<=schedule_row.schedule_date
          and schedule_row.schedule_date<=nullif(publication->>'weekStart','')::date+6
      )
  ));

  select count(*) into v_payroll_rows
  from jsonb_array_elements(coalesce(v_payroll->'employeePayrolls','[]'::jsonb)) item
  where item->>'employeeId'=p_employee_id;
  v_payroll_rows := v_payroll_rows + (
    select count(*) from jsonb_array_elements(coalesce(v_payroll->'compensations','[]'::jsonb)) item
    where item->>'employeeId'=p_employee_id
  );

  select count(*) into v_orders
  from public.orders
  where florist_assigned_employee_id=p_employee_id
     or florist_assigned_by_employee_id=p_employee_id
     or admin_handled_employee_id=p_employee_id;

  return jsonb_strip_nulls(jsonb_build_object(
    'attendance',case when v_attendance>0 then v_attendance end,
    'attendanceReviews',case when v_reviews>0 then v_reviews end,
    'points',case when v_points>0 then v_points end,
    'orders',case when v_orders>0 then v_orders end,
    'payroll',case when v_payroll_rows>0 then v_payroll_rows end,
    'publishedSchedules',case when v_published_schedules>0 then v_published_schedules end,
    'scheduleHistory',case when v_schedule_history>0 then v_schedule_history end
  ));
end;
$$;
revoke execute on function private.employee_removal_blockers(text) from public,anon,authenticated;

create or replace function public.prepare_unused_staff_removal(
  p_employee_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_hr jsonb;
  v_employee jsonb;
  v_blockers jsonb;
  v_target_user_id uuid;
  v_request private.staff_removal_requests%rowtype;
begin
  if (select auth.uid()) is null or private.current_staff_role() not in ('owner','hr') then
    raise exception 'HR_OR_OWNER_REQUIRED' using errcode='42501';
  end if;
  if not private.has_action_permission('hr.edit_employee') then
    raise exception 'HR_EDIT_AUTHORITY_REQUIRED' using errcode='42501';
  end if;
  if p_employee_id is null or btrim(p_employee_id)='' or length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'INVALID_STAFF_REMOVAL' using errcode='22023';
  end if;

  select snapshot into v_hr from private.operational_domain_state where domain='hr';
  select item into v_employee
  from jsonb_array_elements(coalesce(v_hr->'employees','[]'::jsonb)) item
  where item->>'id'=p_employee_id limit 1;
  if v_employee is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode='P0002'; end if;
  if v_employee->>'systemRole'='owner' then raise exception 'OWNER_REMOVAL_FORBIDDEN' using errcode='42501'; end if;
  if private.current_staff_role()='hr'
     and v_employee->>'systemRole' not in ('admin','florist') then
    raise exception 'HR_PROTECTED_ROLE' using errcode='42501';
  end if;

  v_blockers:=private.employee_removal_blockers(p_employee_id);
  if v_blockers<>'{}'::jsonb then
    return jsonb_build_object('allowed',false,'blockers',v_blockers);
  end if;

  select user_id into v_target_user_id
  from public.staff_access_profiles
  where employee_id=p_employee_id limit 1;

  update public.staff_access_profiles
  set is_active=false,updated_at=now()
  where employee_id=p_employee_id;
  delete from private.staff_runtime_context where user_id=v_target_user_id;

  insert into private.staff_removal_requests(employee_id,target_user_id,actor_user_id,reason,status,blockers,employee_tombstone)
  values(p_employee_id,v_target_user_id,(select auth.uid()),btrim(p_reason),'prepared','{}'::jsonb,v_employee)
  on conflict(employee_id) where status='prepared' do update
  set target_user_id=coalesce(excluded.target_user_id,private.staff_removal_requests.target_user_id),
      actor_user_id=excluded.actor_user_id,
      reason=excluded.reason,
      blockers='{}'::jsonb,
      employee_tombstone=excluded.employee_tombstone,
      created_at=now()
  returning * into v_request;

  return jsonb_build_object(
    'allowed',true,
    'requestId',v_request.id,
    'targetUserId',v_request.target_user_id,
    'blockers','{}'::jsonb
  );
end;
$$;
revoke execute on function public.prepare_unused_staff_removal(text,text) from public,anon;
grant execute on function public.prepare_unused_staff_removal(text,text) to authenticated;

create or replace function public.finalize_unused_staff_removal(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request private.staff_removal_requests%rowtype;
  v_state private.operational_domain_state%rowtype;
  v_snapshot jsonb;
  v_blockers jsonb;
begin
  if (select auth.uid()) is null or private.current_staff_role() not in ('owner','hr') then
    raise exception 'HR_OR_OWNER_REQUIRED' using errcode='42501';
  end if;
  select * into v_request from private.staff_removal_requests
  where id=p_request_id and status='prepared' for update;
  if not found then raise exception 'STAFF_REMOVAL_REQUEST_NOT_FOUND' using errcode='P0002'; end if;
  if private.current_staff_role()='hr'
     and v_request.employee_tombstone->>'systemRole' not in ('admin','florist') then
    raise exception 'HR_PROTECTED_ROLE' using errcode='42501';
  end if;

  v_blockers:=private.employee_removal_blockers(v_request.employee_id);
  if v_blockers<>'{}'::jsonb then
    update private.staff_removal_requests set blockers=v_blockers where id=v_request.id;
    return jsonb_build_object('removed',false,'blockers',v_blockers);
  end if;

  select * into v_state from private.operational_domain_state where domain='hr' for update;
  if not found then raise exception 'HR_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  v_snapshot:=v_state.snapshot;

  v_snapshot:=jsonb_set(v_snapshot,'{employees}',coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(v_snapshot->'employees','[]'::jsonb)) item
    where item->>'id'<>v_request.employee_id
  ),'[]'::jsonb),true);
  v_snapshot:=jsonb_set(v_snapshot,'{employeeDefaultSchedules}',coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(v_snapshot->'employeeDefaultSchedules','[]'::jsonb)) item
    where item->>'employeeId'<>v_request.employee_id
  ),'[]'::jsonb),true);
  v_snapshot:=jsonb_set(v_snapshot,'{scheduleOverrides}',coalesce((
    select jsonb_agg(item) from jsonb_array_elements(coalesce(v_snapshot->'scheduleOverrides','[]'::jsonb)) item
    where item->>'employeeId'<>v_request.employee_id
  ),'[]'::jsonb),true);

  update private.operational_domain_state
  set revision=revision+1,snapshot=v_snapshot,updated_by=(select auth.uid()),updated_at=now()
  where domain='hr';

  delete from private.staff_runtime_context where user_id=v_request.target_user_id;
  delete from public.staff_schedule_defaults where employee_id=v_request.employee_id;
  delete from public.staff_schedule_overrides where employee_id=v_request.employee_id;
  delete from public.staff_access_profiles where employee_id=v_request.employee_id;
  update private.staff_removal_requests
  set status='finalized',finalized_at=now(),blockers='{}'::jsonb
  where id=v_request.id;

  perform private.write_business_activity(
    'hr',v_request.employee_id,null,'employee_removed',
    'An authorized Owner or HR operator permanently removed an unused employee account.',
    jsonb_build_object(
      'reason',v_request.reason,
      'employee',v_request.employee_tombstone,
      'removalRequestId',v_request.id
    )
  );

  return jsonb_build_object('removed',true,'employeeId',v_request.employee_id);
end;
$$;
revoke execute on function public.finalize_unused_staff_removal(uuid) from public,anon;
grant execute on function public.finalize_unused_staff_removal(uuid) to authenticated;

-- PostgreSQL must reject a new payroll submission when HR attendance review
-- remains unresolved for that proposal's payroll period.
create or replace function private.enforce_hr_payroll_submission_readiness()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_hr jsonb;
  v_proposal jsonb;
  v_period jsonb;
  v_start date;
  v_end date;
  v_pending integer;
begin
  if new.domain<>'payroll' then return new; end if;
  select coalesce(snapshot,'{}'::jsonb) into v_hr
  from private.operational_domain_state where domain='hr';

  for v_proposal in
    select proposal
    from jsonb_array_elements(coalesce(new.snapshot->'payrollProposals','[]'::jsonb)) proposal
    where proposal->>'status'='submitted_to_finance'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(old.snapshot->'payrollProposals','[]'::jsonb)) previous
        where previous->>'id'=proposal->>'id'
          and previous->>'status'='submitted_to_finance'
      )
  loop
    select period into v_period
    from jsonb_array_elements(coalesce(new.snapshot->'periods','[]'::jsonb)) period
    where period->>'id'=v_proposal->>'payrollPeriodId' limit 1;
    if v_period is null then raise exception 'PAYROLL_PERIOD_REQUIRED' using errcode='22023'; end if;
    v_start:=nullif(v_period->>'periodStart','')::date;
    v_end:=nullif(v_period->>'periodEnd','')::date;
    select count(*) into v_pending
    from jsonb_array_elements(coalesce(v_hr->'attendanceReviewCases','[]'::jsonb)) item
    where item->>'status' in ('pending','problem')
      and nullif(item->>'date','')::date between v_start and v_end;
    if v_pending>0 then
      raise exception 'PENDING_ATTENDANCE_REVIEW:%',v_pending using errcode='23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function private.enforce_hr_payroll_submission_readiness() from public,anon,authenticated;

drop trigger if exists enforce_hr_payroll_submission_readiness on private.operational_domain_state;
create trigger enforce_hr_payroll_submission_readiness
before update of snapshot on private.operational_domain_state
for each row execute function private.enforce_hr_payroll_submission_readiness();

commit;
