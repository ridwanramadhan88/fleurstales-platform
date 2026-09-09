begin;

create table if not exists public.product_variant_flower_recipes (
  id text primary key,
  variant_id text not null references public.product_variants(id) on delete cascade,
  flower_name text not null check (length(trim(flower_name)) between 1 and 120),
  quantity numeric(10,2) not null check (quantity > 0),
  unit text not null check (unit in ('stem','bunch')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_variant_flower_recipes_variant
  on public.product_variant_flower_recipes(variant_id, sort_order, id);

alter table public.product_variant_flower_recipes enable row level security;
revoke all on table public.product_variant_flower_recipes from anon, authenticated;
grant select on table public.product_variant_flower_recipes to authenticated;

drop policy if exists product_variant_flower_recipes_catalog_read on public.product_variant_flower_recipes;
create policy product_variant_flower_recipes_catalog_read
on public.product_variant_flower_recipes
for select to authenticated
using (private.has_staff_role(array['owner','admin']));

create or replace function public.replace_catalog_flower_recipes(
  p_base_revision bigint,
  p_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_current_revision bigint;
  v_product jsonb;
  v_variant jsonb;
  v_recipe jsonb;
  v_variant_id text;
  v_recipe_id text;
  v_count integer := 0;
begin
  v_role := private.current_staff_role();
  if v_role is null or not (v_role = any(array['owner','admin'])) then
    raise exception 'Owner or Admin catalog access is required.' using errcode='42501';
  end if;

  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'p_products must be a JSON array.' using errcode='22023';
  end if;

  select revision into v_current_revision
  from public.catalog_sync_state
  where id='primary';

  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'CATALOG_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision
      using errcode='40001';
  end if;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    for v_variant in select value from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';
      if coalesce(v_variant_id,'') = '' then
        raise exception 'Catalog variant is missing id.' using errcode='22023';
      end if;

      delete from public.product_variant_flower_recipes where variant_id = v_variant_id;

      for v_recipe in
        select value from jsonb_array_elements(coalesce(v_variant->'flowerRecipe','[]'::jsonb))
      loop
        v_recipe_id := coalesce(nullif(v_recipe->>'id',''), 'flower_recipe_'||replace(gen_random_uuid()::text,'-',''));
        insert into public.product_variant_flower_recipes(
          id, variant_id, flower_name, quantity, unit, sort_order
        ) values (
          v_recipe_id,
          v_variant_id,
          trim(v_recipe->>'flowerName'),
          (v_recipe->>'quantity')::numeric,
          coalesce(nullif(v_recipe->>'unit',''),'stem'),
          coalesce((v_recipe->>'sortOrder')::integer, v_count)
        );
        v_count := v_count + 1;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('recipeCount', v_count);
end;
$$;

revoke all on function public.replace_catalog_flower_recipes(bigint,jsonb) from public;
grant execute on function public.replace_catalog_flower_recipes(bigint,jsonb) to authenticated;

commit;
