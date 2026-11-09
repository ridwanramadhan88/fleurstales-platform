-- D2 distance fee: tariff off keeps the flat fee, tariff on prices by quoted
-- road distance per vehicle, product/quantity rules force the car, quotes are
-- bound to the pin and expire. Rolls back.
begin;

do $static$
begin
  if not has_function_privilege('anon', 'public.quote_delivery_fee(text,uuid,text,jsonb,double precision,double precision)', 'EXECUTE') then
    raise exception 'anon must be able to preview the delivery fee';
  end if;
  if has_table_privilege('anon', 'public.delivery_quotes', 'SELECT') or has_table_privilege('authenticated', 'public.delivery_quotes', 'INSERT') then
    raise exception 'delivery_quotes is service role only';
  end if;
  if has_function_privilege('authenticated', 'private.apply_order_delivery_fee(text,jsonb)', 'EXECUTE') then
    raise exception 'apply_order_delivery_fee must stay private';
  end if;
end
$static$;

do $fee$
declare
  v_day date := timezone('Asia/Jakarta', now())::date + 3;
  v_variant record;
  v_items jsonb;
  v_quote uuid;
  v_far uuid;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_message text;
  v_flat bigint;
  v_details jsonb;
begin
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;
  v_items := jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1));
  select delivery_fee_idr into v_flat from public.branches where id = 'Kedamaian';

  -- Tariff off: flat fee, vehicle only recorded.
  v_details := '{"recipientName":"Ibu Ratna","recipientPhone":"0812 7788 2010","latitude":-5.38,"longitude":105.26,"landmark":"Pagar hitam","vehicle":"motor"}';
  v_result := public.create_storefront_order(gen_random_uuid()::text, '{"name":"Fee Smoke","whatsappNumber":"081299992001"}', 'Kedamaian', 'delivery', v_day, '12:00', v_items, 'Jl. Mawar 1', null, null, null, null, 'transfer', null, v_details);
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.delivery_fee_idr <> v_flat or v_order.delivery_vehicle <> 'motor' then
    raise exception 'Tariff off must keep the flat fee (got %, %)', v_order.delivery_fee_idr, v_order.delivery_vehicle;
  end if;

  -- Tariff on: motor 10.000 for 3 km then 2.500/km, car 25.000 then 4.000/km.
  update public.branches set delivery_tariff_enabled = true,
    motor_base_idr = 10000, motor_included_km = 3, motor_per_km_idr = 2500,
    car_base_idr = 25000, car_included_km = 3, car_per_km_idr = 4000,
    max_delivery_km = 25, motor_max_items = 2
  where id = 'Kedamaian';

  insert into public.delivery_quotes(branch_id, latitude, longitude, distance_km) values ('Kedamaian', -5.38, 105.26, 7.2) returning id into v_quote;
  insert into public.delivery_quotes(branch_id, latitude, longitude, distance_km) values ('Kedamaian', -5.38, 105.26, 30.0) returning id into v_far;

  -- 7.2 km -> 5 chargeable km: motor 10.000 + 5*2.500 = 22.500; car 25.000 + 5*4.000 = 45.000.
  v_result := public.quote_delivery_fee('Kedamaian', v_quote, 'motor', v_items, -5.38, 105.26);
  if (v_result->>'feeIdr')::bigint <> 22500 then raise exception 'Motor fee wrong: %', v_result; end if;
  v_result := public.quote_delivery_fee('Kedamaian', v_quote, 'car', v_items, -5.38, 105.26);
  if (v_result->>'feeIdr')::bigint <> 45000 then raise exception 'Car fee wrong: %', v_result; end if;

  -- More products than the motor limit forces the car.
  v_result := public.quote_delivery_fee('Kedamaian', v_quote, null,
    jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'quantity', 3)), -5.38, 105.26);
  if v_result->>'vehicle' <> 'car' or (v_result->>'forcedCar')::boolean is not true then raise exception 'Quantity must force the car: %', v_result; end if;
  begin
    perform public.quote_delivery_fee('Kedamaian', v_quote, 'motor',
      jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'quantity', 3)), -5.38, 105.26);
    raise exception 'Motor accepted above the motor limit';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_VEHICLE_CAR_REQUIRED' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  -- A product marked requires_car forces the car even for one item.
  update public.products set requires_car = true where id = v_variant.product_id;
  v_result := public.quote_delivery_fee('Kedamaian', v_quote, 'motor', v_items, -5.38, 105.26) ;
exception when invalid_parameter_value then
  get stacked diagnostics v_message = message_text;
  if v_message <> 'DELIVERY_VEHICLE_CAR_REQUIRED' then raise exception 'Unexpected error: %', v_message; end if;
  update public.products set requires_car = false where requires_car;
end
$fee$;

