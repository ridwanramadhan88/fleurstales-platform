-- Catalog PR 2 Product Editor atomic-save smoke coverage.
do $$
declare
  v_source text;
begin
  select pg_get_functiondef('public.replace_catalog_snapshot(bigint,jsonb,jsonb)'::regprocedure)
  into v_source;

  if position('validate_catalog_snapshot_payload' in v_source) = 0 then
    raise exception 'Catalog snapshot lost aggregate validation';
  end if;

  if position('delete from public.product_variant_flower_recipes' in v_source) = 0
     or position('insert into public.product_variant_flower_recipes' in v_source) = 0 then
    raise exception 'Catalog snapshot does not atomically replace flower recipes';
  end if;

  if position('delete from public.product_images where product_id=v_product_id' in v_source) = 0
     or position('insert into public.product_images' in v_source) = 0 then
    raise exception 'Catalog snapshot does not atomically replace product/variant image metadata';
  end if;

  if position('CATALOG_CONFLICT' in v_source) = 0
     or position('for update' in lower(v_source)) = 0 then
    raise exception 'Catalog snapshot lost revision conflict locking';
  end if;

  if (
    length(v_source) - length(replace(v_source, 'v_next_revision := v_current_revision+1', ''))
  ) / length('v_next_revision := v_current_revision+1') <> 1 then
    raise exception 'Catalog snapshot must increment the revision exactly once';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.replace_catalog_snapshot(bigint,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated Catalog editors cannot execute the atomic snapshot RPC';
  end if;
end;
$$;
