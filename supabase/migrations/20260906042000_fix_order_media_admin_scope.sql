-- Align order lifecycle media writes with the current order permission model.
-- Admins and owners can read/advance orders across branches, so Storage media
-- writes must use the same authorization boundary instead of the retired
-- operational-branch equality check.

begin;

create or replace function private.can_write_order_media_object(p_object_name text)
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
      and private.current_staff_role() in ('owner','admin')
      and private.has_action_permission('orders.advance_status')
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  )
$$;

commit;
