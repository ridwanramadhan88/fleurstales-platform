-- Fleurstales V3.3 staff identity / Settings / runtime branch smoke test.
-- Run after all migrations. Transaction is rolled back.
begin;

do $$
declare
  v_roles text[];
  v_revision bigint;
  v_def text;
begin
  select allowed_roles into v_roles
  from private.action_capability_registry
  where capability='finance.verify_order';
  if v_roles is distinct from array['owner','finance']::text[] then
    raise exception 'finance.verify_order role-family eligibility mismatch: %', v_roles;
  end if;

  select allowed_roles into v_roles
  from private.action_capability_registry
  where capability='hr.create_employee';
  if v_roles is distinct from array['owner','hr']::text[] then
    raise exception 'hr.create_employee role-family eligibility mismatch: %', v_roles;
  end if;

  if private.section_role_eligible('admin','finance') then
    raise exception 'Admin crossed into Finance workspace authority domain';
  end if;
  if private.section_role_eligible('florist','orders') then
    raise exception 'Florist received the full Orders workspace domain';
  end if;
  if private.section_access_for_role('admin','finance') <> 'none' then
    raise exception 'Cross-domain section permission is not fail-closed';
  end if;

  if private.has_action_permission_for_role('admin','finance.verify_order') then
    raise exception 'Admin crossed into Finance authority through configurable capability';
  end if;
  if private.has_action_permission_for_role('finance','hr.edit_employee') then
    raise exception 'Finance crossed into HR authority through configurable capability';
  end if;

  select revision into v_revision
  from private.internal_settings_state
  where id='primary';
  if v_revision is null or v_revision < 1 then
    raise exception 'Internal Settings revision state is invalid';
  end if;
  if not exists (
    select 1 from private.internal_settings_state
    where id='primary'
      and jsonb_typeof(staff_roles)='object'
      and jsonb_typeof(attendance)='object'
      and jsonb_typeof(scheduling)='object'
      and jsonb_typeof(payroll)='object'
      and jsonb_typeof(scheduling_revisions)='array'
      and jsonb_typeof(payroll_revisions)='array'
  ) then
    raise exception 'Internal Settings payload is not fully initialized';
  end if;

  if to_regclass('private.staff_runtime_context') is null then
    raise exception 'staff_runtime_context missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='private' and table_name='staff_runtime_context' and column_name='session_id'
  ) then
    raise exception 'staff_runtime_context is not scoped per Auth session';
  end if;

  select pg_get_functiondef('private.current_staff_branch_id()'::regprocedure) into v_def;
  if position('staff_runtime_context' in v_def)=0 or position('session_id' in v_def)=0 then
    raise exception 'RLS branch helper does not consume per-session runtime context';
  end if;

  if to_regprocedure('public.set_staff_runtime_context(text,text,date)') is null then
    raise exception 'set_staff_runtime_context RPC missing';
  end if;
  if to_regprocedure('public.can_invite_staff_role(text)') is null then
    raise exception 'can_invite_staff_role RPC missing';
  end if;
  if to_regprocedure('public.sync_staff_access_profile(text,text,text,boolean,text)') is null then
    raise exception 'sync_staff_access_profile RPC missing';
  end if;

  select pg_get_functiondef('public.payroll_record_payment(bigint,jsonb)'::regprocedure) into v_def;
  if position('PAYROLL_PAYMENT_REQUIRES_EXACTLY_ONE_PROPOSAL' in v_def)=0 then
    raise exception 'Payroll final payment does not enforce exactly one newly-paid proposal';
  end if;
end;
$$;

rollback;
