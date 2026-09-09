-- Customer-facing Resep Bunga and immutable order snapshot coverage.
do $$
declare
  v_trigger_source text;
begin
  if to_regclass('public.product_variant_flower_recipes') is null then
    raise exception 'Flower recipe table is missing';
  end if;

  if not has_table_privilege('anon','public.product_variant_flower_recipes','SELECT') then
    raise exception 'Storefront cannot read active flower recipes';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='order_items'
      and column_name='flower_recipe_snapshot'
  ) then
    raise exception 'Order item flower recipe snapshot column is missing';
  end if;

  select pg_get_functiondef('private.snapshot_order_item_flower_recipe()'::regprocedure)
  into v_trigger_source;

  if position('product_variant_flower_recipes' in v_trigger_source) = 0
     or position('flower_recipe_snapshot' in v_trigger_source) = 0
     or position('public.order_items' in v_trigger_source) = 0 then
    raise exception 'Order flower recipe snapshot trigger lost catalog or preservation logic';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid='public.order_items'::regclass
      and tgname='trg_order_items_snapshot_flower_recipe'
      and not tgisinternal
  ) then
    raise exception 'Order flower recipe snapshot trigger is missing';
  end if;
end;
$$;
