-- Amount-embedded QRIS per order (Q3, 25 Nov 2026). Synthetic QRIS only.
-- Rolls back.
begin;

do $rules$
begin
  if not private.qris_dynamic_ready() then raise exception 'Amount-embedded QRIS must be released'; end if;
  -- Largest amount <= bill ending in the 3-digit daily code.
  if private.qris_amount_for('KDM-26-11-26-007', 330000) <> 329007 then raise exception 'qris_amount_for 330000/007'; end if;
  if private.qris_amount_for('KDM-26-11-26-107', 330500) <> 330107 then raise exception 'qris_amount_for 330500/107'; end if;
  if private.qris_amount_for('PHM-26-11-26-250', 250250) <> 250250 then raise exception 'qris_amount_for exact'; end if;
  -- Paid exactly: small bills, legacy numbers, 4-digit sequences.
  if private.qris_amount_for('KDM-26-11-26-001', 9999) <> 9999 then raise exception 'qris_amount_for small bill'; end if;
  if private.qris_amount_for('KDM-2026-0026', 330000) <> 330000 then raise exception 'qris_amount_for legacy'; end if;
  if private.qris_amount_for('KDM-26-11-26-1000', 330000) <> 330000 then raise exception 'qris_amount_for 4-digit'; end if;
  if has_function_privilege('anon', 'public.get_order_qris_payment(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.mark_order_qris_sent(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.order_qris_payment(public.orders)', 'EXECUTE')
     or has_function_privilege('anon', 'private.qris_amount_for(text,bigint)', 'EXECUTE') then
    raise exception 'QRIS order RPC grants are too wide';
  end if;
end
$rules$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'qris3-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'qris3-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('e0000000-0000-4000-8000-0000000000e1', 'qris3-owner', 'QRIS3 Owner', 'owner', true, 'qris3-owner', 'qris3-owner@fleurstales.test'),
  ('e0000000-0000-4000-8000-0000000000e2', 'emp-qris3-florist', 'QRIS3 Florist', 'florist', true, 'qris3-florist', 'qris3-florist@fleurstales.test');
insert into public.public_payment_accounts(id, type, bank_name, account_number, account_holder, is_active, is_default, display_order, is_customer_visible, branch_ids)
values ('smoke-qris3-bank', 'bank_transfer', 'Smoke Bank', '999000333', 'Smoke Holder', true, false, 50, true, '{}')
on conflict (id) do nothing;

delete from private.branch_qris_sources where branch_id in ('Kedamaian', 'Pahoman');
delete from public.branch_qris_codes where branch_id in ('Kedamaian', 'Pahoman');
insert into private.branch_qris_sources(branch_id, payload, nmid)
values ('Kedamaian', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 'ID1000000000001');
insert into public.branch_qris_codes(branch_id, image_path, linked_account_id, is_active, merchant_name, nmid)
values ('Kedamaian', null, 'smoke-qris3-bank', true, 'SMOKE FLORIST A', 'ID1000000000001');

create temporary table qris3(step text, value jsonb) on commit drop;
grant all on qris3 to authenticated, anon;

do $flow$
declare
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_variant record;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_payment jsonb;
  v_expected bigint;
