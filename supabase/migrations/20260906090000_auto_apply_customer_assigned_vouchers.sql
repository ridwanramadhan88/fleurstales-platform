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
