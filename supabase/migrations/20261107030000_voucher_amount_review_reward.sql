-- Vouchers: Rupiah or percent discount + review reward Rp20.000 + all review
-- fields required (Owner request 6 Nov 2026).
--
-- * Vouchers (vouchers operational snapshot) gain discountType 'amount' with
--   amountOffIdr; missing discountType = percent (existing vouchers unchanged).
--   private.voucher_discount_idr computes either, never above the subtotal; the
--   automatic voucher choice compares the Rupiah value.
-- * Review reward: settings and issued rewards gain amount_off_idr. When > 0
--   the reward is a fixed Rupiah discount (percent_off is kept as the
--   fallback value and for rewards already issued).
-- * submit_order_review rejects incomplete forms (REVIEW_ALL_FIELDS_REQUIRED).
--
-- Function bodies below are the latest live definitions, changed only where
-- noted.

begin;

alter table private.review_reward_settings
  add column if not exists amount_off_idr bigint check (amount_off_idr is null or amount_off_idr >= 0);
alter table private.customer_review_rewards
  add column if not exists amount_off_idr bigint check (amount_off_idr is null or amount_off_idr > 0);

create or replace function private.voucher_discount_idr(p_voucher jsonb, p_subtotal bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_voucher->>'discountType', 'percent') = 'amount'
      then least(greatest(0, coalesce(p_subtotal, 0)), greatest(0, coalesce((p_voucher->>'amountOffIdr')::bigint, 0)))
    else round(greatest(0, coalesce(p_subtotal, 0)) * greatest(0, least(100, coalesce((p_voucher->>'percentOff')::integer, 0))) / 100.0)::bigint
  end
$$;
revoke execute on function private.voucher_discount_idr(jsonb, bigint) from public, anon, authenticated;

create or replace function private.review_reward_discount_idr(p_percent_off numeric, p_amount_off_idr bigint, p_subtotal bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_amount_off_idr, 0) > 0 then least(greatest(0, coalesce(p_subtotal, 0)), p_amount_off_idr)
    else least(greatest(0, coalesce(p_subtotal, 0)), round(greatest(0, coalesce(p_subtotal, 0)) * coalesce(p_percent_off, 0) / 100.0)::bigint)
  end
