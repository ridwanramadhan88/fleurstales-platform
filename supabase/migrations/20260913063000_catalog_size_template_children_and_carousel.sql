begin;

-- Persist reusable sellable sizes as first-class data on each size-guide
-- category. `name` remains customer/admin-facing text only.
alter table public.size_guide_templates
  add column if not exists sizes jsonb not null default '[]'::jsonb;

alter table public.size_guide_templates
  drop constraint if exists size_guide_templates_sizes_array_check;

alter table public.size_guide_templates
  add constraint size_guide_templates_sizes_array_check
  check (jsonb_typeof(sizes) = 'array');

comment on column public.size_guide_templates.sizes is
  'Reusable sellable sub-sizes for this size-guide category, stored as [{id,name}, ...].';

-- Remove metadata left by unreleased/preview builds that encoded child sizes
-- inside the visible template name. Production names stay clean from here on.
update public.size_guide_templates
set name = trim(split_part(name, '|||sizes:', 1)),
    updated_at = now()
where position('|||sizes:' in name) > 0;

create or replace function public.replace_size_guide_library(
  p_templates jsonb,
  p_targets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template jsonb;
  v_target jsonb;
  v_role text;
  v_storage_path text;
  v_sizes jsonb;
begin
  v_role := private.current_staff_role();
  if v_role is null or not (v_role = any(array['owner','admin'])) then
    raise exception 'Owner or Admin catalog access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_templates) <> 'array' or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'Size guide templates and targets must be JSON arrays.' using errcode = '22023';
  end if;

  delete from public.size_guide_targets where id is not null;
  delete from public.size_guide_templates where id is not null;

  for v_template in select value from jsonb_array_elements(p_templates)
  loop
    v_storage_path := coalesce(
      nullif(v_template->>'storagePath', ''),
      'logical/' || (v_template->>'id') || '.jpg'
    );
    v_sizes := coalesce(v_template->'sizes', '[]'::jsonb);
    if jsonb_typeof(v_sizes) <> 'array' then
      raise exception 'Size guide template sizes must be a JSON array.' using errcode = '22023';
    end if;

    insert into public.size_guide_templates (
      id, name, sizes, storage_path, mime_type, byte_size, width, height, created_at, updated_at
    ) values (
      v_template->>'id',
      trim(v_template->>'name'),
      v_sizes,
      v_storage_path,
      coalesce(v_template->>'mimeType', 'image/jpeg'),
      coalesce((v_template->>'byteSize')::integer, 0),
      coalesce((v_template->>'width')::integer, 800),
      coalesce((v_template->>'height')::integer, 800),
      coalesce((v_template->>'createdAt')::timestamptz, now()),
      coalesce((v_template->>'updatedAt')::timestamptz, now())
    );
  end loop;

  for v_target in select value from jsonb_array_elements(p_targets)
  loop
    insert into public.size_guide_targets (
      id, template_id, scope, product_type, product_id
    ) values (
      v_target->>'id',
      v_target->>'templateId',
      v_target->>'scope',
      nullif(v_target->>'productType', ''),
      nullif(v_target->>'productId', '')
    );
  end loop;

  return jsonb_build_object(
    'templateCount', jsonb_array_length(p_templates),
    'targetCount', jsonb_array_length(p_targets)
  );
end;
$$;

revoke all on function public.replace_size_guide_library(jsonb, jsonb) from public;
grant execute on function public.replace_size_guide_library(jsonb, jsonb) to authenticated;

-- Current rollout default: every available product uses Bouquet Standard and
-- the reusable Small / Medium / Large size set. Medium is the active canonical
-- size until an Admin chooses another size in the Catalog editor.
do $$
declare
  v_template_id text;
  v_product record;
begin
  select id
  into v_template_id
  from public.size_guide_templates
  where lower(trim(name)) = lower('Bouquet Standard')
  order by created_at, id
  limit 1;

  if v_template_id is null then
    v_template_id := 'guide_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.size_guide_templates (
      id, name, sizes, storage_path, mime_type, byte_size, width, height
    ) values (
      v_template_id,
      'Bouquet Standard',
      jsonb_build_array(
        jsonb_build_object('id', 'bouquet-standard-small', 'name', 'Small'),
        jsonb_build_object('id', 'bouquet-standard-medium', 'name', 'Medium'),
        jsonb_build_object('id', 'bouquet-standard-large', 'name', 'Large')
      ),
      'logical/bouquet-standard.jpg',
      'image/jpeg',
      0,
      800,
      800
    );
  else
    update public.size_guide_templates
    set name = 'Bouquet Standard',
        sizes = jsonb_build_array(
          jsonb_build_object('id', 'bouquet-standard-small', 'name', 'Small'),
          jsonb_build_object('id', 'bouquet-standard-medium', 'name', 'Medium'),
          jsonb_build_object('id', 'bouquet-standard-large', 'name', 'Large')
        ),
        updated_at = now()
    where id = v_template_id;
  end if;

  delete from public.size_guide_targets target
  where target.scope = 'product'
    and target.product_id in (select id from public.products where is_active = true);

  for v_product in
    select id from public.products where is_active = true order by sort_order, id
  loop
    insert into public.size_guide_targets(id, template_id, scope, product_id)
    values(
      'guide_target_' || replace(gen_random_uuid()::text, '-', ''),
      v_template_id,
      'product',
      v_product.id
    );
  end loop;
end $$;

-- Preserve permanent SKU/order history while giving each current product one
-- canonical active Medium variant. Extra historical size rows remain inactive.
with ranked_variants as (
  select
    variant.id,
    row_number() over (
      partition by variant.product_id
      order by (variant.status = 'active') desc, variant.sort_order, variant.id
    ) as variant_rank
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where product.is_active = true
)
update public.product_variants variant
set size = case when ranked.variant_rank = 1 then 'Medium' else variant.size end,
    status = case when ranked.variant_rank = 1 then 'active' else 'inactive' end,
    updated_at = now()
from ranked_variants ranked
where variant.id = ranked.id
  and (
    (ranked.variant_rank = 1 and (variant.size <> 'Medium' or variant.status <> 'active'))
    or (ranked.variant_rank > 1 and variant.status <> 'inactive')
  );

-- Force any already-open stale editor to reload instead of writing the old
-- free-text size snapshot back over this rollout.
update public.catalog_sync_state
set revision = revision + 1,
    updated_at = now(),
    updated_by = null
where id = 'primary';

commit;
