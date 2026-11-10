-- M1 manager role: fixed access matrix, read-all orders, catalog editing rights,
-- review settings, and "still assignable as florist" plumbing.
begin;

do $static$
declare
  v_function text;
begin
  if not private.has_section_access_for_role('manager', 'catalog', 'edit') then raise exception 'Manager must edit the catalog'; end if;
  if not private.has_section_access_for_role('manager', 'orders', 'view') then raise exception 'Manager must view orders'; end if;
  if private.has_section_access_for_role('manager', 'orders', 'edit') then raise exception 'Manager must not edit orders'; end if;
  if not private.has_section_access_for_role('manager', 'customers', 'view') then raise exception 'Manager must view customers'; end if;
  if private.has_section_access_for_role('manager', 'finance', 'view')
     or private.has_section_access_for_role('manager', 'revenue', 'view')
     or private.has_section_access_for_role('manager', 'hr', 'view')
     or private.has_section_access_for_role('manager', 'scheduling', 'view')
     or private.has_section_access_for_role('manager', 'settings', 'view') then
    raise exception 'Manager reached a section outside operations';
  end if;

  if not private.has_action_permission_for_role('manager', 'orders.read_all') then raise exception 'Manager must read every order'; end if;
  if not private.has_action_permission_for_role('manager', 'orders.read_assigned') then raise exception 'Manager must read assigned work'; end if;
  if exists (
    select 1 from private.action_capability_registry r
    where r.capability not in ('orders.read_all', 'orders.read_assigned')
      and private.has_action_permission_for_role('manager', r.capability)
  ) then
    raise exception 'Manager holds a capability beyond read-only orders';
  end if;

  if not private.notification_kind_allowed_for_role('manager', 'order_assigned') then raise exception 'Manager must be told about assigned work'; end if;
  if private.notification_kind_allowed_for_role('manager', 'order_received') then raise exception 'Manager must not get every new-order notification'; end if;
  if not private.notification_kind_allowed_for_role('admin', 'order_received') then raise exception 'Admin new-order notifications regressed'; end if;

  if private.staff_employee_role_label('manager') <> 'Manajer' then raise exception 'Manager label missing'; end if;
  if not ('manager' = any(private.enabled_staff_roles())) then raise exception 'Manager role is not enabled'; end if;

  foreach v_function in array array['process_order_for_production', 'start_paid_order_production'] loop
    if position($t$not in ('florist','manager')$t$ in pg_get_functiondef(
         (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = v_function))) = 0 then
      raise exception 'public.% does not accept a manager as the producing florist', v_function;
    end if;
  end loop;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'mg-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'mg-manager@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-0000000000e3', 'authenticated', 'authenticated', 'mg-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email, branch_id) values
  ('a1000000-0000-4000-8000-0000000000e1', 'mg-owner', 'MG Owner', 'owner', true, 'mg-owner', 'mg-owner@fleurstales.test', null),
  ('a1000000-0000-4000-8000-0000000000e2', 'emp-mg-manager', 'MG Manajer', 'manager', true, 'mg-manager', 'mg-manager@fleurstales.test', null),
  ('a1000000-0000-4000-8000-0000000000e3', 'emp-mg-florist', 'MG Florist', 'florist', true, 'mg-florist', 'mg-florist@fleurstales.test', 'Kedamaian');

set local session_replication_role = replica;
insert into public.orders(id, order_number, revision, customer_name_snapshot, source, fulfillment, status, branch_id,
  total_idr, items_subtotal_idr, discount_idr, delivery_fee_idr, payment_status, paid_amount_idr, payment_method,
  florist_schedule_override, finance_verified, edit_unlocked, created_at, updated_at, public_tracking_id, delivery_address)
values
  ('ord-mg-1', 'SMK-MG-1', 1, 'MG 1', 'whatsapp', 'delivery', 'processing', 'Kedamaian',
   300000, 275000, 0, 25000, 'paid', 300000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), 'Jl. Mawar 1'),
  ('ord-mg-2', 'SMK-MG-2', 1, 'MG 2', 'whatsapp', 'delivery', 'processing', 'Pahoman',
   200000, 175000, 0, 25000, 'paid', 200000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), 'Jl. Melati 2');
update public.orders set florist_assigned_employee_id = 'emp-mg-manager' where id = 'ord-mg-1';
update public.orders set florist_assigned_employee_id = 'emp-mg-florist' where id = 'ord-mg-2';
set local session_replication_role = origin;

-- Owner can invite the role.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $owner$
begin
  if not public.can_invite_staff_role('manager') then raise exception 'Owner must be able to invite a manager'; end if;
end
$owner$;
reset role;

-- Manager: every order in every branch, review settings, catalog recipes.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $manager$
declare
  v_config jsonb;
begin
  if (select count(*) from public.orders where id in ('ord-mg-1', 'ord-mg-2')) <> 2 then
    raise exception 'Manager must read orders of every branch and every florist';
  end if;
  v_config := public.get_review_configuration();
  if v_config is null then raise exception 'Manager could not open review settings'; end if;
  perform count(*) from public.product_variant_flower_recipes;
  if public.can_invite_staff_role('florist') then raise exception 'Manager must not invite staff'; end if;
end
$manager$;
reset role;

-- Florist is unchanged: assigned orders only, no review settings.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
set local role authenticated;
do $florist$
begin
  if (select count(*) from public.orders where id in ('ord-mg-1', 'ord-mg-2')) <> 1 then
    raise exception 'Florist visibility changed';
  end if;
  begin
    perform public.get_review_configuration();
    raise exception 'Florist opened review settings';
  exception when insufficient_privilege then null;
  end;
end
$florist$;
reset role;

rollback;
