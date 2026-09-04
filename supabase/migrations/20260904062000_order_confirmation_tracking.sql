-- Order confirmation, finance reference, and privacy-safe public tracking.

alter table public.orders
  add column if not exists public_tracking_id uuid not null default gen_random_uuid(),
  add column if not exists finance_reference_code text,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;

create unique index if not exists orders_public_tracking_id_key
  on public.orders (public_tracking_id);

create table if not exists private.order_lookup_attempts (
  ip_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (ip_hash, window_started_at)
);

revoke all on table private.order_lookup_attempts from public, anon, authenticated;

create or replace function private.consume_public_order_lookup_budget()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip text;
  v_hash text;
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_count integer;
begin
  -- SQL smoke tests and trusted non-HTTP callers do not have request headers.
  if v_headers = '{}'::jsonb then
    return;
  end if;

  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), '')
  );
  if v_ip is null then
    v_ip := 'unknown';
  end if;

  v_hash := md5(v_ip || ':fleurstales-public-order-tracking');

  insert into private.order_lookup_attempts as attempts (
    ip_hash, window_started_at, request_count, updated_at
  ) values (
    v_hash, v_window, 1, clock_timestamp()
  )
  on conflict (ip_hash, window_started_at) do update
    set request_count = attempts.request_count + 1,
        updated_at = clock_timestamp()
  returning request_count into v_count;

  if v_count > 20 then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'ORDER_LOOKUP_RATE_LIMITED',
        'message', 'Too many order lookups. Please try again shortly.'
      )::text,
      detail = json_build_object(
        'status', 429,
        'status_text', 'Too Many Requests'
      )::text;
  end if;

  -- Opportunistic cleanup keeps the private table bounded without a cron dependency.
  if random() < 0.02 then
    delete from private.order_lookup_attempts
    where window_started_at < clock_timestamp() - interval '1 day';
  end if;
end;
$$;

revoke all on function private.consume_public_order_lookup_budget() from public, anon, authenticated;
grant execute on function private.consume_public_order_lookup_budget() to service_role;

create or replace function private.order_idempotency_result(
  p_order public.orders,
  p_deduplicated boolean
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'orderId', p_order.id,
    'orderNumber', p_order.order_number,
    'publicTrackingId', p_order.public_tracking_id::text,
    'customerId', p_order.customer_id,
    'itemsSubtotalIdr', p_order.items_subtotal_idr,
    'deliveryFeeIdr', p_order.delivery_fee_idr,
    'discountIdr', p_order.discount_idr,
    'totalIdr', p_order.total_idr,
    'deduplicated', p_deduplicated
  );
$$;

revoke all on function private.order_idempotency_result(public.orders,boolean) from public, anon, authenticated;
grant execute on function private.order_idempotency_result(public.orders,boolean) to service_role;

create or replace function public.save_order_finance_reference(
  p_order_id text,
  p_expected_revision integer,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_reference text := nullif(upper(trim(coalesce(p_reference, ''))), '');
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if not private.has_action_permission('finance.verify_order') then
    raise exception 'FINANCE_REFERENCE_NOT_PERMITTED' using errcode='42501';
  end if;
  if v_reference is not null and v_reference !~ '^[A-Z0-9][A-Z0-9-]{0,63}$' then
    raise exception 'FINANCE_REFERENCE_INVALID' using errcode='22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
  end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode='40001';
  end if;

  update public.orders
  set finance_reference_code = v_reference,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'revision', v_order.revision,
    'financeReferenceCode', v_order.finance_reference_code,
    'updatedAt', v_order.updated_at
  );
end;
$$;

revoke all on function public.save_order_finance_reference(text,integer,text) from public, anon;
grant execute on function public.save_order_finance_reference(text,integer,text) to authenticated, service_role;

create or replace function public.confirm_pending_storefront_order(
  p_order_id text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_role text := private.current_staff_role();
  v_employee_id text := private.current_staff_employee_id();
  v_actor_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_role not in ('owner','admin') or not private.has_action_permission('orders.advance_status') then
    raise exception 'ORDER_CONFIRM_NOT_PERMITTED' using errcode='42501';
  end if;

  select display_name into v_actor_name
  from public.staff_access_profiles
  where employee_id = v_employee_id
  limit 1;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
  end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode='40001';
  end if;
  if v_order.storefront_idempotency_key is null then
    raise exception 'STOREFRONT_ORDER_REQUIRED' using errcode='22023';
  end if;
  if v_order.status <> 'pending_verification' then
    raise exception 'ORDER_NOT_PENDING_VERIFICATION' using errcode='22023';
  end if;

  update public.orders
  set status = 'confirmed',
      admin_handled_employee_id = coalesce(admin_handled_employee_id, case when v_role='admin' then v_employee_id else null end),
      admin_handled_by_name = coalesce(admin_handled_by_name, v_actor_name),
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'revision', v_order.revision,
    'status', v_order.status,
    'publicTrackingId', v_order.public_tracking_id::text,
    'updatedAt', v_order.updated_at
  );
