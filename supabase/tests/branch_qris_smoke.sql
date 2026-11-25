-- Branch QRIS (static source, 25 Nov 2026): Owner-only save from the decoded
-- static QRIS text, payload kept private, one QRIS (NMID) per branch, new
-- sources start off, and checkout never exposes a static image. Synthetic
-- QRIS payloads only. Rolls back.
begin;

do $static$
begin
  if has_table_privilege('anon', 'public.branch_qris_codes', 'INSERT')
     or has_table_privilege('authenticated', 'public.branch_qris_codes', 'UPDATE') then
    raise exception 'branch_qris_codes must only be written through the QRIS RPCs';
  end if;
  if has_table_privilege('anon', 'private.branch_qris_sources', 'SELECT')
     or has_table_privilege('authenticated', 'private.branch_qris_sources', 'SELECT') then
    raise exception 'The static QRIS payload must not be readable by API roles';
  end if;
  if has_function_privilege('anon', 'public.save_branch_qris(text,text,text,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.save_branch_qris_source(text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.clear_branch_qris_image(text)', 'EXECUTE') then
    raise exception 'QRIS RPCs must not be callable by anon';
  end if;
  if has_function_privilege('authenticated', 'private.qris_dynamic_payload(text,bigint)', 'EXECUTE')
     or has_function_privilege('anon', 'private.parse_static_qris(text)', 'EXECUTE') then
    raise exception 'QRIS payload helpers must stay private';
  end if;

  -- CRC16-CCITT (0xFFFF/0x1021) standard check value.
  if private.qris_crc16('123456789') <> '29B1' then
    raise exception 'qris_crc16 is wrong: %', private.qris_crc16('123456789');
  end if;
  -- Golden dynamic payload for a synthetic static QRIS.
  if private.qris_dynamic_payload('00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 1000)
     <> '00020101021226650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI520459925303360540410005802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A0163042BF5' then
    raise exception 'qris_dynamic_payload golden mismatch';
  end if;
  if right(private.qris_dynamic_payload('00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 329007), 4) <> 'CA06' then
    raise exception 'qris_dynamic_payload CRC golden mismatch for 329007';
  end if;
  if not private.qris_dynamic_ready() then
    raise exception 'Amount-embedded QRIS is released; qris_dynamic_ready must be true';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', 'qris-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-0000000000d2', 'authenticated', 'authenticated', 'qris-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('d0000000-0000-4000-8000-0000000000d1', 'qris-owner', 'QRIS Owner', 'owner', true, 'qris-owner', 'qris-owner@fleurstales.test'),
  ('d0000000-0000-4000-8000-0000000000d2', 'emp-qris-admin', 'QRIS Admin', 'admin', true, 'qris-admin', 'qris-admin@fleurstales.test');

insert into public.public_payment_accounts(id, type, bank_name, account_number, account_holder, is_active, is_default, display_order, is_customer_visible, branch_ids)
values ('smoke-qris-bank', 'bank_transfer', 'Smoke Bank', '999000111', 'Smoke Holder', true, false, 50, true, '{}')
on conflict (id) do nothing;

-- Start from a clean slate for both branches.
delete from private.branch_qris_sources where branch_id in ('Kedamaian', 'Pahoman');
delete from public.branch_qris_codes where branch_id in ('Kedamaian', 'Pahoman');

create temporary table qris_result(step text, value jsonb) on commit drop;
grant all on qris_result to authenticated;

-- Admin cannot save a QRIS source.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
do $admin$
begin
  perform public.save_branch_qris_source('Kedamaian', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 'smoke-qris-bank');
  raise exception 'Admin saved a branch QRIS source';
exception when insufficient_privilege then null;
end
$admin$;
reset role;

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $owner$
declare v_message text;
begin
  -- Broken CRC is rejected.
  begin
    perform public.save_branch_qris_source('Kedamaian', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A0163040000', 'smoke-qris-bank');
    raise exception 'QRIS with a bad CRC was saved';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'QRIS_INVALID' then raise exception 'Unexpected error: %', v_message; end if;
  end;
  -- A dynamic QRIS is not a valid source.
  begin
    perform public.save_branch_qris_source('Kedamaian', '00020101021226650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI520459925303360540410005802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A0163042BF5', 'smoke-qris-bank');
    raise exception 'A dynamic QRIS was saved as the static source';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'QRIS_NOT_STATIC' then raise exception 'Unexpected error: %', v_message; end if;
  end;
  -- Unknown linked account is rejected.
  begin
    perform public.save_branch_qris_source('Kedamaian', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 'no-such-account');
    raise exception 'QRIS saved with an unknown linked account';
  exception when invalid_parameter_value then null;
  end;
  -- Toggling or relinking needs a source first.
  begin
    perform public.save_branch_qris('Kedamaian', null, 'smoke-qris-bank', false);
    raise exception 'QRIS saved without a source';
  exception when invalid_parameter_value then null;
  end;
end
$owner$;
insert into qris_result select 'save_kdm', public.save_branch_qris_source('Kedamaian', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 'smoke-qris-bank');
-- Saving again replaces (one QRIS per branch).
insert into qris_result select 'save_kdm_again', public.save_branch_qris_source('Kedamaian', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 'smoke-qris-bank');
do $owner_rules$
declare v_message text;
begin
  -- The same QRIS (NMID) cannot be used by a second branch.
  begin
    perform public.save_branch_qris_source('Pahoman', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528', 'smoke-qris-bank');
    raise exception 'One QRIS was saved for two branches';
  exception when unique_violation then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'QRIS_NMID_IN_USE' then raise exception 'Unexpected error: %', v_message; end if;
  end;
end
$owner_rules$;
insert into qris_result select 'save_phm', public.save_branch_qris_source('Pahoman', '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000020303UMI5204599253033605802ID5915SMOKE FLORIST B6014Bandar Lampung61053511162070703A016304042B', 'smoke-qris-bank');
reset role;

do $saved$
declare v_row public.branch_qris_codes%rowtype;
begin
  select * into v_row from public.branch_qris_codes where branch_id = 'Kedamaian';
  if v_row.merchant_name <> 'SMOKE FLORIST A' or v_row.nmid <> 'ID1000000000001'
     or v_row.merchant_criteria <> 'UMI' or v_row.mcc <> '5992' or v_row.acquirer <> 'ID.CO.SMOKEBANK.WWW'
     or v_row.image_path is not null or v_row.is_active then
    raise exception 'Saved QRIS details are wrong: %', to_jsonb(v_row);
  end if;
  if (select count(*) from private.branch_qris_sources where branch_id = 'Kedamaian') <> 1 then
    raise exception 'Expected exactly one QRIS source for the branch';
  end if;
  if exists (select 1 from qris_result where value ? 'payload') then
    raise exception 'QRIS RPC leaked the static payload';
  end if;
end
$saved$;

do $checkout$
declare
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_variant record;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_message text;
begin
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;

  -- Saved sources start off; the Owner switches QRIS on.
  if (select is_active from public.branch_qris_codes where branch_id = 'Kedamaian') then
    raise exception 'A newly saved QRIS source must start off';
  end if;
  update public.branch_qris_codes set is_active = true where branch_id = 'Kedamaian';

  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke QRIS","whatsappNumber":"081299990001"}', 'Kedamaian', 'pickup', v_tomorrow, '12:00',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'qris', null);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.payment_method <> 'transfer' then raise exception 'QRIS order must be recorded as a transfer, got %', v_order.payment_method; end if;
  if v_order.payment_account_snapshot->>'channel' <> 'qris'
     or v_order.payment_account_snapshot->>'accountId' <> 'smoke-qris-bank'
     or v_order.payment_account_snapshot->>'qrisImagePath' is not null then
    raise exception 'QRIS order snapshot is wrong: %', v_order.payment_account_snapshot;
  end if;

  -- Plain transfer still uses the default account without the QRIS marker.
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke Transfer","whatsappNumber":"081299990002"}', 'Kedamaian', 'pickup', v_tomorrow, '12:15',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'transfer', null);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.payment_account_snapshot ? 'channel' then raise exception 'Transfer order got a QRIS marker'; end if;

  -- A branch whose QRIS is off is not offered.
  begin
    perform public.quote_storefront_checkout(
      gen_random_uuid()::text, '{"name":"Smoke QRIS","whatsappNumber":"081299990001"}', 'Pahoman', 'pickup', v_tomorrow, '12:00',
      jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
      null, null, null, null, null, 'qris', null);
    raise exception 'QRIS accepted for a branch whose QRIS is off';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'STOREFRONT_QRIS_UNAVAILABLE' then raise exception 'Unexpected error: %', v_message; end if;
  end;
end
$checkout$;

-- Customers (anon) can read active QRIS details (never a payload), and never inactive ones.
set local role anon;
do $anon$
declare v_count int;
begin
  select count(*) into v_count from public.branch_qris_codes;
  if v_count <> 1 then raise exception 'anon should see exactly the active QRIS, saw %', v_count; end if;
  if not exists (select 1 from public.branch_qris_codes where branch_id = 'Kedamaian') then
    raise exception 'anon cannot see the active Kedamaian QRIS';
  end if;
end
$anon$;
reset role;

rollback;
