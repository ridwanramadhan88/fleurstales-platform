begin;

-- A catalog product owns at most five ordered images, regardless of whether
-- metadata is written through the RPC or directly by a privileged migration.
create or replace function private.enforce_product_image_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_existing_count integer;
begin
  if tg_op = 'UPDATE' then
    select count(*)
      into v_existing_count
      from public.product_images image
     where image.product_id = new.product_id
       and image.id <> old.id;
  else
    select count(*)
      into v_existing_count
      from public.product_images image
     where image.product_id = new.product_id;
  end if;

  if v_existing_count >= 5 then
    raise exception 'A product can have at most 5 images.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists product_images_limit_five on public.product_images;
create trigger product_images_limit_five
before insert or update of product_id on public.product_images
for each row execute function private.enforce_product_image_limit();

-- Preserve the existing authorization/revision implementation behind a
-- stricter public contract that rejects a six-image request before mutation.
alter function public.replace_product_images_metadata(bigint, text, jsonb)
  rename to replace_product_images_metadata_internal;

revoke all on function public.replace_product_images_metadata_internal(bigint, text, jsonb)
  from public, anon, authenticated;

create function public.replace_product_images_metadata(
  p_base_revision bigint,
  p_product_id text,
  p_images jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_images) <> 'array' then
    raise exception 'p_images must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_images) > 5 then
    raise exception 'A product can have at most 5 images.' using errcode = '22023';
  end if;

  return public.replace_product_images_metadata_internal(
    p_base_revision,
    p_product_id,
    p_images
  );
end;
$$;

revoke all on function public.replace_product_images_metadata(bigint, text, jsonb)
  from public, anon;
grant execute on function public.replace_product_images_metadata(bigint, text, jsonb)
  to authenticated;

-- Turn the previous visual-only demo assignment into canonical product data.
-- Each product gets its own metadata row and unique path. The applications map
-- demo/* paths to their bundled transition assets; replacing an image in OS
-- writes a normal Storage path and removes this transition reference.
with ranked_products as (
  select
    product.id,
    product.product_code,
    product.name,
    product.product_type,
    row_number() over (order by product.product_code, product.id) - 1 as position
  from public.products product
  where not exists (
    select 1
    from public.product_images image
    where image.product_id = product.id
  )
),
assigned_images as (
  select
    ranked.*,
    case
      when ranked.product_code like 'GRD-%'
        then 'graduation-0' || ((ranked.position % 2) + 1)::text || '.jpg'
      when ranked.product_code like 'WED-%'
        then 'wedding-bridal-0' || ((ranked.position % 2) + 1)::text || '.jpg'
      when coalesce(ranked.product_type, '') ilike '%cake%'
        then 'flower-cake-0' || ((ranked.position % 3) + 1)::text || '.jpg'
      when ranked.name ilike '%thumbelina%'
        then 'thumbelina-0' || ((ranked.position % 2) + 1)::text || '.jpg'
      when coalesce(ranked.product_type, '') ilike any (array['%box%', '%basket%', '%vase%'])
        then 'box-basket-vase-0' || ((ranked.position % 4) + 1)::text || '.jpg'
      else 'dummy-bouquet-0' || ((ranked.position % 8) + 1)::text || '.jpg'
    end as filename
  from ranked_products ranked
)
insert into public.product_images (
  id,
  product_id,
  storage_path,
  alt_text,
  sort_order,
  is_primary,
  mime_type,
  byte_size,
  width,
  height
)
select
  'img_demo_' || substr(md5(assigned.id), 1, 24),
  assigned.id,
  'demo/' || assigned.id || '/' || assigned.filename,
  assigned.name,
  0,
  true,
  'image/jpeg',
  null,
  800,
  800
from assigned_images assigned
on conflict do nothing;

commit;
