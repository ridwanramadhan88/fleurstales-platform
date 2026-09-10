-- Run after migrations on a real Supabase/Postgres project.
-- Verifies the shared Storefront/Business OS scheduling contract is installed.
begin;

do $$
begin
  if to_regprocedure('public.get_unavailable_order_slots(text,date)') is null then
    raise exception 'Missing public.get_unavailable_order_slots(text,date)';
  end if;

  if to_regprocedure('private.enforce_order_schedule_capacity()') is null then
    raise exception 'Missing private.enforce_order_schedule_capacity()';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'orders_schedule_capacity_guard'
      and tgrelid = 'public.orders'::regclass
      and not tgisinternal
  ) then
    raise exception 'Missing orders_schedule_capacity_guard trigger';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'orders'
      and indexname = 'idx_orders_active_schedule_slot'
  ) then
    raise exception 'Missing idx_orders_active_schedule_slot index';
  end if;

  if not has_function_privilege('anon', 'public.get_unavailable_order_slots(text,date)', 'EXECUTE') then
    raise exception 'Anon storefront cannot read unavailable order slots';
  end if;

  if not has_function_privilege('authenticated', 'public.get_unavailable_order_slots(text,date)', 'EXECUTE') then
    raise exception 'Authenticated Business OS cannot read unavailable order slots';
  end if;
end;
$$;

rollback;