$$;
revoke execute on function private.review_reward_discount_idr(numeric, bigint, bigint) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.resolve_voucher_discount(p_customer jsonb, p_subtotal bigint, p_promo_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text := upper(trim(coalesce(p_promo_code, '')));
  v_voucher jsonb;
  v_customer public.customers%rowtype;
  v_normalized text := private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_metrics jsonb;
  v_spend bigint := 0;
  v_count integer := 0;
  v_segments jsonb;
  v_is_vip boolean := false;
  v_customer_found boolean := false;
  v_eligible boolean := false;
  v_percent integer := 0;
  v_discount bigint := 0;
  v_message text;
begin
  -- For a blank code, privately match the customer by WhatsApp and look only
  -- for vouchers that Admin explicitly assigned to that customer.
  if v_code = '' then
    select *
    into v_customer
    from public.customers
    where normalized_whatsapp_number = v_normalized
    limit 1;
    v_customer_found := found;

    if not v_customer_found then
      return jsonb_build_object(
        'discountIdr', 0,
        'promoCode', null,
        'promoAccepted', false,
        'promoMessage', null
      );
    end if;

    select value
    into v_voucher
    from private.operational_domain_state s,
      lateral jsonb_array_elements(coalesce(s.snapshot->'vouchers', '[]'::jsonb)) e(value)
    where s.domain = 'vouchers'
      and coalesce(value->>'eligibility', 'all') = 'selected'
      and coalesce(value->'selectedCustomerIds', '[]'::jsonb) ? v_customer.id
      and coalesce((value->>'isActive')::boolean, false)
      and nullif(trim(value->>'code'), '') is not null
      and private.voucher_discount_idr(value, p_subtotal) > 0
      and (
        nullif(value->>'startDate', '') is null
        or timezone('Asia/Jakarta', now())::date >= (value->>'startDate')::date
      )
      and (
        nullif(value->>'endDate', '') is null
        or timezone('Asia/Jakarta', now())::date <= (value->>'endDate')::date
      )
      and greatest(0, coalesce(p_subtotal, 0)) >= coalesce((value->>'minOrderIdr')::bigint, 0)
    order by
      private.voucher_discount_idr(value, p_subtotal) desc,
      case when nullif(value->>'endDate', '') is null then 1 else 0 end,
      nullif(value->>'endDate', '')::date,
      upper(trim(value->>'code')),
      value->>'id'
    limit 1;

    if v_voucher is null then
      return jsonb_build_object(
        'discountIdr', 0,
        'promoCode', null,
        'promoAccepted', false,
        'promoMessage', null
      );
    end if;

    v_code := upper(trim(v_voucher->>'code'));
  else
    select value
    into v_voucher
    from private.operational_domain_state s,
      lateral jsonb_array_elements(coalesce(s.snapshot->'vouchers', '[]'::jsonb)) e(value)
    where s.domain = 'vouchers'
      and upper(trim(value->>'code')) = v_code
    limit 1;
  end if;

  if v_voucher is null then
    v_message := 'Voucher is unavailable for this order.';
  elsif coalesce((v_voucher->>'isActive')::boolean, false) = false then
    v_message := 'Voucher is unavailable for this order.';
  elsif nullif(v_voucher->>'startDate', '') is not null
    and timezone('Asia/Jakarta', now())::date < (v_voucher->>'startDate')::date then
    v_message := 'Voucher is unavailable for this order.';
  elsif nullif(v_voucher->>'endDate', '') is not null
    and timezone('Asia/Jakarta', now())::date > (v_voucher->>'endDate')::date then
    v_message := 'Voucher is unavailable for this order.';
  elsif greatest(0, coalesce(p_subtotal, 0)) < coalesce((v_voucher->>'minOrderIdr')::bigint, 0) then
    v_message := 'Voucher is unavailable for this order.';
  else
    if not v_customer_found then
      select *
      into v_customer
      from public.customers
      where normalized_whatsapp_number = v_normalized
      limit 1;
      v_customer_found := found;
    end if;

    if v_customer_found then
      v_metrics := private.customer_voucher_metrics(v_customer.id);
      v_spend := coalesce((v_metrics->>'spendIdr')::bigint, 0);
      v_count := coalesce((v_metrics->>'orderCount')::integer, 0);
    end if;

    select customer_segments
    into v_segments
    from private.internal_settings_state
    where id = 'primary';

    v_is_vip := case coalesce(v_segments->>'mode', 'either')
      when 'spend' then v_spend >= coalesce((v_segments->>'minLifetimeSpend')::bigint, 1000000)
      when 'orders' then v_count >= coalesce((v_segments->>'minOrderCount')::integer, 5)
      else v_spend >= coalesce((v_segments->>'minLifetimeSpend')::bigint, 1000000)
        or v_count >= coalesce((v_segments->>'minOrderCount')::integer, 5)
    end;

    v_eligible := case coalesce(v_voucher->>'eligibility', 'all')
      when 'all' then true
      when 'vip' then v_is_vip
      when 'selected' then v_customer_found
        and coalesce(v_voucher->'selectedCustomerIds', '[]'::jsonb) ? v_customer.id
      else false
    end;

    if not v_eligible then
      v_message := 'Voucher is unavailable for this order.';
    else
      v_discount := private.voucher_discount_idr(v_voucher, p_subtotal);
      v_message := 'Voucher applied.';
    end if;
  end if;

  return jsonb_build_object(
    'discountIdr', v_discount,
    'promoCode', v_code,
    'promoAccepted', v_discount > 0,
    'promoMessage', v_message
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_storefront_order(p_idempotency_key text, p_customer jsonb, p_branch_id text, p_fulfillment text, p_schedule_date date, p_schedule_time time without time zone, p_items jsonb, p_delivery_address text DEFAULT NULL::text, p_delivery_instructions text DEFAULT NULL::text, p_order_note text DEFAULT NULL::text, p_greeting_message text DEFAULT NULL::text, p_greeting_card_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'transfer'::text, p_promo_code text DEFAULT NULL::text)
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

  return private.order_idempotency_result(v_order, v_is_dedup);
end;
$function$;

CREATE OR REPLACE FUNCTION public.quote_storefront_checkout(p_idempotency_key text, p_customer jsonb, p_branch_id text, p_fulfillment text, p_schedule_date date, p_schedule_time time without time zone, p_items jsonb, p_delivery_address text DEFAULT NULL::text, p_delivery_instructions text DEFAULT NULL::text, p_order_note text DEFAULT NULL::text, p_greeting_message text DEFAULT NULL::text, p_greeting_card_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'transfer'::text, p_promo_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quote jsonb;
  v_customer_id text;
  v_reward private.customer_review_rewards%rowtype;
  v_items bigint;
  v_current_discount bigint;
  v_reward_discount bigint;
begin
  -- 'qris' = pay the branch QRIS; still a transfer (proof upload, Finance
  -- verification) into the QRIS's linked bank account.
  if lower(trim(coalesce(p_payment_method, 'transfer'))) not in ('transfer', 'qris') then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;
  if lower(trim(coalesce(p_payment_method, 'transfer'))) = 'qris' then
    if private.storefront_qris_account(p_branch_id) is null then
      raise exception 'STOREFRONT_QRIS_UNAVAILABLE' using errcode = '22023';
    end if;
  elsif private.default_storefront_payment_account(p_branch_id) is null then
    raise exception 'STOREFRONT_PAYMENT_ACCOUNT_UNAVAILABLE' using errcode = '22023';
  end if;

  v_quote := public.quote_storefront_checkout_pre_cashflow(
    p_idempotency_key,p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,
    p_items,p_delivery_address,p_delivery_instructions,p_order_note,p_greeting_message,
    p_greeting_card_name,'transfer',p_promo_code
  );

  select c.id into v_customer_id
  from public.customers c
  where c.normalized_whatsapp_number = private.normalize_whatsapp(p_customer->>'whatsappNumber')
  limit 1;

  if v_customer_id is null then
    return v_quote || jsonb_build_object('reviewRewardApplied', false);
  end if;

  v_items := coalesce((v_quote->>'itemsSubtotalIdr')::bigint, 0);
  v_current_discount := coalesce((v_quote->>'discountIdr')::bigint, 0);

  select * into v_reward
  from private.customer_review_rewards r
  where r.customer_id = v_customer_id
    and r.status = 'available'
    and r.min_order_idr <= v_items
  order by r.issued_at, r.id
  limit 1;

  if not found then
    return v_quote || jsonb_build_object('reviewRewardApplied', false);
  end if;

  v_reward_discount := private.review_reward_discount_idr(v_reward.percent_off, v_reward.amount_off_idr, v_items);
  if v_reward_discount <= v_current_discount then
    return v_quote || jsonb_build_object('reviewRewardApplied', false);
  end if;

  return v_quote || jsonb_build_object(
    'discountIdr', v_reward_discount,
    'totalIdr', greatest(0, v_items - v_reward_discount + coalesce((v_quote->>'deliveryFeeIdr')::bigint,0)),
    'promoCode', null,
    'promoAccepted', false,
    'promoMessage', null,
    'reviewRewardApplied', true,
    'reviewRewardPercentOff', case when coalesce(v_reward.amount_off_idr, 0) > 0 then null else v_reward.percent_off end,
    'reviewRewardAmountOffIdr', v_reward.amount_off_idr,
    'reviewRewardMinOrderIdr', v_reward.min_order_idr
  );
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.get_staff_reviews(p_order_id text DEFAULT NULL::text, p_customer_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reviews jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- A review combines CRM identity with order history. Requiring both configured
  -- read capabilities keeps the RPC aligned with the same backend permission
  -- matrix used by the Customers and Orders workspaces.
  if not private.has_section_access('customers', 'view')
    or not private.has_action_permission('orders.read_all') then
    raise exception 'STAFF_REVIEW_READ_NOT_PERMITTED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(review_row order by submitted_at desc, review_id desc), '[]'::jsonb)
  into v_reviews
  from (
    select
      r.id as review_id,
      r.submitted_at,
      jsonb_build_object(
        'id', r.id,
        'orderId', r.order_id,
        'orderNumber', r.order_number,
        'customerId', r.customer_id,
        'customerName', o.customer_name_snapshot,
        'customerWhatsapp', o.customer_whatsapp_snapshot,
        'submittedAt', r.submitted_at,
        'note', r.note,
        'averageScore', coalesce((
          select round(avg(a.score)::numeric, 2)
          from private.order_review_answers a
          where a.review_id = r.id
        ), 0),
        'answers', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'questionId', a.question_id,
              'question', a.question_snapshot,
              'score', a.score
            )
            order by a.question_snapshot, a.question_id
          )
          from private.order_review_answers a
          where a.review_id = r.id
        ), '[]'::jsonb),
        'reward', (
          select jsonb_build_object(
            'id', rw.id,
            'percentOff', case when coalesce(rw.amount_off_idr, 0) > 0 then null else rw.percent_off end,
            'amountOffIdr', rw.amount_off_idr,
            'minOrderIdr', rw.min_order_idr,
            'status', rw.status,
            'issuedAt', rw.issued_at,
            'redeemedAt', rw.redeemed_at,
            'redeemedOrderId', rw.redeemed_order_id
          )
          from private.customer_review_rewards rw
          where rw.source_review_id = r.id
          limit 1
        )
      ) as review_row
    from private.order_reviews r
    join public.orders o on o.id = r.order_id
    where (p_order_id is null or r.order_id = p_order_id)
      and (p_customer_id is null or r.customer_id = p_customer_id)
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  ) s;

  return jsonb_build_object('reviews', v_reviews);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_review_configuration_cashflow_internal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text:=private.current_staff_role();
  v_reward private.review_reward_settings%rowtype;
