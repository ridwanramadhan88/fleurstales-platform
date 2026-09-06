-- Company-wide staff reads vs Admin operational branch ownership.
-- Read visibility must never be narrowed by the Admin runtime branch. Normal
-- operational mutations remain branch-scoped, while the dedicated payment
-- confirmation flow has a narrow company-wide payment-only exception.

do $$
declare
  v_source text;
  v_policy text;
begin
  if not exists (
    select 1 from private.role_section_permissions
    where role='hr' and section='orders' and access_level in ('view','edit')
  ) or not exists (
    select 1 from private.role_section_permissions
    where role='hr' and section='customers' and access_level in ('view','edit')
  ) then
    raise exception 'HR read-only Orders/Customers access is missing';
  end if;

  -- Check effective section access as well as raw rows. Role-domain eligibility
  -- guards can otherwise silently coerce or mask a configured `view` row.
  if not private.has_section_access_for_role('hr','orders','view')
     or not private.has_section_access_for_role('hr','customers','view') then
    raise exception 'HR effective Orders/Customers read domain is missing';
  end if;

  if not private.has_action_permission_for_role('hr','orders.read_all') then
    raise exception 'HR company-wide order read capability is missing';
  end if;

  -- This migration follows the Finance-only hardening migration and must never
  -- widen that authority domain while extending HR read eligibility.
  if private.section_role_eligible('owner','finance')
     or private.section_role_eligible('admin','finance')
     or not private.section_role_eligible('finance','finance') then
    raise exception 'Staff read migration regressed the Finance-only workspace boundary';
  end if;
  if private.section_access_for_role('owner','finance') <> 'none'
     or private.section_access_for_role('admin','finance') <> 'none'
     or private.section_access_for_role('finance','finance') <> 'edit' then
    raise exception 'Effective Finance workspace access no longer matches the Finance-only boundary';
  end if;

  select pg_get_functiondef('private.can_read_order_row(text,text)'::regprocedure) into v_source;
  if position('orders.read_all' in v_source)=0
     or position('orders.read_assigned' in v_source)=0
     or position('current_staff_employee_id' in v_source)=0 then
    raise exception 'Order read helper lost configured company-wide/assigned read capabilities';
  end if;
  if position('current_staff_branch_id' in v_source)>0
     or position('v_branch_id' in v_source)>0 then
    raise exception 'Order read helper reintroduced branch-scoped visibility';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where n.nspname='public'
      and c.relname='orders'
      and t.tgname='enforce_admin_order_mutation_branch'
      and not t.tgisinternal
      and pn.nspname='private'
      and p.proname='enforce_admin_order_mutation_branch'
  ) then
    raise exception 'Admin order mutation branch trigger is missing';
  end if;

  select pg_get_functiondef('private.enforce_admin_order_mutation_branch()'::regprocedure) into v_source;
  if position('current_staff_role' in v_source)=0
     or position('current_staff_branch_id' in v_source)=0
     or position('ORDER_OUTSIDE_BRANCH_SCOPE' in v_source)=0
     or position('admin' in lower(v_source))=0
     or position('is distinct from' in lower(v_source))=0 then
    raise exception 'Admin order mutation trigger lost its authoritative/null-safe branch guard';
  end if;

  -- Payment confirmation may be company-wide for Admin, but the bypass must be
  -- restricted to confirmed orders and payment-only columns. In particular,
  -- lifecycle status, florist assignment, branch, and all other order fields
  -- must still fall through to the operational branch guard above.
  if position('v_payment_only_update' in v_source)=0
     or position('orders.advance_status' in v_source)=0
     or position('payment_proof_url' in v_source)=0
     or position('payment_status' in v_source)=0
     or position('paid_amount_idr' in v_source)=0
     or position('to_jsonb' in lower(v_source))=0
     or position('old.status = ''confirmed''' in lower(v_source))=0
     or position('new.status = ''confirmed''' in lower(v_source))=0 then
    raise exception 'Admin payment confirmation exception is missing or too broad';
  end if;

  -- Orders RLS must continue delegating row visibility to the helper.
  select qual into v_policy
  from pg_policies
  where schemaname='public' and tablename='orders' and policyname='orders_staff_read';
  if v_policy is null or position('can_read_order_row' in v_policy)=0 then
    raise exception 'Orders read policy no longer delegates to company-wide read helper';
  end if;

  select pg_get_functiondef('public.get_staff_reviews(text,text)'::regprocedure) into v_source;
  if position('has_section_access' in v_source)=0
     or position('orders.read_all' in v_source)=0
     or position('can_read_order_row' in v_source)=0 then
    raise exception 'Staff review reader is not aligned with Orders/Customers read permissions';
  end if;
  if not has_function_privilege('authenticated','public.get_staff_reviews(text,text)','EXECUTE')
     or has_function_privilege('anon','public.get_staff_reviews(text,text)','EXECUTE') then
    raise exception 'Staff review reader grants are incorrect';
  end if;

  -- Notifications are awareness/read surfaces. Admin may see company-wide
  -- notifications; operational order mutation authority remains branch-scoped.
  select pg_get_functiondef('private.can_read_staff_notification(public.staff_notifications)'::regprocedure) into v_source;
  if position('notification_kind_allowed_for_role' in v_source)=0 then
    raise exception 'Notification reads lost capability-aware filtering';
  end if;
  if position('current_staff_branch_id' in v_source)>0 then
    raise exception 'Admin notification reads are still branch-scoped';
  end if;
end $$;
