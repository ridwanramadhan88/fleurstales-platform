begin;

-- Flower recipes are intentionally customer-facing per size variant. Cost stays
-- private; only recipe rows attached to an active, non-archived Product and
-- active, non-archived variant are readable by Storefront clients.
grant select on table public.product_variant_flower_recipes to anon, authenticated;

drop policy if exists product_variant_flower_recipes_public_read on public.product_variant_flower_recipes;
create policy product_variant_flower_recipes_public_read
on public.product_variant_flower_recipes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = product_variant_flower_recipes.variant_id
      and v.status = 'active'
      and v.archived_at is null
      and p.is_active = true
      and p.archived_at is null
  )
);

comment on table public.product_variant_flower_recipes is
  'Variant-owned flower recipe. Publicly readable only for active Storefront products/variants; order lines retain immutable purchase-time snapshots.';

commit;
