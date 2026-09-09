begin;

-- Flower recipes are customer-facing catalog data and must be snapshotted into
-- each ordered line so Florist always sees the recipe that applied at purchase time.

alter table public.order_items
  add column if not exists flower_recipe_snapshot jsonb not null default '[]'::jsonb;

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
      and p.is_active = true
  )
);

create or replace function private.snapshot_order_item_flower_recipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_snapshot jsonb;
begin
  -- Operational saves upsert existing line ids. Preserve their historical
  -- snapshot even if Admin has since edited the live Catalog recipe.
  select flower_recipe_snapshot
  into v_existing_snapshot
  from public.order_items
  where id = new.id;

  if found then
    new.flower_recipe_snapshot := coalesce(v_existing_snapshot, '[]'::jsonb);
    return new;
  end if;

  if new.variant_id is null then
    new.flower_recipe_snapshot := '[]'::jsonb;
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'flowerName', r.flower_name,
        'quantity', r.quantity,
        'unit', r.unit
      )
      order by r.sort_order, r.id
    ),
    '[]'::jsonb
  )
  into new.flower_recipe_snapshot
  from public.product_variant_flower_recipes r
  where r.variant_id = new.variant_id;

  return new;
end;
$$;

drop trigger if exists trg_order_items_snapshot_flower_recipe on public.order_items;
create trigger trg_order_items_snapshot_flower_recipe
before insert on public.order_items
for each row
execute function private.snapshot_order_item_flower_recipe();

comment on column public.order_items.flower_recipe_snapshot is
  'Order-time snapshot of the selected variant flower recipe. Customer-facing and used by Florist as production reference.';

commit;
