-- D3 shipment: Owner/Admin record Gojek or internal delivery, the real Gojek
-- cost is booked/corrected/voided in Finance from the branch courier account,
-- the tracking link reaches the customer page only while on the way. Rolls back.
begin;

do $static$
begin
  if has_function_privilege('anon', 'public.save_order_shipment_guarded(text,integer,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.save_order_shipment(text,integer,jsonb)', 'EXECUTE') then
    raise exception 'save_order_shipment must only be reachable through the guarded wrapper';
  end if;
  if has_function_privilege('authenticated', 'private.sync_delivery_courier_expense(text,text,text)', 'EXECUTE') then
    raise exception 'sync_delivery_courier_expense must stay private';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'd3000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'ship-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd3000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'ship-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('d3000000-0000-4000-8000-0000000000e1', 'ship-owner', 'Ship Owner', 'owner', true, 'ship-owner', 'ship-owner@fleurstales.test'),
  ('d3000000-0000-4000-8000-0000000000e2', 'emp-ship-florist', 'Ship Florist', 'florist', true, 'ship-florist', 'ship-florist@fleurstales.test');

insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('finance', 1, '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb, now())
on conflict (domain) do update set snapshot = '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb;

set local session_replication_role = replica;
insert into public.orders(id, order_number, revision, customer_name_snapshot, source, fulfillment, status, branch_id,
  total_idr, items_subtotal_idr, discount_idr, delivery_fee_idr, payment_status, paid_amount_idr, payment_method,
  florist_schedule_override, finance_verified, edit_unlocked, created_at, updated_at, public_tracking_id, delivery_address)
values
  ('ord-ship-a', 'SMK-SHIP-A', 1, 'Ship A', 'whatsapp', 'delivery', 'ready', 'Kedamaian',
   300000, 275000, 0, 25000, 'paid', 300000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), 'Jl. Mawar 1'),
  ('ord-ship-pick', 'SMK-SHIP-P', 1, 'Ship P', 'whatsapp', 'pickup', 'ready', 'Kedamaian',
   100000, 100000, 0, 0, 'paid', 100000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), null);
set local session_replication_role = origin;

create temporary table ship_ctx(key text primary key, value text) on commit drop;
grant all on ship_ctx to authenticated;

