-- Auto-apply only customer-specific vouchers during Storefront checkout when
-- no code was supplied. Customer identity remains resolved privately from the
-- WhatsApp number inside the checkout pipeline; no CRM lookup is exposed.
--
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

-- The catalog Storefront quote has historically resolved vouchers inline and
-- skipped that work entirely when p_promo_code was blank. Wrap the current
-- cash-flow/review-reward quote so the customer-specific resolver participates
-- in the actual Storefront path without weakening the private CRM boundary.
alter function public.quote_storefront_checkout(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) rename to quote_storefront_checkout_pre_customer_auto_promo;
revoke execute on function public.quote_storefront_checkout_pre_customer_auto_promo(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;

create or replace function public.quote_storefront_checkout(
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
  v_quote jsonb;
  v_auto_promo jsonb;
  v_items_subtotal bigint := 0;
  v_delivery_fee bigint := 0;
  v_existing_discount bigint := 0;
  v_auto_discount bigint := 0;
begin
  v_quote := public.quote_storefront_checkout_pre_customer_auto_promo(
    p_idempotency_key,
    p_customer,
    p_branch_id,
    p_fulfillment,
    p_schedule_date,
    p_schedule_time,
    p_items,
    p_delivery_address,
    p_delivery_instructions,
    p_order_note,
    p_greeting_message,
    p_greeting_card_name,
    p_payment_method,
    p_promo_code
  );

  -- A code typed by the customer remains authoritative. This also preserves
  -- the existing validation/message behavior for explicit all/vip/selected
  -- vouchers.
  if nullif(trim(coalesce(p_promo_code, '')), '') is not null then
    return v_quote;
  end if;

  v_items_subtotal := coalesce((v_quote->>'itemsSubtotalIdr')::bigint, 0);
  v_delivery_fee := coalesce((v_quote->>'deliveryFeeIdr')::bigint, 0);
  v_existing_discount := coalesce((v_quote->>'discountIdr')::bigint, 0);
  v_auto_promo := private.resolve_voucher_discount(p_customer, v_items_subtotal, null);

  if coalesce((v_auto_promo->>'promoAccepted')::boolean, false) is not true then
    return v_quote;
  end if;

  v_auto_discount := coalesce((v_auto_promo->>'discountIdr')::bigint, 0);

  -- Review rewards are already resolved by the wrapped quote. Keep whichever
  -- automatic benefit is better; ties keep the review reward so its one-time
  -- redemption behavior stays deterministic.
  if v_auto_discount <= v_existing_discount then
    return v_quote;
  end if;

  return (v_quote - 'reviewRewardPercentOff' - 'reviewRewardMinOrderIdr')
    || jsonb_build_object(
      'discountIdr', v_auto_discount,
      'totalIdr', greatest(0, v_items_subtotal - v_auto_discount + v_delivery_fee),
      'promoCode', nullif(trim(v_auto_promo->>'promoCode'), ''),
      'promoAccepted', true,
      'promoMessage', v_auto_promo->>'promoMessage',
      'reviewRewardApplied', false
    );
end;
$function$;
revoke execute on function public.quote_storefront_checkout(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, authenticated;
grant execute on function public.quote_storefront_checkout(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) to anon, service_role;

-- Enforce the same automatic selection at final order creation. The browser
-- normally snapshots the quoted promo code, but the server must not rely on a
-- client race or stale UI state for customer-assigned eligibility.
alter function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) rename to create_storefront_order_pre_customer_auto_promo;
revoke execute on function public.create_storefront_order_pre_customer_auto_promo(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;

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
  v_effective_promo_code text := nullif(trim(coalesce(p_promo_code, '')), '');
  v_quote jsonb;
begin
  if v_effective_promo_code is null then
    v_quote := public.quote_storefront_checkout(
      p_idempotency_key,
      p_customer,
      p_branch_id,
      p_fulfillment,
      p_schedule_date,
      p_schedule_time,
      p_items,
      p_delivery_address,
      p_delivery_instructions,
      p_order_note,
      p_greeting_message,
      p_greeting_card_name,
      p_payment_method,
      null
    );

    if coalesce((v_quote->>'promoAccepted')::boolean, false)
      and nullif(trim(v_quote->>'promoCode'), '') is not null then
      v_effective_promo_code := v_quote->>'promoCode';
    end if;
  end if;

  return public.create_storefront_order_pre_customer_auto_promo(
    p_idempotency_key,
    p_customer,
    p_branch_id,
    p_fulfillment,
    p_schedule_date,
    p_schedule_time,
    p_items,
    p_delivery_address,
    p_delivery_instructions,
    p_order_note,
    p_greeting_message,
    p_greeting_card_name,
    p_payment_method,
    v_effective_promo_code
  );
end;
$function$;
revoke execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, authenticated;
grant execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) to anon, service_role;
