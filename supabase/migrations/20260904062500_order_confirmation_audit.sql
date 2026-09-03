-- Preserve the normal order/business audit trail for the dedicated storefront
-- confirmation commands. These RPCs remain the only direct entrypoints used by
-- the pending storefront confirmation UI.

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
  where user_id = (select auth.uid()) and is_active = true
  limit 1;
  v_actor_name := coalesce(nullif(trim(v_actor_name),''), v_role);

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
      updated_at = clock_timestamp()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at)
  values (
    'activity_'||replace(gen_random_uuid()::text,'-',''),
    v_order.id,
    'status',
    'Storefront order confirmed and customer notification prepared.',
    v_actor_name,
    clock_timestamp()
  );

  perform private.write_business_activity(
    'order', v_order.id, v_order.branch_id, 'confirmed',
    'Storefront order confirmed.',
    jsonb_build_object('orderNumber',v_order.order_number,'fromStatus','pending_verification','toStatus','confirmed')
  );

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
  where user_id = (select auth.uid()) and is_active = true
  limit 1;
  v_actor_name := coalesce(nullif(trim(v_actor_name),''), v_role);

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
      cancelled_by = v_actor_name,
      cancelled_at = clock_timestamp(),
      admin_handled_employee_id = coalesce(admin_handled_employee_id, case when v_role='admin' then v_employee_id else null end),
      admin_handled_by_name = coalesce(admin_handled_by_name, v_actor_name),
      updated_at = clock_timestamp()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at)
  values (
    'activity_'||replace(gen_random_uuid()::text,'-',''),
    v_order.id,
    'status',
    'Storefront order rejected. Reason: '||v_reason,
    v_actor_name,
    clock_timestamp()
  );

  perform private.write_business_activity(
    'order', v_order.id, v_order.branch_id, 'cancelled',
    'Storefront order rejected.',
    jsonb_build_object(
      'orderNumber',v_order.order_number,
      'fromStatus','pending_verification',
      'toStatus','cancelled',
      'reason',v_reason
    )
  );

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

notify pgrst, 'reload schema';