begin
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;

  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke QRIS3","whatsappNumber":"081299993001"}', 'Kedamaian', 'pickup', v_tomorrow, '12:00',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'qris', null);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.order_number !~ '^KDM-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}$' then
    raise exception 'QRIS order must get a daily number, got %', v_order.order_number;
  end if;

  v_expected := private.qris_amount_for(v_order.order_number, v_order.total_idr);
  if v_order.qris_amount_shown is distinct from v_expected then
    raise exception 'Initial QRIS amount not remembered: % vs %', v_order.qris_amount_shown, v_expected;
  end if;

  -- Customer tracking returns the order's own dynamic QR.
  v_payment := (public.get_order_public_status(v_order.public_tracking_id::text))->'qrisPayment';
  if v_payment is null then raise exception 'Tracking must include qrisPayment for an unpaid QRIS order'; end if;
  if (v_payment->>'amountIdr')::bigint <> v_expected
     or (v_payment->>'uniqueDiscountIdr')::bigint <> v_order.total_idr - v_expected
     or (v_payment->>'amountUpdated')::boolean
     or v_payment->>'nmid' <> 'ID1000000000001' then
    raise exception 'Tracking qrisPayment is wrong: %', v_payment;
  end if;
  if v_payment->>'payload' <> private.qris_dynamic_payload(
      (select payload from private.branch_qris_sources where branch_id = 'Kedamaian'), v_expected) then
    raise exception 'Tracking payload is not the dynamic QR for the QRIS amount';
  end if;
  if position('6304' in v_payment->>'payload') = 0 or v_payment->>'payload' !~ '^000201010212' then
    raise exception 'Tracking payload is not a dynamic QRIS';
  end if;
  insert into qris3 values ('order', to_jsonb(v_order));
end
$flow$;

-- Staff: Owner sees the QR; a florist does not.
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $florist$
begin
  perform public.get_order_qris_payment((select value->>'id' from qris3 where step = 'order'));
  raise exception 'A florist read the QRIS payment';
exception when insufficient_privilege then null;
end
$florist$;
reset role;

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
insert into qris3 select 'staff', public.get_order_qris_payment((select value->>'id' from qris3 where step = 'order'));
reset role;

do $change$
declare
  v_id text := (select value->>'id' from qris3 where step = 'order');
  v_order public.orders%rowtype;
  v_payment jsonb;
begin
  if (select value from qris3 where step = 'staff') is null then raise exception 'Owner could not read the QRIS payment'; end if;

  -- The bill changes after the QR was handed out -> "QR diperbarui".
  update public.orders set delivery_fee_idr = delivery_fee_idr + 15000, total_idr = total_idr + 15000 where id = v_id;
  select * into v_order from public.orders where id = v_id;
  v_payment := private.order_qris_payment(v_order);
  if not (v_payment->>'amountUpdated')::boolean then raise exception 'A changed bill must flag the QR as updated'; end if;
end
$change$;

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
insert into qris3 select 'sent', public.mark_order_qris_sent((select value->>'id' from qris3 where step = 'order'));
reset role;

do $confirm$
declare
  v_id text := (select value->>'id' from qris3 where step = 'order');
  v_order public.orders%rowtype;
  v_bill bigint;
  v_amount bigint;
begin
  select * into v_order from public.orders where id = v_id;
  if (private.order_qris_payment(v_order)->>'amountUpdated')::boolean then
    raise exception 'Marking the new QR as sent must clear the update flag';
  end if;
  v_bill := v_order.total_idr;
  v_amount := private.qris_amount_for(v_order.order_number, v_bill);

  -- Payment confirmation applies the unique-code discount: paid = QRIS amount.
  update public.orders set status = 'confirmed' where id = v_id;
  select * into v_order from public.orders where id = v_id;
end
$confirm$;

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
insert into qris3 select 'paid', public.confirm_order_payment_with_proof_guarded(
  (select value->>'id' from qris3 where step = 'order'),
  (select revision from public.orders where id = (select value->>'id' from qris3 where step = 'order')),
  'smoke-qris3-bank',
  (select value->>'id' from qris3 where step = 'order') || '/proof-smoke.jpg');
reset role;

do $after$
declare
  v_id text := (select value->>'id' from qris3 where step = 'order');
  v_order public.orders%rowtype;
  v_initial public.orders%rowtype;
