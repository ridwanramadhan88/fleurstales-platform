-- Give staff 7 days, not 48 hours, to confirm and record payment for a Storefront order
-- before it is cancelled automatically. An unpaid order whose scheduled time has already
-- passed is still cancelled at once, because that slot can no longer be fulfilled.
create or replace function private.expire_stale_storefront_orders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_reason text;
  v_count integer := 0;
  v_local_now timestamp := timezone('Asia/Jakarta', clock_timestamp());
begin
  for v_order in
    select o.*
    from public.orders o
    where o.source = 'customer_app'
      and o.status = 'pending_verification'
      and o.payment_status = 'unpaid'
      and nullif(trim(coalesce(o.payment_proof_url, '')), '') is null
      and (
        o.created_at < clock_timestamp() - interval '7 days'
        or (o.schedule_date is not null and o.schedule_date + coalesce(o.schedule_time, time '23:59') < v_local_now)
      )
    order by o.created_at
    for update skip locked
  loop
    v_reason := case
      when v_order.schedule_date is not null
           and v_order.schedule_date + coalesce(v_order.schedule_time, time '23:59') < v_local_now
        then 'Automatically cancelled: the scheduled time passed before the order was confirmed and paid.'
      else 'Automatically cancelled: not confirmed and paid within 7 days.'
    end;

    update public.orders
    set status = 'cancelled',
        cancellation_reason = v_reason,
        cancelled_by = 'System',
        cancelled_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = v_order.id;

    insert into public.order_activities(id, order_id, kind, description, actor, occurred_at)
    values (
      'activity_'||replace(gen_random_uuid()::text,'-',''),
      v_order.id,
      'status',
      v_reason,
      'System',
      clock_timestamp()
    );

    perform private.write_business_activity(
      'order', v_order.id, v_order.branch_id, 'cancelled',
      'Unpaid Storefront order cancelled automatically.',
      jsonb_build_object(
        'orderNumber', v_order.order_number,
        'fromStatus', 'pending_verification',
        'toStatus', 'cancelled',
        'reason', v_reason
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.expire_stale_storefront_orders() from public, anon, authenticated;
