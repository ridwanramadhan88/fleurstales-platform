-- Auto-apply only customer-specific vouchers during Storefront checkout when
-- no code was supplied. Customer identity remains resolved privately from the
-- WhatsApp number inside the checkout pipeline; no CRM lookup is exposed.
--
-- The current authoritative checkout resolver already delegates voucher
-- pricing to private.resolve_voucher_discount() for both quote and final order
-- creation. Keep that hardened resolver untouched and extend only this helper.
-- Explicit voucher codes preserve the existing all/vip/selected semantics.
-- Blank-code checkout considers only eligibility='selected' vouchers assigned
-- to the matched customer. General all/vip promotions still require a code.

create or replace function private.resolve_voucher_discount(
  p_customer jsonb,
  p_subtotal bigint,
  p_promo_code text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      and greatest(0, coalesce((value->>'percentOff')::integer, 0)) > 0
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
      coalesce((value->>'percentOff')::integer, 0) desc,
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
      v_percent := greatest(0, least(100, coalesce((v_voucher->>'percentOff')::integer, 0)));
      v_discount := round(greatest(0, p_subtotal) * v_percent / 100.0)::bigint;
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
revoke execute on function private.resolve_voucher_discount(jsonb,bigint,text)
  from public, anon, authenticated;

-- The hardened pre-cashflow creator intentionally owns idempotency, request
-- hashing, catalog validation, and authoritative totals. Do not replace it.
-- Its quote now carries an automatically selected voucher, but because the
-- original request has no typed promo code, the created row initially has a
-- null promo_code. Snapshot the effective automatic voucher in this existing
-- outer wrapper while preserving review-reward precedence and retry behavior.
create or replace function public.create_storefront_order(
  p_idempotency_key text,
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time without time zone,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_instructions text default null,
  p_order_note text default null,
  p_greeting_message text default null,
  p_greeting_card_name text default null,
  p_payment_method text default 'transfer',
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  if lower(trim(coalesce(p_payment_method, 'transfer'))) <> 'transfer' then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;

  v_account := private.default_storefront_payment_account(p_branch_id);
  if v_account is null then
    raise exception 'STOREFRONT_PAYMENT_ACCOUNT_UNAVAILABLE' using errcode = '22023';
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
      v_reward_discount := least(
        v_order.items_subtotal_idr,
        round(v_order.items_subtotal_idr * v_reward.percent_off / 100.0)::bigint
      );
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

-- CREATE OR REPLACE preserves the existing function ACL, but keep the intended
-- public boundary explicit: Storefront customer checkout is anon/service-role.
revoke execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, authenticated;
grant execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) to anon, service_role;
