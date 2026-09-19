-- Catalog PR 4: historical order safety, cart-related Catalog invariants,
-- authoritative audit, and permission-matrix integration.
do $$
declare
  v_catalog_source text;
  v_validator_source text;
  v_size_source text;
  v_snapshot_guard_source text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='products' and column_name='archived_at'
  ) then
    raise exception 'Products do not have a historical archive marker';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='product_variants' and column_name='archived_at'
  ) then
    raise exception 'Product variants do not have a historical archive marker';
  end if;

  select pg_get_functiondef('public.replace_catalog_snapshot(bigint,jsonb,jsonb)'::regprocedure)
  into v_catalog_source;

  if position('public.order_items' in v_catalog_source) = 0
     or position('oi.variant_id=pv.id' in replace(v_catalog_source,' ','')) = 0 then
    raise exception 'Catalog snapshot does not protect ordered variants from hard deletion';
  end if;

  if position('archived_at' in v_catalog_source) = 0
     or position('status=''inactive''' in v_catalog_source) = 0 then
    raise exception 'Ordered Catalog rows are not archived/inactivated';
  end if;

  select pg_get_functiondef('private.preserve_order_item_catalog_snapshot()'::regprocedure)
  into v_snapshot_guard_source;

  if position('unit_price_idr := old.unit_price_idr' in v_snapshot_guard_source) = 0
     or position('flower_recipe_snapshot := old.flower_recipe_snapshot' in v_snapshot_guard_source) = 0
     or position('variant_id is not distinct from new.variant_id' in v_snapshot_guard_source) = 0 then
    raise exception 'Order item Catalog snapshots are not immutable while variant identity is unchanged';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.order_items'::regclass
      and tgname='trg_order_items_preserve_catalog_snapshot'
      and not tgisinternal
  ) then
    raise exception 'Order item Catalog snapshot preservation trigger is missing';
  end if;

  select pg_get_functiondef('private.validate_catalog_snapshot_payload(jsonb)'::regprocedure)
  into v_validator_source;
  if position('CATALOG_HISTORICAL_SIZE_OPTION_MISSING' in v_validator_source) = 0 then
    raise exception 'Inactive historical Size Template identities cannot survive Arrangement Type review';
  end if;

  select pg_get_functiondef('public.replace_size_guide_library(jsonb,jsonb)'::regprocedure)
  into v_size_source;
  if position('SIZE_GUIDE_HISTORICAL_CHILD_CANNOT_BE_REMOVED' in v_size_source) = 0
     or position('catalog.size_template_assignments.update' in v_size_source) = 0 then
    raise exception 'Size Template historical identity or assignment audit contract is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.product_variants'::regclass
      and tgname='trg_catalog_variant_audit'
      and not tgisinternal
  ) then
    raise exception 'Variant price/status audit trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.product_variant_costs'::regclass
      and tgname='trg_catalog_variant_cost_audit'
      and not tgisinternal
  ) then
    raise exception 'Variant Cost audit trigger is missing';
  end if;

  -- Hard role-family Catalog eligibility must agree with the OS matrix.
  if private.section_role_eligible('owner','catalog') is not true
     or private.section_role_eligible('admin','catalog') is not true
     or private.section_role_eligible('finance','catalog') is not true
     or private.section_role_eligible('hr','catalog') is not false
     or private.section_role_eligible('florist','catalog') is not false then
    raise exception 'Catalog role-family eligibility drifted from the OS permission contract';
  end if;

  if private.section_access_for_role('owner','catalog') <> 'edit'
     or private.section_access_for_role('admin','catalog') <> 'edit'
     or private.section_access_for_role('finance','catalog') <> 'view'
     or private.section_access_for_role('hr','catalog') <> 'none'
     or private.section_access_for_role('florist','catalog') <> 'none' then
    raise exception 'Catalog section access drifted from the expected permission matrix';
  end if;

  if not exists (
    select 1 from private.action_capability_registry
    where capability='orders.read_all'
      and allowed_roles @> array['owner','admin','finance','hr']::text[]
      and not (allowed_roles @> array['florist']::text[])
  ) then
    raise exception 'Orders read-all role eligibility drifted';
  end if;

  if not exists (
    select 1 from private.action_capability_registry
    where capability='orders.read_assigned'
      and allowed_roles @> array['owner','florist']::text[]
      and cardinality(allowed_roles)=2
  ) then
    raise exception 'Assigned-work role eligibility drifted';
  end if;
end;
$$;
