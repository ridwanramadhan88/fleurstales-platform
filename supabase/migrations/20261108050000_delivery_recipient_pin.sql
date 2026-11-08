-- Delivery recipient, map pin and landmark (Owner decisions, 8 Nov 2026).
--
-- A delivery order now records who receives it (name + phone, which may differ
-- from the customer), a map pin and a landmark / house detail. New checkouts
-- (toko online and Admin) must send all of them; older clients keep working and
-- default the recipient to the customer. Owner/Admin can correct the details
-- until the order is finished.

begin;

alter table public.orders
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision,
  add column if not exists delivery_landmark text;

alter table public.orders drop constraint if exists orders_delivery_details_valid;
alter table public.orders add constraint orders_delivery_details_valid check (
  ((delivery_lat is null and delivery_lng is null)
    or (delivery_lat between -90 and 90 and delivery_lng between -180 and 180))
  and (recipient_name is null or char_length(recipient_name) <= 120)
  and (recipient_phone is null or char_length(recipient_phone) <= 32)
  and (delivery_landmark is null or char_length(delivery_landmark) <= 500)
);

create or replace function private.apply_order_delivery_details(
  p_order_id text,
  p_details jsonb,
  p_require_complete boolean
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_name text;
  v_phone text;
  v_landmark text;
  v_lat double precision;
  v_lng double precision;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.fulfillment <> 'delivery' then
    return v_order;
  end if;

  if jsonb_typeof(v_details) <> 'object' then
    raise exception 'DELIVERY_DETAILS_INVALID' using errcode = '22023';
  end if;

  v_name := nullif(trim(coalesce(v_details->>'recipientName', '')), '');
  v_phone := nullif(trim(coalesce(v_details->>'recipientPhone', '')), '');
  v_landmark := nullif(trim(coalesce(v_details->>'landmark', '')), '');

  begin
    v_lat := nullif(trim(coalesce(v_details->>'latitude', '')), '')::double precision;
    v_lng := nullif(trim(coalesce(v_details->>'longitude', '')), '')::double precision;
  exception when invalid_text_representation then
    raise exception 'DELIVERY_PIN_INVALID' using errcode = '22023';
  end;
  if (v_lat is null) <> (v_lng is null)
     or (v_lat is not null and (v_lat not between -90 and 90 or v_lng not between -180 and 180)) then
    raise exception 'DELIVERY_PIN_INVALID' using errcode = '22023';
  end if;

  if v_phone is not null
     and char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 8 and 15 then
    raise exception 'DELIVERY_RECIPIENT_PHONE_INVALID' using errcode = '22023';
  end if;

  v_name := coalesce(v_name, v_order.customer_name_snapshot);
  v_phone := coalesce(v_phone, v_order.customer_whatsapp_snapshot);

  if p_require_complete then
    if v_name is null then raise exception 'DELIVERY_RECIPIENT_NAME_REQUIRED' using errcode = '22023'; end if;
    if v_phone is null then raise exception 'DELIVERY_RECIPIENT_PHONE_INVALID' using errcode = '22023'; end if;
    if v_lat is null then raise exception 'DELIVERY_PIN_REQUIRED' using errcode = '22023'; end if;
    if v_landmark is null then raise exception 'DELIVERY_LANDMARK_REQUIRED' using errcode = '22023'; end if;
  end if;
  if char_length(coalesce(v_name, '')) > 120 then raise exception 'DELIVERY_RECIPIENT_NAME_TOO_LONG' using errcode = '22023'; end if;
  if char_length(coalesce(v_phone, '')) > 32 then raise exception 'DELIVERY_RECIPIENT_PHONE_INVALID' using errcode = '22023'; end if;
  if char_length(coalesce(v_landmark, '')) > 500 then raise exception 'DELIVERY_LANDMARK_TOO_LONG' using errcode = '22023'; end if;

  update public.orders
  set recipient_name = v_name,
      recipient_phone = v_phone,
      delivery_landmark = v_landmark,
      delivery_lat = v_lat,
      delivery_lng = v_lng,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function private.apply_order_delivery_details(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function private.apply_order_delivery_details(text, jsonb, boolean) to service_role;

-- Toko online checkout: same as before plus p_delivery_details.
drop function if exists public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
);

CREATE OR REPLACE FUNCTION public.create_storefront_order(p_idempotency_key text, p_customer jsonb, p_branch_id text, p_fulfillment text, p_schedule_date date, p_schedule_time time without time zone, p_items jsonb, p_delivery_address text DEFAULT NULL::text, p_delivery_instructions text DEFAULT NULL::text, p_order_note text DEFAULT NULL::text, p_greeting_message text DEFAULT NULL::text, p_greeting_card_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'transfer'::text, p_promo_code text DEFAULT NULL::text, p_delivery_details jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account jsonb;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_reward private.customer_review_rewards%rowtype;
  v_reward_discount bigint;
  v_is_dedup boolean;
  v_auto_promo jsonb;
  v_effective_promo_code text;
begin
  -- A retry of an order that already exists must still return it, so only new
  -- idempotency keys spend the per-IP checkout budget.
  if not exists (
    select 1 from public.orders o
    where o.storefront_idempotency_key = trim(coalesce(p_idempotency_key, ''))
  ) then
    perform private.consume_public_checkout_budget();
  end if;

  -- 'qris' = pay the branch QRIS; recorded as a transfer whose account
  -- snapshot is the QRIS's linked bank account (+ channel 'qris'), so proof
  -- upload, verification and reconciliation work unchanged.
  if lower(trim(coalesce(p_payment_method, 'transfer'))) not in ('transfer', 'qris') then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;

  if lower(trim(coalesce(p_payment_method, 'transfer'))) = 'qris' then
    v_account := private.storefront_qris_account(p_branch_id);
    if v_account is null then
      raise exception 'STOREFRONT_QRIS_UNAVAILABLE' using errcode = '22023';
    end if;
  else
    v_account := private.default_storefront_payment_account(p_branch_id);
    if v_account is null then
      raise exception 'STOREFRONT_PAYMENT_ACCOUNT_UNAVAILABLE' using errcode = '22023';
    end if;
  end if;

  v_result := public.create_storefront_order_pre_cashflow(
    p_idempotency_key,p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,
    p_items,p_delivery_address,p_delivery_instructions,p_order_note,p_greeting_message,
    p_greeting_card_name,'transfer',p_promo_code
  );
  v_is_dedup := coalesce((v_result->>'deduplicated')::boolean, false);

  select * into v_order from public.orders where id = v_result->>'orderId' for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;

  if not v_is_dedup then
    if nullif(trim(coalesce(p_promo_code, '')), '') is null
       and v_order.promo_code is null
       and v_order.discount_idr > 0 then
      v_auto_promo := private.resolve_voucher_discount(
        p_customer,
        v_order.items_subtotal_idr,
        null
      );
      if coalesce((v_auto_promo->>'promoAccepted')::boolean, false)
         and coalesce((v_auto_promo->>'discountIdr')::bigint, 0) = v_order.discount_idr then
        v_effective_promo_code := nullif(
          upper(trim(coalesce(v_auto_promo->>'promoCode', ''))),
          ''
        );
      end if;
    end if;

    update public.orders
    set payment_method = 'transfer',
        payment_account_snapshot = v_account,
        promo_code = coalesce(v_order.promo_code, v_effective_promo_code),
        updated_at = now()
    where id = v_order.id
    returning * into v_order;

    select * into v_reward
    from private.customer_review_rewards r
    where r.customer_id = v_order.customer_id
      and r.status = 'available'
      and r.min_order_idr <= v_order.items_subtotal_idr
    order by r.issued_at, r.id
    limit 1
    for update;

    if found then
      v_reward_discount := private.review_reward_discount_idr(v_reward.percent_off, v_reward.amount_off_idr, v_order.items_subtotal_idr);
      if v_reward_discount > v_order.discount_idr then
        update public.orders
        set discount_idr = v_reward_discount,
            total_idr = greatest(0, items_subtotal_idr - v_reward_discount + delivery_fee_idr),
            promo_code = null,
            review_reward_id = v_reward.id,
            updated_at = now()
        where id = v_order.id
        returning * into v_order;

        update private.customer_review_rewards
        set status = 'redeemed', redeemed_order_id = v_order.id, redeemed_at = now()
        where id = v_reward.id and status = 'available';
      end if;
    end if;
  end if;

  -- Recipient, map pin and landmark (Owner decision, 8 Nov 2026). New
  -- checkouts send p_delivery_details and must carry all of them; a client
  -- without it keeps working and the customer becomes the recipient.
  if not v_is_dedup and v_order.fulfillment = 'delivery' then
    v_order := private.apply_order_delivery_details(v_order.id, p_delivery_details, p_delivery_details is not null);
  end if;

  return private.order_idempotency_result(v_order, v_is_dedup);
end;
$function$;

revoke execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text,jsonb
) from public, authenticated;
grant execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text,jsonb
) to anon, service_role;

