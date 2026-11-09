-- D2: distance-based delivery fee (Owner decisions 1, 7, 8, 9 of 8 Nov 2026).
-- The fee is base + per km by road distance from the map pin, with separate
-- Motor and Mobil formulas per branch. A branch keeps its current flat
-- `delivery_fee_idr` until the Owner turns the tariff on, so nothing changes
-- for existing orders or older clients.

alter table public.branches
  add column if not exists delivery_tariff_enabled boolean not null default false,
  add column if not exists motor_base_idr bigint not null default 0,
  add column if not exists motor_included_km numeric(5,1) not null default 3,
  add column if not exists motor_per_km_idr bigint not null default 0,
  add column if not exists car_base_idr bigint not null default 0,
  add column if not exists car_included_km numeric(5,1) not null default 3,
  add column if not exists car_per_km_idr bigint not null default 0,
  add column if not exists max_delivery_km numeric(5,1) not null default 25,
  add column if not exists motor_max_items integer;

alter table public.branches
  add constraint branches_tariff_values_check check (
    motor_base_idr >= 0 and motor_per_km_idr >= 0 and car_base_idr >= 0 and car_per_km_idr >= 0
    and motor_included_km >= 0 and car_included_km >= 0
    and max_delivery_km > 0 and max_delivery_km <= 100
    and (motor_max_items is null or motor_max_items >= 1)
  );

alter table public.products
  add column if not exists requires_car boolean not null default false;

alter table public.orders
  add column if not exists delivery_vehicle text,
  add column if not exists delivery_distance_km numeric(6,1);

alter table public.orders
  add constraint orders_delivery_vehicle_check check (delivery_vehicle is null or delivery_vehicle in ('motor', 'car'));

-- Road distances measured by the delivery-quote edge function (service role).
create table if not exists public.delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  distance_km numeric(6,1) not null check (distance_km >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);
alter table public.delivery_quotes enable row level security;
revoke all on public.delivery_quotes from anon, authenticated;
create index if not exists idx_delivery_quotes_expires on public.delivery_quotes (expires_at);

