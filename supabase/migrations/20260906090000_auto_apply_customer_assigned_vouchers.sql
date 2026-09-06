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
revoke execute on function private.resolve_voucher_discount(jsonb,bigint,text)
  from public, anon, authenticated;

-- Catalog Storefront checkout has a separate authoritative resolver that
-- validates the branch, schedule, live product/variant prices and voucher.
-- Wire the blank-code customer assignment into that resolver itself so both
-- quote_storefront_checkout() and create_storefront_order() share exactly the
-- same decision. This preserves the existing idempotency path in final order
-- creation and does not add another public CRM/customer lookup surface.
create or replace function private.resolve_checkout_quote(
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time,
  p_items jsonb,
  p_payment_method text,
  p_promo_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_branch public.branches%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_qty integer;
  v_subtotal bigint := 0;
  v_delivery bigint := 0;
  v_discount bigint := 0;
  v_code text := upper(trim(coalesce(p_promo_code, '')));
  v_voucher jsonb;
  v_customer public.customers%rowtype;
  v_normalized text := private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_spend bigint := 0;
  v_count integer := 0;
  v_segments jsonb;
  v_is_vip boolean := false;
  v_customer_found boolean := false;
  v_eligible boolean := false;
  v_percent integer := 0;
  v_message text;
  v_day_key text;
  v_hours jsonb;
  v_auto_promo jsonb;
begin
  if nullif(trim(coalesce(p_customer->>'name', '')), '') is null then
    raise exception 'Customer name is required.' using errcode = '22023';
  end if;
  if length(v_normalized) < 8 or length(v_normalized) > 15 then
    raise exception 'A valid WhatsApp number is required.' using errcode = '22023';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id and is_active = true;
  if not found then
    raise exception 'Selected branch is unavailable.' using errcode = '22023';
  end if;

  if p_fulfillment not in ('delivery', 'pickup') then
    raise exception 'Invalid fulfillment type.' using errcode = '22023';
  end if;
  if p_payment_method not in ('transfer', 'cash') then
    raise exception 'Invalid payment method.' using errcode = '22023';
  end if;
  if p_fulfillment = 'delivery' and p_payment_method = 'cash' then
    raise exception 'Cash payment is only available for pickup orders.' using errcode = '22023';
  end if;
  if p_payment_method = 'transfer' and not exists (
    select 1
    from public.public_payment_accounts account
    where account.is_active = true
      and account.is_customer_visible = true
      and (cardinality(account.branch_ids) = 0 or p_branch_id = any(account.branch_ids))
  ) then
    raise exception 'Bank transfer is unavailable for this branch.' using errcode = '22023';
  end if;

  if p_schedule_date is null or p_schedule_time is null then
    raise exception 'Schedule date and time are required.' using errcode = '22023';
  end if;
  if p_schedule_date < timezone('Asia/Jakarta', now())::date then
    raise exception 'Schedule date cannot be in the past.' using errcode = '22023';
  end if;

  v_day_key := lower(trim(to_char(p_schedule_date, 'FMDay')));
  v_hours := v_branch.opening_hours->v_day_key;
  if v_hours is null or coalesce((v_hours->>'isOpen')::boolean, false) = false then
    raise exception 'Selected branch is closed on this date.' using errcode = '22023';
  end if;
  if p_schedule_time < (v_hours->>'opensAt')::time
    or p_schedule_time > (v_hours->>'closesAt')::time then
    raise exception 'Selected time is outside branch opening hours.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 20 then
    raise exception 'Order must contain between 1 and 20 items.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'Item quantity must be between 1 and 99.' using errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = nullif(v_item->>'productId', '') and is_active = true;
    if not found then
      raise exception 'A selected product is unavailable.' using errcode = '22023';
    end if;

    select * into v_variant
    from public.product_variants
    where id = nullif(v_item->>'variantId', '')
      and product_id = v_product.id
      and status = 'active';
    if not found then
      raise exception 'A selected product variant is unavailable.' using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + (v_variant.price_idr * v_qty);
  end loop;

  v_delivery := case when p_fulfillment = 'delivery' then v_branch.delivery_fee_idr else 0 end;

  if v_code = '' then
    -- No code was typed. Only a privately matched customer-specific assignment
    -- is eligible for automatic application.
    v_auto_promo := private.resolve_voucher_discount(p_customer, v_subtotal, null);
    if coalesce((v_auto_promo->>'promoAccepted')::boolean, false) then
      v_code := coalesce(v_auto_promo->>'promoCode', '');
      v_discount := coalesce((v_auto_promo->>'discountIdr')::bigint, 0);
      v_message := v_auto_promo->>'promoMessage';
    end if;
  else
    -- Preserve the existing explicit-code validation and customer eligibility
    -- behavior exactly for all/vip/selected vouchers.
    select value into v_voucher
    from private.operational_domain_state s,
      lateral jsonb_array_elements(coalesce(s.snapshot->'vouchers', '[]'::jsonb)) e(value)
    where s.domain = 'vouchers'
      and upper(trim(value->>'code')) = v_code
    limit 1;

    if v_voucher is null then
      v_message := 'Voucher code was not found.';
    elsif coalesce((v_voucher->>'isActive')::boolean, false) = false then
      v_message := 'Voucher is inactive.';
    elsif nullif(v_voucher->>'startDate', '') is not null
      and timezone('Asia/Jakarta', now())::date < (v_voucher->>'startDate')::date then
      v_message := 'Voucher is not active yet.';
    elsif nullif(v_voucher->>'endDate', '') is not null
      and timezone('Asia/Jakarta', now())::date > (v_voucher->>'endDate')::date then
      v_message := 'Voucher has expired.';
    elsif v_subtotal < coalesce((v_voucher->>'minOrderIdr')::bigint, 0) then
      v_message := 'Order minimum has not been reached.';
    else
      select * into v_customer
      from public.customers
      where normalized_whatsapp_number = v_normalized
      limit 1;
      v_customer_found := found;

      if v_customer_found then
        select coalesce(sum(total_idr), 0), count(*)
        into v_spend, v_count
        from public.orders
        where customer_id = v_customer.id
          and status not in ('cancelled', 'failed')
          and payment_status <> 'refunded';
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
        v_discount := round(v_subtotal * v_percent / 100.0)::bigint;
        v_message := 'Voucher applied.';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'itemsSubtotalIdr', v_subtotal,
    'deliveryFeeIdr', v_delivery,
    'discountIdr', v_discount,
    'totalIdr', greatest(0, v_subtotal - v_discount + v_delivery),
    'promoCode', case when v_code = '' then null else v_code end,
    'promoAccepted', v_code <> '' and v_discount > 0,
    'promoMessage', v_message
  );
end;
$function$;
revoke execute on function private.resolve_checkout_quote(jsonb,text,text,date,time,jsonb,text,text)
  from public, anon, authenticated;
