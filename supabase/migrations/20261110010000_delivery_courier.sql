-- D4: Courier accounts (role "courier" / "Kurir").
-- - New staff role with fixed, minimal access (Dashboard "Tugas antar" only).
-- - Internal-courier assignment on the shipment, assigned-orders-only RLS.
-- - Courier start/complete RPCs, private proof-of-delivery photo (internal only,
--   never exposed through the public tracking RPC).

begin;

-- ---------------------------------------------------------------------------
-- Role plumbing
-- ---------------------------------------------------------------------------
alter table public.staff_access_profiles drop constraint if exists staff_access_profiles_role_check;
alter table public.staff_access_profiles add constraint staff_access_profiles_role_check
  check (role in ('owner','admin','finance','hr','florist','courier'));
alter table private.role_section_permissions drop constraint if exists role_section_permissions_role_check;
alter table private.role_section_permissions add constraint role_section_permissions_role_check
  check (role in ('owner','admin','finance','hr','florist','courier'));
alter table private.role_action_permissions drop constraint if exists role_action_permissions_role_check;
alter table private.role_action_permissions add constraint role_action_permissions_role_check
  check (role in ('owner','admin','finance','hr','florist','courier'));

-- Courier access is fixed: Dashboard only. No configurable action capabilities.
insert into private.role_section_permissions(role, section, access_level) values
  ('courier','dashboard','view'),('courier','orders','none'),('courier','stock','none'),
  ('courier','catalog','none'),('courier','customers','none'),('courier','revenue','none'),
  ('courier','finance','none'),('courier','hr','none'),('courier','scheduling','none'),
  ('courier','settings','none')
on conflict (role, section) do nothing;

-- Make the role available to Owner in Settings > Staff roles (Owner can still turn it off).
update private.internal_settings_state
set staff_roles = jsonb_set(staff_roles, '{roles}', (staff_roles->'roles') || '"courier"'::jsonb)
where id = 'primary'
  and jsonb_typeof(staff_roles->'roles') = 'array'
  and not (staff_roles->'roles') ? 'courier';

drop policy if exists branches_authenticated_read on public.branches;
create policy branches_authenticated_read on public.branches
for select to authenticated
using (
  is_active = true
  or private.has_staff_role(array['owner','admin','finance','hr','florist','courier'])
);

-- ---------------------------------------------------------------------------
-- Order columns
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists delivery_courier_employee_id text,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_proof_photo_path text,
  add column if not exists delivery_proof_uploaded_at timestamptz;

create index if not exists orders_delivery_courier_idx
  on public.orders(delivery_courier_employee_id)
  where delivery_courier_employee_id is not null;

-- Courier reads only orders assigned to them (and their items).
drop policy if exists orders_courier_read on public.orders;
create policy orders_courier_read on public.orders
for select to authenticated
using (
  private.current_staff_role() = 'courier'
  and delivery_courier_employee_id is not null
  and delivery_courier_employee_id = private.current_staff_employee_id()
);

drop policy if exists order_items_courier_read on public.order_items;
create policy order_items_courier_read on public.order_items
for select to authenticated
using (
  private.current_staff_role() = 'courier'
  and exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.delivery_courier_employee_id is not null
      and o.delivery_courier_employee_id = private.current_staff_employee_id()
  )
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
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
  if p_kind='order_delivered' then return p_role in ('owner','admin'); end if;
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

-- ---------------------------------------------------------------------------
-- Private proof-of-delivery bucket (internal only)
-- ---------------------------------------------------------------------------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('order-delivery-proofs', 'order-delivery-proofs', false, 307200,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 307200,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create or replace function private.can_write_delivery_proof_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = split_part(coalesce(p_object_name,''), '/', 1)
      and (
        (private.current_staff_role() = 'courier'
          and o.status = 'delivering'
          and o.delivery_courier_employee_id is not null
          and o.delivery_courier_employee_id = private.current_staff_employee_id())
        or (private.current_staff_role() in ('owner','admin')
          and private.has_action_permission('orders.advance_status')
          and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id))
      )
  )
$$;

create or replace function private.can_read_delivery_proof_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = split_part(coalesce(p_object_name,''), '/', 1)
      and (
        (private.current_staff_role() = 'courier'
          and o.delivery_courier_employee_id is not null
          and o.delivery_courier_employee_id = private.current_staff_employee_id())
        or (private.current_staff_role() in ('owner','admin')
          and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id))
      )
  )
$$;
revoke execute on function private.can_write_delivery_proof_object(text) from public, anon;
revoke execute on function private.can_read_delivery_proof_object(text) from public, anon;
grant execute on function private.can_write_delivery_proof_object(text) to authenticated;
grant execute on function private.can_read_delivery_proof_object(text) to authenticated;

drop policy if exists order_delivery_proofs_insert on storage.objects;
drop policy if exists order_delivery_proofs_select on storage.objects;
drop policy if exists order_delivery_proofs_delete on storage.objects;
create policy order_delivery_proofs_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'order-delivery-proofs' and private.can_write_delivery_proof_object(name));
create policy order_delivery_proofs_select on storage.objects
for select to authenticated
using (bucket_id = 'order-delivery-proofs' and private.can_read_delivery_proof_object(name));
create policy order_delivery_proofs_delete on storage.objects
for delete to authenticated
using (bucket_id = 'order-delivery-proofs' and private.can_write_delivery_proof_object(name));

