-- Fleurstales V3.8 — Florist Order access is read-only.
-- Florists may read only Orders assigned to their staff identity, but cannot
-- advance, undo, complete, cancel, or otherwise mutate an Order.

begin;

update private.action_capability_registry
set allowed_roles = array['owner','admin']::text[]
where capability = 'orders.advance_status';

insert into private.role_action_permissions (role, capability, enabled, updated_at)
values ('florist', 'orders.advance_status', false, now())
on conflict (role, capability) do update
set enabled = excluded.enabled,
    updated_at = excluded.updated_at;

-- Preserve the complete V3.7 writer as an internal implementation, then add a
-- final public role boundary. Older internal validators still contain the
-- historical restricted-Florist transition branch, but authenticated clients
-- cannot execute any internal writer directly and can no longer reach it.
alter function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  rename to save_order_operational_state_v37_internal;

revoke execute on function public.save_order_operational_state_v37_internal(text,integer,integer,jsonb,jsonb,jsonb)
  from public, anon, authenticated;

create or replace function public.save_order_operational_state(
  p_order_id text,
  p_expected_revision integer,
  p_next_revision integer,
  p_state jsonb,
  p_items jsonb default '[]'::jsonb,
  p_payment_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid())
    and is_active = true
  limit 1;

  if not found then
    raise exception 'ORDER_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_profile.role = 'florist' then
    raise exception 'FLORIST_ORDER_READ_ONLY' using errcode = '42501';
  end if;

  if v_profile.role not in ('owner','admin','finance') then
    raise exception 'ORDER_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  return public.save_order_operational_state_v37_internal(
    p_order_id,
    p_expected_revision,
    p_next_revision,
    p_state,
    p_items,
    p_payment_events
  );
end;
$$;

revoke execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  from public, anon;
grant execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  to authenticated;

commit;
