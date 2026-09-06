-- Verifies customer-assigned voucher semantics through the real Storefront
-- quote and final order-creation paths. Everything is rolled back.
begin;

insert into public.branches (
  id,
  name,
  code,
  is_active,
  delivery_fee_idr,
  opening_hours
) values (
  'smoke-auto-promo-branch',
  'Auto Promo Smoke Branch',
  'SAP',
  true,
  0,
  jsonb_build_object(
    'monday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'tuesday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'wednesday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'thursday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'friday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'saturday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'sunday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59')
  )
)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  is_active = excluded.is_active,
  delivery_fee_idr = excluded.delivery_fee_idr,
  opening_hours = excluded.opening_hours,
  updated_at = now();

insert into public.public_payment_accounts (
  id,
  bank_name,
  account_number,
  account_holder,
  type,
  is_active,
  is_default,
  is_customer_visible,
  branch_ids
) values (
  'smoke-auto-promo-account',
  'Smoke Bank',
  '0000000000',
  'Smoke Account',
  'bank_transfer',
  true,
  true,
  true,
  array['smoke-auto-promo-branch']::text[]
)
on conflict (id) do update set
  is_active = excluded.is_active,
  is_default = excluded.is_default,
  is_customer_visible = excluded.is_customer_visible,
  branch_ids = excluded.branch_ids,
  updated_at = now();

insert into public.products (
  id,
  product_code,
  material,
  name,
  is_active
) values (
  'smoke-auto-promo-product',
  'SAP-PRODUCT',
  'fresh',
  'Auto Promo Smoke Product',
  true
)
on conflict (id) do update set
  product_code = excluded.product_code,
  material = excluded.material,
  name = excluded.name,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.product_variants (
  id,
  product_id,
  sku,
  size,
  price_idr,
  status
) values (
  'smoke-auto-promo-variant',
  'smoke-auto-promo-product',
  'SAP-VARIANT',
  'M',
  400000,
  'active'
)
on conflict (id) do update set
  product_id = excluded.product_id,
  sku = excluded.sku,
  size = excluded.size,
  price_idr = excluded.price_idr,
  status = excluded.status,
  updated_at = now();

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
  name = excluded.name,
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
        'id', 'smoke-selected-disabled',
        'code', 'OFF80',
        'percentOff', 80,
        'eligibility', 'selected',
        'selectedCustomerIds', jsonb_build_array('smoke-auto-promo-customer'),
        'isActive', false,
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
  v_customer jsonb := jsonb_build_object(
    'name', 'Auto Promo Smoke Customer',
    'whatsappNumber', '089900009000'
  );
  v_unmatched_customer jsonb := jsonb_build_object(
    'name', 'Unknown Smoke Customer',
    'whatsappNumber', '089911119999'
  );
  v_items jsonb := jsonb_build_array(
    jsonb_build_object(
      'productId', 'smoke-auto-promo-product',
      'variantId', 'smoke-auto-promo-variant',
      'quantity', 1
    )
  );
  v_schedule_date date := timezone('Asia/Jakarta', now())::date + 1;
  v_result jsonb;
  v_order public.orders%rowtype;
begin
  -- Helper semantics: blank code privately selects the best eligible voucher
  -- assigned to the WhatsApp-matched customer.
  v_result := private.resolve_voucher_discount(v_customer, 400000, null);
  if coalesce((v_result->>'promoAccepted')::boolean, false) is not true
    or v_result->>'promoCode' <> 'AUTO20'
    or (v_result->>'discountIdr')::bigint <> 80000 then
    raise exception 'Expected helper to choose AUTO20 / 80000, got %', v_result;
  end if;

  -- Real public Storefront quote must do the same with no promo code supplied.
  v_result := public.quote_storefront_checkout(
    'smoke-auto-promo-quote-0001',
    v_customer,
    'smoke-auto-promo-branch',
    'pickup',
    v_schedule_date,
    '12:00'::time,
    v_items,
    null,
    null,
    null,
    null,
    null,
    'transfer',
    null
  );
  if coalesce((v_result->>'promoAccepted')::boolean, false) is not true
    or v_result->>'promoCode' <> 'AUTO20'
    or (v_result->>'itemsSubtotalIdr')::bigint <> 400000
    or (v_result->>'discountIdr')::bigint <> 80000
    or (v_result->>'totalIdr')::bigint <> 320000 then
    raise exception 'Expected Storefront quote to auto-apply AUTO20, got %', v_result;
  end if;

  -- Explicit customer input remains authoritative. A general voucher may still
  -- be used when its code is intentionally entered.
  v_result := public.quote_storefront_checkout(
    'smoke-auto-promo-quote-0002',
    v_customer,
    'smoke-auto-promo-branch',
    'pickup',
    v_schedule_date,
    '12:00'::time,
    v_items,
    null,
    null,
    null,
    null,
    null,
    'transfer',
    'ALL50'
  );
  if coalesce((v_result->>'promoAccepted')::boolean, false) is not true
    or v_result->>'promoCode' <> 'ALL50'
    or (v_result->>'discountIdr')::bigint <> 200000
    or (v_result->>'totalIdr')::bigint <> 200000 then
    raise exception 'Expected explicit ALL50 semantics to stay unchanged, got %', v_result;
  end if;

  -- A phone number with no private CRM match must not reveal or auto-apply a
  -- customer-specific voucher.
  v_result := public.quote_storefront_checkout(
    'smoke-auto-promo-quote-0003',
    v_unmatched_customer,
    'smoke-auto-promo-branch',
    'pickup',
    v_schedule_date,
    '12:00'::time,
    v_items,
    null,
    null,
    null,
    null,
    null,
    'transfer',
    null
  );
  if coalesce((v_result->>'promoAccepted')::boolean, false) is true
    or v_result->>'promoCode' is not null
    or coalesce((v_result->>'discountIdr')::bigint, 0) <> 0
    or (v_result->>'totalIdr')::bigint <> 400000 then
    raise exception 'Expected unmatched WhatsApp to have no automatic voucher, got %', v_result;
  end if;

  -- Final Storefront order creation must independently resolve the same blank
  -- code through the authoritative checkout resolver and snapshot AUTO20.
  v_result := public.create_storefront_order(
    'smoke-auto-promo-create-0001',
    v_customer,
    'smoke-auto-promo-branch',
    'pickup',
    v_schedule_date,
    '12:00'::time,
    v_items,
    null,
    null,
    null,
    null,
    null,
    'transfer',
    null
  );

  if (v_result->>'discountIdr')::bigint <> 80000
    or (v_result->>'totalIdr')::bigint <> 320000 then
    raise exception 'Expected final order result to include AUTO20 discount, got %', v_result;
  end if;

  select * into v_order
  from public.orders
  where id = v_result->>'orderId';

  if not found then
    raise exception 'Expected Storefront order row to be created.';
  end if;
  if v_order.promo_code <> 'AUTO20'
    or v_order.discount_idr <> 80000
    or v_order.total_idr <> 320000 then
    raise exception 'Expected order row to snapshot AUTO20 / 80000 / 320000, got promo %, discount %, total %',
      v_order.promo_code, v_order.discount_idr, v_order.total_idr;
  end if;
end
$$;

rollback;