begin
  if (select auth.uid()) is null or v_role not in ('owner','admin','finance') then raise exception 'REVIEW_SETTINGS_NOT_PERMITTED' using errcode='42501'; end if;
  select * into v_reward from private.review_reward_settings where id='primary';
  return jsonb_build_object(
    'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'displayOrder',q.display_order,'isActive',q.is_active) order by q.display_order,q.id) from private.review_questions q),'[]'::jsonb),
    'reward',jsonb_build_object('enabled',v_reward.enabled,'percentOff',v_reward.percent_off,'amountOffIdr',v_reward.amount_off_idr,'rewardType',case when coalesce(v_reward.amount_off_idr,0)>0 then 'amount' else 'percent' end,'minOrderIdr',v_reward.min_order_idr,'revision',v_reward.revision)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_order_review(p_tracking_id text, p_answers jsonb, p_note text DEFAULT NULL::text, p_profile jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tracking_id uuid;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_review_id text := 'review_'||replace(gen_random_uuid()::text,'-','');
  v_item jsonb;
  v_question private.review_questions%rowtype;
  v_active_count integer;
  v_reward_settings private.review_reward_settings%rowtype;
  v_reward_id text;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_profile jsonb := coalesce(p_profile, '{}'::jsonb);
  v_name text;
  v_email text;
  v_birthday date;
  v_domicile text;
  v_age_range text;
  v_gender text;
  v_occupation text;
  v_acquisition_source text;
  v_promo_preferences text[] := '{}'::text[];
  v_survey_data jsonb;
begin
  perform private.consume_public_order_lookup_budget();
  begin
    v_tracking_id := p_tracking_id::uuid;
  exception when invalid_text_representation then
    raise exception 'TRACKING_LINK_INVALID' using errcode='22023';
  end;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'REVIEW_ANSWERS_INVALID' using errcode='22023';
  end if;
  if jsonb_typeof(v_profile) <> 'object' then
    raise exception 'REVIEW_PROFILE_INVALID' using errcode='22023';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'REVIEW_NOTE_TOO_LONG' using errcode='22023';
  end if;

  select * into v_order
  from public.orders
  where public_tracking_id = v_tracking_id
    and (tracking_expires_at is null or tracking_expires_at > now())
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.status not in ('delivered','picked_up') then raise exception 'ORDER_NOT_COMPLETED' using errcode='22023'; end if;
  if v_order.customer_id is null then raise exception 'CUSTOMER_ID_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from private.order_reviews where order_id=v_order.id) then
    raise exception 'ORDER_ALREADY_REVIEWED' using errcode='23505';
  end if;

  select * into v_customer
  from public.customers
  where id = v_order.customer_id
  for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode='P0002'; end if;

  v_name := nullif(trim(v_profile->>'name'),'');
  v_email := nullif(lower(trim(v_profile->>'email')),'');
  v_domicile := nullif(trim(v_profile->>'domicile'),'');
  v_age_range := nullif(trim(v_profile->>'ageRange'),'');
  v_gender := nullif(trim(v_profile->>'gender'),'');
  v_occupation := nullif(trim(v_profile->>'occupation'),'');
  v_acquisition_source := nullif(trim(v_profile->>'acquisitionSource'),'');

  if v_name is not null and length(v_name) > 120 then raise exception 'REVIEW_NAME_INVALID' using errcode='22023'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'REVIEW_EMAIL_INVALID' using errcode='22023';
  end if;
  if nullif(trim(v_profile->>'birthday'),'') is not null then
    begin
      v_birthday := (v_profile->>'birthday')::date;
    exception when others then
      raise exception 'REVIEW_BIRTHDAY_INVALID' using errcode='22023';
    end;
    if v_birthday > current_date then raise exception 'REVIEW_BIRTHDAY_INVALID' using errcode='22023'; end if;
  end if;
  if v_domicile is not null and length(v_domicile) > 100 then raise exception 'REVIEW_DOMICILE_INVALID' using errcode='22023'; end if;
  if v_age_range is not null and v_age_range not in ('under_18','18_24','25_34','35_plus') then
    raise exception 'REVIEW_AGE_RANGE_INVALID' using errcode='22023';
  end if;
  if v_gender is not null and v_gender not in ('male','female') then
    raise exception 'REVIEW_GENDER_INVALID' using errcode='22023';
  end if;
  if v_occupation is not null and length(v_occupation) > 100 then raise exception 'REVIEW_OCCUPATION_INVALID' using errcode='22023'; end if;
  if v_acquisition_source is not null and length(v_acquisition_source) > 120 then raise exception 'REVIEW_ACQUISITION_INVALID' using errcode='22023'; end if;

  if v_profile ? 'promoPreferences' then
    if jsonb_typeof(v_profile->'promoPreferences') <> 'array' then
      raise exception 'REVIEW_PROMO_PREFERENCES_INVALID' using errcode='22023';
    end if;
    select coalesce(array_agg(value order by value), '{}'::text[])
    into v_promo_preferences
    from jsonb_array_elements_text(v_profile->'promoPreferences');
    if exists(
      select 1 from unnest(v_promo_preferences) p
      where p not in ('discount','cashback','bundling','flash_sale')
    ) then
      raise exception 'REVIEW_PROMO_PREFERENCES_INVALID' using errcode='22023';
    end if;
  else
    v_promo_preferences := v_customer.promo_preferences;
  end if;

  -- Owner decision 6 Nov 2026: every field of the form is required (the
  -- review earns a voucher), so incomplete reviews are rejected outright.
  if v_name is null or v_email is null or nullif(trim(coalesce(v_profile->>'birthday','')),'') is null
     or v_domicile is null or v_age_range is null or v_gender is null or v_occupation is null
     or v_acquisition_source is null or v_note is null
     or not (v_profile ? 'promoPreferences') or jsonb_array_length(v_profile->'promoPreferences') = 0 then
    raise exception 'REVIEW_ALL_FIELDS_REQUIRED' using errcode='22023';
  end if;
  select count(*) into v_active_count from private.review_questions where is_active=true;
  -- Each active question must be answered exactly once. Counting rows alone let
  -- a client answer one question twice and skip another.
  if jsonb_array_length(p_answers) <> v_active_count
     or (
       select count(distinct nullif(trim(coalesce(a.value->>'questionId','')),''))
       from jsonb_array_elements(p_answers) a
     ) <> v_active_count then
    raise exception 'ALL_REVIEW_QUESTIONS_REQUIRED' using errcode='22023';
  end if;

  update public.customers
  set name = coalesce(v_name, name),
      email = coalesce(v_email, email),
      birthday = coalesce(v_birthday, birthday),
      domicile = coalesce(v_domicile, domicile),
      age_range = coalesce(v_age_range, age_range),
      gender = coalesce(v_gender, gender),
      occupation = coalesce(v_occupation, occupation),
      acquisition_source = coalesce(v_acquisition_source, acquisition_source),
      promo_preferences = coalesce(v_promo_preferences, promo_preferences),
      revision = revision + 1,
      updated_at = now()
  where id = v_order.customer_id
  returning * into v_customer;

  v_survey_data := jsonb_strip_nulls(jsonb_build_object(
    'name', v_customer.name,
    'whatsapp', v_customer.whatsapp_number,
    'email', v_customer.email,
    'birthday', v_customer.birthday,
    'domicile', v_customer.domicile,
    'ageRange', v_customer.age_range,
    'gender', v_customer.gender,
    'occupation', v_customer.occupation,
    'acquisitionSource', v_customer.acquisition_source,
    'promoPreferences', to_jsonb(v_customer.promo_preferences),
    'branchId', v_order.branch_id
  ));

  insert into private.order_reviews(id,order_id,order_number,customer_id,note,survey_data,submitted_at)
  values(v_review_id,v_order.id,v_order.order_number,v_order.customer_id,v_note,v_survey_data,now());

  for v_item in select value from jsonb_array_elements(p_answers) loop
    select * into v_question
    from private.review_questions
    where id=v_item->>'questionId' and is_active=true;
    if not found then raise exception 'REVIEW_QUESTION_INVALID' using errcode='22023'; end if;
    if coalesce((v_item->>'score')::integer,0) not between 1 and 5 then
      raise exception 'REVIEW_SCORE_INVALID' using errcode='22023';
    end if;
    insert into private.order_review_answers(review_id,question_id,question_snapshot,score)
    values(v_review_id,v_question.id,v_question.question,(v_item->>'score')::integer);
  end loop;

  select * into v_reward_settings from private.review_reward_settings where id='primary';
  if v_reward_settings.enabled then
    v_reward_id := 'review_reward_'||replace(gen_random_uuid()::text,'-','');
    insert into private.customer_review_rewards(
      id,customer_id,source_order_id,source_review_id,percent_off,amount_off_idr,min_order_idr,status,issued_at
    )
    values(
      v_reward_id,v_order.customer_id,v_order.id,v_review_id,
      v_reward_settings.percent_off,nullif(v_reward_settings.amount_off_idr,0),v_reward_settings.min_order_idr,'available',now()
    )
    on conflict(source_order_id) do nothing;
  end if;

  return jsonb_build_object(
    'reviewSubmitted',true,
    'reviewId',v_review_id,
    'reward',case when v_reward_id is null then null else jsonb_build_object(
      'id',v_reward_id,
      'percentOff',case when coalesce(v_reward_settings.amount_off_idr,0)>0 then null else v_reward_settings.percent_off end,
      'amountOffIdr',nullif(v_reward_settings.amount_off_idr,0),
      'minOrderIdr',v_reward_settings.min_order_idr,
      'status','available'
    ) end
  );
end;
$function$;

-- Reward settings with a type. Same permission and revision rules as
-- save_review_reward_settings (Owner, Admin, Finance).
create or replace function public.save_review_reward_settings_v2_guarded(
  p_enabled boolean,
  p_reward_type text,
  p_percent_off numeric,
  p_amount_off_idr bigint,
  p_min_order_idr bigint,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
  v_row private.review_reward_settings%rowtype;
begin
  if (select auth.uid()) is null or v_role not in ('owner','admin','finance') then
    raise exception 'PROMO_SETTINGS_NOT_PERMITTED' using errcode = '42501';
  end if;
  if p_reward_type not in ('percent','amount') or coalesce(p_min_order_idr, -1) < 0
     or (p_reward_type = 'percent' and (coalesce(p_percent_off, 0) <= 0 or p_percent_off > 100))
     or (p_reward_type = 'amount' and coalesce(p_amount_off_idr, 0) <= 0) then
    raise exception 'REVIEW_REWARD_INVALID' using errcode = '22023';
  end if;
  select * into v_row from private.review_reward_settings where id = 'primary' for update;
  if v_row.revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = format('REVISION_CONFLICT expected=%s, actual=%s', p_expected_revision, v_row.revision),
      hint = 'Reload the latest review reward settings before saving again.';
  end if;
  update private.review_reward_settings
  set enabled = p_enabled,
      percent_off = case when p_reward_type = 'percent' then p_percent_off else percent_off end,
      amount_off_idr = case when p_reward_type = 'amount' then p_amount_off_idr else null end,
      min_order_idr = p_min_order_idr,
      revision = revision + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = 'primary';
  perform private.write_business_activity('customer','review-reward',null,'review_reward_settings_updated','Review reward settings updated.',
    jsonb_build_object('enabled', p_enabled, 'rewardType', p_reward_type, 'percentOff', p_percent_off, 'amountOffIdr', p_amount_off_idr, 'minOrderIdr', p_min_order_idr));
  return public.get_review_configuration();
end;
$$;
revoke execute on function public.save_review_reward_settings_v2_guarded(boolean,text,numeric,bigint,bigint,bigint) from public, anon;
grant execute on function public.save_review_reward_settings_v2_guarded(boolean,text,numeric,bigint,bigint,bigint) to authenticated;

-- Owner decision: review reward = Rp20.000, minimum order stays Rp300.000.
update private.review_reward_settings
set amount_off_idr = 20000, min_order_idr = 300000, revision = revision + 1, updated_at = now()
where id = 'primary';

notify pgrst, 'reload schema';

commit;