-- ---------------------------------------------------------------------------
-- Courier RPCs
-- ---------------------------------------------------------------------------
create or replace function public.courier_start_delivery(p_order_id text, p_expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_me text := private.current_staff_employee_id();
  v_actor text;
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
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode = '40001';
  end if;
  if v_order.fulfillment <> 'delivery' or v_order.status <> 'ready' then
    raise exception 'ORDER_NOT_READY_FOR_DELIVERY' using errcode = '22023';
  end if;
  if v_order.payment_status in ('unpaid','partial') then
    raise exception 'OUTSTANDING_PAYMENT_BLOCKS_FULFILLMENT' using errcode = '22023';
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Kurir') into v_actor
  from public.staff_access_profiles where user_id = (select auth.uid()) and is_active = true limit 1;

  update public.orders
  set status = 'delivering', delivery_started_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
  values ('activity_' || replace(gen_random_uuid()::text, '-', ''), v_order.id, 'status',
          'Kurir ' || v_actor || ' mulai mengantar pesanan.', v_actor, now(),
          jsonb_build_object('from', 'ready', 'to', 'delivering', 'courierEmployeeId', v_me));

  return jsonb_build_object('orderId', v_order.id, 'revision', v_order.revision, 'status', v_order.status,
                            'deliveryStartedAt', v_order.delivery_started_at);
end;
$$;

create or replace function public.courier_complete_delivery(p_order_id text, p_expected_revision integer, p_proof_path text)
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
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode = '40001';
  end if;
  if v_order.fulfillment <> 'delivery' or v_order.status <> 'delivering' then
    raise exception 'ORDER_NOT_DELIVERING' using errcode = '22023';
  end if;
  if v_order.payment_status in ('unpaid','partial') then
    raise exception 'OUTSTANDING_PAYMENT_BLOCKS_FULFILLMENT' using errcode = '22023';
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
  set status = 'delivered',
      completed_at = v_now,
      delivery_proof_photo_path = p_proof_path,
      delivery_proof_uploaded_at = v_now
  where id = v_order.id
  returning * into v_order;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
  values ('activity_' || replace(gen_random_uuid()::text, '-', ''), v_order.id, 'status',
          'Pesanan terkirim oleh kurir ' || v_actor || ' (foto bukti terima tersimpan).', v_actor, v_now,
          jsonb_build_object('from', 'delivering', 'to', 'delivered', 'courierEmployeeId', v_me));

  perform private.sync_order_finance_transactions(v_order.id);
  perform private.sync_order_contribution_points(v_order.id);

  perform private.notify_roles(
    array['owner','finance'], v_order.branch_id, 'order_pending_verification', 'warning',
    'Ready for reconciliation',
    v_order.order_number || ' · ' || coalesce(v_order.customer_name_snapshot, 'Customer'),
    'order', v_order.id, 'finance_orders', v_order.order_number
  );
  perform private.notify_roles(
    array['owner','admin'], v_order.branch_id, 'order_delivered', 'info',
    'Pesanan terkirim',
    v_order.order_number || ' · diantar ' || v_actor,
    'order', v_order.id, 'order', v_order.order_number
  );

  return jsonb_build_object('orderId', v_order.id, 'revision', v_order.revision, 'status', v_order.status,
                            'completedAt', v_order.completed_at);
end;
$$;

create or replace function public.courier_start_delivery_guarded(p_order_id text, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.courier_start_delivery(p_order_id, p_expected_revision);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm, hint = 'Reload the order before trying again.';
end;
$$;

create or replace function public.courier_complete_delivery_guarded(p_order_id text, p_expected_revision integer, p_proof_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.courier_complete_delivery(p_order_id, p_expected_revision, p_proof_path);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm, hint = 'Reload the order before trying again.';
end;
$$;

revoke execute on function public.courier_start_delivery(text,integer) from public, anon, authenticated;
revoke execute on function public.courier_complete_delivery(text,integer,text) from public, anon, authenticated;
revoke execute on function public.courier_start_delivery_guarded(text,integer) from public, anon;
revoke execute on function public.courier_complete_delivery_guarded(text,integer,text) from public, anon;
grant execute on function public.courier_start_delivery_guarded(text,integer) to authenticated;
grant execute on function public.courier_complete_delivery_guarded(text,integer,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Shipment save: internal courier account + role-aware helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_order_shipment(p_order_id text, p_expected_revision integer, p_shipment jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_before public.orders%rowtype;
  v_actor text;
  v_provider text := lower(trim(coalesce(p_shipment->>'provider', '')));
  v_courier text := nullif(trim(coalesce(p_shipment->>'courierName', '')), '');
  v_url text := nullif(trim(coalesce(p_shipment->>'trackingUrl', '')), '');
  v_cost bigint;
  v_finance jsonb;
  v_courier_emp text := nullif(trim(coalesce(p_shipment->>'courierEmployeeId', '')), '');
  v_emp jsonb;
  v_courier_id text := null;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.current_staff_role() is null or private.current_staff_role() not in ('owner', 'admin') then
    raise exception 'ORDER_SHIPMENT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if v_provider not in ('gojek', 'internal') then
    raise exception 'DELIVERY_PROVIDER_INVALID' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode = '40001';
  end if;
  if v_order.fulfillment <> 'delivery' then raise exception 'ORDER_NOT_DELIVERY' using errcode = '22023'; end if;
  if v_order.status not in ('ready', 'delivering') then
    raise exception 'ORDER_SHIPMENT_LOCKED' using errcode = '22023';
  end if;

  if v_provider = 'gojek' then
    begin
      v_cost := nullif(trim(coalesce(p_shipment->>'actualCostIdr', '')), '')::bigint;
    exception when others then
      raise exception 'DELIVERY_COST_INVALID' using errcode = '22023';
    end;
    if v_cost is null or v_cost < 0 or v_cost > 100000000 then
      raise exception 'DELIVERY_COST_INVALID' using errcode = '22023';
    end if;
    if v_url is not null and (char_length(v_url) > 500 or v_url !~* '^https://') then
      raise exception 'DELIVERY_TRACKING_URL_INVALID' using errcode = '22023';
    end if;
    v_courier := null;
    v_courier_emp := null;
  else
    if v_courier is not null and char_length(v_courier) > 120 then
      raise exception 'DELIVERY_COURIER_NAME_TOO_LONG' using errcode = '22023';
    end if;
    v_cost := null;
    v_url := null;
    if v_courier_emp is not null then
      select employee into v_emp
      from private.operational_domain_state state,
           lateral jsonb_array_elements(coalesce(state.snapshot->'employees', '[]'::jsonb)) employee
      where state.domain = 'hr' and employee->>'id' = v_courier_emp
      limit 1;
      if v_emp is null
         or coalesce(v_emp->>'status', '') <> 'active'
         or coalesce(v_emp->>'systemRole', '') <> 'courier'
         or not exists (
           select 1 from public.staff_access_profiles sap
           where sap.employee_id = v_courier_emp and sap.role = 'courier' and sap.is_active = true
         ) then
        raise exception 'ACTIVE_COURIER_REQUIRED' using errcode = '22023';
      end if;
      if v_order.status = 'delivering'
         and v_order.delivery_courier_employee_id is not null
         and v_order.delivery_courier_employee_id is distinct from v_courier_emp then
        raise exception 'DELIVERY_COURIER_LOCKED' using errcode = '22023';
      end if;
      v_courier_id := v_courier_emp;
      v_courier := coalesce(nullif(trim(v_emp->>'name'), ''), v_courier_emp);
    elsif v_order.status = 'delivering' and v_order.delivery_courier_employee_id is not null then
      raise exception 'DELIVERY_COURIER_LOCKED' using errcode = '22023';
    end if;
  end if;

  v_before := v_order;
  select coalesce(nullif(trim(sap.display_name), ''), sap.role) into v_actor
  from public.staff_access_profiles sap
  where sap.user_id = (select auth.uid()) and sap.is_active = true limit 1;

  update public.orders set
    delivery_provider = v_provider,
    delivery_courier_name = v_courier,
    delivery_courier_employee_id = v_courier_id,
    delivery_actual_cost_idr = v_cost,
    delivery_tracking_url = v_url,
    delivery_shipped_at = coalesce(delivery_shipped_at, now())
  where id = v_order.id;

  v_finance := private.sync_delivery_courier_expense(v_order.id, v_actor);

  if v_courier_id is not null and v_courier_id is distinct from v_before.delivery_courier_employee_id then
    insert into public.staff_notifications(recipient_user_id, recipient_employee_id, kind, severity, title, message, branch_id, entity_type, entity_id, target, target_id)
    select sap.user_id, sap.employee_id, 'delivery_assigned', 'info', 'Tugas antar baru',
           v_order.order_number || ' · ' || coalesce(v_order.recipient_name, v_order.customer_name_snapshot, 'Penerima'),
           v_order.branch_id, 'order', v_order.id, 'order', v_order.order_number
    from public.staff_access_profiles sap
    where sap.employee_id = v_courier_id and sap.role = 'courier' and sap.is_active = true
      and sap.user_id is distinct from (select auth.uid());
  end if;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
  values (
    'activity_' || replace(gen_random_uuid()::text, '-', ''), v_order.id, 'fulfillment',
    case when v_provider = 'gojek'
      then 'Pengiriman Gojek dicatat, ongkos asli ' || private.format_idr(v_cost) || '.'
      else 'Pengiriman kurir internal dicatat' || coalesce(' (' || v_courier || ')', '') || '.' end,
    v_actor, now(),
    jsonb_build_object(
      'before', jsonb_build_object('provider', v_before.delivery_provider, 'courierName', v_before.delivery_courier_name, 'courierEmployeeId', v_before.delivery_courier_employee_id,
        'actualCostIdr', v_before.delivery_actual_cost_idr, 'trackingUrl', v_before.delivery_tracking_url),
      'after', jsonb_build_object('provider', v_provider, 'courierName', v_courier, 'courierEmployeeId', v_courier_id,
        'actualCostIdr', v_cost, 'trackingUrl', v_url),
      'finance', v_finance
    )
  );

  select * into v_order from public.orders where id = v_order.id;
  return jsonb_build_object(
    'orderId', v_order.id, 'revision', v_order.revision,
    'deliveryProvider', v_order.delivery_provider,
    'deliveryCourierName', v_order.delivery_courier_name,
    'deliveryCourierEmployeeId', v_order.delivery_courier_employee_id,
    'deliveryActualCostIdr', v_order.delivery_actual_cost_idr,
    'deliveryTrackingUrl', v_order.delivery_tracking_url,
    'financeRecorded', coalesce((v_finance->>'recorded')::boolean, false),
    'financeReason', v_finance->>'reason'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.enabled_staff_roles()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array(
    select jsonb_array_elements_text(coalesce(s.staff_roles->'roles','[]'::jsonb))
    from private.internal_settings_state s where s.id='primary'
  ), array['owner','admin','finance','hr','florist','courier']::text[])
$function$;

CREATE OR REPLACE FUNCTION private.section_role_eligible(p_role text, p_section text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_role
    when 'owner' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','hr','scheduling','settings')
    when 'admin' then p_section in ('dashboard','orders','stock','catalog','customers')
    when 'finance' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','finance')
    when 'hr' then p_section in ('dashboard','orders','customers','hr','scheduling')
    when 'florist' then p_section in ('dashboard','customers')
    when 'courier' then p_section in ('dashboard')
    else false
  end
$function$;

CREATE OR REPLACE FUNCTION private.staff_employee_role_label(p_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_role
    when 'owner' then 'Owner'
    when 'admin' then 'Admin'
    when 'finance' then 'Finance'
    when 'hr' then 'HR'
    when 'florist' then 'Florist'
    when 'courier' then 'Kurir'
    else p_role
  end
$function$;

CREATE OR REPLACE FUNCTION public.can_invite_staff_role(p_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_role text := private.current_staff_role();
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
begin
  if (select auth.uid()) is null or v_actor_role is null then return false; end if;
  if p_role not in ('admin','finance','hr','florist','courier') or not (p_role = any(v_enabled)) then return false; end if;
  if v_actor_role='owner' then return true; end if;
  return v_actor_role='hr'
    and private.has_action_permission('hr.create_employee')
    and p_role = any(v_managed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_operational_roster(p_date date, p_branch_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.current_staff_role() not in ('owner','admin','hr') then raise exception 'ROSTER_ACCESS_REQUIRED' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'employeeId',sap.employee_id,'displayName',sap.display_name,'role',sap.role,
      'profileBranchId',sap.branch_id,'defaultSchedule',d.days,
      'override',o.shift,'overrideNote',o.note,'overrideWorkMode',o.work_mode,
      'attendance',case when a.record is null then null else a.record - 'selfieDataUrl' - 'checkOutSelfieDataUrl' end
    ) order by sap.display_name)
    from public.staff_access_profiles sap
    left join public.staff_schedule_defaults d on d.employee_id=sap.employee_id
    left join public.staff_schedule_overrides o on o.employee_id=sap.employee_id and o.schedule_date=p_date
    left join public.staff_attendance_records a on a.employee_id=sap.employee_id and a.attendance_date=p_date
    where sap.is_active=true
      and sap.role in ('admin','florist','courier')
      and (p_branch_id is null or coalesce(o.shift->>'branchId',sap.branch_id)=p_branch_id)
  ),'[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_attendance_record(p_record jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_now timestamptz := now();
  v_date date := timezone('Asia/Jakarta',v_now)::date;
  v_current time := timezone('Asia/Jakarta',v_now)::time;
  v_record_date date;
  v_is_checkout boolean := nullif(p_record->>'checkOutSelfieDataUrl','') is not null;
  v_path text;
  v_shift jsonb;
  v_existing jsonb;
  v_scheduled_end time;
  v_checkout_window integer;
  v_minutes_until_end integer;
begin
  select *
  into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid())
    and is_active=true
    and role in ('admin','florist','courier')
  limit 1;

  if not found then
    raise exception 'SELF_ATTENDANCE_ROLE_REQUIRED' using errcode='42501';
  end if;

  begin
    v_record_date := nullif(p_record->>'date','')::date;
  exception when others then
    raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023';
  end;

  if v_record_date is distinct from v_date then
    raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023';
  end if;

  select shift
  into v_shift
  from public.staff_schedule_overrides
  where employee_id=v_profile.employee_id
    and schedule_date=v_date;

  if v_shift is null
    or not coalesce((v_shift->>'isWorking')::boolean,false)
    or nullif(v_shift->>'branchId','') is null
  then
    raise exception 'DATED_ATTENDANCE_SCHEDULE_REQUIRED' using errcode='22023';
  end if;

  v_path := case
    when v_is_checkout then nullif(p_record->>'checkOutSelfieDataUrl','')
    else nullif(p_record->>'selfieDataUrl','')
  end;

  if v_path is null
    or not private.attendance_selfie_object_is_valid(
      v_path,
      v_profile.employee_id,
      v_date,
      case when v_is_checkout then 'checkout' else 'checkin' end
    )
  then
    raise exception 'ATTENDANCE_SELFIE_OBJECT_REQUIRED' using errcode='22023';
  end if;

  if exists(
    select 1
    from public.staff_attendance_records ar
    where (ar.record->>'selfieDataUrl'=v_path or ar.record->>'checkOutSelfieDataUrl'=v_path)
      and not(ar.employee_id=v_profile.employee_id and ar.attendance_date=v_date)
  ) then
    raise exception 'ATTENDANCE_SELFIE_ALREADY_USED' using errcode='23505';
  end if;

  if v_is_checkout then
    select record
    into v_existing
    from public.staff_attendance_records
    where employee_id=v_profile.employee_id
      and attendance_date=v_date;

    if v_existing is null or nullif(v_existing->>'checkInAt','') is null then
      raise exception 'CHECKOUT_REQUIRES_EXISTING_CHECKIN' using errcode='22023';
    end if;

    v_scheduled_end := coalesce(
      nullif(v_existing->'checkInLocation'->>'scheduledEndTime','')::time,
      nullif(v_shift->>'endTime','')::time
    );

    select coalesce((attendance->>'checkoutGraceMinutes')::integer,30)
    into v_checkout_window
    from private.internal_settings_state
    where id='primary';

    if v_scheduled_end is null then
      raise exception 'DATED_ATTENDANCE_SCHEDULE_REQUIRED' using errcode='22023';
    end if;

    v_minutes_until_end := floor(extract(epoch from (v_scheduled_end - v_current)) / 60);
    if v_scheduled_end <= '04:00'::time and v_current >= '12:00'::time then
      v_minutes_until_end := v_minutes_until_end + 24 * 60;
    end if;

    if v_minutes_until_end > greatest(0,v_checkout_window) then
      raise exception 'CHECKOUT_NOT_YET_AVAILABLE' using errcode='22023';
    end if;
  end if;

  return public.save_my_attendance_record_v310_internal(p_record);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_attendance_record_v310_internal(p_record jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile public.staff_access_profiles%rowtype; v_existing jsonb; v_now timestamptz:=now(); v_date date:=timezone('Asia/Jakarta',v_now)::date;
  v_location jsonb; v_lat double precision; v_lng double precision; v_accuracy double precision; v_radius integer; v_grace integer;
  v_branch public.branches%rowtype; v_distance integer; v_day text:=lower(trim(to_char(v_date,'FMDay'))); v_shift jsonb; v_override jsonb; v_defaults jsonb;
  v_schedule_branch text; v_start time; v_end time; v_is_working boolean:=false; v_current time:=timezone('Asia/Jakarta',v_now)::time;
  v_mismatch boolean:=false; v_review_reason text; v_status text; v_evidence jsonb; v_safe jsonb; v_state private.operational_domain_state%rowtype; v_records jsonb; v_revision bigint;
  v_is_checkout boolean:=nullif(p_record->>'checkOutSelfieDataUrl','') is not null;
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true and role in ('admin','florist','courier') limit 1;
  if not found then raise exception 'SELF_ATTENDANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  if nullif(p_record->>'date','')::date is distinct from v_date then raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023'; end if;
  select record into v_existing from public.staff_attendance_records where employee_id=v_profile.employee_id and attendance_date=v_date for update;

  if v_is_checkout then
    if v_existing is null or nullif(v_existing->>'checkInAt','') is null then raise exception 'CHECKOUT_REQUIRES_EXISTING_CHECKIN' using errcode='22023'; end if;
    if nullif(v_existing->>'checkOutAt','') is not null then return jsonb_build_object('record',v_existing,'revision',null,'updatedAt',v_now); end if;
    if nullif(p_record->>'checkOutSelfieDataUrl','') is null or p_record->>'checkOutSelfieDataUrl' not like v_profile.employee_id||'/%' then raise exception 'VALID_CHECKOUT_SELFIE_PATH_REQUIRED' using errcode='22023'; end if;
    v_location:=p_record->'checkOutLocation';
  else
    if v_existing is not null then raise exception 'ATTENDANCE_ALREADY_RECORDED' using errcode='23505'; end if;
    if nullif(p_record->>'selfieDataUrl','') is null or p_record->>'selfieDataUrl' not like v_profile.employee_id||'/%' then raise exception 'VALID_CHECKIN_SELFIE_PATH_REQUIRED' using errcode='22023'; end if;
    v_location:=p_record->'checkInLocation';
  end if;
  if jsonb_typeof(v_location)<>'object' then raise exception 'LOCATION_REQUIRED' using errcode='22023'; end if;
  v_lat:=(v_location->>'latitude')::double precision; v_lng:=(v_location->>'longitude')::double precision; v_accuracy:=greatest(0,coalesce((v_location->>'accuracyMeters')::double precision,0));
  if v_lat not between -90 and 90 or v_lng not between -180 and 180 then raise exception 'INVALID_LOCATION' using errcode='22023'; end if;
  select coalesce((attendance->>'locationRadiusMeters')::integer,100),coalesce((attendance->>'lateGraceMinutes')::integer,10) into v_radius,v_grace from private.internal_settings_state where id='primary';
  select * into v_branch
  from public.branches b where b.is_active=true and b.latitude is not null and b.longitude is not null
  order by private.geo_distance_meters(v_lat,v_lng,b.latitude,b.longitude) limit 1;
  if not found then raise exception 'NO_BRANCH_LOCATION_CONFIGURED' using errcode='55000'; end if;
  v_distance:=private.geo_distance_meters(v_lat,v_lng,v_branch.latitude,v_branch.longitude);
  if v_distance>v_radius then raise exception 'OUTSIDE_ATTENDANCE_RADIUS' using errcode='22023'; end if;

  select shift into v_override from public.staff_schedule_overrides where employee_id=v_profile.employee_id and schedule_date=v_date;
  select days into v_defaults from public.staff_schedule_defaults where employee_id=v_profile.employee_id;
  v_shift:=coalesce(v_override,v_defaults->v_day,(select scheduling->'defaultWeeklySchedule'->v_day from private.internal_settings_state where id='primary'),'{}'::jsonb);
  v_is_working:=coalesce((v_shift->>'isWorking')::boolean,false);
  v_schedule_branch:=coalesce(nullif(v_shift->>'branchId',''),v_profile.branch_id);
  v_start:=nullif(v_shift->>'startTime','')::time; v_end:=nullif(v_shift->>'endTime','')::time;
  v_mismatch:=not v_is_working or (v_schedule_branch is not null and v_schedule_branch<>v_branch.id) or v_accuracy>v_radius*4 or (v_start is not null and v_end is not null and (v_current<v_start or v_current>v_end));
  v_review_reason:=concat_ws(' ',case when not v_is_working then 'Recorded on a scheduled day off.' end,case when v_schedule_branch is not null and v_schedule_branch<>v_branch.id then 'Detected branch differs from scheduled branch.' end,case when v_accuracy>v_radius*4 then 'GPS accuracy requires HR review.' end,case when v_start is not null and v_end is not null and (v_current<v_start or v_current>v_end) then 'Recorded outside the scheduled shift.' end);
  v_status:=case when v_is_working and v_start is not null and v_current>v_start+(v_grace||' minutes')::interval then 'late' else 'present' end;
  v_evidence:=jsonb_build_object('latitude',v_lat,'longitude',v_lng,'accuracyMeters',round(v_accuracy),'branchLatitude',v_branch.latitude,'branchLongitude',v_branch.longitude,'distanceMeters',v_distance,'acceptedRadiusMeters',v_radius,'withinRange',true,'detectedBranchId',v_branch.id,'detectedBranchName',v_branch.name,'scheduledBranchId',v_schedule_branch,'scheduledStartTime',case when v_start is null then null else to_char(v_start,'HH24:MI') end,'scheduledEndTime',case when v_end is null then null else to_char(v_end,'HH24:MI') end,'branchMismatch',v_schedule_branch is not null and v_schedule_branch<>v_branch.id,'scheduleMismatch',v_mismatch,'reviewStatus',case when v_mismatch then 'pending_review' else 'not_required' end,'reviewReason',nullif(v_review_reason,''));

  if v_is_checkout then
    v_safe:=v_existing||jsonb_build_object('checkOutAt',v_now,'checkOutSelfieDataUrl',p_record->>'checkOutSelfieDataUrl','checkOutLocation',v_evidence,'actor',v_profile.display_name)||jsonb_strip_nulls(jsonb_build_object('checkOutReason',case when p_record->>'checkOutReason' in ('overtime','late_checkout') then p_record->>'checkOutReason' end,'checkOutReasonNote',left(nullif(trim(p_record->>'checkOutReasonNote'),''),300)));
  else
    v_safe:=jsonb_build_object('id','att-'||replace(gen_random_uuid()::text,'-',''),'employeeId',v_profile.employee_id,'date',v_date,'status',v_status,'actor',v_profile.display_name,'createdAt',v_now,'selfieDataUrl',p_record->>'selfieDataUrl','checkInAt',v_now,'source','selfie','checkInLocation',v_evidence);
  end if;

  insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record,updated_at)
  values(v_safe->>'id',v_profile.employee_id,v_date,v_safe->>'status',v_safe,now())
  on conflict(employee_id,attendance_date) do update set status=excluded.status,record=excluded.record,updated_at=now();

  select * into v_state from private.operational_domain_state where domain='hr' for update;
  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
    values('hr',1,jsonb_build_object('attendance',jsonb_build_array(v_safe)),(select auth.uid()),now())
    returning revision into v_revision;
  else
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_records from jsonb_array_elements(coalesce(v_state.snapshot->'attendance','[]'::jsonb)) e(value) where not(value->>'employeeId'=v_profile.employee_id and value->>'date'=v_date::text);
    v_records:=coalesce(v_records,'[]'::jsonb)||jsonb_build_array(v_safe);
    update private.operational_domain_state set revision=revision+1,snapshot=jsonb_set(coalesce(snapshot,'{}'::jsonb),'{attendance}',v_records,true),updated_by=(select auth.uid()),updated_at=now() where domain='hr' returning revision into v_revision;
  end if;
  perform private.write_audit_event('attendance.self_service','attendance',v_safe->>'id','succeeded',null,v_revision,v_existing,v_safe);
  perform private.write_business_activity('hr',v_safe->>'id',v_branch.id,'attendance_recorded','Staff attendance was recorded.',jsonb_build_object('activityScope','attendance','employeeId',v_profile.employee_id,'date',v_date));
  return jsonb_build_object('record',v_safe,'revision',v_revision,'updatedAt',now());
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_runtime_context(p_scheduled_branch_id text, p_operational_branch_id text, p_operational_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := private.current_staff_role();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_session_id uuid := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  v_previous_operational text;
begin
  if (select auth.uid()) is null or v_role is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_session_id is null then
    raise exception 'AUTH_SESSION_REQUIRED' using errcode='42501';
  end if;
  if p_operational_date <> v_today then
    raise exception 'RUNTIME_CONTEXT_DATE_MUST_BE_TODAY' using errcode='22023';
  end if;

  -- Branch-scoped staff still require a real active operational branch. This
  -- is an RLS/workspace scope, not proof that they were scheduled to work.
  if v_role in ('admin','florist','courier') and p_operational_branch_id is null then
    raise exception 'OPERATIONAL_BRANCH_REQUIRED' using errcode='22023';
  end if;
  if p_scheduled_branch_id is not null and not exists(
    select 1 from public.branches
    where id=p_scheduled_branch_id and is_active=true
  ) then
    raise exception 'INVALID_SCHEDULED_BRANCH' using errcode='22023';
  end if;
  if p_operational_branch_id is not null and not exists(
    select 1 from public.branches
    where id=p_operational_branch_id and is_active=true
  ) then
    raise exception 'INVALID_OPERATIONAL_BRANCH' using errcode='22023';
  end if;

  select operational_branch_id into v_previous_operational
  from private.staff_runtime_context
  where session_id=v_session_id
    and user_id=(select auth.uid())
    and operational_date=p_operational_date;

  insert into private.staff_runtime_context(
    session_id,user_id,operational_date,scheduled_branch_id,operational_branch_id,updated_at
  )
  values (
    v_session_id,(select auth.uid()),p_operational_date,p_scheduled_branch_id,p_operational_branch_id,now()
  )
  on conflict(session_id) do update
  set user_id=excluded.user_id,
      operational_date=excluded.operational_date,
      scheduled_branch_id=excluded.scheduled_branch_id,
      operational_branch_id=excluded.operational_branch_id,
      updated_at=excluded.updated_at;

  if v_previous_operational is distinct from p_operational_branch_id then
    perform private.write_business_activity(
      'hr',v_session_id::text,p_operational_branch_id,'operational_branch_changed',
      'Staff operational branch changed.',
      jsonb_build_object(
        'activityScope','staff_runtime',
        'sessionId',v_session_id,
        'scheduledBranchId',p_scheduled_branch_id,
        'previousOperationalBranchId',v_previous_operational,
        'operationalBranchId',p_operational_branch_id
      )
    );
  end if;

  return jsonb_build_object(
    'sessionId',v_session_id,
    'scheduledBranchId',p_scheduled_branch_id,
    'operationalBranchId',p_operational_branch_id,
    'operationalDate',p_operational_date,
    'updatedAt',now()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.on_authorization_state_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.revision is distinct from old.revision then
    perform private.write_business_activity(
      'authorization','primary',null,'permissions_updated',
      'Owner updated role permissions and feature settings',
      jsonb_build_object('revision',new.revision)
    );
    perform private.notify_roles(
      array['admin','finance','hr','florist','courier'],null,'authorization_changed','info',
      'Access settings updated','Your Fleurstales access settings were updated.',
      'authorization','primary',null,null
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_staff_access_profile(p_employee_id text, p_display_name text, p_role text, p_is_active boolean, p_branch_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_role text := private.current_staff_role();
  v_target public.staff_access_profiles%rowtype;
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_role not in ('owner','admin','finance','hr','florist','courier') then raise exception 'INVALID_STAFF_ROLE' using errcode='22023'; end if;
  if p_role <> 'owner' and not (p_role = any(v_enabled)) then raise exception 'STAFF_ROLE_DISABLED' using errcode='42501'; end if;
  select * into v_target from public.staff_access_profiles where employee_id=p_employee_id for update;
  if not found then return null; end if;

  if v_actor_role <> 'owner' then
    if not private.has_action_permission('hr.edit_employee') then raise exception 'STAFF_EDIT_FORBIDDEN' using errcode='42501'; end if;
    if not (v_target.role = any(v_managed)) or not (p_role = any(v_managed)) then
      raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode='42501';
    end if;
  end if;

  if v_target.role='owner' and (p_role<>'owner' or p_is_active is not true) and
     (select count(*) from public.staff_access_profiles where role='owner' and is_active=true and user_id<>v_target.user_id) = 0 then
    raise exception 'LAST_ACTIVE_OWNER_PROTECTED' using errcode='42501';
  end if;

  update public.staff_access_profiles
  set display_name=trim(p_display_name), role=p_role, is_active=p_is_active, branch_id=p_branch_id, updated_at=now()
  where user_id=v_target.user_id
  returning * into v_target;

  perform private.write_business_activity(
    'staff_access',p_employee_id,p_branch_id,'staff_access_synced','Staff login access synchronized with HR.',
    jsonb_build_object('role',p_role,'isActive',p_is_active)
  );

  return jsonb_build_object('userId',v_target.user_id,'employeeId',v_target.employee_id,'displayName',v_target.display_name,'role',v_target.role,'branchId',v_target.branch_id,'isActive',v_target.is_active);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_staff_access_profile(p_employee_id text, p_display_name text, p_role text, p_is_active boolean, p_branch_id text DEFAULT NULL::text, p_username text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_role text := private.current_staff_role();
  v_target public.staff_access_profiles%rowtype;
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
  v_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_role not in ('owner','admin','finance','hr','florist','courier') then raise exception 'INVALID_STAFF_ROLE' using errcode='22023'; end if;
  if p_role <> 'owner' and not (p_role = any(v_enabled)) then raise exception 'STAFF_ROLE_DISABLED' using errcode='42501'; end if;
  if v_username is not null and v_username !~ '^[a-z][a-z0-9._-]*$' then raise exception 'INVALID_STAFF_USERNAME' using errcode='22023'; end if;
  select * into v_target from public.staff_access_profiles where employee_id=p_employee_id for update;
  if not found then return null; end if;
  if v_actor_role <> 'owner' then
    if not private.has_action_permission('hr.edit_employee') then raise exception 'STAFF_EDIT_FORBIDDEN' using errcode='42501'; end if;
    if not (v_target.role = any(v_managed)) or not (p_role = any(v_managed)) then raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode='42501'; end if;
  end if;
  if v_target.role='owner' and (p_role<>'owner' or p_is_active is not true) and
     (select count(*) from public.staff_access_profiles where role='owner' and is_active=true and user_id<>v_target.user_id) = 0 then
    raise exception 'LAST_ACTIVE_OWNER_PROTECTED' using errcode='42501';
  end if;
  if v_username is not null and exists (select 1 from public.staff_access_profiles where lower(username)=v_username and user_id<>v_target.user_id) then
    raise exception 'STAFF_USERNAME_IN_USE' using errcode='23505';
  end if;
  update public.staff_access_profiles
  set display_name=trim(p_display_name), role=p_role, username=v_username, is_active=p_is_active, branch_id=p_branch_id, updated_at=now()
  where user_id=v_target.user_id returning * into v_target;
  perform private.write_business_activity(
    'hr', p_employee_id, p_branch_id, 'staff_access_synced',
    'Staff login access synchronized with HR.',
    jsonb_build_object('role',p_role,'username',v_username,'isActive',p_is_active)
  );
  return jsonb_build_object(
    'userId',v_target.user_id,'employeeId',v_target.employee_id,
    'displayName',v_target.display_name,'role',v_target.role,
    'username',v_target.username,'branchId',v_target.branch_id,
    'isActive',v_target.is_active
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.service_create_staff_access_profile(p_user_id uuid, p_employee_id text, p_email text, p_username text, p_display_name text, p_role text, p_branch_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  if p_user_id is null or nullif(trim(coalesce(p_employee_id,'')),'') is null then raise exception 'INVALID_STAFF_IDENTITY' using errcode='22023'; end if;
  if p_role not in ('admin','finance','hr','florist','courier') then raise exception 'INVALID_PROVISIONED_STAFF_ROLE' using errcode='22023'; end if;
  if v_username !~ '^[a-z][a-z0-9._-]*$' then raise exception 'INVALID_STAFF_USERNAME' using errcode='22023'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_STAFF_EMAIL' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null then raise exception 'INVALID_STAFF_DISPLAY_NAME' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'AUTH_USER_REQUIRED' using errcode='23503'; end if;

  insert into public.staff_access_profiles(user_id,employee_id,email,username,display_name,role,branch_id,is_active,created_at,updated_at)
  values(p_user_id,trim(p_employee_id),v_email,v_username,trim(p_display_name),p_role,p_branch_id,true,now(),now())
  returning * into v_profile;

  return jsonb_build_object(
    'userId',v_profile.user_id,'employeeId',v_profile.employee_id,'email',v_profile.email,
    'username',v_profile.username,'displayName',v_profile.display_name,'role',v_profile.role,
    'branchId',v_profile.branch_id,'isActive',v_profile.is_active
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_staff_employee(p_employee_id text, p_patch jsonb, p_require_login boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_role text := private.current_staff_role();
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_key text;
  v_current jsonb;
  v_next jsonb;
  v_profile public.staff_access_profiles%rowtype;
  v_has_profile boolean := false;
  v_role text;
  v_username text;
  v_email text;
  v_status text;
  v_actor_name text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_revision bigint;
  v_changed text[] := array[]::text[];
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_actor_role not in ('owner', 'hr') or not private.has_action_permission('hr.edit_employee') then
    raise exception 'STAFF_EDIT_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(v_patch) <> 'object' then raise exception 'INVALID_STAFF_UPDATE' using errcode = '22023'; end if;
  for v_key in select jsonb_object_keys(v_patch) loop
    if v_key not in ('name', 'phone', 'hireDate', 'systemRole', 'username', 'email', 'status') then
      raise exception 'INVALID_STAFF_UPDATE_KEY:%', v_key using errcode = '22023';
    end if;
  end loop;

  perform 1 from private.operational_domain_state where domain = 'hr' for update;
  select e into v_current
  from private.operational_domain_state s, jsonb_array_elements(coalesce(s.snapshot->'employees', '[]'::jsonb)) e
  where s.domain = 'hr' and e->>'id' = p_employee_id
  limit 1;
  if v_current is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_profile from public.staff_access_profiles where employee_id = p_employee_id for update;
  v_has_profile := found;
  if p_require_login and not v_has_profile then raise exception 'STAFF_LOGIN_NOT_FOUND' using errcode = 'P0002'; end if;

  if coalesce(v_current->>'systemRole', '') = 'owner' or (v_has_profile and v_profile.role = 'owner') then
    raise exception 'OWNER_PROFILE_PROTECTED' using errcode = '42501';
  end if;
  if v_actor_role = 'hr' and not (coalesce(v_current->>'systemRole', '') = any(v_managed)) then
    raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  -- HR may change role, username and email only inside its managed roles
  -- (same rule as the OS screen); Owner may assign any enabled non-owner role.
  if v_actor_role = 'hr' and v_patch ? 'systemRole' and not ((v_patch->>'systemRole') = any(v_managed)) then
    raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  v_next := v_current - 'pin';

  if v_patch ? 'name' then
    if nullif(trim(coalesce(v_patch->>'name', '')), '') is null then raise exception 'INVALID_STAFF_DISPLAY_NAME' using errcode = '22023'; end if;
    v_next := v_next || jsonb_build_object('name', trim(v_patch->>'name'));
  end if;
  if v_patch ? 'phone' then
    if trim(coalesce(v_patch->>'phone', '')) <> '' and trim(v_patch->>'phone') !~ '^\+?[0-9][0-9 ()-]{7,19}$' then
      raise exception 'INVALID_STAFF_PHONE' using errcode = '22023';
    end if;
    v_next := v_next || jsonb_build_object('phone', trim(coalesce(v_patch->>'phone', '')));
  end if;
  if v_patch ? 'hireDate' then
    if coalesce(v_patch->>'hireDate', '') !~ '^\d{4}-\d{2}-\d{2}$' or (v_patch->>'hireDate')::date > v_today then
      raise exception 'INVALID_STAFF_HIRE_DATE' using errcode = '22023';
    end if;
    v_next := v_next || jsonb_build_object('hireDate', v_patch->>'hireDate');
  end if;
  if v_patch ? 'systemRole' then
    v_role := v_patch->>'systemRole';
    if v_role is distinct from v_current->>'systemRole' then
      if v_role not in ('admin', 'finance', 'hr', 'florist', 'courier') or not (v_role = any(v_enabled)) then
        raise exception 'STAFF_ROLE_DISABLED' using errcode = '42501';
      end if;
    end if;
    v_next := v_next || jsonb_build_object('systemRole', v_role, 'position', private.staff_employee_role_label(v_role));
  end if;
  if v_patch ? 'username' then
    v_username := lower(trim(coalesce(v_patch->>'username', '')));
    if v_username !~ '^[a-z][a-z0-9._-]*$' then raise exception 'INVALID_STAFF_USERNAME' using errcode = '22023'; end if;
    if exists (select 1 from public.staff_access_profiles where lower(username) = v_username and employee_id <> p_employee_id)
       or exists (
         select 1 from private.operational_domain_state s, jsonb_array_elements(coalesce(s.snapshot->'employees', '[]'::jsonb)) e
         where s.domain = 'hr' and e->>'id' <> p_employee_id and lower(coalesce(e->>'username', '')) = v_username
       ) then
      raise exception 'USERNAME_ALREADY_IN_USE' using errcode = '23505';
    end if;
    v_next := v_next || jsonb_build_object('username', v_username);
  end if;
  if v_patch ? 'email' then
    v_email := lower(trim(coalesce(v_patch->>'email', '')));
    if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_STAFF_EMAIL' using errcode = '22023'; end if;
    if exists (select 1 from public.staff_access_profiles where lower(email) = v_email and employee_id <> p_employee_id)
       or exists (
         select 1 from private.operational_domain_state s, jsonb_array_elements(coalesce(s.snapshot->'employees', '[]'::jsonb)) e
         where s.domain = 'hr' and e->>'id' <> p_employee_id and lower(coalesce(e->>'email', '')) = v_email
       ) then
      raise exception 'EMAIL_ALREADY_IN_USE' using errcode = '23505';
    end if;
    v_next := v_next || jsonb_build_object('email', v_email);
  end if;
  if v_patch ? 'status' then
    v_status := v_patch->>'status';
    if v_status not in ('active', 'inactive') then raise exception 'INVALID_STAFF_STATUS' using errcode = '22023'; end if;
    if v_status is distinct from v_current->>'status' then
      if v_status = 'inactive' then
        select display_name into v_actor_name from public.staff_access_profiles where user_id = (select auth.uid());
        v_next := v_next || jsonb_build_object(
          'status', 'inactive',
          'employmentEndDate', coalesce(v_current->>'employmentEndDate', v_today::text),
          'separationReason', coalesce(v_current->>'separationReason', 'Employee deactivated'),
          'separatedAt', coalesce(v_current->>'separatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          'separatedBy', coalesce(v_current->>'separatedBy', nullif(trim(coalesce(v_actor_name, '')), ''), 'HR')
        );
      else
        -- Reactivation starts a new employment state; payroll history keeps its
        -- own snapshots, so the stale end date must not carry forward.
        v_next := (v_next - 'employmentEndDate' - 'separationReason' - 'separatedAt' - 'separatedBy')
          || jsonb_build_object('status', 'active');
      end if;
    end if;
  end if;

  select coalesce(array_agg(k order by k), array[]::text[]) into v_changed
  from jsonb_object_keys(v_next) k
  where (v_next->k) is distinct from (v_current->k);
  select v_changed || coalesce(array_agg(k order by k), array[]::text[]) into v_changed
  from jsonb_object_keys(v_current) k
  where k <> 'pin' and not (v_next ? k);

  if v_has_profile then
    update public.staff_access_profiles
    set display_name = coalesce(v_next->>'name', display_name),
        role = coalesce(v_next->>'systemRole', role),
        username = coalesce(nullif(v_next->>'username', ''), username),
        email = coalesce(nullif(v_next->>'email', ''), email),
        is_active = case when v_patch ? 'status' then (v_next->>'status') = 'active' else is_active end,
        updated_at = now()
    where user_id = v_profile.user_id
    returning * into v_profile;

    if v_patch ? 'status' and (v_next->>'status') = 'inactive' then
      -- Deactivation ends existing sessions; the database already rejects an
      -- inactive profile, this also stops token refresh.
      delete from private.staff_runtime_context where user_id = v_profile.user_id;
      delete from auth.sessions where user_id = v_profile.user_id;
    end if;
  end if;

  if cardinality(v_changed) > 0 then
    v_revision := private.write_hr_employee_entry(v_next, false);
    perform private.write_business_activity(
      'hr', p_employee_id, nullif(v_next->>'branch', ''), 'staff_employee_updated',
      'Employee record and staff login updated together.',
      jsonb_build_object('changed', to_jsonb(v_changed), 'isActive', case when v_has_profile then v_profile.is_active end)
    );
  else
    select revision into v_revision from private.operational_domain_state where domain = 'hr';
  end if;

  return jsonb_build_object(
    'revision', v_revision,
    'employee', v_next,
    'previous', v_current - 'pin',
    'changed', to_jsonb(v_changed),
    'login', case when v_has_profile then jsonb_build_object(
      'userId', v_profile.user_id, 'email', v_profile.email, 'username', v_profile.username,
      'role', v_profile.role, 'isActive', v_profile.is_active
    ) end
  );
end;
$function$;

commit;
