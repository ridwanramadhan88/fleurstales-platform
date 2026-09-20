-- Flower recipe catalog authority and persistence smoke coverage.
do $$
declare
  v_source text;
begin
  if to_regclass('public.product_variant_flower_recipes') is null then
    raise exception 'Flower recipe table is missing';
  end if;

  if not has_table_privilege('anon','public.product_variant_flower_recipes','SELECT') then
    raise exception 'Storefront/anon cannot read customer-facing active flower recipes';
  end if;

  if not has_table_privilege('authenticated','public.product_variant_flower_recipes','SELECT') then
    raise exception 'Authenticated staff lost flower recipe table read grant';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='product_variant_flower_recipes'
      and policyname='product_variant_flower_recipes_catalog_read'
      and qual ilike '%owner%'
      and qual ilike '%admin%'
  ) then
    raise exception 'Flower recipe staff RLS is missing Owner/Admin scope';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='product_variant_flower_recipes'
      and policyname='product_variant_flower_recipes_public_read'
      and 'anon' = any(roles)
      and qual ilike '%status%'
      and qual ilike '%is_active%'
  ) then
    raise exception 'Scoped public flower recipe policy is missing active Product/variant guards';
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

  if position('has_section_access' in v_source) = 0
     or position('catalog' in v_source) = 0
     or position('catalog_sync_state' in v_source) = 0
     or position('flowerRecipe' in v_source) = 0 then
    raise exception 'Flower recipe replacement lost Catalog permission/revision/payload guards';
  end if;
end;
$$;
