-- Courier no longer moves the order status. Admin/Owner own the delivery status
-- (ready -> delivering -> delivered). The courier only confirms to Admin that the
-- order was handed over, attaching the internal proof photo.

begin;

drop function if exists public.courier_start_delivery_guarded(text, integer);
drop function if exists public.courier_complete_delivery_guarded(text, integer, text);
drop function if exists public.courier_start_delivery(text, integer);
drop function if exists public.courier_complete_delivery(text, integer, text);

create or replace function public.courier_confirm_delivery(p_order_id text, p_proof_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_me text := private.current_staff_employee_id();
  v_actor text;
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.current_staff_role() is distinct from 'courier' or v_me is null then
    raise exception 'COURIER_REQUIRED' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.delivery_courier_employee_id is distinct from v_me then
    raise exception 'ORDER_NOT_ASSIGNED_TO_COURIER' using errcode = '42501';
  end if;
  if v_order.fulfillment <> 'delivery' or v_order.status <> 'delivering' then
    raise exception 'ORDER_NOT_DELIVERING' using errcode = '22023';
  end if;
  if v_order.delivery_proof_photo_path is not null then
    raise exception 'DELIVERY_ALREADY_CONFIRMED' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_proof_path, '')), '') is null
     or p_proof_path not like v_order.id || '/proof-%'
     or not exists (
       select 1 from storage.objects so
       where so.bucket_id = 'order-delivery-proofs' and so.name = p_proof_path
     ) then
    raise exception 'DELIVERY_PROOF_REQUIRED' using errcode = '22023';
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Kurir') into v_actor
  from public.staff_access_profiles where user_id = (select auth.uid()) and is_active = true limit 1;

  update public.orders
  set delivery_proof_photo_path = p_proof_path,
      delivery_proof_uploaded_at = v_now
  where id = v_order.id
  returning * into v_order;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
  values ('activity_' || replace(gen_random_uuid()::text, '-', ''), v_order.id, 'status',
          'Kurir ' || v_actor || ' mengonfirmasi pesanan sudah diantar (foto bukti terima tersimpan).', v_actor, v_now,
          jsonb_build_object('courierEmployeeId', v_me));

  perform private.notify_roles(
    array['owner','admin'], v_order.branch_id, 'delivery_confirmed', 'info',
    'Kurir konfirmasi selesai antar',
    v_order.order_number || ' · ' || v_actor || ' · tandai terkirim',
    'order', v_order.id, 'order', v_order.order_number
  );

  return jsonb_build_object('orderId', v_order.id, 'revision', v_order.revision, 'status', v_order.status,
                            'deliveryProofUploadedAt', v_order.delivery_proof_uploaded_at);
end;
$$;

create or replace function public.courier_confirm_delivery_guarded(p_order_id text, p_proof_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.courier_confirm_delivery(p_order_id, p_proof_path);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm, hint = 'Reload the order before trying again.';
end;
$$;

revoke execute on function public.courier_confirm_delivery(text, text) from public, anon, authenticated;
revoke execute on function public.courier_confirm_delivery_guarded(text, text) from public, anon;
grant execute on function public.courier_confirm_delivery_guarded(text, text) to authenticated;

-- Replace the notification kinds of the previous design.
create or replace function private.notification_kind_allowed_for_role(p_role text, p_kind text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_kind='authorization_changed' then return p_role is not null; end if;
  if p_kind='delivery_assigned' then return p_role='courier'; end if;
  if p_kind='delivery_confirmed' then return p_role in ('owner','admin'); end if;
  -- Owner request 6 Nov 2026: customer birthdays go to every Admin.
  if p_kind='customer_birthday' then return p_role='admin'; end if;

  if p_kind in ('order_received','finance_rejected','order_change_resolved') then
    return private.has_action_permission_for_role(p_role,'orders.read_all');
  end if;
  if p_kind='order_assigned' then
    return private.has_action_permission_for_role(p_role,'orders.read_assigned')
      or private.has_action_permission_for_role(p_role,'orders.read_all');
  end if;
  if p_kind in ('order_pending_verification','admin_resubmitted') then
    return private.has_action_permission_for_role(p_role,'finance.verify_order');
  end if;
  if p_kind='order_change_requested' then
    return private.has_action_permission_for_role(p_role,'orders.resolve_change_request');
  end if;

  if p_kind='payroll_submitted' then
    return private.has_action_permission_for_role(p_role,'finance.view_payroll');
  end if;
  if p_kind in ('payroll_rejected','payroll_approved','payroll_paid') then
    return private.has_action_permission_for_role(p_role,'hr.create_payroll_proposal')
      or private.has_action_permission_for_role(p_role,'hr.edit_payroll_proposal')
      or private.has_action_permission_for_role(p_role,'hr.resolve_rejected_employee');
  end if;

  return false;
end;
$$;

commit;
