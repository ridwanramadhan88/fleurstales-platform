-- QRIS Services Fee (Q5, 25 Nov 2026): one automatic Finance expense per
-- paid QRIS order, amounts from the Owner's settings, voided on cancel,
-- never for plain transfers, never bumps the order revision.
-- Synthetic QRIS only. Rolls back.
begin;

do $grants$
begin
  if has_table_privilege('anon', 'public.qris_services_fee_settings', 'SELECT')
     or has_table_privilege('authenticated', 'public.qris_services_fee_settings', 'UPDATE')
     or has_function_privilege('anon', 'public.save_qris_services_fee_settings(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_qris_services_fee_settings()', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.sync_qris_services_fee(text,text,text)', 'EXECUTE') then
    raise exception 'Services Fee grants are too wide';
  end if;
  -- Defaults: Rp1.000 below Rp500.000, Rp2.000 from Rp500.000.
  if private.qris_services_fee_for(499999) <> 1000 or private.qris_services_fee_for(500000) <> 2000 then
    raise exception 'Services Fee defaults are wrong';
  end if;
end
$grants$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'e5000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'fee-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e5000000-0000-4000-8000-0000000000f2', 'authenticated', 'authenticated', 'fee-finance@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('e5000000-0000-4000-8000-0000000000f1', 'fee-owner', 'Fee Owner', 'owner', true, 'fee-owner', 'fee-owner@fleurstales.test'),
  ('e5000000-0000-4000-8000-0000000000f2', 'emp-fee-finance', 'Fee Finance', 'finance', true, 'fee-finance', 'fee-finance@fleurstales.test');
insert into public.public_payment_accounts(id, type, bank_name, account_number, account_holder, is_active, is_default, display_order, is_customer_visible, branch_ids)
values ('smoke-fee-bank', 'bank_transfer', 'Smoke Bank', '999000555', 'Smoke Holder', true, false, 50, true, '{}')
on conflict (id) do nothing;
insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('finance', 1, '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb, now())
on conflict (domain) do update set snapshot = '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb;

delete from private.branch_qris_sources where branch_id in ('Kedamaian', 'Pahoman');
delete from public.branch_qris_codes where branch_id in ('Kedamaian', 'Pahoman');
insert into private.branch_qris_sources(branch_id, payload, nmid)
values ('Kedamaian', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 'ID1000000000001');
insert into public.branch_qris_codes(branch_id, image_path, linked_account_id, is_active, merchant_name, nmid)
values ('Kedamaian', null, 'smoke-fee-bank', true, 'SMOKE FLORIST A', 'ID1000000000001');

create temporary table fee(step text, value jsonb) on commit drop;
grant all on fee to authenticated;

-- Finance can read the settings but not change them; the Owner can.
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
insert into fee select 'finance_read', public.get_qris_services_fee_settings();
do $finance$
begin
  perform public.save_qris_services_fee_settings('{"isEnabled":true,"thresholdIdr":1,"feeBelowIdr":1,"feeAtOrAboveIdr":1}');
  raise exception 'Finance changed the Services Fee';
exception when insufficient_privilege then null;
end
$finance$;
reset role;

select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $owner$
begin
  begin
    perform public.save_qris_services_fee_settings('{"isEnabled":true,"thresholdIdr":500000,"feeBelowIdr":-1,"feeAtOrAboveIdr":2000}');
    raise exception 'A negative Services Fee was saved';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_qris_services_fee_settings('{"isEnabled":true,"thresholdIdr":500000,"feeBelowIdr":1000,"feeAtOrAboveIdr":2000,"accountId":"no-such-account"}');
    raise exception 'Services Fee saved with an unknown account';
  exception when invalid_parameter_value then null;
  end;
end
$owner$;
-- Owner sets custom amounts: Rp1.500 below Rp200.000, Rp2.500 from Rp200.000, paid from cash.
insert into fee select 'owner_save', public.save_qris_services_fee_settings('{"isEnabled":true,"thresholdIdr":200000,"feeBelowIdr":1500,"feeAtOrAboveIdr":2500,"accountId":"cash:main"}');
reset role;

do $saved$
begin
  if (select value->>'thresholdIdr' from fee where step = 'finance_read') is null then raise exception 'Finance could not read the settings'; end if;
  if (select (value->>'feeAtOrAboveIdr')::bigint from fee where step = 'owner_save') <> 2500 then raise exception 'Owner settings not saved'; end if;
  if private.qris_services_fee_for(199999) <> 1500 or private.qris_services_fee_for(200000) <> 2500 then
    raise exception 'Services Fee does not follow the Owner settings';
  end if;
end
$saved$;

-- A QRIS order and a plain transfer, both confirmed then paid.
do $orders$
declare
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_variant record;
  v_result jsonb;
begin
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke Fee QRIS","whatsappNumber":"081299995001"}', 'Kedamaian', 'pickup', v_tomorrow, '12:00',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'qris', null);
  insert into fee values ('qris_order', v_result);
  update public.orders set status = 'confirmed' where id = v_result->>'orderId';
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke Fee Transfer","whatsappNumber":"081299995002"}', 'Kedamaian', 'pickup', v_tomorrow, '12:15',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'transfer', null);
  insert into fee values ('transfer_order', v_result);
  update public.orders set status = 'confirmed' where id = v_result->>'orderId';
end
$orders$;

select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
insert into fee select 'qris_paid', public.confirm_order_payment_with_proof_guarded(
  (select value->>'orderId' from fee where step = 'qris_order'),
  (select revision from public.orders where id = (select value->>'orderId' from fee where step = 'qris_order')),
  'smoke-fee-bank',
  (select value->>'orderId' from fee where step = 'qris_order') || '/proof-smoke.jpg');
insert into fee select 'transfer_paid', public.confirm_order_payment_with_proof_guarded(
  (select value->>'orderId' from fee where step = 'transfer_order'),
  (select revision from public.orders where id = (select value->>'orderId' from fee where step = 'transfer_order')),
  'smoke-fee-bank',
  (select value->>'orderId' from fee where step = 'transfer_order') || '/proof-smoke.jpg');
reset role;

do $recorded$
declare
  v_order public.orders%rowtype;
  v_tx jsonb;
  v_expected bigint;
begin
  select * into v_order from public.orders where id = (select value->>'orderId' from fee where step = 'qris_order');
  if v_order.revision <> (select (value->>'revision')::integer from fee where step = 'qris_paid') then
    raise exception 'Recording the Services Fee must not bump the order revision (% vs %)', v_order.revision, (select value->>'revision' from fee where step = 'qris_paid');
  end if;
  v_expected := private.qris_services_fee_for(v_order.total_idr + v_order.qris_unique_discount_idr);
  select x into v_tx from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
  where s.domain = 'finance' and x->>'idempotencyKey' = 'qris-services-fee:' || v_order.id;
  if v_tx is null then raise exception 'Services Fee was not recorded for the paid QRIS order'; end if;
  if v_tx->>'type' <> 'expense' or v_tx->>'source' <> 'qris_services_fee' or v_tx->>'status' <> 'verified'
     or (v_tx->>'amount')::bigint <> v_expected or v_tx->>'accountId' <> 'cash:main'
     or v_tx->>'orderNumber' <> v_order.order_number or v_tx->>'branch' <> 'Kedamaian' then
    raise exception 'Services Fee entry is wrong: %', v_tx;
  end if;

  -- Plain transfers never get a Services Fee.
  if exists (select 1 from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
             where s.domain = 'finance' and x->>'idempotencyKey' = 'qris-services-fee:' || (select value->>'orderId' from fee where step = 'transfer_order')) then
    raise exception 'A transfer order got a Services Fee';
  end if;

  -- Recorded once: a settings change and a second sync do not rewrite or duplicate it.
  update public.qris_services_fee_settings set fee_below_idr = 9000, fee_at_or_above_idr = 9000 where id = 'primary';
  perform private.sync_qris_services_fee(v_order.id, 'System', null);
  if (select count(*) from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'idempotencyKey' = 'qris-services-fee:' || v_order.id) <> 1 then
    raise exception 'Services Fee duplicated';
  end if;
  if (select (x->>'amount')::bigint from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'idempotencyKey' = 'qris-services-fee:' || v_order.id) <> v_expected then
    raise exception 'A recorded Services Fee must keep its amount';
  end if;

  -- Cancelling the order voids the fee.
  update public.orders set status = 'cancelled' where id = v_order.id;
  if (select x->>'status' from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
      where s.domain = 'finance' and x->>'idempotencyKey' = 'qris-services-fee:' || v_order.id) <> 'void' then
    raise exception 'Cancelling a paid QRIS order must void its Services Fee';
  end if;
end
$recorded$;

rollback;
