-- The legacy storefront_idempotency_key column is also used by internal order
-- idempotency. Public tracking must be scoped by the real order source instead.

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
    and o.source = 'customer_app'
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
    and o.source = 'customer_app'
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.search_order_public_status(text) from public, authenticated;
grant execute on function public.search_order_public_status(text) to anon, service_role;

notify pgrst, 'reload schema';