-- Fee for one vehicle and distance. Raises a coded error when the order cannot
-- be delivered that way. p_items: [{productId, quantity}] (custom items have no
-- productId and only count toward the motor limit).
create or replace function private.compute_delivery_fee(
  p_branch_id text,
  p_vehicle text,
  p_distance_km numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_qty integer := 0;
  v_requires_car boolean := false;
  v_forced text;
  v_vehicle text := lower(trim(coalesce(p_vehicle, '')));
  v_base bigint; v_inc numeric; v_per bigint; v_fee bigint;
begin
  select * into v_branch from public.branches where id = p_branch_id;
  if not found then raise exception 'Selected branch is unavailable.' using errcode = '22023'; end if;

  select coalesce(sum(greatest(1, coalesce((i->>'quantity')::integer, 1))), 0),
         coalesce(bool_or(coalesce(p.requires_car, false)), false)
    into v_qty, v_requires_car
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
  left join public.products p on p.id = nullif(i->>'productId', '');

  if v_requires_car then v_forced := 'product';
  elsif v_branch.motor_max_items is not null and v_qty > v_branch.motor_max_items then v_forced := 'quantity';
  end if;

  if v_vehicle not in ('motor', 'car') then
    v_vehicle := case when v_forced is not null then 'car' else 'motor' end;
  end if;
  if v_vehicle = 'motor' and v_forced is not null then
    raise exception 'DELIVERY_VEHICLE_CAR_REQUIRED' using errcode = '22023';
  end if;

  if p_distance_km is null then raise exception 'DELIVERY_QUOTE_REQUIRED' using errcode = '22023'; end if;
  if p_distance_km > v_branch.max_delivery_km then
    raise exception 'DELIVERY_OUT_OF_RANGE' using errcode = '22023';
  end if;

  if v_vehicle = 'motor' then
    v_base := v_branch.motor_base_idr; v_inc := v_branch.motor_included_km; v_per := v_branch.motor_per_km_idr;
  else
    v_base := v_branch.car_base_idr; v_inc := v_branch.car_included_km; v_per := v_branch.car_per_km_idr;
  end if;
  v_fee := v_base + ceil(greatest(0, p_distance_km - v_inc))::bigint * v_per;

  return jsonb_build_object(
    'feeIdr', v_fee,
    'vehicle', v_vehicle,
    'forcedCar', v_forced is not null,
    'forcedReason', v_forced,
    'distanceKm', p_distance_km,
    'maxDistanceKm', v_branch.max_delivery_km,
    'motorMaxItems', v_branch.motor_max_items
  );
end;
$$;
revoke all on function private.compute_delivery_fee(text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function private.compute_delivery_fee(text, text, numeric, jsonb) to service_role;

-- Reads a still-valid quote and checks the pin sits where it was measured.
create or replace function private.resolve_delivery_quote(
  p_quote_id uuid,
  p_branch_id text,
  p_lat double precision,
  p_lng double precision
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.delivery_quotes%rowtype;
begin
  select * into v_quote from public.delivery_quotes where id = p_quote_id;
  if not found or v_quote.branch_id <> p_branch_id or v_quote.expires_at < now() then
    raise exception 'DELIVERY_QUOTE_EXPIRED' using errcode = '22023';
  end if;
  -- ~0.002 degrees is about 200 m: the pin cannot be moved after measuring.
  if p_lat is null or p_lng is null
     or abs(p_lat - v_quote.latitude) > 0.002 or abs(p_lng - v_quote.longitude) > 0.002 then
    raise exception 'DELIVERY_QUOTE_PIN_MISMATCH' using errcode = '22023';
  end if;
  return v_quote.distance_km;
end;
$$;
revoke all on function private.resolve_delivery_quote(uuid, text, double precision, double precision) from public, anon, authenticated;
grant execute on function private.resolve_delivery_quote(uuid, text, double precision, double precision) to service_role;

-- Re-prices a freshly created delivery order from its quote. A branch with the
-- tariff off keeps its flat fee and the vehicle is only recorded.
create or replace function private.apply_order_delivery_fee(
  p_order_id text,
  p_details jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_branch public.branches%rowtype;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_items jsonb;
  v_distance numeric;
  v_calc jsonb;
  v_vehicle text := lower(nullif(trim(coalesce(v_details->>'vehicle', '')), ''));
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.fulfillment <> 'delivery' then return v_order; end if;
  select * into v_branch from public.branches where id = v_order.branch_id;
  if not v_branch.delivery_tariff_enabled then
    if v_vehicle in ('motor', 'car') then
      update public.orders set delivery_vehicle = v_vehicle where id = v_order.id returning * into v_order;
    end if;
    return v_order;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('productId', product_id, 'quantity', quantity)), '[]'::jsonb)
    into v_items from public.order_items where order_id = v_order.id;

  v_distance := private.resolve_delivery_quote(
    nullif(v_details->>'quoteId', '')::uuid, v_order.branch_id, v_order.delivery_lat, v_order.delivery_lng
  );
  v_calc := private.compute_delivery_fee(v_order.branch_id, v_vehicle, v_distance, v_items);

  update public.orders
  set delivery_fee_idr = (v_calc->>'feeIdr')::bigint,
      total_idr = greatest(0, items_subtotal_idr - discount_idr + (v_calc->>'feeIdr')::bigint),
      delivery_vehicle = v_calc->>'vehicle',
      delivery_distance_km = v_distance,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;
revoke all on function private.apply_order_delivery_fee(text, jsonb) from public, anon, authenticated;
grant execute on function private.apply_order_delivery_fee(text, jsonb) to service_role;

-- Customer / staff checkout preview. Read only.
create or replace function public.quote_delivery_fee(
  p_branch_id text,
  p_quote_id uuid,
  p_vehicle text,
  p_items jsonb,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_distance numeric;
begin
  select * into v_branch from public.branches where id = p_branch_id and is_active = true;
  if not found then raise exception 'Selected branch is unavailable.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 20 then
    raise exception 'Order must contain between 1 and 20 items.' using errcode = '22023';
  end if;
  if not v_branch.delivery_tariff_enabled then
    return jsonb_build_object('tariffEnabled', false, 'feeIdr', v_branch.delivery_fee_idr);
  end if;
  v_distance := private.resolve_delivery_quote(p_quote_id, p_branch_id, p_lat, p_lng);
  return private.compute_delivery_fee(p_branch_id, p_vehicle, v_distance, p_items) || jsonb_build_object('tariffEnabled', true);
end;
$$;
revoke all on function public.quote_delivery_fee(text, uuid, text, jsonb, double precision, double precision) from public;
grant execute on function public.quote_delivery_fee(text, uuid, text, jsonb, double precision, double precision) to anon, authenticated;

-- Hook the fee into both order creation wrappers (re-priced after the reward discount).
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
    v_order := private.apply_order_delivery_fee(v_order.id, p_delivery_details);
  end if;

  return private.order_idempotency_result(v_order, v_is_dedup);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_internal_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      v_order := private.apply_order_delivery_fee(v_order.id, p_payload->'deliveryDetails');
      v_result := v_result || jsonb_build_object('deliveryFeeIdr', v_order.delivery_fee_idr, 'totalIdr', v_order.total_idr);
    end if;
  end if;

  return v_result;
end;
$function$;

-- Branch settings save the tariff (only when the client sends it).
CREATE OR REPLACE FUNCTION public.replace_public_store_snapshot(p_base_revision bigint, p_profile jsonb, p_branches jsonb, p_payment_accounts jsonb, p_payment_instructions text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_revision bigint;
  v_next_revision bigint;
  v_branch jsonb;
  v_account jsonb;
  v_branch_count integer;
  v_account_count integer;
  v_active_branch_count integer;
  v_active_account_count integer;
  v_default_account_count integer;
  v_duplicate_count integer;
  v_default_branch_count integer;
begin
  if not (
    private.has_action_permission('settings.edit_store_profile')
    and private.has_action_permission('settings.edit_branches')
    and private.has_action_permission('settings.edit_payment_methods')
  ) then
    raise exception 'STORE_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_profile) <> 'object' then
    raise exception 'p_profile must be a JSON object.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_branches) <> 'array' then
    raise exception 'p_branches must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payment_accounts) <> 'array' then
    raise exception 'p_payment_accounts must be a JSON array.' using errcode = '22023';
  end if;
  if coalesce(nullif(trim(p_profile->>'storeName'), ''), '') = '' then
    raise exception 'Store name is required.' using errcode = '22023';
  end if;
  if coalesce(nullif(trim(p_payment_instructions), ''), '') = '' then
    raise exception 'Payment instructions are required.' using errcode = '22023';
  end if;

  select count(*) into v_active_branch_count
  from jsonb_array_elements(p_branches) branch
  where coalesce((branch->>'isActive')::boolean, true) = true;
  if v_active_branch_count = 0 then
    raise exception 'At least one active branch is required.' using errcode = '22023';
  end if;

  select count(*) - count(distinct branch->>'id') into v_duplicate_count
  from jsonb_array_elements(p_branches) branch;
  if v_duplicate_count > 0 then
    raise exception 'Branch ids must be unique.' using errcode = '22023';
  end if;

  select count(*) - count(distinct upper(trim(branch->>'code'))) into v_duplicate_count
  from jsonb_array_elements(p_branches) branch;
  if v_duplicate_count > 0 then
    raise exception 'Branch codes must be unique.' using errcode = '22023';
  end if;

  select count(*) into v_default_branch_count
  from jsonb_array_elements(p_branches) branch
  where coalesce((branch->>'isActive')::boolean, true) = true
    and coalesce((branch->>'isDefault')::boolean, false) = true;
  if v_default_branch_count > 1 then
    raise exception 'At most one active branch may be the default.' using errcode = '22023';
  end if;

  select count(*) into v_active_account_count
  from jsonb_array_elements(p_payment_accounts) account
  where coalesce((account->>'isActive')::boolean, true) = true;
  if v_active_account_count = 0 then
    raise exception 'At least one active payment account is required.' using errcode = '22023';
  end if;

  select count(*) into v_default_account_count
  from jsonb_array_elements(p_payment_accounts) account
  where coalesce((account->>'isActive')::boolean, true) = true
    and coalesce((account->>'isDefault')::boolean, false) = true;
  if v_default_account_count <> 1 then
    raise exception 'Exactly one active payment account must be the default.' using errcode = '22023';
  end if;


  select count(*) - count(distinct account->>'id') into v_duplicate_count
  from jsonb_array_elements(p_payment_accounts) account;
  if v_duplicate_count > 0 then
    raise exception 'Payment account ids must be unique.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payment_accounts) account
    cross join lateral jsonb_array_elements_text(coalesce(account->'branchIds', '[]'::jsonb)) branch_id
    where not exists (
      select 1 from jsonb_array_elements(p_branches) branch
      where branch->>'id' = branch_id
    )
  ) then
    raise exception 'Payment account references an unknown branch.' using errcode = '22023';
  end if;

  insert into public.store_sync_state (id, revision)
  values ('primary', 0)
  on conflict (id) do nothing;

  select revision into v_current_revision
  from public.store_sync_state
  where id = 'primary'
  for update;

  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'STORE_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision
      using errcode = '40001';
  end if;

  insert into public.store_profile (
    id, store_name, legal_name, logo_url, phone, whatsapp, email, address, currency, timezone
  ) values (
    'primary',
    trim(p_profile->>'storeName'),
    nullif(trim(p_profile->>'legalName'), ''),
    nullif(trim(p_profile->>'logoUrl'), ''),
    coalesce(trim(p_profile->>'phone'), ''),
    coalesce(trim(p_profile->>'whatsapp'), ''),
    coalesce(trim(p_profile->>'email'), ''),
    coalesce(trim(p_profile->>'address'), ''),
    'IDR',
    'Asia/Jakarta'
  )
  on conflict (id) do update set
    store_name = excluded.store_name,
    legal_name = excluded.legal_name,
    logo_url = excluded.logo_url,
    phone = excluded.phone,
    whatsapp = excluded.whatsapp,
    email = excluded.email,
    address = excluded.address,
    currency = excluded.currency,
    timezone = excluded.timezone,
    updated_at = now();

  -- Clear defaults before upserting to avoid transient unique-index conflicts.
  update public.branches set is_default = false where is_default = true;

  for v_branch in select value from jsonb_array_elements(p_branches)
  loop
    if coalesce(nullif(trim(v_branch->>'id'), ''), '') = '' then
      raise exception 'Branch id is required.' using errcode = '22023';
    end if;
    if coalesce(nullif(trim(v_branch->>'code'), ''), '') = '' then
      raise exception 'Branch code is required.' using errcode = '22023';
    end if;
    if coalesce((v_branch->>'deliveryFeeIdr')::bigint, 0) < 0 then
      raise exception 'Branch delivery fee cannot be negative.' using errcode = '22023';
    end if;

    insert into public.branches (
      id, name, code, address, phone, is_active, is_default, sort_order,
      delivery_fee_idr, opening_hours, latitude, longitude
    ) values (
      trim(v_branch->>'id'),
      trim(v_branch->>'name'),
      upper(trim(v_branch->>'code')),
      coalesce(trim(v_branch->>'address'), ''),
      coalesce(trim(v_branch->>'phone'), ''),
      coalesce((v_branch->>'isActive')::boolean, true),
      coalesce((v_branch->>'isDefault')::boolean, false),
      coalesce((v_branch->>'sortOrder')::integer, 0),
      coalesce((v_branch->>'deliveryFeeIdr')::bigint, 0),
      coalesce(v_branch->'openingHours', '{}'::jsonb),
      case when v_branch ? 'latitude' and v_branch->>'latitude' is not null then (v_branch->>'latitude')::double precision else null end,
      case when v_branch ? 'longitude' and v_branch->>'longitude' is not null then (v_branch->>'longitude')::double precision else null end
    )
    on conflict (id) do update set
      name = excluded.name,
      code = excluded.code,
      address = excluded.address,
      phone = excluded.phone,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      sort_order = excluded.sort_order,
      delivery_fee_idr = excluded.delivery_fee_idr,
      opening_hours = excluded.opening_hours,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = now();

    -- Distance tariff (D2). Only written when the client sends it, so an
    -- older client saving settings never wipes the Owner's tariff.
    if jsonb_typeof(v_branch->'deliveryTariff') = 'object' then
      update public.branches set
        delivery_tariff_enabled = coalesce((v_branch#>>'{deliveryTariff,enabled}')::boolean, false),
        motor_base_idr = coalesce((v_branch#>>'{deliveryTariff,motor,baseIdr}')::bigint, 0),
        motor_included_km = coalesce((v_branch#>>'{deliveryTariff,motor,includedKm}')::numeric, 3),
        motor_per_km_idr = coalesce((v_branch#>>'{deliveryTariff,motor,perKmIdr}')::bigint, 0),
        car_base_idr = coalesce((v_branch#>>'{deliveryTariff,car,baseIdr}')::bigint, 0),
        car_included_km = coalesce((v_branch#>>'{deliveryTariff,car,includedKm}')::numeric, 3),
        car_per_km_idr = coalesce((v_branch#>>'{deliveryTariff,car,perKmIdr}')::bigint, 0),
        max_delivery_km = coalesce((v_branch#>>'{deliveryTariff,maxKm}')::numeric, 25),
        motor_max_items = nullif(v_branch#>>'{deliveryTariff,motorMaxItems}', '')::integer,
        updated_at = now()
      where id = trim(v_branch->>'id');
    end if;
  end loop;

  -- Branch rows may be referenced by historical Orders/HR data. Never delete
  -- omitted rows from a full snapshot; retire them instead.
  update public.branches branch
  set is_active = false,
      is_default = false,
      updated_at = now()
  where not exists (
    select 1 from jsonb_array_elements(p_branches) item
    where item->>'id' = branch.id
  );

  update public.public_payment_accounts set is_default = false where is_default = true;

  for v_account in select value from jsonb_array_elements(p_payment_accounts)
  loop
    if coalesce(nullif(trim(v_account->>'id'), ''), '') = '' then
      raise exception 'Payment account id is required.' using errcode = '22023';
    end if;

    insert into public.public_payment_accounts (
      id, bank_name, account_number, account_holder, type,
      is_active, is_default, display_order, is_customer_visible, branch_ids
    ) values (
      trim(v_account->>'id'),
      trim(v_account->>'bankName'),
      trim(v_account->>'accountNumber'),
      trim(v_account->>'accountHolder'),
      coalesce(nullif(v_account->>'type', ''), 'bank_transfer'),
      coalesce((v_account->>'isActive')::boolean, true),
      coalesce((v_account->>'isDefault')::boolean, false),
      coalesce((v_account->>'displayOrder')::integer, 0),
      coalesce((v_account->>'isCustomerVisible')::boolean, true),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_account->'branchIds', '[]'::jsonb))), '{}'::text[])
    )
    on conflict (id) do update set
      bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      type = excluded.type,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      display_order = excluded.display_order,
      is_customer_visible = excluded.is_customer_visible,
      branch_ids = excluded.branch_ids,
      updated_at = now();
  end loop;

  delete from public.public_payment_accounts account
  where not exists (
    select 1 from jsonb_array_elements(p_payment_accounts) item
    where item->>'id' = account.id
  );

  insert into public.storefront_payment_settings (id, payment_instructions)
  values ('primary', trim(p_payment_instructions))
  on conflict (id) do update set
    payment_instructions = excluded.payment_instructions,
    updated_at = now();

  v_next_revision := v_current_revision + 1;
  update public.store_sync_state
  set revision = v_next_revision,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = 'primary';

  select jsonb_array_length(p_branches) into v_branch_count;
  select jsonb_array_length(p_payment_accounts) into v_account_count;

  return jsonb_build_object(
    'revision', v_next_revision,
    'branchCount', v_branch_count,
    'paymentAccountCount', v_account_count
  );
end;
$function$;

-- Catalog save carries the car-only flag (only when the client sends it).
CREATE OR REPLACE FUNCTION public.replace_catalog_snapshot(p_base_revision bigint, p_occasions jsonb, p_products jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_current_revision bigint;
  v_next_revision bigint;
  v_occasion jsonb;
  v_product jsonb;
  v_variant jsonb;
  v_recipe jsonb;
  v_image jsonb;
  v_link record;
  v_product_id text;
  v_variant_id text;
  v_recipe_id text;
  v_product_count integer;
  v_occasion_count integer;
  v_image_count integer;
  v_storage_path text;
  v_mime_type text;
  v_byte_size integer;
  v_width integer;
  v_height integer;
begin
  v_role := private.current_staff_role();
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_occasions) <> 'array' or jsonb_typeof(p_products) <> 'array' then
    raise exception 'Catalog payloads must be JSON arrays.' using errcode = '22023';
  end if;

  perform private.validate_catalog_snapshot_payload(p_products);

  insert into public.catalog_sync_state (id, revision)
  values ('primary', 0)
  on conflict (id) do nothing;

  select revision
  into v_current_revision
  from public.catalog_sync_state
  where id = 'primary'
  for update;

  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'CATALOG_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision
      using errcode = '40001';
  end if;

  for v_occasion in select value from jsonb_array_elements(p_occasions)
  loop
    insert into public.occasions(id,name,prefix,sort_order,is_active)
    values(
      v_occasion->>'id',
      v_occasion->>'name',
      v_occasion->>'prefix',
      coalesce((v_occasion->>'sortOrder')::integer,0),
      coalesce((v_occasion->>'isActive')::boolean,true)
    )
    on conflict(id) do update set
      name=excluded.name,
      prefix=excluded.prefix,
      sort_order=excluded.sort_order,
      is_active=excluded.is_active,
      updated_at=now();
  end loop;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_product_id := v_product->>'id';

    if jsonb_typeof(coalesce(v_product->'images','[]'::jsonb)) <> 'array' then
      raise exception 'CATALOG_PRODUCT_IMAGES_MUST_BE_ARRAY:%', v_product_id using errcode = '22023';
    end if;

    insert into public.products(
      id,product_code,primary_occasion_id,material,name,description,product_type,
      collection_series,pricing_type,order_type,is_featured,is_active,promo_label,
      original_price_idr,is_customizable,sort_order,archived_at
    )
    values(
      v_product_id,
      v_product->>'productCode',
      nullif(v_product->>'primaryOccasionId',''),
      v_product->>'material',
      v_product->>'name',
      nullif(v_product->>'description',''),
      nullif(v_product->>'productType',''),
      nullif(v_product->>'collectionSeries',''),
      nullif(v_product->>'pricingType',''),
      nullif(v_product->>'orderType',''),
      coalesce((v_product->>'isFeatured')::boolean,false),
      coalesce((v_product->>'isActive')::boolean,true),
      nullif(v_product->>'promoLabel',''),
      case when v_product?'originalPriceIdr' and v_product->>'originalPriceIdr' is not null
        then (v_product->>'originalPriceIdr')::bigint else null end,
      coalesce((v_product->>'isCustomizable')::boolean,false),
      coalesce((v_product->>'sortOrder')::integer,0),
      null
    )
    on conflict(id) do update set
      product_code=excluded.product_code,
      primary_occasion_id=excluded.primary_occasion_id,
      material=excluded.material,
      name=excluded.name,
      description=excluded.description,
      product_type=excluded.product_type,
      collection_series=excluded.collection_series,
      pricing_type=excluded.pricing_type,
      order_type=excluded.order_type,
      is_featured=excluded.is_featured,
      is_active=excluded.is_active,
      promo_label=excluded.promo_label,
      original_price_idr=excluded.original_price_idr,
      is_customizable=excluded.is_customizable,
      sort_order=excluded.sort_order,
      archived_at=null,
      updated_at=now();

    -- D2: "must be delivered by car". Only written when the client sends it.
    if jsonb_typeof(v_product->'requiresCar') = 'boolean' then
      update public.products set requires_car = (v_product->>'requiresCar')::boolean where id = v_product_id;
    end if;

    delete from public.product_occasions where product_id=v_product_id;
    for v_link in
      select value as occasion_id, ordinality
      from jsonb_array_elements_text(coalesce(v_product->'occasionIds','[]'::jsonb)) with ordinality
    loop
      insert into public.product_occasions(product_id,occasion_id,sort_order)
      values(v_product_id,v_link.occasion_id,(v_link.ordinality-1)::integer)
      on conflict(product_id,occasion_id) do update set sort_order=excluded.sort_order;
    end loop;

    update public.product_variants pv
    set status='inactive',
        archived_at=coalesce(pv.archived_at,clock_timestamp()),
        updated_at=clock_timestamp()
    where pv.product_id=v_product_id
      and pv.archived_at is null
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) item
        where item->>'id'=pv.id
      )
      and exists(select 1 from public.order_items oi where oi.variant_id=pv.id);

    delete from public.product_variants pv
    where pv.product_id=v_product_id
      and pv.archived_at is null
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) item
        where item->>'id'=pv.id
      )
      and not exists(select 1 from public.order_items oi where oi.variant_id=pv.id);

    for v_variant in
      select value from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';

      if jsonb_typeof(coalesce(v_variant->'images','[]'::jsonb)) <> 'array' then
        raise exception 'CATALOG_VARIANT_IMAGES_MUST_BE_ARRAY:%', v_variant_id using errcode = '22023';
      end if;
      if jsonb_typeof(coalesce(v_variant->'flowerRecipe','[]'::jsonb)) <> 'array' then
        raise exception 'CATALOG_VARIANT_RECIPE_MUST_BE_ARRAY:%', v_variant_id using errcode = '22023';
      end if;

      insert into public.product_variants(
        id,product_id,sku,size,size_option_id,price_idr,status,sort_order,archived_at
      )
      values(
        v_variant_id,
        v_product_id,
        v_variant->>'sku',
        v_variant->>'size',
        nullif(v_variant->>'sizeOptionId',''),
        (v_variant->>'priceIdr')::bigint,
        coalesce(v_variant->>'status','active'),
        coalesce((v_variant->>'sortOrder')::integer,0),
        null
      )
      on conflict(id) do update set
        product_id=excluded.product_id,
        sku=excluded.sku,
        size=excluded.size,
        size_option_id=excluded.size_option_id,
        price_idr=excluded.price_idr,
        status=excluded.status,
        sort_order=excluded.sort_order,
        archived_at=null,
        updated_at=now();

      -- Only Owner can mutate Cost. Admin edits preserve any existing Cost row.
      if v_role='owner' and v_variant?'costIdr' then
        insert into public.product_variant_costs(variant_id,cost_idr)
        values(
          v_variant_id,
          case when v_variant->>'costIdr' is null then null else (v_variant->>'costIdr')::bigint end
        )
        on conflict(variant_id) do update set
          cost_idr=excluded.cost_idr,
          updated_at=now();
      end if;

      -- Recipes are replaced inside the same revision transaction as the
      -- Product/variant rows. Existing order snapshots are separate immutable
      -- values and are not changed here.
      delete from public.product_variant_flower_recipes where variant_id=v_variant_id;
      for v_recipe in
        select value from jsonb_array_elements(coalesce(v_variant->'flowerRecipe','[]'::jsonb))
      loop
        if coalesce(trim(v_recipe->>'flowerName'),'') = '' then
          raise exception 'CATALOG_RECIPE_FLOWER_REQUIRED:%', v_variant_id using errcode = '22023';
        end if;
        if coalesce((v_recipe->>'quantity')::numeric,0) <= 0 then
          raise exception 'CATALOG_RECIPE_QUANTITY_INVALID:%', v_variant_id using errcode = '22023';
        end if;
        if coalesce(v_recipe->>'unit','stem') not in ('stem','bunch') then
          raise exception 'CATALOG_RECIPE_UNIT_INVALID:%', v_variant_id using errcode = '22023';
        end if;

        v_recipe_id := coalesce(
          nullif(v_recipe->>'id',''),
          'flower_recipe_'||replace(gen_random_uuid()::text,'-','')
        );
        insert into public.product_variant_flower_recipes(
          id,variant_id,flower_name,quantity,unit,sort_order
        )
        values(
          v_recipe_id,
          v_variant_id,
          trim(v_recipe->>'flowerName'),
          (v_recipe->>'quantity')::numeric,
          coalesce(v_recipe->>'unit','stem'),
          coalesce((v_recipe->>'sortOrder')::integer,0)
        );
      end loop;
    end loop;

    -- Image metadata is also replaced inside this transaction. Binary objects
    -- are pre-uploaded under unique paths; stale/conflicting saves remove those
    -- newly-uploaded objects client-side and never commit this metadata.
    select
      jsonb_array_length(coalesce(v_product->'images','[]'::jsonb))
      + coalesce(sum(jsonb_array_length(coalesce(variant->'images','[]'::jsonb))),0)
    into v_image_count
    from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) variant;

    if v_image_count > 36 then
      raise exception 'CATALOG_IMAGE_LIMIT_EXCEEDED:%', v_product_id using errcode = '22023';
    end if;

    delete from public.product_images where product_id=v_product_id;

    for v_image in
      select value from jsonb_array_elements(coalesce(v_product->'images','[]'::jsonb))
    loop
      v_storage_path := coalesce(v_image->>'storagePath','');
      v_mime_type := coalesce(v_image->>'mimeType','image/jpeg');
      v_byte_size := case when v_image?'byteSize' and v_image->>'byteSize' is not null then (v_image->>'byteSize')::integer else null end;
      v_width := case when v_image?'width' and v_image->>'width' is not null then (v_image->>'width')::integer else null end;
      v_height := case when v_image?'height' and v_image->>'height' is not null then (v_image->>'height')::integer else null end;

      if coalesce(v_image->>'id','') = '' then raise exception 'CATALOG_IMAGE_ID_REQUIRED:%', v_product_id using errcode='22023'; end if;
      if v_storage_path = '' or v_storage_path !~ '^[a-z0-9._/-]+\.(jpg|jpeg|png|webp)$' then
        raise exception 'CATALOG_IMAGE_PATH_INVALID:%', v_storage_path using errcode='22023';
      end if;
      if v_mime_type not in ('image/jpeg','image/png','image/webp') then
        raise exception 'CATALOG_IMAGE_MIME_INVALID:%', v_mime_type using errcode='22023';
      end if;
      if v_byte_size is not null and (v_byte_size < 0 or v_byte_size > 102400) then
        raise exception 'CATALOG_IMAGE_SIZE_INVALID:%', v_image->>'id' using errcode='22023';
      end if;
      if (v_width is not null and v_width <= 0) or (v_height is not null and v_height <= 0) then
        raise exception 'CATALOG_IMAGE_DIMENSIONS_INVALID:%', v_image->>'id' using errcode='22023';
      end if;

      insert into public.product_images(
        id,product_id,variant_id,storage_path,alt_text,sort_order,is_primary,
        mime_type,byte_size,width,height
      )
      values(
        v_image->>'id',
        v_product_id,
        null,
        v_storage_path,
        nullif(v_image->>'altText',''),
        coalesce((v_image->>'sortOrder')::integer,0),
        coalesce((v_image->>'isPrimary')::boolean,false),
        v_mime_type,
        v_byte_size,
        v_width,
        v_height
      );
    end loop;

    for v_variant in
      select value from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';
      for v_image in
        select value from jsonb_array_elements(coalesce(v_variant->'images','[]'::jsonb))
      loop
        v_storage_path := coalesce(v_image->>'storagePath','');
        v_mime_type := coalesce(v_image->>'mimeType','image/jpeg');
        v_byte_size := case when v_image?'byteSize' and v_image->>'byteSize' is not null then (v_image->>'byteSize')::integer else null end;
        v_width := case when v_image?'width' and v_image->>'width' is not null then (v_image->>'width')::integer else null end;
        v_height := case when v_image?'height' and v_image->>'height' is not null then (v_image->>'height')::integer else null end;

        if coalesce(v_image->>'id','') = '' then raise exception 'CATALOG_IMAGE_ID_REQUIRED:%', v_variant_id using errcode='22023'; end if;
        if v_storage_path = '' or v_storage_path !~ '^[a-z0-9._/-]+\.(jpg|jpeg|png|webp)$' then
          raise exception 'CATALOG_IMAGE_PATH_INVALID:%', v_storage_path using errcode='22023';
        end if;
        if v_mime_type not in ('image/jpeg','image/png','image/webp') then
          raise exception 'CATALOG_IMAGE_MIME_INVALID:%', v_mime_type using errcode='22023';
        end if;
        if v_byte_size is not null and (v_byte_size < 0 or v_byte_size > 102400) then
          raise exception 'CATALOG_IMAGE_SIZE_INVALID:%', v_image->>'id' using errcode='22023';
        end if;
        if (v_width is not null and v_width <= 0) or (v_height is not null and v_height <= 0) then
          raise exception 'CATALOG_IMAGE_DIMENSIONS_INVALID:%', v_image->>'id' using errcode='22023';
        end if;

        insert into public.product_images(
          id,product_id,variant_id,storage_path,alt_text,sort_order,is_primary,
          mime_type,byte_size,width,height
        )
        values(
          v_image->>'id',
          v_product_id,
          v_variant_id,
          v_storage_path,
          nullif(v_image->>'altText',''),
          coalesce((v_image->>'sortOrder')::integer,0),
          coalesce((v_image->>'isPrimary')::boolean,false),
          v_mime_type,
          v_byte_size,
          v_width,
          v_height
        );
      end loop;
    end loop;
  end loop;

  insert into public.catalog_product_code_tombstones(product_code,deleted_product_id,deleted_at,deleted_by)
  select p.product_code,p.id,now(),(select auth.uid())
  from public.products p
  where not exists(
    select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id
  )
  on conflict(product_code) do update set
    deleted_product_id=excluded.deleted_product_id,
    deleted_at=excluded.deleted_at,
    deleted_by=excluded.deleted_by;

  update public.product_variants pv
  set status='inactive',
      archived_at=coalesce(pv.archived_at,clock_timestamp()),
      updated_at=clock_timestamp()
  where pv.archived_at is null
    and exists(
    select 1
    from public.products p
    where p.id=pv.product_id
      and not exists(select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id)
      and (
        exists(select 1 from public.order_items oi where oi.product_id=p.id)
        or exists(
          select 1 from public.order_items oi
          join public.product_variants linked on linked.id=oi.variant_id
          where linked.product_id=p.id
        )
      )
  );

  update public.products p
  set is_active=false,
      primary_occasion_id=null,
      archived_at=coalesce(p.archived_at,clock_timestamp()),
      updated_at=clock_timestamp()
  where p.archived_at is null
    and not exists(
    select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id
  )
    and (
      exists(select 1 from public.order_items oi where oi.product_id=p.id)
      or exists(
        select 1 from public.order_items oi
        join public.product_variants linked on linked.id=oi.variant_id
        where linked.product_id=p.id
      )
    );

  delete from public.product_occasions link
  using public.products p
  where p.id=link.product_id
    and p.archived_at is not null;

  delete from public.products p
  where p.archived_at is null
    and not exists(
    select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id
  )
    and not exists(select 1 from public.order_items oi where oi.product_id=p.id)
    and not exists(
      select 1 from public.order_items oi
      join public.product_variants linked on linked.id=oi.variant_id
      where linked.product_id=p.id
    );

  delete from public.occasions o
  where not exists(
    select 1 from jsonb_array_elements(p_occasions) item where item->>'id'=o.id
  );

  v_next_revision := v_current_revision+1;
  update public.catalog_sync_state
  set revision=v_next_revision,
      updated_at=now(),
      updated_by=(select auth.uid())
  where id='primary';

  select jsonb_array_length(p_products) into v_product_count;
  select jsonb_array_length(p_occasions) into v_occasion_count;

  return jsonb_build_object(
    'revision',v_next_revision,
    'productCount',v_product_count,
    'occasionCount',v_occasion_count
  );
end;
$function$;
