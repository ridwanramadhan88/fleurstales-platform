-- Florists may upload the finished-arrangement photo for orders assigned to them
-- while the order is in Processing. Status changes stay Owner/Admin only
-- (V3.8 read-only contract is unchanged); transfer proofs stay Owner/Admin only.

begin;

create or replace function private.can_write_order_finish_photo_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = split_part(coalesce(p_object_name,''), '/', 1)
      and (
        (
          private.current_staff_role() in ('owner','admin')
          and private.has_action_permission('orders.advance_status')
          and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
        )
        or (
          private.current_staff_role() = 'florist'
          and o.status = 'processing'
          and o.florist_assigned_employee_id is not null
          and o.florist_assigned_employee_id = private.current_staff_employee_id()
        )
      )
  )
$$;
revoke execute on function private.can_write_order_finish_photo_object(text) from public, anon;
grant execute on function private.can_write_order_finish_photo_object(text) to authenticated;

drop policy if exists order_finish_photos_storage_insert on storage.objects;
drop policy if exists order_finish_photos_storage_delete on storage.objects;

create policy order_finish_photos_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'order-finish-photos'
  and private.can_write_order_finish_photo_object(name)
);

create policy order_finish_photos_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'order-finish-photos'
  and private.can_write_order_finish_photo_object(name)
);

create or replace function public.attach_order_finish_photo(
  p_order_id text,
  p_expected_revision integer,
  p_finish_photo_url text,
  p_uploaded_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_role text := private.current_staff_role();
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;

  if v_role in ('owner','admin') then
    if not private.has_action_permission('orders.advance_status') then
      raise exception 'FINISH_PHOTO_NOT_PERMITTED' using errcode='42501';
    end if;
  elsif v_role = 'florist' then
    if v_order.florist_assigned_employee_id is null
       or v_order.florist_assigned_employee_id is distinct from private.current_staff_employee_id() then
      raise exception 'FINISH_PHOTO_NOT_PERMITTED' using errcode='42501';
    end if;
  else
    raise exception 'FINISH_PHOTO_NOT_PERMITTED' using errcode='42501';
  end if;

  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.status <> 'processing' then
    raise exception 'FINISH_PHOTO_REQUIRES_PROCESSING_ORDER' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_finish_photo_url,'')),'') is null
     or position('/storage/v1/object/public/order-finish-photos/' || v_order.id || '/' in p_finish_photo_url) = 0 then
    raise exception 'FINISH_PHOTO_OBJECT_INVALID' using errcode='22023';
  end if;

  update public.orders
  set finish_photo_url=p_finish_photo_url,
      finish_photo_uploaded_by=nullif(trim(coalesce(p_uploaded_by,'')),''),
      finish_photo_uploaded_at=v_now,
      revision=revision+1,
      updated_at=v_now
  where id=v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'finishPhotoUrl',v_order.finish_photo_url,
    'finishPhotoUploadedAt',v_order.finish_photo_uploaded_at
  );
end;
$$;
revoke execute on function public.attach_order_finish_photo(text,integer,text,text) from public, anon, authenticated;
grant execute on function public.attach_order_finish_photo(text,integer,text,text) to service_role;

commit;
