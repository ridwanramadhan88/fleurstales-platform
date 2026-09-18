begin;

-- PR 1A data-safety backfill.
-- Before explicit template resolution, the Business OS silently used
-- "Bouquet Standard" whenever a product had no product/product-type target.
-- Preserve that existing behavior for products present at migration time by
-- making the relationship explicit. Future products are not auto-assigned.
do $$
declare
  v_default_template_id text;
begin
  select template.id
  into v_default_template_id
  from public.size_guide_templates template
  where lower(trim(template.name)) = lower('Bouquet Standard')
  order by template.created_at, template.id
  limit 1;

  if v_default_template_id is null then
    raise exception 'Catalog PR 1A backfill requires the Bouquet Standard size template.'
      using errcode = '23514';
  end if;

  insert into public.size_guide_targets (
    id,
    template_id,
    scope,
    product_id
  )
  select
    'guide_target_' || replace(gen_random_uuid()::text, '-', ''),
    v_default_template_id,
    'product',
    product.id
  from public.products product
  where not exists (
    select 1
    from public.size_guide_targets direct_target
    where direct_target.scope = 'product'
      and direct_target.product_id = product.id
  )
  and not exists (
    select 1
    from public.size_guide_targets type_target
    where type_target.scope = 'product_type'
      and type_target.product_type = product.product_type
  );

  if exists (
    select 1
    from public.products product
    where not exists (
      select 1
      from public.size_guide_targets direct_target
      where direct_target.scope = 'product'
        and direct_target.product_id = product.id
    )
    and not exists (
      select 1
      from public.size_guide_targets type_target
      where type_target.scope = 'product_type'
        and type_target.product_type = product.product_type
    )
  ) then
    raise exception 'Catalog PR 1A backfill left fallback-dependent products unresolved.'
      using errcode = '23514';
  end if;
end $$;

commit;