-- Admin order: payload.deliveryDetails, same rules.
create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_order public.orders%rowtype;
begin
  if coalesce(p_payload->>'paymentStatus','unpaid') <> 'unpaid'
     or coalesce((p_payload->>'depositAmountIdr')::bigint,0) <> 0 then
    raise exception 'PAYMENT_CONFIRMED_DURING_PROCESS_ORDER' using errcode='22023';
  end if;
  v_result := public.create_internal_order_pre_cashflow(p_payload);

  if not coalesce((v_result->>'deduplicated')::boolean, false) then
    select * into v_order from public.orders where id = v_result->>'orderId';
    if found and v_order.fulfillment = 'delivery' then
      perform private.apply_order_delivery_details(
        v_order.id,
        p_payload->'deliveryDetails',
        jsonb_typeof(p_payload->'deliveryDetails') = 'object'
      );
    end if;
  end if;

  return v_result;
end;
$function$;

-- Owner/Admin correct the recipient, pin, landmark or address until the
-- order is finished.
create or replace function public.save_order_delivery_details(
  p_order_id text,
  p_expected_revision integer,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_before public.orders%rowtype;
  v_address text := nullif(trim(coalesce(p_details->>'address', '')), '');
  v_actor text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.current_staff_role() is null or private.current_staff_role() not in ('owner', 'admin') then
    raise exception 'ORDER_DELIVERY_EDIT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode = '40001';
  end if;
  if v_order.fulfillment <> 'delivery' then
    raise exception 'ORDER_NOT_DELIVERY' using errcode = '22023';
  end if;
  if v_order.status in ('delivered', 'picked_up', 'cancelled', 'failed') then
    raise exception 'ORDER_DELIVERY_LOCKED' using errcode = '22023';
  end if;
  if char_length(coalesce(v_address, '')) > 1000 then
    raise exception 'DELIVERY_ADDRESS_TOO_LONG' using errcode = '22023';
  end if;
  v_before := v_order;

  if v_address is not null and v_address is distinct from v_order.delivery_address then
    update public.orders set delivery_address = v_address where id = v_order.id;
  end if;
  v_order := private.apply_order_delivery_details(v_order.id, p_details, true);

  select coalesce(nullif(trim(sap.display_name), ''), sap.role) into v_actor
  from public.staff_access_profiles sap
  where sap.user_id = (select auth.uid()) and sap.is_active = true
  limit 1;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
  values (
    'activity_' || replace(gen_random_uuid()::text, '-', ''), v_order.id, 'fulfillment',
    'Detail pengiriman diperbarui.',
    v_actor, now(),
    jsonb_build_object(
      'before', jsonb_build_object('address', v_before.delivery_address, 'recipientName', v_before.recipient_name,
        'recipientPhone', v_before.recipient_phone, 'landmark', v_before.delivery_landmark,
        'latitude', v_before.delivery_lat, 'longitude', v_before.delivery_lng),
      'after', jsonb_build_object('address', v_order.delivery_address, 'recipientName', v_order.recipient_name,
        'recipientPhone', v_order.recipient_phone, 'landmark', v_order.delivery_landmark,
        'latitude', v_order.delivery_lat, 'longitude', v_order.delivery_lng)
    )
  );

  return jsonb_build_object(
    'orderId', v_order.id,
    'revision', v_order.revision,
    'deliveryAddress', v_order.delivery_address,
    'recipientName', v_order.recipient_name,
    'recipientPhone', v_order.recipient_phone,
    'deliveryLandmark', v_order.delivery_landmark,
    'deliveryLatitude', v_order.delivery_lat,
    'deliveryLongitude', v_order.delivery_lng
  );
end;
$$;

-- A stale revision raises 40001; browsers call the guarded wrapper, which turns
-- it into PT409 so PostgREST does not retry it server-side.
create or replace function public.save_order_delivery_details_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_order_delivery_details(p_order_id, p_expected_revision, p_details);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the order before saving its delivery details again.';
end;
$$;

revoke all on function public.save_order_delivery_details(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_order_delivery_details(text, integer, jsonb) to service_role;
revoke all on function public.save_order_delivery_details_guarded(text, integer, jsonb) from public, anon;
grant execute on function public.save_order_delivery_details_guarded(text, integer, jsonb) to authenticated, service_role;

-- Customer tracking page shows who receives the order and where.
CREATE OR REPLACE FUNCTION public.get_order_public_status(p_tracking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tracking_id uuid;
  v_result jsonb;
begin
  perform private.consume_public_order_lookup_budget();
  begin
    v_tracking_id := p_tracking_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  select jsonb_build_object(
    'orderNumber',o.order_number,
    'status',o.status,
    'fulfillment',o.fulfillment,
    'branchId',o.branch_id,
    'branchName',b.name,
    'branchAddress',b.address,
    'customerName',coalesce(c.name,o.customer_name_snapshot),
    'customerWhatsapp',coalesce(c.whatsapp_number,o.customer_whatsapp_snapshot),
    'customerEmail',coalesce(c.email,o.customer_email_snapshot),
    'customerBirthday',c.birthday,
    'customerProfile',jsonb_strip_nulls(jsonb_build_object(
      'domicile',c.domicile,
      'ageRange',c.age_range,
      'gender',c.gender,
      'occupation',c.occupation,
      'acquisitionSource',c.acquisition_source,
      'promoPreferences',to_jsonb(c.promo_preferences)
    )),
    'contactWhatsapp',sp.whatsapp,
    'deliveryAddress',o.delivery_address,
    'deliveryInstructions',o.delivery_instructions,
    'recipientName',o.recipient_name,
    'recipientPhone',o.recipient_phone,
    'deliveryLandmark',o.delivery_landmark,
    'deliveryLatitude',o.delivery_lat,
    'deliveryLongitude',o.delivery_lng,
    'scheduleDate',o.schedule_date,
    'scheduleTime',o.schedule_time,
    'requestedPickupDate',o.requested_pickup_date,
    'requestedPickupTime',o.requested_pickup_time,
    'paymentStatus',o.payment_status,
    'paymentMethod',o.payment_method,
    'paymentAccountSnapshot',o.payment_account_snapshot,
    'itemsSubtotalIdr',o.items_subtotal_idr,
    'deliveryFeeIdr',o.delivery_fee_idr,
    'discountIdr',o.discount_idr,
    'totalIdr',o.total_idr,
    'cancellationReason',o.cancellation_reason,
    'finishPhotoUrl',o.finish_photo_url,
    'reviewSubmitted',exists(select 1 from private.order_reviews r where r.order_id=o.id),
    'reviewQuestions',case
      when o.status in ('delivered','picked_up')
        and not exists(select 1 from private.order_reviews r where r.order_id=o.id)
      then coalesce((
        select jsonb_agg(
          jsonb_build_object('id',q.id,'question',q.question,'displayOrder',q.display_order)
          order by q.display_order,q.id
        )
        from private.review_questions q where q.is_active=true
      ),'[]'::jsonb)
      else '[]'::jsonb
    end,
    'review',(select jsonb_build_object(
      'note',r.note,
      'submittedAt',r.submitted_at,
      'surveyData',r.survey_data,
      'answers',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'questionId',a.question_id,
            'question',a.question_snapshot,
            'score',a.score
          ) order by a.question_id
        )
        from private.order_review_answers a where a.review_id=r.id
      ),'[]'::jsonb)
    ) from private.order_reviews r where r.order_id=o.id limit 1),
    'reviewReward',(select jsonb_build_object(
      'percentOff',case when coalesce(rw.amount_off_idr,0)>0 then null else rw.percent_off end,
      'amountOffIdr',rw.amount_off_idr,
      'minOrderIdr',rw.min_order_idr,
      'status',rw.status,
      'issuedAt',rw.issued_at,
      'redeemedAt',rw.redeemed_at
    ) from private.customer_review_rewards rw where rw.source_order_id=o.id limit 1),
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name',i.product_name_snapshot,
          'variant',i.variant_size_snapshot,
          'quantity',i.quantity,
          'unitPriceIdr',i.unit_price_idr
        ) order by i.created_at,i.id
      )
      from public.order_items i where i.order_id=o.id
    ),'[]'::jsonb)
  ) into v_result
  from public.orders o
  left join public.customers c on c.id=o.customer_id
  left join public.branches b on b.id=o.branch_id
  left join public.store_profile sp on sp.id='primary'
  where o.public_tracking_id=v_tracking_id
    and (o.tracking_expires_at is null or o.tracking_expires_at > now())
  limit 1;

  return v_result;
end;
$function$;

notify pgrst, 'reload schema';

commit;
