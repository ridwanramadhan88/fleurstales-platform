-- D4 courier accounts: assignment, assigned-orders-only visibility, courier
-- confirmation with a private proof photo (status stays with Admin),
-- notifications, public page never exposing the proof. Rolls back.
begin;

do $static$
begin
  if has_function_privilege('anon', 'public.courier_confirm_delivery_guarded(text,text)', 'EXECUTE') then
    raise exception 'courier RPC must not be anonymous';
  end if;
  if has_function_privilege('authenticated', 'public.courier_confirm_delivery(text,text)', 'EXECUTE') then
    raise exception 'courier RPC must only be reachable through the guarded wrapper';
  end if;
  if to_regprocedure('public.courier_start_delivery(text,integer)') is not null
     or to_regprocedure('public.courier_complete_delivery(text,integer,text)') is not null then
    raise exception 'The courier start/complete RPCs must no longer exist';
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

-- Admin (owner here) starts the delivery: status is theirs alone.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $early$
begin
  begin
    perform public.courier_confirm_delivery_guarded('ord-cr-1', 'ord-cr-1/proof-x.jpg');
    raise exception 'Confirmed before the order was delivering';
  exception when invalid_parameter_value then null;
  end;
end
$early$;
reset role;

set local session_replication_role = replica;
update public.orders set status = 'delivering', delivery_started_at = now() where id = 'ord-cr-1';
set local session_replication_role = origin;

-- Courier B cannot confirm courier A's order.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
set local role authenticated;
do $other$
begin
  begin
    perform public.courier_confirm_delivery_guarded('ord-cr-1', 'ord-cr-1/proof-x.jpg');
    raise exception 'Courier B confirmed courier A order';
  exception when insufficient_privilege then null;
  end;
end
$other$;
reset role;

-- Confirming needs a real uploaded proof; it never changes the status.
select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $confirm$
declare
  v_result jsonb;
begin
  begin
    perform public.courier_confirm_delivery_guarded('ord-cr-1', 'ord-cr-1/proof-missing.jpg');
    raise exception 'Confirmed with a proof that was never uploaded';
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

  v_result := public.courier_confirm_delivery_guarded('ord-cr-1', 'ord-cr-1/proof-ok.jpg');
  if v_result is null then raise exception 'No confirmation result'; end if;

  begin
    perform public.courier_confirm_delivery_guarded('ord-cr-1', 'ord-cr-1/proof-ok.jpg');
    raise exception 'Double confirmation accepted';
  exception when others then
    if sqlerrm not like '%DELIVERY_ALREADY_CONFIRMED%' then raise; end if;
  end;

  if (select count(*) from storage.objects where bucket_id = 'order-delivery-proofs') <> 1 then
    raise exception 'Courier A must read exactly their own proof';
  end if;
end
$confirm$;
reset role;

do $after$
declare
  v_order public.orders%rowtype;
  v_status jsonb;
begin
  select * into v_order from public.orders where id = 'ord-cr-1';
  if v_order.status <> 'delivering' or v_order.completed_at is not null then
    raise exception 'The courier confirmation must not change the order status';
  end if;
  if v_order.delivery_proof_photo_path <> 'ord-cr-1/proof-ok.jpg' or v_order.delivery_proof_uploaded_at is null then
    raise exception 'Proof not recorded';
  end if;
  if (select count(*) from public.staff_notifications where kind = 'delivery_confirmed' and recipient_employee_id = 'cr-owner') <> 1 then
    raise exception 'Owner must be notified of the courier confirmation';
  end if;
  if (select count(*) from public.order_activities where order_id = 'ord-cr-1' and description like '%mengonfirmasi%') < 1 then
    raise exception 'Confirmation activity missing';
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
