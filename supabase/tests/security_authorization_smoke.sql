-- Fleurstales V3.2 authorization/workflow structural smoke checks.
-- Run after all migrations on a real Supabase/Postgres project.
begin;

do $$
declare
  v_name text;
  v_write_tables text[] := array[
    'orders','order_items','order_payment_events','order_activities',
    'customers','customer_addresses',
    'store_profile','branches','public_payment_accounts','storefront_payment_settings',
    'occasions','products','product_occasions','product_variants','product_variant_costs',
    'product_images','size_guide_templates','size_guide_targets',
    'business_activities','staff_notifications'
  ];
  v_payroll_rpcs text[] := array[
    'payroll_set_compensation','payroll_prepare','payroll_generate','payroll_submit',
    'payroll_resolve_rejected','payroll_approve_employee','payroll_reject_employee',
    'payroll_approve_all','payroll_record_payment','payroll_adjust_schedule'
  ];
begin
  -- New authoritative configuration and durable event infrastructure.
  if to_regclass('private.authorization_state') is null
    or to_regclass('private.role_section_permissions') is null
    or to_regclass('private.action_capability_registry') is null
    or to_regclass('private.role_action_permissions') is null
    or to_regclass('private.feature_settings') is null then
    raise exception 'V3.2 authorization tables missing';
  end if;

  if to_regclass('private.operational_domain_state') is null then
    raise exception 'private.operational_domain_state missing';
  end if;
  if to_regclass('private.audit_events') is null then
    raise exception 'private.audit_events missing';
  end if;
  if to_regclass('public.business_activities') is null
    or to_regclass('public.staff_notifications') is null then
    raise exception 'Durable activity/notification tables missing';
  end if;

  if to_regprocedure('public.get_authorization_config()') is null
    or to_regprocedure('public.save_authorization_config(bigint,jsonb,jsonb,jsonb)') is null then
    raise exception 'Authorization RPCs missing';
  end if;
  if to_regprocedure('public.get_operational_domain_state(text)') is null
    or to_regprocedure('public.save_operational_domain_state(text,bigint,jsonb)') is null
    or to_regprocedure('public.save_hr_operational_state(bigint,jsonb)') is null
    or to_regprocedure('public.save_finance_operational_state(bigint,jsonb)') is null then
    raise exception 'Operational-domain RPCs missing';
  end if;
  if to_regprocedure('public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.save_order_operational_state_v31_internal(text,integer,integer,jsonb,jsonb,jsonb)') is null then
    raise exception 'Secured Orders RPC boundary missing';
  end if;
  if to_regprocedure('public.mark_notifications_read(uuid[])') is null
    or to_regprocedure('public.record_mutation_conflict(text,text,text,bigint,bigint)') is null then
    raise exception 'Notification/conflict RPCs missing';
  end if;

  foreach v_name in array v_payroll_rpcs loop
    if to_regprocedure(format('public.%I(bigint,jsonb)', v_name)) is null then
      raise exception 'Payroll workflow RPC missing: %', v_name;
    end if;
    if not has_function_privilege('authenticated', format('public.%I(bigint,jsonb)', v_name), 'EXECUTE') then
      raise exception 'authenticated cannot execute Payroll workflow RPC: %', v_name;
    end if;
  end loop;

  -- Internal helpers/writers must not become public mutation APIs.
  if has_function_privilege(
    'authenticated',
    'public.save_order_operational_state_v31_internal(text,integer,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can bypass the V3.2 Orders authority wrapper';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute secured Orders RPC';
  end if;
  if has_function_privilege('anon', 'private.can_read_order_row(text,text)', 'EXECUTE') then
    raise exception 'anon can execute staff Orders RLS helper';
  end if;
  if not has_function_privilege('authenticated', 'private.can_read_order_row(text,text)', 'EXECUTE') then
    raise exception 'authenticated cannot evaluate Orders RLS helper';
  end if;

  -- Sensitive mutations are RPC-owned, not direct browser table writes.
  foreach v_name in array v_write_tables loop
    if has_table_privilege('authenticated', format('public.%I', v_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', v_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', v_name), 'DELETE') then
      raise exception 'authenticated retains direct write privilege on public.%', v_name;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'private.operational_domain_state', 'SELECT')
    or has_table_privilege('authenticated', 'private.operational_domain_state', 'INSERT')
    or has_table_privilege('authenticated', 'private.operational_domain_state', 'UPDATE')
    or has_table_privilege('authenticated', 'private.operational_domain_state', 'DELETE') then
    raise exception 'authenticated has direct access to private operational state';
  end if;
  if has_table_privilege('authenticated', 'private.audit_events', 'INSERT')
    or has_table_privilege('authenticated', 'private.audit_events', 'UPDATE')
    or has_table_privilege('authenticated', 'private.audit_events', 'DELETE') then
    raise exception 'authenticated can directly mutate immutable audit events';
  end if;

  -- RLS must defer to backend authorization helpers, not hard-coded UI assumptions.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='customers' and policyname='customers_crm_read'
      and qual ilike '%has_section_access%customers%'
  ) then
    raise exception 'Customers RLS is not configuration-driven';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='orders' and policyname='orders_staff_read'
      and qual ilike '%can_read_order_row%'
  ) then
    raise exception 'Orders row-scope RLS missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='staff_notifications' and policyname='staff_notifications_own_read'
      and qual ilike '%can_read_staff_notification%'
  ) then
    raise exception 'Notification permission-aware ownership RLS missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='can_read_order_row'
      and pg_get_functiondef(p.oid) ilike '%has_action_permission%orders.read_all%'
      and pg_get_functiondef(p.oid) ilike '%orders.read_assigned%'
      and pg_get_functiondef(p.oid) ilike '%p_florist_employee_id%'
  ) then
    raise exception 'Orders helper does not enforce configured read capability + assignment scope';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='apply_payroll_workflow_state'
      and pg_get_functiondef(p.oid) ilike '%PAYROLL_COMMAND_SCOPE_VIOLATION%'
      and pg_get_functiondef(p.oid) ilike '%payroll-expense:%'
  ) then
    raise exception 'Payroll command isolation/final-payment finance integration missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='can_write_operational_domain'
      and pg_get_functiondef(p.oid) ilike '%when ''hr'' then false%'
      and pg_get_functiondef(p.oid) ilike '%when ''finance'' then false%'
      and pg_get_functiondef(p.oid) ilike '%when ''payroll'' then false%'
  ) then
    raise exception 'Sensitive domains are still exposed through generic operational writes';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_hr_operational_state'
      and pg_get_functiondef(p.oid) ilike '%HR_PIN_MUST_NOT_BE_PERSISTED%'
      and pg_get_functiondef(p.oid) ilike '%hr.create_employee%'
      and pg_get_functiondef(p.oid) ilike '%hr.correct_attendance%'
  ) then
    raise exception 'HR operational writer is not action-aware';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_finance_operational_state'
      and pg_get_functiondef(p.oid) ilike '%finance.create_ledger_entry%'
      and pg_get_functiondef(p.oid) ilike '%finance.verify_ledger_entry%'
      and pg_get_functiondef(p.oid) ilike '%FINANCE_LEDGER_ENTRY_IMMUTABLE%'
  ) then
    raise exception 'Finance operational writer is not action-aware/append-only';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='notification_kind_allowed_for_role'
      and pg_get_functiondef(p.oid) ilike '%orders.read_all%'
      and pg_get_functiondef(p.oid) ilike '%finance.view_payroll%'
      and pg_get_functiondef(p.oid) ilike '%orders.read_assigned%'
  ) then
    raise exception 'Notifications can bypass configured role/action permissions';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_order_operational_state'
      and pg_get_functiondef(p.oid) ilike '%FLORIST_REQUIRED_BEFORE_PROCESSING%'
      and pg_get_functiondef(p.oid) ilike '%ORDER_UNDO_EVIDENCE_REQUIRED%'
      and pg_get_functiondef(p.oid) ilike '%finance_verified_by%v_actor_name%'
  ) then
    raise exception 'Orders server workflow/actor authority incomplete';
  end if;

  -- No personal email may be a permanent owner-authority primitive.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where pg_get_functiondef(p.oid) ilike '%new.email%'
      and (p.proname ilike '%owner%' or p.proname ilike '%bootstrap%')
  ) then
    raise exception 'Owner bootstrap still authorizes by personal email';
  end if;
end;
$$;

rollback;
