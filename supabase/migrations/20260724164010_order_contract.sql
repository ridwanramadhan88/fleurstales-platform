-- Phase 8: canonical Order contract and local/remote parity preparation.
begin;

-- One allocator is shared by Storefront and future staff-order RPCs. Sequence
-- scope is branch + Jakarta calendar year and is atomic under concurrency.
create or replace function private.allocate_order_number(
  p_branch_id text,
  p_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_year integer;
  v_sequence bigint;
begin
  select * into v_branch from public.branches where id = p_branch_id for share;
  if not found then
    raise exception 'Selected branch is unavailable.' using errcode = '22023';
  end if;
  v_year := extract(year from timezone('Asia/Jakarta', p_at))::integer;
  insert into public.order_sequences(branch_id, sequence_year, last_sequence, updated_at)
  values (v_branch.id, v_year, 1, now())
  on conflict (branch_id, sequence_year)
  do update set last_sequence = public.order_sequences.last_sequence + 1, updated_at = now()
  returning last_sequence into v_sequence;
  return upper(v_branch.code) || '-' || v_year::text || '-' || lpad(v_sequence::text, 4, '0');
end;
$$;

-- Remove the Phase 7 signature before adding the promo-code snapshot argument,
-- otherwise Postgres would retain two overloads.
drop function if exists public.create_storefront_order(
  text, jsonb, text, text, date, time, jsonb,
  text, text, text, text, text, text
);

create or replace function public.create_storefront_order(
  p_idempotency_key text,
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time,
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
as $$
declare
  v_branch public.branches%rowtype;
  v_customer public.customers%rowtype;
  v_normalized_whatsapp text;
  v_customer_name text;
  v_customer_email text;
  v_customer_birthday date;
  v_customer_id text;
  v_order_id text;
  v_order_number text;
  v_items_subtotal bigint := 0;
  v_delivery_fee bigint := 0;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_quantity integer;
  v_item_count integer;
  v_day_key text;
  v_day_hours jsonb;
  v_existing_order public.orders%rowtype;
  v_customer_suggestions jsonb := '{}'::jsonb;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 or length(trim(p_idempotency_key)) > 128 then
    raise exception 'A valid checkout idempotency key is required.' using errcode = '22023';
  end if;

  select * into v_existing_order
  from public.orders
  where storefront_idempotency_key = trim(p_idempotency_key)
  limit 1;

  if found then
    return jsonb_build_object(
      'orderId', v_existing_order.id,
      'orderNumber', v_existing_order.order_number,
      'customerId', v_existing_order.customer_id,
      'itemsSubtotalIdr', v_existing_order.items_subtotal_idr,
      'deliveryFeeIdr', v_existing_order.delivery_fee_idr,
      'discountIdr', v_existing_order.discount_idr,
      'totalIdr', v_existing_order.total_idr,
      'deduplicated', true
    );
  end if;

  v_customer_name := nullif(trim(coalesce(p_customer->>'name', '')), '');
  v_normalized_whatsapp := private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_customer_email := nullif(lower(trim(coalesce(p_customer->>'email', ''))), '');

  if v_customer_name is null then
    raise exception 'Customer name is required.' using errcode = '22023';
  end if;
  if length(v_normalized_whatsapp) < 8 or length(v_normalized_whatsapp) > 15 then
    raise exception 'A valid WhatsApp number is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_customer->>'birthday', '')), '') is not null then
    v_customer_birthday := (p_customer->>'birthday')::date;
  end if;

  if p_fulfillment not in ('delivery', 'pickup') then
    raise exception 'Invalid fulfillment type.' using errcode = '22023';
  end if;
  if p_payment_method not in ('transfer', 'cash') then
    raise exception 'Invalid payment method.' using errcode = '22023';
  end if;
  if p_fulfillment = 'delivery' and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'Delivery address is required.' using errcode = '22023';
  end if;
  if p_fulfillment = 'delivery' and p_payment_method = 'cash' then
    raise exception 'Cash payment is only available for pickup orders.' using errcode = '22023';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id and is_active = true
  for share;

  if not found then
    raise exception 'Selected branch is unavailable.' using errcode = '22023';
  end if;

  if p_schedule_date is null or p_schedule_time is null then
    raise exception 'Schedule date and time are required.' using errcode = '22023';
  end if;
  if p_schedule_date < timezone('Asia/Jakarta', now())::date then
    raise exception 'Schedule date cannot be in the past.' using errcode = '22023';
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

  v_day_key := lower(trim(to_char(p_schedule_date, 'FMDay')));
  v_day_hours := v_branch.opening_hours -> v_day_key;
  if v_day_hours is null
     or coalesce((v_day_hours->>'isOpen')::boolean, false) = false then
    raise exception 'Selected branch is closed on this date.' using errcode = '22023';
  end if;
  if p_schedule_time < (v_day_hours->>'opensAt')::time
     or p_schedule_time > (v_day_hours->>'closesAt')::time then
    raise exception 'Selected time is outside branch opening hours.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be an array.' using errcode = '22023';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 20 then
    raise exception 'Order must contain between 1 and 20 items.' using errcode = '22023';
  end if;

  -- Validate catalog/pricing before touching CRM so local and future remote
  -- transaction ordering match and invalid checkout attempts do not lock customer rows.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 99 then
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

    v_items_subtotal := v_items_subtotal + (v_variant.price_idr * v_quantity);
  end loop;

  v_delivery_fee := case when p_fulfillment = 'delivery' then v_branch.delivery_fee_idr else 0 end;
  v_total := v_items_subtotal + v_delivery_fee;


  -- Create a new CRM profile atomically when the WhatsApp identity is new.
  -- Existing CRM profiles are never silently changed by Storefront checkout;
  -- missing email/birthday/preferred branch become order-level suggestions for staff review.
  insert into public.customers (
    id, revision, name, whatsapp_number, normalized_whatsapp_number, email, birthday,
    preferred_branch_id, created_source, last_order_at
  ) values (
    'cust_' || replace(gen_random_uuid()::text, '-', ''),
    1,
    v_customer_name,
    coalesce(nullif(trim(p_customer->>'whatsappNumber'), ''), v_normalized_whatsapp),
    v_normalized_whatsapp,
    v_customer_email,
    v_customer_birthday,
    p_branch_id,
    'storefront',
    now()
  )
  on conflict (normalized_whatsapp_number) do nothing
  returning * into v_customer;

  if not found then
    select * into v_customer
    from public.customers
    where normalized_whatsapp_number = v_normalized_whatsapp
    for update;

    if not found then
      raise exception 'Unable to resolve customer identity.' using errcode = '40001';
    end if;

    v_customer_suggestions := jsonb_strip_nulls(jsonb_build_object(
      'birthday', case when v_customer.birthday is null then v_customer_birthday else null end,
      'email', case
        when nullif(trim(coalesce(v_customer.email, '')), '') is null then v_customer_email
        else null
      end,
      'preferredBranchId', case when v_customer.preferred_branch_id is null then p_branch_id else null end
    ));

    update public.customers
    set last_order_at = now(), updated_at = now()
    where id = v_customer.id
    returning * into v_customer;
  end if;

  v_customer_id := v_customer.id;

  v_order_number := private.allocate_order_number(v_branch.id, now());
  v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.orders (
    id, order_number, revision, storefront_idempotency_key,
    customer_id, customer_name_snapshot, customer_whatsapp_snapshot, customer_email_snapshot,
    customer_profile_suggestions,
    source, fulfillment, status, branch_id,
    total_idr, items_subtotal_idr, discount_idr, delivery_fee_idr,
    payment_status, payment_method, paid_amount_idr,
    schedule_label, schedule_date, schedule_time,
    requested_pickup_date, requested_pickup_time,
    order_note, greeting_message, greeting_card_name,
    delivery_address, delivery_instructions, promo_code,
    created_at, updated_at
  ) values (
    v_order_id, v_order_number, 1, trim(p_idempotency_key),
    v_customer_id,
    v_customer_name,
    coalesce(nullif(trim(p_customer->>'whatsappNumber'), ''), v_customer.whatsapp_number),
    coalesce(v_customer_email, v_customer.email),
    v_customer_suggestions,
    'customer_app', p_fulfillment, 'pending_verification', v_branch.id,
    v_total, v_items_subtotal, 0, v_delivery_fee,
    'unpaid', p_payment_method, 0,
    to_char(p_schedule_date, 'YYYY-MM-DD') || ' · ' || to_char(p_schedule_time, 'HH24:MI'),
    p_schedule_date, p_schedule_time,
    case when p_fulfillment = 'pickup' then p_schedule_date else null end,
    case when p_fulfillment = 'pickup' then p_schedule_time else null end,
    nullif(trim(coalesce(p_order_note, '')), ''),
    nullif(trim(coalesce(p_greeting_message, '')), ''),
    nullif(trim(coalesce(p_greeting_card_name, '')), ''),
    case when p_fulfillment = 'delivery' then nullif(trim(coalesce(p_delivery_address, '')), '') else null end,
    case when p_fulfillment = 'delivery' then nullif(trim(coalesce(p_delivery_instructions, '')), '') else null end,
    nullif(upper(trim(coalesce(p_promo_code, ''))), ''),
    now(), now()
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = v_item->>'productId';
    select * into v_variant from public.product_variants where id = v_item->>'variantId';

    insert into public.order_items (
      id, order_id, product_id, variant_id,
      product_code_snapshot, product_name_snapshot,
      variant_sku_snapshot, variant_size_snapshot,
      quantity, unit_price_idr
    ) values (
      'line_' || replace(gen_random_uuid()::text, '-', ''),
      v_order_id,
      v_product.id,
      v_variant.id,
      v_product.product_code,
      v_product.name,
      v_variant.sku,
      v_variant.size,
      v_quantity,
      v_variant.price_idr
    );
  end loop;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at)
  values (
    'activity_' || replace(gen_random_uuid()::text, '-', ''),
    v_order_id,
    'created',
    'Order created from Online Store',
    'Storefront customer',
    now()
  );

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'customerId', v_customer_id,
    'itemsSubtotalIdr', v_items_subtotal,
    'deliveryFeeIdr', v_delivery_fee,
    'discountIdr', 0,
    'totalIdr', v_total,
    'deduplicated', false
  );
exception
  when unique_violation then
    -- Handles a race where the same idempotency key arrives twice.
    select * into v_existing_order
    from public.orders
    where storefront_idempotency_key = trim(p_idempotency_key)
    limit 1;
    if found then
      return jsonb_build_object(
        'orderId', v_existing_order.id,
        'orderNumber', v_existing_order.order_number,
        'customerId', v_existing_order.customer_id,
        'itemsSubtotalIdr', v_existing_order.items_subtotal_idr,
        'deliveryFeeIdr', v_existing_order.delivery_fee_idr,
        'discountIdr', v_existing_order.discount_idr,
        'totalIdr', v_existing_order.total_idr,
        'deduplicated', true
      );
    end if;
    raise;
end;
$$;

revoke execute on function public.create_storefront_order(text, jsonb, text, text, date, time, jsonb, text, text, text, text, text, text, text) from public;
grant execute on function public.create_storefront_order(text, jsonb, text, text, date, time, jsonb, text, text, text, text, text, text, text) to anon, authenticated;

-- Tighten the line-level contract to the same quantity ceiling used by checkout.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_quantity_max_99'
  ) then
    alter table public.order_items add constraint order_items_quantity_max_99 check (quantity <= 99);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'orders_discount_not_above_subtotal'
  ) then
    alter table public.orders add constraint orders_discount_not_above_subtotal check (discount_idr <= items_subtotal_idr);
  end if;
end;
$$;

comment on column public.orders.promo_code is
  'Order-time promo code snapshot. Discount remains authoritative backend/internal-domain data; anonymous clients never submit a discount amount.';

commit;
