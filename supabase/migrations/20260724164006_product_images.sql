begin;

-- Phase 5: canonical product-image metadata + Storage-ready mutation contract.
alter table public.product_images
  add column if not exists mime_type text not null default 'image/jpeg',
  add column if not exists byte_size integer,
  add column if not exists width integer,
  add column if not exists height integer;

alter table public.product_images
  drop constraint if exists product_images_mime_type_check,
  add constraint product_images_mime_type_check
    check (mime_type in ('image/jpeg','image/png','image/webp')),
  drop constraint if exists product_images_byte_size_check,
  add constraint product_images_byte_size_check
    check (byte_size is null or (byte_size >= 0 and byte_size <= 102400)),
  drop constraint if exists product_images_width_check,
  add constraint product_images_width_check check (width is null or width > 0),
  drop constraint if exists product_images_height_check,
  add constraint product_images_height_check check (height is null or height > 0);

-- Storage remove() needs SELECT + DELETE on storage.objects for the caller.
drop policy if exists product_images_storage_staff_select on storage.objects;
create policy product_images_storage_staff_select on storage.objects
for select to authenticated
using (bucket_id = 'product-images' and private.has_staff_role(array['owner','admin']));

create or replace function public.replace_product_images_metadata(
  p_base_revision bigint,
  p_product_id text,
  p_images jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_current_revision bigint;
  v_next_revision bigint;
  v_image jsonb;
  v_image_count integer;
  v_primary_count integer := 0;
  v_storage_path text;
  v_mime_type text;
  v_byte_size integer;
  v_width integer;
  v_height integer;
begin
  v_role := private.current_staff_role();
  if v_role is null or not (v_role = any(array['owner','admin'])) then
    raise exception 'Owner or Admin catalog access is required.' using errcode = '42501';
  end if;

  if coalesce(p_product_id, '') = '' or not exists (
    select 1 from public.products p where p.id = p_product_id
  ) then
    raise exception 'Unknown catalog product.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_images) <> 'array' then
    raise exception 'p_images must be a JSON array.' using errcode = '22023';
  end if;

  v_image_count := jsonb_array_length(p_images);
  if v_image_count > 6 then
    raise exception 'A product can have at most 6 images.' using errcode = '22023';
  end if;

  insert into public.catalog_sync_state (id, revision)
  values ('primary', 0)
  on conflict (id) do nothing;

  select revision into v_current_revision
  from public.catalog_sync_state
  where id = 'primary'
  for update;

  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'CATALOG_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision
      using errcode = '40001';
  end if;

  -- Validate the complete replacement before mutating existing metadata.
  for v_image in select value from jsonb_array_elements(p_images)
  loop
    if coalesce(v_image->>'id', '') = '' then
      raise exception 'Product image is missing id.' using errcode = '22023';
    end if;

    v_storage_path := coalesce(v_image->>'storagePath', '');
    if v_storage_path = '' or v_storage_path !~ '^[a-z0-9._-]+/[a-z0-9._-]+\.(jpg|jpeg|png|webp)$' then
      raise exception 'Invalid product image storage path: %', v_storage_path using errcode = '22023';
    end if;

    v_mime_type := coalesce(v_image->>'mimeType', 'image/jpeg');
    if v_mime_type not in ('image/jpeg','image/png','image/webp') then
      raise exception 'Unsupported product image MIME type: %', v_mime_type using errcode = '22023';
    end if;

    v_byte_size := case when v_image ? 'byteSize' and v_image->>'byteSize' is not null
      then (v_image->>'byteSize')::integer else null end;
    if v_byte_size is not null and (v_byte_size < 0 or v_byte_size > 102400) then
      raise exception 'Product image exceeds the 100 KB limit.' using errcode = '22023';
    end if;

    v_width := case when v_image ? 'width' and v_image->>'width' is not null
      then (v_image->>'width')::integer else null end;
    v_height := case when v_image ? 'height' and v_image->>'height' is not null
      then (v_image->>'height')::integer else null end;
    if (v_width is not null and v_width <= 0) or (v_height is not null and v_height <= 0) then
      raise exception 'Product image dimensions must be positive.' using errcode = '22023';
    end if;

    if coalesce((v_image->>'isPrimary')::boolean, false) then
      v_primary_count := v_primary_count + 1;
    end if;
  end loop;

  if v_image_count > 0 and v_primary_count <> 1 then
    raise exception 'Exactly one image must be primary when a product has images.' using errcode = '22023';
  end if;

  delete from public.product_images where product_id = p_product_id;

  for v_image in select value from jsonb_array_elements(p_images)
  loop
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
    ) values (
      v_image->>'id',
      p_product_id,
      v_image->>'storagePath',
      nullif(v_image->>'altText', ''),
      coalesce((v_image->>'sortOrder')::integer, 0),
      coalesce((v_image->>'isPrimary')::boolean, false),
      coalesce(v_image->>'mimeType', 'image/jpeg'),
      case when v_image ? 'byteSize' and v_image->>'byteSize' is not null then (v_image->>'byteSize')::integer else null end,
      case when v_image ? 'width' and v_image->>'width' is not null then (v_image->>'width')::integer else null end,
      case when v_image ? 'height' and v_image->>'height' is not null then (v_image->>'height')::integer else null end
    );
  end loop;

  v_next_revision := v_current_revision + 1;
  update public.catalog_sync_state
  set revision = v_next_revision,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = 'primary';

  return jsonb_build_object(
    'revision', v_next_revision,
    'productId', p_product_id,
    'imageCount', v_image_count
  );
end;
$$;

revoke all on function public.replace_product_images_metadata(bigint, text, jsonb) from public;
grant execute on function public.replace_product_images_metadata(bigint, text, jsonb) to authenticated;

commit;
