-- M5a: inventory foundation (items, suppliers, purchases, Finance decision). Rolls back.
begin;

do $static$
declare t text;
begin
  foreach t in array array['inventory_items', 'inventory_suppliers', 'inventory_purchases', 'inventory_movements'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception '% must only be reachable through functions', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.save_inventory_item(uuid,text,text,text,text,numeric,boolean,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.save_inventory_supplier(uuid,text,text,text,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_inventory_purchase(uuid,uuid,numeric,bigint,text,date,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.decide_inventory_purchase(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_inventory_overview(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_inventory_purchases(text,integer)', 'EXECUTE') then
    raise exception 'Inventory functions must not be anonymous';
  end if;
  if not private.has_action_permission_for_role('manager', 'inventory.manage')
     or not private.has_action_permission_for_role('owner', 'inventory.manage')
     or private.has_action_permission_for_role('admin', 'inventory.manage')
     or private.has_action_permission_for_role('finance', 'inventory.manage')
     or not private.has_action_permission_for_role('finance', 'inventory.confirm_purchase')
     or private.has_action_permission_for_role('manager', 'inventory.confirm_purchase') then
    raise exception 'inventory capabilities are wrong';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'inv-manager@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'inv-finance@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'inv-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email, branch_id) values
  ('a7000000-0000-4000-8000-0000000000c1', 'emp-inv-manager', 'Inv Manajer', 'manager', true, 'inv-manager', 'inv-manager@fleurstales.test', null),
  ('a7000000-0000-4000-8000-0000000000c2', 'emp-inv-finance', 'Inv Finance', 'finance', true, 'inv-finance', 'inv-finance@fleurstales.test', null),
  ('a7000000-0000-4000-8000-0000000000c3', 'emp-inv-admin', 'Inv Admin', 'admin', true, 'inv-admin', 'inv-admin@fleurstales.test', 'Kedamaian');

-- Admin: may read, may not write.
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
do $admin$
begin
  perform public.get_inventory_overview(null);
  begin
    perform public.save_inventory_item(null, 'Kedamaian', 'Admin item', 'flowers', 'tangkai', 5, true, false);
    raise exception 'Admin must not manage inventory';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_inventory_purchases(null, 10);
    raise exception 'Admin must not read purchases';
  exception when insufficient_privilege then null; end;
end
$admin$;
reset role;

-- Manager: full flow.
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
do $manager$
declare
  v_item uuid;
  v_supplier uuid;
  v_purchase jsonb;
  v_overview jsonb;
  v_row jsonb;
begin
  v_item := (public.save_inventory_item(null, 'Kedamaian', 'Mawar Merah', 'flowers', 'tangkai', 20, true, false)->>'id')::uuid;
  v_supplier := (public.save_inventory_supplier(null, 'Pasar Bunga', '0812', 'Langganan', true)->>'id')::uuid;

  begin
    perform public.save_inventory_item(null, 'Kedamaian', 'mawar merah', 'flowers', 'tangkai', 5, true, false);
    raise exception 'Duplicate item name must be rejected';
  exception when unique_violation then null; end;

  begin
    perform public.record_inventory_purchase(v_item, v_supplier, 0, 1000, 'cash:main', current_date, null);
    raise exception 'Zero quantity must be rejected';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_inventory_purchase(v_item, v_supplier, 10, 1000, 'not-an-account', current_date, null);
    raise exception 'Unknown funding account must be rejected';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_inventory_purchase(v_item, v_supplier, 10, 1000, 'cash:main', current_date + 3, null);
    raise exception 'Future purchase date must be rejected';
  exception when invalid_parameter_value then null; end;

  v_purchase := public.record_inventory_purchase(v_item, v_supplier, 50, 2000, 'cash:main', current_date, 'Pagi');
  if v_purchase->>'status' <> 'pending_finance' or (v_purchase->>'totalIdr')::bigint <> 100000 then
    raise exception 'Purchase should be pending with total 100000, got %', v_purchase;
  end if;
  -- Second purchase at a different price: weighted average (50*2000 + 50*3000) / 100 = 2500.
  perform public.record_inventory_purchase(v_item, v_supplier, 50, 3000, 'cash:main', current_date, null);

  v_overview := public.get_inventory_overview('Kedamaian');
  select e into v_row from jsonb_array_elements(v_overview->'items') e where e->>'name' = 'Mawar Merah';
  if (v_row->>'quantity')::numeric <> 100 or (v_row->>'avgUnitCostIdr')::bigint <> 2500 or (v_row->>'lastUnitCostIdr')::bigint <> 3000 then
    raise exception 'Item totals wrong: %', v_row;
  end if;

  begin
    perform public.decide_inventory_purchase((v_purchase->>'id')::uuid, 'confirmed', null);
    raise exception 'Manager must not decide purchases';
  exception when insufficient_privilege then null; end;

  perform set_config('app.test_purchase', v_purchase->>'id', true);
  perform set_config('app.test_item', v_item::text, true);
end
$manager$;
reset role;

-- Finance: confirm the first purchase, reject a second one.
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
do $finance$
declare
  v_first uuid := current_setting('app.test_purchase')::uuid;
  v_item uuid := current_setting('app.test_item')::uuid;
  v_second uuid;
  v_res jsonb;
  v_qty numeric;
begin
  if jsonb_array_length(public.get_inventory_purchases('pending_finance', 50)) <> 2 then
    raise exception 'Finance should see two pending purchases';
  end if;

  v_res := public.decide_inventory_purchase(v_first, 'confirmed', null);
  if v_res->>'status' <> 'confirmed' or (v_res->>'totalIdr')::bigint <> 100000 or v_res->>'fundingAccountId' <> 'cash:main' then
    raise exception 'Confirm result wrong: %', v_res;
  end if;
  if (public.decide_inventory_purchase(v_first, 'rejected', 'late')->>'alreadyDecided')::boolean is not true then
    raise exception 'A decided purchase must not change';
  end if;

  select (e->>'id')::uuid into v_second from jsonb_array_elements(public.get_inventory_purchases('pending_finance', 50)) e limit 1;
  begin
    perform public.decide_inventory_purchase(v_second, 'rejected', null);
    raise exception 'Rejecting without a reason must fail';
  exception when invalid_parameter_value then null; end;
  perform public.decide_inventory_purchase(v_second, 'rejected', 'Nota tidak jelas');

  begin
    perform public.save_inventory_item(null, 'Kedamaian', 'Finance item', 'flowers', 'tangkai', 5, true, false);
    raise exception 'Finance must not manage inventory';
  exception when insufficient_privilege then null; end;
end
$finance$;
reset role;

do $after$
declare
  v_qty numeric;
  v_moves int;
begin
  select quantity into v_qty from public.inventory_items where id = current_setting('app.test_item')::uuid;
  -- 100 bought, one 50-stem purchase rejected -> 50 left.
  if v_qty <> 50 then raise exception 'Rejected purchase must be taken back out of stock, qty=%', v_qty; end if;
  select count(*) into v_moves from public.inventory_movements where item_id = current_setting('app.test_item')::uuid;
  if v_moves <> 3 then raise exception 'Expected 3 movements, got %', v_moves; end if;
  if (select count(*) from public.business_activities where kind like 'inventory_purchase%') < 4 then
    raise exception 'Purchase activity was not logged';
  end if;
end
$after$;

rollback;
