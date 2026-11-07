-- Rupiah vouchers, review reward Rp20.000, all review fields required. Rolls back.
begin;

do $smoke$
declare
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_variant record;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_answers jsonb;
  v_message text;
  v_review jsonb;
  v_quote jsonb;
  v_full_profile jsonb := '{"name":"Smoke Review","email":"smoke-review@fleurstales.test","birthday":"1995-05-05","domicile":"Bandar Lampung","ageRange":"25_34","gender":"female","occupation":"Designer","acquisitionSource":"Instagram","promoPreferences":["discount"]}';
  v_customer jsonb := '{"name":"Smoke Review","whatsappNumber":"081299990077"}';
  v_items jsonb;
  v_customer_id text;
begin
  -- Discount helper.
  if private.voucher_discount_idr('{"discountType":"amount","amountOffIdr":20000}', 15000) <> 15000 then raise exception 'Amount voucher must not exceed the subtotal'; end if;
  if private.voucher_discount_idr('{"discountType":"amount","amountOffIdr":20000}', 300000) <> 20000 then raise exception 'Amount voucher wrong'; end if;
  if private.voucher_discount_idr('{"percentOff":10}', 300000) <> 30000 then raise exception 'Percent voucher (no discountType) must stay percent'; end if;

  select p.id as product_id, v.id as variant_id, v.price_idr into v_variant
  from public.products p join public.product_variants v on v.product_id = p.id and v.status = 'active'
  where p.is_active order by v.price_idr desc limit 1;
  v_items := jsonb_build_array(jsonb_build_object('productId', v_variant.product_id, 'variantId', v_variant.variant_id, 'quantity', 2));

  -- A completed order to review.
  v_result := public.create_storefront_order(gen_random_uuid()::text, v_customer, 'Kedamaian', 'pickup', v_tomorrow, '12:00', v_items, null, null, null, null, null, 'transfer', null);
  -- Fixture shortcut: mark it completed without walking the payment workflow.
  set local session_replication_role = replica;
  update public.orders set status = 'picked_up', payment_status = 'paid' where id = v_result->>'orderId' returning * into v_order;
  set local session_replication_role = origin;
  v_customer_id := v_order.customer_id;
  select coalesce(jsonb_agg(jsonb_build_object('questionId', id, 'score', 5)), '[]'::jsonb) into v_answers from private.review_questions where is_active;

  -- Incomplete form (no note) is rejected.
  begin
    perform public.submit_order_review(v_order.public_tracking_id::text, v_answers, null, v_full_profile);
    raise exception 'Review without a note was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'REVIEW_ALL_FIELDS_REQUIRED' then raise exception 'Unexpected: %', v_message; end if;
  end;
  -- Missing a profile field is rejected.
  begin
    perform public.submit_order_review(v_order.public_tracking_id::text, v_answers, 'Bagus', v_full_profile - 'occupation');
    raise exception 'Review without occupation was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'REVIEW_ALL_FIELDS_REQUIRED' then raise exception 'Unexpected: %', v_message; end if;
  end;

  v_review := public.submit_order_review(v_order.public_tracking_id::text, v_answers, 'Bunga cantik, pelayanan cepat.', v_full_profile);
  if (v_review->'reward'->>'amountOffIdr')::bigint <> 20000 then raise exception 'Reward should be Rp20.000: %', v_review; end if;

  -- The reward gives exactly Rp20.000 on the next order (subtotal >= 300.000).
  v_quote := public.quote_storefront_checkout(gen_random_uuid()::text, v_customer, 'Kedamaian', 'pickup', v_tomorrow, '13:00', v_items, null, null, null, null, null, 'transfer', null);
  if (v_quote->>'itemsSubtotalIdr')::bigint >= 300000 then
    if coalesce((v_quote->>'reviewRewardApplied')::boolean, false) is not true or (v_quote->>'discountIdr')::bigint <> 20000 then
      raise exception 'Review reward not applied as Rp20.000: %', v_quote;
    end if;
  end if;

  -- Customer-assigned vouchers: the higher Rupiah value wins (Rp50.000 > 10%).
  insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
  values ('vouchers', 1, jsonb_build_object('vouchers', jsonb_build_array(
    jsonb_build_object('id','v1','code','PCT10','percentOff',10,'eligibility','selected','selectedCustomerIds',jsonb_build_array(v_customer_id),'isActive',true,'createdAt','2026-11-07T00:00:00Z'),
    jsonb_build_object('id','v2','code','RP50K','discountType','amount','amountOffIdr',50000,'percentOff',0,'eligibility','selected','selectedCustomerIds',jsonb_build_array(v_customer_id),'isActive',true,'createdAt','2026-11-07T00:00:00Z')
  )), now())
  on conflict (domain) do update set snapshot = excluded.snapshot;
  v_result := private.resolve_voucher_discount(v_customer, 300000, null);
  if v_result->>'promoCode' <> 'RP50K' or (v_result->>'discountIdr')::bigint <> 50000 then raise exception 'Auto voucher should pick RP50K: %', v_result; end if;
  v_result := private.resolve_voucher_discount(v_customer, 300000, 'PCT10');
  if (v_result->>'discountIdr')::bigint <> 30000 then raise exception 'Typed percent voucher wrong: %', v_result; end if;
  v_result := private.resolve_voucher_discount(v_customer, 30000, 'RP50K');
  if (v_result->>'discountIdr')::bigint <> 30000 then raise exception 'Amount voucher must cap at the subtotal: %', v_result; end if;
end
$smoke$;

rollback;
