-- D4 courier accounts: assignment, assigned-orders-only visibility, start /
-- complete delivery with a private proof photo, notifications, public page
-- never exposing the proof. Rolls back.
begin;

do $static$
begin
  if has_function_privilege('anon', 'public.courier_start_delivery_guarded(text,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.courier_complete_delivery_guarded(text,integer,text)', 'EXECUTE') then
    raise exception 'courier RPCs must not be anonymous';
  end if;
  if has_function_privilege('authenticated', 'public.courier_start_delivery(text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.courier_complete_delivery(text,integer,text)', 'EXECUTE') then
    raise exception 'courier RPCs must only be reachable through guarded wrappers';
  end if;
  if (select public from storage.buckets where id = 'order-delivery-proofs') is distinct from false then
    raise exception 'proof bucket must be private';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'd4000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'cr-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd4000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'cr-a@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd4000000-0000-4000-8000-0000000000e3', 'authenticated', 'authenticated', 'cr-b@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd4000000-0000-4000-8000-0000000000e4', 'authenticated', 'authenticated', 'cr-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email, branch_id) values
  ('d4000000-0000-4000-8000-0000000000e1', 'cr-owner', 'CR Owner', 'owner', true, 'cr-owner', 'cr-owner@fleurstales.test', null),
  ('d4000000-0000-4000-8000-0000000000e2', 'emp-courier-a', 'Kurir A', 'courier', true, 'cr-a', 'cr-a@fleurstales.test', 'Kedamaian'),
  ('d4000000-0000-4000-8000-0000000000e3', 'emp-courier-b', 'Kurir B', 'courier', true, 'cr-b', 'cr-b@fleurstales.test', 'Kedamaian'),
  ('d4000000-0000-4000-8000-0000000000e4', 'emp-cr-florist', 'CR Florist', 'florist', true, 'cr-florist', 'cr-florist@fleurstales.test', 'Kedamaian');

insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('hr', 1, jsonb_build_object('employees', jsonb_build_array(
  jsonb_build_object('id','emp-courier-a','name','Kurir A','status','active','systemRole','courier'),
  jsonb_build_object('id','emp-courier-b','name','Kurir B','status','active','systemRole','courier'),
  jsonb_build_object('id','emp-cr-florist','name','CR Florist','status','active','systemRole','florist')
)), now())
on conflict (domain) do update set snapshot = excluded.snapshot;

insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('finance', 1, '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb, now())
on conflict (domain) do update set snapshot = excluded.snapshot;

set local session_replication_role = replica;
insert into public.orders(id, order_number, revision, customer_name_snapshot, source, fulfillment, status, branch_id,
  total_idr, items_subtotal_idr, discount_idr, delivery_fee_idr, payment_status, paid_amount_idr, payment_method,
  florist_schedule_override, finance_verified, edit_unlocked, created_at, updated_at, public_tracking_id, delivery_address)
values
  ('ord-cr-1', 'SMK-CR-1', 1, 'CR 1', 'whatsapp', 'delivery', 'ready', 'Kedamaian',
   300000, 275000, 0, 25000, 'paid', 300000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), 'Jl. Mawar 1'),
  ('ord-cr-2', 'SMK-CR-2', 1, 'CR 2', 'whatsapp', 'delivery', 'ready', 'Kedamaian',
   200000, 175000, 0, 25000, 'paid', 200000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), 'Jl. Melati 2'),
  ('ord-cr-unpaid', 'SMK-CR-3', 1, 'CR 3', 'whatsapp', 'delivery', 'ready', 'Kedamaian',
   150000, 125000, 0, 25000, 'unpaid', 0, 'transfer', false, false, false, now(), now(), gen_random_uuid(), 'Jl. Kenanga 3');
update public.orders set delivery_courier_employee_id = 'emp-courier-b', delivery_provider = 'internal', delivery_courier_name = 'Kurir B'
where id = 'ord-cr-2';
update public.orders set delivery_courier_employee_id = 'emp-courier-a', delivery_provider = 'internal', delivery_courier_name = 'Kurir A'
where id = 'ord-cr-unpaid';
insert into public.order_items(id, order_id, product_name_snapshot, quantity, unit_price_idr)
values ('item-cr-2', 'ord-cr-2', 'Bouquet', 1, 175000)
on conflict do nothing;
set local session_replication_role = origin;

create temporary table cr_ctx(key text primary key, value text) on commit drop;
grant all on cr_ctx to authenticated;

-- Owner can invite the role; florist cannot assign a non-courier.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $owner$
declare
  v_result jsonb;
begin
  if not public.can_invite_staff_role('courier') then raise exception 'Owner must be able to invite couriers'; end if;

  begin
    perform public.save_order_shipment_guarded('ord-cr-1', 1, '{"provider":"internal","courierEmployeeId":"emp-cr-florist"}');
    raise exception 'A florist was accepted as courier';
  exception when invalid_parameter_value then null;
  end;

  v_result := public.save_order_shipment_guarded('ord-cr-1', 1, '{"provider":"internal","courierEmployeeId":"emp-courier-a"}');
  if v_result->>'deliveryCourierEmployeeId' <> 'emp-courier-a' or v_result->>'deliveryCourierName' <> 'Kurir A' then
    raise exception 'Courier not assigned: %', v_result;
  end if;
  insert into cr_ctx values ('rev', v_result->>'revision');
end
$owner$;
reset role;

