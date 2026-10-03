-- Size charts (Size Templates) are now picked per product in the product editor.
-- Arrangement Type is only a label and no longer selects a chart, so:
-- 1. products that relied on their Arrangement Type default get that template as
--    their own explicit choice, so nothing they show changes;
-- 2. the Arrangement Type default targets are removed.
insert into public.size_guide_targets (id, template_id, scope, product_id)
select
  'guide_target_' || replace(gen_random_uuid()::text, '-', ''),
  type_target.template_id,
  'product',
  product.id
from public.products product
join public.size_guide_targets type_target
  on type_target.scope = 'product_type'
 and type_target.product_type = product.product_type
where not exists (
  select 1
  from public.size_guide_targets direct_target
  where direct_target.scope = 'product'
    and direct_target.product_id = product.id
);

delete from public.size_guide_targets where scope = 'product_type';
