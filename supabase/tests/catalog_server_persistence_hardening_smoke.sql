-- Catalog PR 1B server privacy and invariant smoke coverage.
do $$
declare
  v_catalog_source text;
  v_size_source text;
begin
  if not has_table_privilege('anon','public.product_variant_flower_recipes','SELECT') then
    raise exception 'anon cannot read customer-facing variant flower recipes';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'product_variant_flower_recipes'
      and c.relrowsecurity
  ) then
    raise exception 'Variant flower recipe RLS must remain enabled';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_variant_flower_recipes'
      and policyname = 'product_variant_flower_recipes_public_read'
      and cmd = 'SELECT'
      and 'anon' = any(roles)
      and 'authenticated' = any(roles)
      and qual ilike '%active%'
      and qual ilike '%archived_at%'
      and qual ilike '%is_active%'
  ) then
    raise exception 'Storefront recipe read policy is missing active/archive guards';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='product_variant_costs'
      and policyname='variant_costs_owner_finance_read'
      and qual ilike '%owner%'
      and qual ilike '%finance%'
  ) then
    raise exception 'Owner/Finance Cost RLS policy is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.product_variants'::regclass
      and conname='product_variants_active_positive_price_check'
  ) then
    raise exception 'Sellable variant positive-price constraint is missing';
  end if;

  if to_regprocedure('private.validate_catalog_snapshot_payload(jsonb)') is null then
    raise exception 'Catalog invariant validator is missing';
  end if;

  select pg_get_functiondef('public.replace_catalog_snapshot(bigint,jsonb,jsonb)'::regprocedure)
  into v_catalog_source;

  if position('validate_catalog_snapshot_payload' in v_catalog_source) = 0
     or position('has_section_access' in v_catalog_source) = 0
     or position('costIdr' in v_catalog_source) = 0 then
    raise exception 'Catalog snapshot RPC lost validation/authority/Cost preservation';
  end if;

  select pg_get_functiondef('public.replace_size_guide_library(jsonb,jsonb)'::regprocedure)
  into v_size_source;

  if position('SIZE_GUIDE_REFERENCED_CHILD_CANNOT_BE_REMOVED' in v_size_source) = 0
     or position('SIZE_GUIDE_ACTIVE_CHILD_CANNOT_BE_ARCHIVED' in v_size_source) = 0
     or position('has_section_access' in v_size_source) = 0 then
    raise exception 'Size Template RPC lost reference/archive/authority guards';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.validate_catalog_snapshot_payload(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Catalog invariant helper is directly executable by browser roles';
  end if;
end;
$$;