begin
  select * into v_order from public.orders where id = v_id;
  select * into v_initial from jsonb_populate_record(null::public.orders, (select value from qris3 where step = 'order'));
  if v_order.payment_status <> 'paid' then raise exception 'QRIS order not paid'; end if;
  if v_order.paid_amount_idr <> private.qris_amount_for(v_order.order_number, v_initial.total_idr + 15000) then
    raise exception 'Paid amount % must equal the QRIS amount', v_order.paid_amount_idr;
  end if;
  if v_order.qris_unique_discount_idr <> (v_initial.total_idr + 15000) - v_order.paid_amount_idr
     or v_order.total_idr <> v_order.paid_amount_idr
     or v_order.discount_idr <> v_initial.discount_idr + v_order.qris_unique_discount_idr then
    raise exception 'Unique-code discount not recorded: %', jsonb_build_object('total', v_order.total_idr, 'paid', v_order.paid_amount_idr, 'unique', v_order.qris_unique_discount_idr, 'discount', v_order.discount_idr);
  end if;
  if (select (value->>'qrisUniqueDiscountIdr')::bigint from qris3 where step = 'paid') <> v_order.qris_unique_discount_idr then
    raise exception 'Confirmation result must report the unique-code discount';
  end if;
  -- Paid -> no more QR.
  if private.order_qris_payment(v_order) is not null then raise exception 'A paid order must not show a QR'; end if;
end
$after$;

-- Cancelled QRIS orders hide the QR; plain transfers never get one.
do $hidden$
declare
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_variant record;
  v_result jsonb;
  v_order public.orders%rowtype;
begin
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke QRIS3 Cancel","whatsappNumber":"081299993002"}', 'Kedamaian', 'pickup', v_tomorrow, '12:15',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'qris', null);
  update public.orders set status = 'cancelled' where id = v_result->>'orderId' returning * into v_order;
  if private.order_qris_payment(v_order) is not null then raise exception 'A cancelled order must not show a QR'; end if;

  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke Transfer3","whatsappNumber":"081299993003"}', 'Kedamaian', 'pickup', v_tomorrow, '12:30',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'transfer', null);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if private.order_qris_payment(v_order) is not null or v_order.qris_amount_shown is not null then
    raise exception 'A transfer order must not get a QRIS amount';
  end if;
  if (public.get_order_public_status(v_order.public_tracking_id::text))->'qrisPayment' <> 'null'::jsonb then
    raise exception 'Tracking must return qrisPayment null for a transfer order';
  end if;
end
$hidden$;

-- Admin-created orders follow the same QRIS rules (paymentChannel = 'qris').
create temporary table qris3_internal(value jsonb) on commit drop;
grant all on qris3_internal to authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
insert into qris3_internal
select public.create_internal_order_guarded(jsonb_build_object(
  'idempotencyKey', 'smoke-qris3-internal-0001',
  'customer', jsonb_build_object('name', 'Smoke QRIS3 Admin', 'whatsappNumber', '081299993004'),
  'branchId', 'Kedamaian',
  'source', 'whatsapp',
  'fulfillment', 'pickup',
  'scheduleDate', (timezone('Asia/Jakarta', now())::date + 2)::text,
  'scheduleTime', '13:00',
  'items', jsonb_build_array(jsonb_build_object('mode', 'custom', 'productName', 'Smoke Custom Bouquet', 'quantity', 1, 'unitPriceIdr', 330000)),
  'paymentMethod', 'transfer',
  'paymentChannel', 'qris',
  'paymentStatus', 'unpaid',
  'depositAmountIdr', 0
));
reset role;

do $internal$
declare
  v_order public.orders%rowtype;
  v_payment jsonb;
begin
  select * into v_order from public.orders where id = (select value->>'orderId' from qris3_internal);
  if not found then raise exception 'Admin QRIS order was not created'; end if;
  if v_order.payment_account_snapshot->>'channel' <> 'qris' or v_order.payment_method <> 'transfer' then
    raise exception 'Admin QRIS order snapshot is wrong: %', v_order.payment_account_snapshot;
  end if;
  v_payment := private.order_qris_payment(v_order);
  if v_payment is null
     or (v_payment->>'amountIdr')::bigint <> private.qris_amount_for(v_order.order_number, v_order.total_idr)
     or v_order.qris_amount_shown is distinct from (v_payment->>'amountIdr')::bigint then
    raise exception 'Admin QRIS order payment is wrong: % / %', v_payment, v_order.qris_amount_shown;
  end if;
end
$internal$;

rollback;
