-- Fleurstales V3.7 authority-consistency live database smoke checks.
-- Run after all migrations through 20260725234500.

do $$
declare
  v_source text;
begin
  if to_regprocedure('public.quote_internal_order(jsonb)') is null then
    raise exception 'Internal Order quote RPC is missing';
  end if;
  if to_regprocedure('public.get_customer_business_metrics(text)') is null then
    raise exception 'Authoritative CRM metrics RPC is missing';
  end if;
  if to_regprocedure('public.create_employee_point(jsonb)') is null
     or to_regprocedure('public.review_employee_point(text,text,text)') is null
     or to_regprocedure('public.reverse_employee_point(text,text)') is null then
    raise exception 'Employee-point command RPCs are incomplete';
  end if;

  if has_function_privilege('anon','public.quote_internal_order(jsonb)','execute') then
    raise exception 'anon must not execute internal Order quotes';
  end if;
  if has_function_privilege('anon','public.get_customer_business_metrics(text)','execute') then
    raise exception 'anon must not read CRM business metrics';
  end if;
  if has_function_privilege('anon','public.create_employee_point(jsonb)','execute')
     or has_function_privilege('anon','public.review_employee_point(text,text,text)','execute')
     or has_function_privilege('anon','public.reverse_employee_point(text,text)','execute') then
    raise exception 'anon must not execute employee-point commands';
  end if;

  select pg_get_functiondef('public.save_order_operational_state_v31_internal(text,integer,integer,jsonb,jsonb,jsonb)'::regprocedure)
  into v_source;
  if position('current_staff_branch_id' in v_source) = 0 then
    raise exception 'Legacy Order writer still lacks runtime-session branch authority';
  end if;
  if position('FLORIST_PRODUCTION_STATUS_ONLY' in v_source) = 0 then
    raise exception 'Florist Order mutations are not restricted to production status changes';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='attendance-selfies'
      and public=false
      and file_size_limit=102400
  ) then
    raise exception 'Private attendance-selfies bucket is missing or misconfigured';
  end if;

  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='attendance_selfies_select')
     or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='attendance_selfies_insert') then
    raise exception 'Attendance selfie Storage policies are incomplete';
  end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='attendance_selfies_delete') then
    raise exception 'Attendance selfie evidence must be immutable to authenticated staff';
  end if;
end $$;

do $$
declare
  v_hr_wrapper_source text;
  v_hr_internal_source text;
begin
  select pg_get_functiondef('public.save_hr_operational_state(bigint,jsonb)'::regprocedure)
  into v_hr_wrapper_source;
  if position('save_hr_operational_state_unchecked' in v_hr_wrapper_source)=0
     or position('mutation_conflict_circuit_is_blocked' in v_hr_wrapper_source)=0 then
    raise exception 'Guarded HR save lost delegation or conflict circuit';
  end if;

  select pg_get_functiondef('public.save_hr_operational_state_unchecked(bigint,jsonb)'::regprocedure)
  into v_hr_internal_source;
  if position('employeePointEntries' in v_hr_internal_source)=0
     or position('employee_point_events' in v_hr_internal_source)=0 then
    raise exception 'HR authority no longer projects normalized employee-point events';
  end if;
end $$;

do $$
declare
  v_finance_source text;
  v_finance_contract_source text;
  v_finance_delegate_source text;
begin
  select pg_get_functiondef('public.save_finance_operational_state(bigint,jsonb)'::regprocedure)
  into v_finance_source;
  v_finance_contract_source := v_finance_source;

  -- Newer Finance layers wrap the proven V3.7 writer to tighten the role
  -- boundary. Follow that delegation so the smoke test validates both the
  -- current Finance-only guard and the original server-side actor stamping.
  if position('save_finance_operational_state_pre_finance_only' in v_finance_source)>0 then
    if to_regprocedure('public.save_finance_operational_state_pre_finance_only(bigint,jsonb)') is null then
      raise exception 'Finance pre-finance-only delegate is missing';
    end if;
    if position('FINANCE_ROLE_REQUIRED' in v_finance_source)=0
       or position('current_staff_role' in v_finance_source)=0 then
      raise exception 'Finance-only operational-state boundary is incomplete';
    end if;

    select pg_get_functiondef('public.save_finance_operational_state_pre_finance_only(bigint,jsonb)'::regprocedure)
      into v_finance_delegate_source;
    v_finance_contract_source := v_finance_contract_source || E'\n' || v_finance_delegate_source;
  end if;

  if position('display_name' in v_finance_contract_source)=0
     or position('updatedAt' in v_finance_contract_source)=0 then
    raise exception 'Finance verification actor is not server-stamped';
  end if;
end $$;