end;
$$;

revoke all on function public.confirm_pending_storefront_order(text,integer) from public, anon;
grant execute on function public.confirm_pending_storefront_order(text,integer) to authenticated, service_role;

create or replace function public.cancel_pending_storefront_order(
  p_order_id text,
  p_expected_revision integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_role text := private.current_staff_role();
  v_employee_id text := private.current_staff_employee_id();
  v_actor_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_role not in ('owner','admin') or not private.has_action_permission('orders.advance_status') then
    raise exception 'ORDER_CANCEL_NOT_PERMITTED' using errcode='42501';
  end if;
  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'CANCELLATION_REASON_REQUIRED' using errcode='22023';
  end if;

  select display_name into v_actor_name
  from public.staff_access_profiles
  where employee_id = v_employee_id
  limit 1;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
  end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode='40001';
  end if;
  if v_order.storefront_idempotency_key is null then
    raise exception 'STOREFRONT_ORDER_REQUIRED' using errcode='22023';
  end if;
  if v_order.status <> 'pending_verification' then
    raise exception 'ORDER_NOT_PENDING_VERIFICATION' using errcode='22023';
  end if;

  update public.orders
  set status = 'cancelled',
      cancellation_reason = v_reason,
      cancelled_by = coalesce(v_actor_name, v_employee_id, v_role),
      cancelled_at = clock_timestamp(),
      admin_handled_employee_id = coalesce(admin_handled_employee_id, case when v_role='admin' then v_employee_id else null end),
      admin_handled_by_name = coalesce(admin_handled_by_name, v_actor_name),
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'revision', v_order.revision,
    'status', v_order.status,
    'cancellationReason', v_order.cancellation_reason,
    'publicTrackingId', v_order.public_tracking_id::text,
    'updatedAt', v_order.updated_at
  );
end;
$$;

revoke all on function public.cancel_pending_storefront_order(text,integer,text) from public, anon;
grant execute on function public.cancel_pending_storefront_order(text,integer,text) to authenticated, service_role;

create or replace function public.get_order_tracking_id(p_order_id text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tracking_id text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if not private.has_action_permission('orders.view') then
    raise exception 'ORDER_VIEW_NOT_PERMITTED' using errcode='42501';
  end if;

  select public_tracking_id::text into v_tracking_id
  from public.orders
  where id = p_order_id;
  return v_tracking_id;
end;
$$;

revoke all on function public.get_order_tracking_id(text) from public, anon;
grant execute on function public.get_order_tracking_id(text) to authenticated, service_role;

create or replace function public.get_order_public_status(p_tracking_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
    'orderNumber', o.order_number,
    'status', o.status,
    'fulfillment', o.fulfillment,
    'branchId', o.branch_id,
    'branchName', b.name,
    'branchAddress', b.address,
    'customerName', o.customer_name_snapshot,
    'customerWhatsapp', o.customer_whatsapp_snapshot,
    'deliveryAddress', o.delivery_address,
    'deliveryInstructions', o.delivery_instructions,
    'scheduleDate', o.schedule_date,
    'scheduleTime', o.schedule_time,
    'requestedPickupDate', o.requested_pickup_date,
    'requestedPickupTime', o.requested_pickup_time,
    'paymentStatus', o.payment_status,
    'paymentMethod', o.payment_method,
    'itemsSubtotalIdr', o.items_subtotal_idr,
    'deliveryFeeIdr', o.delivery_fee_idr,
    'discountIdr', o.discount_idr,
    'totalIdr', o.total_idr,
    'cancellationReason', o.cancellation_reason,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.product_name_snapshot,
        'variant', i.variant_size_snapshot,
        'quantity', i.quantity,
        'unitPriceIdr', i.unit_price_idr
      ) order by i.created_at, i.id)
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  ) into v_result
  from public.orders o
  left join public.branches b on b.id = o.branch_id
  where o.public_tracking_id = v_tracking_id
    and o.storefront_idempotency_key is not null
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_order_public_status(text) from public, authenticated;
grant execute on function public.get_order_public_status(text) to anon, service_role;

create or replace function public.search_order_public_status(p_order_number text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.consume_public_order_lookup_budget();

  select jsonb_build_object(
    'orderNumber', o.order_number,
    'status', o.status,
    'fulfillment', o.fulfillment,
    'branchName', b.name,
    'scheduleDate', o.schedule_date,
    'scheduleTime', o.schedule_time,
    'requestedPickupDate', o.requested_pickup_date,
    'requestedPickupTime', o.requested_pickup_time
  ) into v_result
  from public.orders o
  left join public.branches b on b.id = o.branch_id
  where upper(o.order_number) = upper(trim(p_order_number))
    and o.storefront_idempotency_key is not null
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.search_order_public_status(text) from public, authenticated;
grant execute on function public.search_order_public_status(text) to anon, service_role;

notify pgrst, 'reload schema';
