-- Run after migrations on a real Supabase/Postgres project.
begin;

do $$
begin
  if to_regprocedure('private.allocate_order_number(text,timestamp with time zone)') is null then
    raise exception 'Missing private.allocate_order_number';
  end if;
  if to_regprocedure('public.create_storefront_order(text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text)') is null then
    raise exception 'Missing Phase 8 create_storefront_order signature';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_quantity_max_99') then
    raise exception 'Missing order item quantity ceiling';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_discount_not_above_subtotal') then
    raise exception 'Missing order discount ceiling';
  end if;
end;
$$;

rollback;
