-- Flower recipe catalog authority and persistence smoke coverage.
do $$
declare
  v_source text;
begin
  if to_regclass('public.product_variant_flower_recipes') is null then
    raise exception 'Flower recipe table is missing';
  end if;

  if not has_table_privilege('anon','public.product_variant_flower_recipes','SELECT') then
    raise exception 'Customer-facing flower recipes must be readable by Storefront';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.replace_catalog_flower_recipes(bigint,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Catalog editors cannot save flower recipes';
  end if;

  select pg_get_functiondef('public.replace_catalog_flower_recipes(bigint,jsonb)'::regprocedure)
  into v_source;

  if position('owner' in lower(v_source)) = 0
     or position('admin' in lower(v_source)) = 0
     or position('catalog_sync_state' in v_source) = 0
     or position('flowerRecipe' in v_source) = 0 then
    raise exception 'Flower recipe replacement lost role/revision/payload guards';
  end if;
end;
$$;