-- Florist cannot record a shipment.
select set_config('request.jwt.claims', '{"sub":"d3000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $florist$
begin
  perform public.save_order_shipment_guarded('ord-ship-a', 1, '{"provider":"internal"}');
  raise exception 'Florist saved a shipment';
exception when insufficient_privilege then null;
end
$florist$;
reset role;

select set_config('request.jwt.claims', '{"sub":"d3000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $owner$
declare
  v_result jsonb;
  v_rev int;
  v_message text;
begin
  select revision into v_rev from public.orders where id = 'ord-ship-a';

  begin
    perform public.save_order_shipment_guarded('ord-ship-a', v_rev - 1, '{"provider":"internal"}');
    raise exception 'Stale revision accepted';
  exception when sqlstate 'PT409' then null;
  end;

  begin
    perform public.save_order_shipment_guarded('ord-ship-pick', 1, '{"provider":"internal"}');
    raise exception 'Pickup order accepted a shipment';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'ORDER_NOT_DELIVERY' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  begin
    perform public.save_order_shipment_guarded('ord-ship-a', v_rev, '{"provider":"gojek","actualCostIdr":-5}');
    raise exception 'Negative cost accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_order_shipment_guarded('ord-ship-a', v_rev, '{"provider":"gojek","actualCostIdr":20000,"trackingUrl":"http://x.test/a"}');
    raise exception 'Non-https link accepted';
  exception when invalid_parameter_value then null;
  end;

  -- No courier payment account yet: shipment is saved, expense is not.
  v_result := public.save_order_shipment_guarded('ord-ship-a', v_rev,
    '{"provider":"gojek","actualCostIdr":20000,"trackingUrl":"https://gojek.link/abc"}');
  if (v_result->>'financeRecorded')::boolean is not false or v_result->>'financeReason' <> 'COURIER_PAYMENT_ACCOUNT_REQUIRED' then
    raise exception 'Expected no expense without an account: %', v_result;
  end if;
  insert into ship_ctx values ('rev', (v_result->>'revision'));
end
$owner$;
reset role;

do $nofin$
begin
  if jsonb_array_length((select snapshot->'transactions' from private.operational_domain_state where domain = 'finance')) <> 0 then
    raise exception 'Ledger must stay empty without a courier account';
  end if;
end
$nofin$;

-- Owner picks the courier account; saving again books the expense.
update public.branches set courier_payment_account_id = 'cash:main' where id = 'Kedamaian';

select set_config('request.jwt.claims', '{"sub":"d3000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $book$
declare
  v_result jsonb;
begin
  v_result := public.save_order_shipment_guarded('ord-ship-a', (select value::int from ship_ctx where key = 'rev'),
    '{"provider":"gojek","actualCostIdr":22000,"trackingUrl":"https://gojek.link/abc"}');
  if (v_result->>'financeRecorded')::boolean is not true then raise exception 'Expense not booked: %', v_result; end if;
  update ship_ctx set value = v_result->>'revision' where key = 'rev';
end
$book$;
reset role;

do $check1$
declare
  v_tx jsonb;
begin
  select x into v_tx from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
  where s.domain = 'finance' and x->>'source' = 'delivery_courier';
  if v_tx is null or (v_tx->>'amount')::bigint <> 22000 or v_tx->>'type' <> 'expense'
     or v_tx->>'accountId' <> 'cash:main' or v_tx->>'status' <> 'verified' or v_tx->>'branch' <> 'Kedamaian' then
    raise exception 'Courier expense wrong: %', v_tx;
  end if;
  if (select delivery_cost_txn_id from public.orders where id = 'ord-ship-a') <> v_tx->>'id' then
    raise exception 'Order must remember its expense';
  end if;
end
$check1$;

-- Changing the cost corrects the same transaction (no duplicate).
select set_config('request.jwt.claims', '{"sub":"d3000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $correct$
declare
  v_result jsonb;
begin
  v_result := public.save_order_shipment_guarded('ord-ship-a', (select value::int from ship_ctx where key = 'rev'),
    '{"provider":"gojek","actualCostIdr":25000,"trackingUrl":"https://gojek.link/abc"}');
  update ship_ctx set value = v_result->>'revision' where key = 'rev';
end
$correct$;
reset role;

do $check2$
begin
  if (select count(*) from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'source' = 'delivery_courier') <> 1 then
    raise exception 'Correction must not duplicate the expense';
  end if;
  if (select (x->>'amount')::bigint from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'source' = 'delivery_courier') <> 25000 then
    raise exception 'Expense amount not corrected';
  end if;
end
$check2$;

-- Tracking link: visible while on the way, hidden before and after.
update public.orders set status = 'delivering' where id = 'ord-ship-a';
do $public$
declare
  v_status jsonb;
  v_tracking text := (select public_tracking_id::text from public.orders where id = 'ord-ship-a');
begin
  v_status := public.get_order_public_status(v_tracking);
  if v_status->>'deliveryTrackingUrl' is distinct from 'https://gojek.link/abc' or v_status->>'deliveryProvider' <> 'gojek' then
    raise exception 'Tracking link missing while delivering: %', v_status;
  end if;
  update public.orders set status = 'delivered' where id = 'ord-ship-a';
  v_status := public.get_order_public_status(v_tracking);
  if v_status ? 'deliveryTrackingUrl' and v_status->>'deliveryTrackingUrl' is not null then
    raise exception 'Tracking link must close after delivery';
  end if;
  update public.orders set status = 'delivering' where id = 'ord-ship-a';
end
$public$;

-- Switching to the internal courier voids the Gojek expense.
select set_config('request.jwt.claims', '{"sub":"d3000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $internal$
declare
  v_result jsonb;
begin
  v_result := public.save_order_shipment_guarded('ord-ship-a', (select revision from public.orders where id = 'ord-ship-a'),
    '{"provider":"internal","courierName":"Pak Joko"}');
  if (v_result->>'financeRecorded')::boolean is not false then raise exception 'Internal courier must not book cost: %', v_result; end if;
end
$internal$;
reset role;

do $check3$
begin
  if (select x->>'status' from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'source' = 'delivery_courier') <> 'void' then
    raise exception 'Switching to internal must void the Gojek expense';
  end if;
  if (select delivery_courier_name from public.orders where id = 'ord-ship-a') <> 'Pak Joko'
     or (select delivery_tracking_url from public.orders where id = 'ord-ship-a') is not null then
    raise exception 'Internal shipment fields wrong';
  end if;
end
$check3$;

-- Gojek again, then cancel: expense voided automatically.
select set_config('request.jwt.claims', '{"sub":"d3000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $again$
begin
  perform public.save_order_shipment_guarded('ord-ship-a', (select revision from public.orders where id = 'ord-ship-a'),
    '{"provider":"gojek","actualCostIdr":30000}');
end
$again$;
reset role;
do $cancel$
begin
  if (select count(*) from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'source' = 'delivery_courier' and x->>'status' <> 'void') <> 1 then
    raise exception 'Gojek expense should be live again';
  end if;
  update public.orders set status = 'cancelled' where id = 'ord-ship-a';
  if (select count(*) from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'source' = 'delivery_courier' and x->>'status' <> 'void') <> 0 then
    raise exception 'Cancelling the order must void the courier expense';
  end if;
end
$cancel$;

rollback;
