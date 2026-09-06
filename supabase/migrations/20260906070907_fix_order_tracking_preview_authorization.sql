-- The WhatsApp preview used the nonexistent orders.view capability.
-- Use the same row visibility boundary as Orders RLS (all/assigned access).
set local lock_timeout = '2s';
set local statement_timeout = '10s';

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

  select o.public_tracking_id::text into v_tracking_id
  from public.orders o
  where o.id = p_order_id
    and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id);

  if not found then
    raise exception 'ORDER_VIEW_NOT_PERMITTED' using errcode='42501';
  end if;
  return v_tracking_id;
end;
$$;

-- Keep this staff-only; tracking keys remain subject to order row visibility.
revoke all on function public.get_order_tracking_id(text) from public, anon;
grant execute on function public.get_order_tracking_id(text) to authenticated, service_role;
notify pgrst, 'reload schema';
