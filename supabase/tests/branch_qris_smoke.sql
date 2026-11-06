-- Branch QRIS: Owner-only save, one per branch, checkout with p_payment_method
-- 'qris' records a transfer into the linked bank account. Rolls back.
begin;

do $static$
begin
  if has_table_privilege('anon', 'public.branch_qris_codes', 'INSERT')
     or has_table_privilege('authenticated', 'public.branch_qris_codes', 'UPDATE') then
    raise exception 'branch_qris_codes must only be written through save_branch_qris';
  end if;
  if has_function_privilege('anon', 'public.save_branch_qris(text,text,text,boolean)', 'EXECUTE') then
    raise exception 'save_branch_qris must not be callable by anon';
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
insert into storage.objects(bucket_id, name) values ('store-assets', 'qris/smoke-kedamaian.png');

create temporary table qris_result(step text, value jsonb) on commit drop;
grant all on qris_result to authenticated;

-- Admin cannot save a QRIS.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
do $admin$
begin
  perform public.save_branch_qris('Kedamaian', 'qris/smoke-kedamaian.png', 'smoke-qris-bank', true);
  raise exception 'Admin saved a branch QRIS';
exception when insufficient_privilege then null;
end
$admin$;
reset role;

-- Owner saves; image must exist; linked account must be a bank account.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $owner$
begin
  begin
    perform public.save_branch_qris('Kedamaian', 'qris/missing.png', 'smoke-qris-bank', true);
    raise exception 'QRIS saved without an uploaded image';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_branch_qris('Kedamaian', 'qris/smoke-kedamaian.png', 'no-such-account', true);
    raise exception 'QRIS saved with an unknown linked account';
  exception when invalid_parameter_value then null;
  end;
end
$owner$;
insert into qris_result select 'save', public.save_branch_qris('Kedamaian', 'qris/smoke-kedamaian.png', 'smoke-qris-bank', true);
-- Saving again replaces (one QRIS per branch).
insert into qris_result select 'save_again', public.save_branch_qris('Kedamaian', 'qris/smoke-kedamaian.png', 'smoke-qris-bank', true);
reset role;

do $checkout$
declare
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_variant record;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_message text;
begin
  if (select count(*) from public.branch_qris_codes where branch_id = 'Kedamaian') <> 1 then
    raise exception 'Expected exactly one QRIS for the branch';
  end if;
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;

  -- A branch without QRIS rejects 'qris'.
  begin
    perform public.quote_storefront_checkout(
      gen_random_uuid()::text, '{"name":"Smoke QRIS","whatsappNumber":"081299990001"}', 'Pahoman', 'pickup', v_tomorrow, '12:00',
      jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
      null, null, null, null, null, 'qris', null);
    raise exception 'QRIS accepted for a branch without QRIS';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'STOREFRONT_QRIS_UNAVAILABLE' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke QRIS","whatsappNumber":"081299990001"}', 'Kedamaian', 'pickup', v_tomorrow, '12:00',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'qris', null);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.payment_method <> 'transfer' then raise exception 'QRIS order must be recorded as a transfer, got %', v_order.payment_method; end if;
  if v_order.payment_account_snapshot->>'channel' <> 'qris'
     or v_order.payment_account_snapshot->>'accountId' <> 'smoke-qris-bank'
     or v_order.payment_account_snapshot->>'qrisImagePath' <> 'qris/smoke-kedamaian.png' then
    raise exception 'QRIS order snapshot is wrong: %', v_order.payment_account_snapshot;
  end if;

  -- Plain transfer still uses the default account without the QRIS marker.
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Smoke Transfer","whatsappNumber":"081299990002"}', 'Kedamaian', 'pickup', v_tomorrow, '12:15',
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1)),
    null, null, null, null, null, 'transfer', null);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.payment_account_snapshot ? 'channel' then raise exception 'Transfer order got a QRIS marker'; end if;
end
$checkout$;

-- Customers (anon) can read active QRIS without touching staff-only helpers,
-- and never see inactive ones.
insert into public.branch_qris_codes(branch_id, image_path, linked_account_id, is_active)
select 'Pahoman', 'qris/smoke-pahoman-off.png', linked_account_id, false
from public.branch_qris_codes where branch_id = 'Kedamaian'
on conflict (branch_id) do update set is_active = false;
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
