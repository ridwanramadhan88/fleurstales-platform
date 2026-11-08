-- Delivery recipient, pin and landmark: new checkouts must send them, older
-- clients default the recipient to the customer, Owner/Admin can correct them,
-- tracking shows them. Rolls back.
begin;

do $static$
begin
  if to_regprocedure('public.create_storefront_order(text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text)') is not null then
    raise exception 'Old 14-argument create_storefront_order must be gone (overload ambiguity)';
  end if;
  if not has_function_privilege('anon', 'public.create_storefront_order(text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text,jsonb)', 'EXECUTE') then
    raise exception 'anon must be able to check out';
  end if;
  if has_function_privilege('anon', 'public.save_order_delivery_details_guarded(text,integer,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.save_order_delivery_details(text,integer,jsonb)', 'EXECUTE') then
    raise exception 'Delivery edits must go through the guarded wrapper, staff only';
  end if;
  if has_function_privilege('authenticated', 'private.apply_order_delivery_details(text,jsonb,boolean)', 'EXECUTE') then
    raise exception 'apply_order_delivery_details must stay private';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'pin-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'pin-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('d0000000-0000-4000-8000-0000000000e1', 'pin-owner', 'Pin Owner', 'owner', true, 'pin-owner', 'pin-owner@fleurstales.test'),
  ('d0000000-0000-4000-8000-0000000000e2', 'emp-pin-florist', 'Pin Florist', 'florist', true, 'pin-florist', 'pin-florist@fleurstales.test');

create temporary table pin_ctx(key text primary key, value text) on commit drop;
grant all on pin_ctx to authenticated;

do $checkout$
declare
  v_day date := timezone('Asia/Jakarta', now())::date + 3;
  v_variant record;
  v_items jsonb;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_message text;
  v_status jsonb;
begin
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;
  v_items := jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1));

  -- New checkout without a pin is refused.
  begin
    perform public.create_storefront_order(
      gen_random_uuid()::text, '{"name":"Pin Smoke","whatsappNumber":"081299991001"}', 'Kedamaian', 'delivery', v_day, '12:00',
      v_items, 'E2E Jl. Mawar 1', null, null, null, null, 'transfer', null,
      '{"recipientName":"Ibu Ratna","recipientPhone":"0812 7788 2010","landmark":"Pagar hitam"}');
    raise exception 'Checkout without a pin was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_PIN_REQUIRED' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  -- Bad phone and bad coordinates are refused.
  begin
    perform public.create_storefront_order(
      gen_random_uuid()::text, '{"name":"Pin Smoke","whatsappNumber":"081299991001"}', 'Kedamaian', 'delivery', v_day, '12:00',
      v_items, 'E2E Jl. Mawar 1', null, null, null, null, 'transfer', null,
      '{"recipientName":"Ibu Ratna","recipientPhone":"12","latitude":-5.38,"longitude":105.26,"landmark":"Pagar hitam"}');
    raise exception 'Checkout with a 2-digit phone was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_RECIPIENT_PHONE_INVALID' then raise exception 'Unexpected error: %', v_message; end if;
  end;
  begin
    perform public.create_storefront_order(
      gen_random_uuid()::text, '{"name":"Pin Smoke","whatsappNumber":"081299991001"}', 'Kedamaian', 'delivery', v_day, '12:00',
      v_items, 'E2E Jl. Mawar 1', null, null, null, null, 'transfer', null,
      '{"latitude":95,"longitude":105.26,"landmark":"Pagar hitam"}');
    raise exception 'Checkout with latitude 95 was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_PIN_INVALID' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  -- Complete details are stored.
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Pin Smoke","whatsappNumber":"081299991001"}', 'Kedamaian', 'delivery', v_day, '12:00',
    v_items, 'E2E Jl. Mawar 1', null, null, null, null, 'transfer', null,
    '{"recipientName":"Ibu Ratna","recipientPhone":"0812 7788 2010","latitude":-5.381,"longitude":105.258,"landmark":"Pagar hitam"}');
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.recipient_name <> 'Ibu Ratna' or v_order.recipient_phone <> '0812 7788 2010'
     or v_order.delivery_lat <> -5.381 or v_order.delivery_lng <> 105.258 or v_order.delivery_landmark <> 'Pagar hitam' then
    raise exception 'Delivery details not stored: %', to_jsonb(v_order);
  end if;
  insert into pin_ctx values ('order', v_order.id), ('revision', v_order.revision::text);

  -- Tracking shows them.
  v_status := public.get_order_public_status(v_order.public_tracking_id::text);
  if v_status->>'recipientName' <> 'Ibu Ratna' or v_status->>'deliveryLandmark' <> 'Pagar hitam'
     or (v_status->>'deliveryLatitude')::double precision <> -5.381 then
    raise exception 'Tracking lacks delivery details: %', v_status;
  end if;

  -- An older client (no details) still works; customer becomes the recipient.
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Old Client","whatsappNumber":"081299991002"}', 'Kedamaian', 'delivery', v_day, '12:15',
    v_items, 'E2E Jl. Mawar 2', null, null, null, null, 'transfer', null);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.recipient_name is distinct from v_order.customer_name_snapshot
     or v_order.recipient_phone is distinct from v_order.customer_whatsapp_snapshot
     or v_order.delivery_lat is not null then
    raise exception 'Older client order did not default the recipient: %', to_jsonb(v_order);
  end if;

  -- Pickup orders ignore delivery details.
  v_result := public.create_storefront_order(
    gen_random_uuid()::text, '{"name":"Pickup Smoke","whatsappNumber":"081299991003"}', 'Kedamaian', 'pickup', v_day, '12:30',
    v_items, null, null, null, null, null, 'transfer', null, '{"recipientName":"X"}');
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.recipient_name is not null then raise exception 'Pickup order stored a recipient'; end if;
end
$checkout$;

-- Florist cannot edit delivery details.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $florist$
begin
  perform public.save_order_delivery_details_guarded((select value from pin_ctx where key = 'order'), (select value::int from pin_ctx where key = 'revision'), '{"landmark":"x","latitude":1,"longitude":1}');
  raise exception 'Florist edited delivery details';
exception when insufficient_privilege then null;
end
$florist$;
reset role;

-- Owner corrects them; revision is checked; activity is written.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $owner$
declare
  v_order_id text := (select value from pin_ctx where key = 'order');
  v_revision int := (select value::int from pin_ctx where key = 'revision');
  v_result jsonb;
begin
  begin
    perform public.save_order_delivery_details_guarded(v_order_id, v_revision - 1, '{"landmark":"x","latitude":1,"longitude":1}');
    raise exception 'Stale revision accepted';
  exception when sqlstate 'PT409' then null;
  end;
  v_result := public.save_order_delivery_details_guarded(v_order_id, v_revision,
    '{"address":"E2E Jl. Melati 9","recipientName":"Pak Budi","recipientPhone":"0813 1111 2222","latitude":-5.4,"longitude":105.27,"landmark":"Rumah biru"}');
  if v_result->>'recipientName' <> 'Pak Budi' or v_result->>'deliveryAddress' <> 'E2E Jl. Melati 9'
     or (v_result->>'revision')::int <= v_revision then
    raise exception 'Owner edit not applied: %', v_result;
  end if;
end
$owner$;
reset role;

do $after$
begin
  if not exists (
    select 1 from public.order_activities
    where order_id = (select value from pin_ctx where key = 'order') and kind = 'fulfillment'
      and metadata->'after'->>'landmark' = 'Rumah biru'
  ) then
    raise exception 'Delivery edit activity missing';
  end if;
end
$after$;

rollback;