do $notify$
begin
  if (select count(*) from public.staff_notifications where kind = 'delivery_assigned' and recipient_employee_id = 'emp-courier-a') <> 1 then
    raise exception 'Courier A must be notified about the new task';
  end if;
end
$notify$;

-- Courier A sees only the order assigned to them.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $visibility$
begin
  if (select count(*) from public.orders where id like 'ord-cr-%') <> 2 then
    raise exception 'Courier A must see exactly their 2 assigned orders';
  end if;
  if exists (select 1 from public.orders where id = 'ord-cr-2') then raise exception 'Courier A sees courier B order'; end if;
  if exists (select 1 from public.order_items where order_id = 'ord-cr-2') then raise exception 'Courier A sees courier B items'; end if;
  begin
    perform public.save_order_operational_state('ord-cr-1', 1, 2, '{"status":"delivering"}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    raise exception 'Courier used the generic order save';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_order_shipment_guarded('ord-cr-1', (select value::int from cr_ctx where key='rev'), '{"provider":"internal"}');
    raise exception 'Courier changed a shipment';
  exception when insufficient_privilege then null;
  end;
end
$visibility$;
reset role;

-- Courier B cannot start courier A's order; unpaid orders are blocked.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
set local role authenticated;
do $other$
begin
  begin
    perform public.courier_start_delivery_guarded('ord-cr-1', (select value::int from cr_ctx where key='rev'));
    raise exception 'Courier B started courier A order';
  exception when insufficient_privilege then null;
  end;
end
$other$;
reset role;

select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $start$
declare
  v_result jsonb;
  v_rev int := (select value::int from cr_ctx where key='rev');
begin
  begin
    perform public.courier_start_delivery_guarded('ord-cr-unpaid', 1);
    raise exception 'Unpaid order started';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.courier_complete_delivery_guarded('ord-cr-1', v_rev, 'ord-cr-1/proof-x.jpg');
    raise exception 'Completed before starting';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.courier_start_delivery_guarded('ord-cr-1', v_rev - 1);
    raise exception 'Stale revision accepted';
  exception when sqlstate 'PT409' then null;
  end;
  v_result := public.courier_start_delivery_guarded('ord-cr-1', v_rev);
  if v_result->>'status' <> 'delivering' then raise exception 'Not delivering: %', v_result; end if;
  update cr_ctx set value = v_result->>'revision' where key = 'rev';
end
$start$;
reset role;

-- Completing needs a real uploaded proof. Only the assigned courier can upload / read it.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $complete$
declare
  v_result jsonb;
  v_rev int := (select value::int from cr_ctx where key='rev');
begin
  begin
    perform public.courier_complete_delivery_guarded('ord-cr-1', v_rev, 'ord-cr-1/proof-missing.jpg');
    raise exception 'Completed with a proof that was never uploaded';
  exception when invalid_parameter_value then null;
  end;

  insert into storage.objects(bucket_id, name, owner, metadata)
  values ('order-delivery-proofs', 'ord-cr-1/proof-ok.jpg', (select auth.uid()), '{"mimetype":"image/jpeg"}');

  begin
    insert into storage.objects(bucket_id, name, owner, metadata)
    values ('order-delivery-proofs', 'ord-cr-2/proof-bad.jpg', (select auth.uid()), '{"mimetype":"image/jpeg"}');
    raise exception 'Courier uploaded proof for an order that is not theirs';
  exception when insufficient_privilege then null;
  end;

  v_result := public.courier_complete_delivery_guarded('ord-cr-1', v_rev, 'ord-cr-1/proof-ok.jpg');
  if v_result->>'status' <> 'delivered' or v_result->>'completedAt' is null then
    raise exception 'Not delivered: %', v_result;
  end if;
  if (select count(*) from storage.objects where bucket_id = 'order-delivery-proofs') <> 1 then
    raise exception 'Courier A must read exactly their own proof';
  end if;
end
$complete$;
reset role;

do $after$
declare
  v_order public.orders%rowtype;
  v_status jsonb;
begin
  select * into v_order from public.orders where id = 'ord-cr-1';
  if v_order.status <> 'delivered' or v_order.completed_at is null
     or v_order.delivery_proof_photo_path <> 'ord-cr-1/proof-ok.jpg'
     or v_order.delivery_started_at is null then
    raise exception 'Order not completed correctly';
  end if;
  if (select count(*) from public.staff_notifications where kind = 'order_delivered' and recipient_employee_id = 'cr-owner') <> 1 then
    raise exception 'Owner must be notified when the order is delivered';
  end if;
  if (select count(*) from public.order_activities where order_id = 'ord-cr-1' and description like 'Pesanan terkirim oleh kurir%') <> 1 then
    raise exception 'Delivery activity missing';
  end if;

  v_status := public.get_order_public_status(v_order.public_tracking_id::text);
  if v_status::text ilike '%proof%' or v_status::text like '%order-delivery-proofs%' then
    raise exception 'Public tracking must never expose the delivery proof: %', v_status;
  end if;
end
$after$;

-- Courier B and the florist cannot read courier A's proof.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
set local role authenticated;
do $b$
begin
  if exists (select 1 from storage.objects where bucket_id = 'order-delivery-proofs' and name like 'ord-cr-1/%') then
    raise exception 'Courier B read courier A proof';
  end if;
end
$b$;
reset role;

select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e4","role":"authenticated"}', true);
set local role authenticated;
do $f$
begin
  if exists (select 1 from storage.objects where bucket_id = 'order-delivery-proofs') then
    raise exception 'Florist read a delivery proof';
  end if;
end
$f$;
reset role;

rollback;
