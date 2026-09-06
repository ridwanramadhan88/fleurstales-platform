begin;

insert into public.customers (
  id,
  name,
  whatsapp_number,
  normalized_whatsapp_number,
  created_source
) values (
  'smoke-auto-promo-customer',
  'Auto Promo Smoke Customer',
  '089900009000',
  private.normalize_whatsapp('089900009000'),
  'admin'
)
on conflict (id) do update set
  whatsapp_number = excluded.whatsapp_number,
  normalized_whatsapp_number = excluded.normalized_whatsapp_number,
  updated_at = now();

insert into private.operational_domain_state (domain, revision, snapshot)
values (
  'vouchers',
  900001,
  jsonb_build_object(
    'vouchers',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'smoke-all-50',
        'code', 'ALL50',
        'percentOff', 50,
        'eligibility', 'all',
        'selectedCustomerIds', jsonb_build_array(),
        'isActive', true,
        'minOrderIdr', 0,
        'startDate', '2000-01-01',
        'endDate', '2100-01-01'
      ),
      jsonb_build_object(
        'id', 'smoke-selected-20',
        'code', 'AUTO20',
        'percentOff', 20,
        'eligibility', 'selected',
        'selectedCustomerIds', jsonb_build_array('smoke-auto-promo-customer'),
        'isActive', true,
        'minOrderIdr', 100000,
        'startDate', '2000-01-01',
        'endDate', '2100-01-01'
      ),
      jsonb_build_object(
        'id', 'smoke-selected-10',
        'code', 'AUTO10',
        'percentOff', 10,
        'eligibility', 'selected',
        'selectedCustomerIds', jsonb_build_array('smoke-auto-promo-customer'),
        'isActive', true,
        'minOrderIdr', 0,
        'startDate', '2000-01-01',
        'endDate', '2100-01-01'
      ),
      jsonb_build_object(
        'id', 'smoke-selected-high-minimum',
        'code', 'HIGH30',
        'percentOff', 30,
        'eligibility', 'selected',
        'selectedCustomerIds', jsonb_build_array('smoke-auto-promo-customer'),
        'isActive', true,
        'minOrderIdr', 9999999,
        'startDate', '2000-01-01',
        'endDate', '2100-01-01'
      ),
      jsonb_build_object(
        'id', 'smoke-selected-expired',
        'code', 'OLD40',
        'percentOff', 40,
        'eligibility', 'selected',
        'selectedCustomerIds', jsonb_build_array('smoke-auto-promo-customer'),
        'isActive', true,
        'minOrderIdr', 0,
        'startDate', '2000-01-01',
        'endDate', '2000-12-31'
      ),
      jsonb_build_object(
        'id', 'smoke-other-customer',
        'code', 'OTHER90',
        'percentOff', 90,
        'eligibility', 'selected',
        'selectedCustomerIds', jsonb_build_array('someone-else'),
        'isActive', true,
        'minOrderIdr', 0,
        'startDate', '2000-01-01',
        'endDate', '2100-01-01'
      )
    )
  )
)
on conflict (domain) do update set
  revision = excluded.revision,
  snapshot = excluded.snapshot,
  updated_at = now();

do $$
declare
  v_result jsonb;
begin
  v_result := private.resolve_voucher_discount(
    jsonb_build_object('whatsappNumber', '089900009000'),
    400000,
    null
  );

  if coalesce((v_result->>'promoAccepted')::boolean, false) is not true then
    raise exception 'Expected assigned voucher to auto-apply, got %', v_result;
  end if;
  if v_result->>'promoCode' <> 'AUTO20' then
    raise exception 'Expected best eligible selected voucher AUTO20, got %', v_result;
  end if;
  if (v_result->>'discountIdr')::bigint <> 80000 then
    raise exception 'Expected AUTO20 discount 80000, got %', v_result;
  end if;

  -- General vouchers remain code-driven even when they have a larger discount.
  v_result := private.resolve_voucher_discount(
    jsonb_build_object('whatsappNumber', '089900009000'),
    400000,
    'ALL50'
  );
  if coalesce((v_result->>'promoAccepted')::boolean, false) is not true
    or v_result->>'promoCode' <> 'ALL50'
    or (v_result->>'discountIdr')::bigint <> 200000 then
    raise exception 'Expected explicit ALL50 voucher semantics to stay unchanged, got %', v_result;
  end if;

  -- A phone number with no private CRM match must not reveal or auto-apply any voucher.
  v_result := private.resolve_voucher_discount(
    jsonb_build_object('whatsappNumber', '089911119999'),
    400000,
    null
  );
  if coalesce((v_result->>'promoAccepted')::boolean, false) is true
    or v_result->>'promoCode' is not null
    or coalesce((v_result->>'discountIdr')::bigint, 0) <> 0 then
    raise exception 'Expected unmatched WhatsApp to have no automatic voucher, got %', v_result;
  end if;
end
$$;

rollback;
