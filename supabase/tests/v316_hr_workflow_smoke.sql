-- HR simplification and permanent-removal authority checks. Read-only assertions only.

do $$
declare
  v_prepare_source text;
  v_finalize_source text;
  v_blocker_source text;
  v_payroll_trigger_source text;
begin
  if to_regclass('private.staff_removal_requests') is null then
    raise exception 'Staff removal request authority table is missing';
  end if;

  if has_table_privilege('anon','private.staff_removal_requests','SELECT')
     or has_table_privilege('authenticated','private.staff_removal_requests','SELECT')
     or has_table_privilege('authenticated','private.staff_removal_requests','INSERT')
     or has_table_privilege('authenticated','private.staff_removal_requests','UPDATE')
     or has_table_privilege('authenticated','private.staff_removal_requests','DELETE') then
    raise exception 'Browser roles can access staff-removal authority rows directly';
  end if;

  if not has_function_privilege('authenticated','public.prepare_unused_staff_removal(text,text)','EXECUTE')
     or has_function_privilege('anon','public.prepare_unused_staff_removal(text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.finalize_unused_staff_removal(uuid)','EXECUTE')
     or has_function_privilege('anon','public.finalize_unused_staff_removal(uuid)','EXECUTE') then
    raise exception 'Staff-removal RPC grants are incorrect';
  end if;

  if has_function_privilege('authenticated','private.employee_removal_blockers(text)','EXECUTE')
     or has_function_privilege('anon','private.employee_removal_blockers(text)','EXECUTE')
     or has_function_privilege('authenticated','private.enforce_hr_payroll_submission_readiness()','EXECUTE') then
    raise exception 'Private HR helpers are browser-executable';
  end if;

  select pg_get_functiondef('public.prepare_unused_staff_removal(text,text)'::regprocedure) into v_prepare_source;
  if position('HR_OR_OWNER_REQUIRED' in v_prepare_source)=0
     or position('HR_PROTECTED_ROLE' in v_prepare_source)=0
     or position('hr.edit_employee' in v_prepare_source)=0
     or position('employee_removal_blockers' in v_prepare_source)=0 then
    raise exception 'Staff-removal preparation lost role, capability, or history enforcement';
  end if;

  select pg_get_functiondef('public.finalize_unused_staff_removal(uuid)'::regprocedure) into v_finalize_source;
  if position('HR_PROTECTED_ROLE' in v_finalize_source)=0
     or position('employee_removal_blockers' in v_finalize_source)=0
     or position('staff_schedule_overrides' in v_finalize_source)=0
     or position('staff_access_profiles' in v_finalize_source)=0 then
    raise exception 'Staff-removal finalization lost recheck or cleanup enforcement';
  end if;

  select pg_get_functiondef('private.employee_removal_blockers(text)'::regprocedure) into v_blocker_source;
  if position('staff_attendance_records' in v_blocker_source)=0
     or position('employee_point_events' in v_blocker_source)=0
     or position('orders' in v_blocker_source)=0
     or position('publishedSchedules' in v_blocker_source)=0 then
    raise exception 'Permanent-removal history blockers are incomplete';
  end if;

  select pg_get_functiondef('private.enforce_hr_payroll_submission_readiness()'::regprocedure) into v_payroll_trigger_source;
  if position('PENDING_ATTENDANCE_REVIEW' in v_payroll_trigger_source)=0 then
    raise exception 'Payroll attendance-readiness enforcement is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='private.operational_domain_state'::regclass
      and tgname='enforce_hr_payroll_submission_readiness'
      and not tgisinternal
  ) then
    raise exception 'Payroll attendance-readiness trigger is missing';
  end if;
end $$;
