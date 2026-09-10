begin;

-- A size-guide template can now exist before its optional visual guide is uploaded.
-- byte_size = 0 is the explicit marker for a logical sizing template without an image object yet.
alter table public.size_guide_templates
  drop constraint if exists size_guide_templates_byte_size_check;

alter table public.size_guide_templates
  add constraint size_guide_templates_byte_size_check
  check (byte_size between 0 and 102400);

comment on column public.size_guide_templates.byte_size is
  'JPEG byte size. Zero means the sizing template is logical-only and has no uploaded guide image yet.';

-- Keep the existing replacement contract compatible with logical-only templates.
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
begin
  v_role := private.current_staff_role();
  if v_role is null or not (v_role = any(array['owner','admin'])) then
    raise exception 'Owner or Admin catalog access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_templates) <> 'array' or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'Size guide templates and targets must be JSON arrays.' using errcode = '22023';
  end if;

  delete from public.size_guide_targets;
  delete from public.size_guide_templates;

  for v_template in select value from jsonb_array_elements(p_templates)
  loop
    v_storage_path := coalesce(
      nullif(v_template->>'storagePath', ''),
      'logical/' || (v_template->>'id') || '.jpg'
    );

    insert into public.size_guide_templates (
      id, name, storage_path, mime_type, byte_size, width, height, created_at, updated_at
    ) values (
      v_template->>'id',
      trim(v_template->>'name'),
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

-- Seed one canonical temporary template and attach every currently available
-- product to it. Product-level targets deliberately override any arrangement
-- type target without changing future products automatically.
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
      id, name, storage_path, mime_type, byte_size, width, height
    ) values (
      v_template_id,
      'Bouquet Standard',
      'logical/bouquet-standard.jpg',
      'image/jpeg',
      0,
      800,
      800
    );
  else
    update public.size_guide_templates
    set name = 'Bouquet Standard',
        updated_at = now()
    where id = v_template_id;
  end if;

  delete from public.size_guide_targets target
  where target.scope = 'product'
    and target.product_id in (
      select id from public.products where is_active = true
    );

  for v_product in
    select id
    from public.products
    where is_active = true
    order by sort_order, id
  loop
    insert into public.size_guide_targets (
      id, template_id, scope, product_id
    ) values (
      'guide_target_' || replace(gen_random_uuid()::text, '-', ''),
      v_template_id,
      'product',
      v_product.id
    );
  end loop;
end $$;

-- Every available product gets exactly one active canonical Medium variant.
-- Extra variants are retained as inactive rows so permanent SKU/order history
-- and their size-specific flower recipes remain intact.
with ranked_variants as (
  select
    variant.id,
    row_number() over (
      partition by variant.product_id
      order by variant.sort_order, variant.id
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

-- Force any already-open stale OS snapshot to conflict rather than silently
-- writing the old variant sizing back over this canonical backfill.
update public.catalog_sync_state
set revision = revision + 1,
    updated_at = now(),
    updated_by = null
where id = 'primary';

commit;