do $order$
declare
  v_day date := timezone('Asia/Jakarta', now())::date + 3;
  v_variant record;
  v_items jsonb;
  v_quote uuid;
  v_far uuid;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_message text;
  v_details jsonb;
begin
  select p.id as product_id, v.id as variant_id into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active limit 1;
  v_items := jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 1));
  update public.branches set delivery_tariff_enabled = true,
    motor_base_idr = 10000, motor_included_km = 3, motor_per_km_idr = 2500,
    car_base_idr = 25000, car_included_km = 3, car_per_km_idr = 4000, max_delivery_km = 25, motor_max_items = 2
  where id = 'Kedamaian';
  insert into public.delivery_quotes(branch_id, latitude, longitude, distance_km) values ('Kedamaian', -5.38, 105.26, 7.2) returning id into v_quote;
  insert into public.delivery_quotes(branch_id, latitude, longitude, distance_km) values ('Kedamaian', -5.38, 105.26, 30.0) returning id into v_far;

  -- Checkout without a quote is refused.
  begin
    perform public.create_storefront_order(gen_random_uuid()::text, '{"name":"Fee Smoke","whatsappNumber":"081299992002"}', 'Kedamaian', 'delivery', v_day, '12:00', v_items, 'Jl. Mawar 1', null, null, null, null, 'transfer', null,
      '{"recipientName":"Ibu Ratna","recipientPhone":"0812 7788 2010","latitude":-5.38,"longitude":105.26,"landmark":"Pagar hitam","vehicle":"motor"}');
    raise exception 'Checkout without a quote was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_QUOTE_EXPIRED' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  -- Pin moved after measuring is refused.
  begin
    perform public.create_storefront_order(gen_random_uuid()::text, '{"name":"Fee Smoke","whatsappNumber":"081299992003"}', 'Kedamaian', 'delivery', v_day, '12:00', v_items, 'Jl. Mawar 1', null, null, null, null, 'transfer', null,
      jsonb_build_object('recipientName','Ibu Ratna','recipientPhone','0812 7788 2010','latitude',-5.30,'longitude',105.26,'landmark','Pagar hitam','vehicle','motor','quoteId',v_quote));
    raise exception 'Moved pin was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_QUOTE_PIN_MISMATCH' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  -- Out of range is refused.
  begin
    perform public.create_storefront_order(gen_random_uuid()::text, '{"name":"Fee Smoke","whatsappNumber":"081299992004"}', 'Kedamaian', 'delivery', v_day, '12:00', v_items, 'Jl. Mawar 1', null, null, null, null, 'transfer', null,
      jsonb_build_object('recipientName','Ibu Ratna','recipientPhone','0812 7788 2010','latitude',-5.38,'longitude',105.26,'landmark','Pagar hitam','vehicle','motor','quoteId',v_far));
    raise exception 'Out-of-range delivery was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_OUT_OF_RANGE' then raise exception 'Unexpected error: %', v_message; end if;
  end;

  -- Valid quote: fee recomputed on the server and total follows.
  v_result := public.create_storefront_order(gen_random_uuid()::text, '{"name":"Fee Smoke","whatsappNumber":"081299992005"}', 'Kedamaian', 'delivery', v_day, '12:00', v_items, 'Jl. Mawar 1', null, null, null, null, 'transfer', null,
    jsonb_build_object('recipientName','Ibu Ratna','recipientPhone','0812 7788 2010','latitude',-5.38,'longitude',105.26,'landmark','Pagar hitam','vehicle','car','quoteId',v_quote));
  select * into v_order from public.orders where id = v_result->>'orderId';
  if v_order.delivery_fee_idr <> 45000 or v_order.delivery_vehicle <> 'car' or v_order.delivery_distance_km <> 7.2
     or v_order.total_idr <> v_order.items_subtotal_idr - v_order.discount_idr + 45000 then
    raise exception 'Order not re-priced from the quote: fee %, vehicle %, total %', v_order.delivery_fee_idr, v_order.delivery_vehicle, v_order.total_idr;
  end if;

  -- Expired quote is refused.
  update public.delivery_quotes set expires_at = now() - interval '1 minute' where id = v_quote;
  begin
    perform public.quote_delivery_fee('Kedamaian', v_quote, 'motor', v_items, -5.38, 105.26);
    raise exception 'Expired quote was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'DELIVERY_QUOTE_EXPIRED' then raise exception 'Unexpected error: %', v_message; end if;
  end;
end
$order$;

do $anon_columns$
declare v_col text;
begin
  foreach v_col in array array['delivery_tariff_enabled','motor_base_idr','motor_included_km','motor_per_km_idr','car_base_idr','car_included_km','car_per_km_idr','max_delivery_km','motor_max_items'] loop
    if not has_column_privilege('anon', 'public.branches', v_col, 'SELECT') then
      raise exception 'anon must read branches.% (storefront branch list)', v_col;
    end if;
  end loop;
end
$anon_columns$;

rollback;
