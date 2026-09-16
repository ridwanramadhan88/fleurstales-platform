begin;

-- Batch 1 foundation: keep existing free-text size/product-image contracts valid
-- while adding stable size-option identity and variant-owned images.
alter table public.product_variants
  add column if not exists size_option_id text;

create unique index if not exists uq_product_variants_product_size_option
  on public.product_variants(product_id, size_option_id)
  where size_option_id is not null;

comment on column public.product_variants.size_option_id is
  'Stable id of the child size option from size_guide_templates.sizes. Null preserves legacy variants.';

alter table public.product_images
  add column if not exists variant_id text references public.product_variants(id) on delete cascade;

create index if not exists idx_product_images_variant
  on public.product_images(variant_id, sort_order)
  where variant_id is not null;

-- The legacy index allowed one primary image per product total. Split it so the
-- base product and each variant may independently own one primary image.
drop index if exists public.uq_product_images_single_primary;
create unique index if not exists uq_product_images_base_single_primary
  on public.product_images(product_id)
  where is_primary = true and variant_id is null;
create unique index if not exists uq_product_images_variant_single_primary
  on public.product_images(variant_id)
  where is_primary = true and variant_id is not null;

comment on column public.product_images.variant_id is
  'Optional owning product variant. Null means the legacy/base product gallery.';

-- Extend the existing replacement RPC rather than introducing a parallel
-- image pipeline. p_images entries may now include variantId; omitted remains
-- a base-product image and therefore stays backwards compatible.
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
  v_storage_path text;
  v_mime_type text;
  v_byte_size integer;
  v_width integer;
  v_height integer;
  v_variant_id text;
  v_owner_key text;
  v_primary_by_owner jsonb := '{}'::jsonb;
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
  if v_image_count > 36 then
    raise exception 'A product and its variants can have at most 36 images in one replacement.' using errcode = '22023';
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

  for v_image in select value from jsonb_array_elements(p_images)
  loop
    if coalesce(v_image->>'id', '') = '' then
      raise exception 'Product image is missing id.' using errcode = '22023';
    end if;

    v_variant_id := nullif(v_image->>'variantId', '');
    if v_variant_id is not null and not exists (
      select 1 from public.product_variants pv
      where pv.id = v_variant_id and pv.product_id = p_product_id
    ) then
      raise exception 'Image variant does not belong to product.' using errcode = '22023';
    end if;

    v_storage_path := coalesce(v_image->>'storagePath', '');
    if v_storage_path = '' or v_storage_path !~ '^[a-z0-9._/-]+\.(jpg|jpeg|png|webp)$' then
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

    v_width := case when v_image ? 'width' and v_image->>'width' is not null then (v_image->>'width')::integer else null end;
    v_height := case when v_image ? 'height' and v_image->>'height' is not null then (v_image->>'height')::integer else null end;
    if (v_width is not null and v_width <= 0) or (v_height is not null and v_height <= 0) then
      raise exception 'Product image dimensions must be positive.' using errcode = '22023';
    end if;

    if coalesce((v_image->>'isPrimary')::boolean, false) then
      v_owner_key := coalesce(v_variant_id, '__base__');
      v_primary_by_owner := jsonb_set(
        v_primary_by_owner,
        array[v_owner_key],
        to_jsonb(coalesce((v_primary_by_owner->>v_owner_key)::integer, 0) + 1),
        true
      );
    end if;
  end loop;

  if exists (
    select 1 from jsonb_each_text(v_primary_by_owner) entry
    where entry.value::integer > 1
  ) then
    raise exception 'Each product/variant image set can have at most one primary image.' using errcode = '22023';
  end if;

  delete from public.product_images where product_id = p_product_id;

  for v_image in select value from jsonb_array_elements(p_images)
  loop
    insert into public.product_images (
      id, product_id, variant_id, storage_path, alt_text, sort_order, is_primary,
      mime_type, byte_size, width, height
    ) values (
      v_image->>'id',
      p_product_id,
      nullif(v_image->>'variantId', ''),
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

-- The catalog snapshot RPC needs to understand sizeOptionId. Keep all existing
-- arguments and response fields unchanged for old clients.
create or replace function public.replace_catalog_snapshot(
  p_base_revision bigint,
  p_occasions jsonb,
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
  v_next_revision bigint;
  v_occasion jsonb;
  v_product jsonb;
  v_variant jsonb;
  v_link record;
  v_product_id text;
  v_variant_id text;
  v_product_count integer;
  v_occasion_count integer;
begin
  v_role := private.current_staff_role();
  if v_role is null or not (v_role = any(array['owner','admin'])) then
    raise exception 'Owner or Admin catalog access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_occasions) <> 'array' or jsonb_typeof(p_products) <> 'array' then
    raise exception 'Catalog payloads must be JSON arrays.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_products) = 0 then
    raise exception 'Refusing to replace the catalog with an empty product snapshot.' using errcode = '22023';
  end if;

  insert into public.catalog_sync_state (id, revision) values ('primary', 0) on conflict (id) do nothing;
  select revision into v_current_revision from public.catalog_sync_state where id = 'primary' for update;
  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'CATALOG_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision using errcode = '40001';
  end if;

  for v_occasion in select value from jsonb_array_elements(p_occasions)
  loop
    insert into public.occasions(id,name,prefix,sort_order,is_active)
    values(v_occasion->>'id',v_occasion->>'name',v_occasion->>'prefix',coalesce((v_occasion->>'sortOrder')::integer,0),coalesce((v_occasion->>'isActive')::boolean,true))
    on conflict(id) do update set name=excluded.name,prefix=excluded.prefix,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now();
  end loop;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_product_id := v_product->>'id';
    if coalesce(v_product_id,'')='' then raise exception 'Catalog product is missing id.' using errcode='22023'; end if;

    insert into public.products(id,product_code,primary_occasion_id,material,name,description,product_type,collection_series,pricing_type,order_type,is_featured,is_active,promo_label,original_price_idr,is_customizable,sort_order)
    values(v_product_id,v_product->>'productCode',nullif(v_product->>'primaryOccasionId',''),v_product->>'material',v_product->>'name',nullif(v_product->>'description',''),nullif(v_product->>'productType',''),nullif(v_product->>'collectionSeries',''),nullif(v_product->>'pricingType',''),nullif(v_product->>'orderType',''),coalesce((v_product->>'isFeatured')::boolean,false),coalesce((v_product->>'isActive')::boolean,true),nullif(v_product->>'promoLabel',''),case when v_product?'originalPriceIdr' and v_product->>'originalPriceIdr' is not null then (v_product->>'originalPriceIdr')::bigint else null end,coalesce((v_product->>'isCustomizable')::boolean,false),coalesce((v_product->>'sortOrder')::integer,0))
    on conflict(id) do update set product_code=excluded.product_code,primary_occasion_id=excluded.primary_occasion_id,material=excluded.material,name=excluded.name,description=excluded.description,product_type=excluded.product_type,collection_series=excluded.collection_series,pricing_type=excluded.pricing_type,order_type=excluded.order_type,is_featured=excluded.is_featured,is_active=excluded.is_active,promo_label=excluded.promo_label,original_price_idr=excluded.original_price_idr,is_customizable=excluded.is_customizable,sort_order=excluded.sort_order,updated_at=now();

    delete from public.product_occasions where product_id=v_product_id;
    for v_link in select value as occasion_id, ordinality from jsonb_array_elements_text(coalesce(v_product->'occasionIds','[]'::jsonb)) with ordinality
    loop
      insert into public.product_occasions(product_id,occasion_id,sort_order) values(v_product_id,v_link.occasion_id,(v_link.ordinality-1)::integer)
      on conflict(product_id,occasion_id) do update set sort_order=excluded.sort_order;
    end loop;

    delete from public.product_variants pv where pv.product_id=v_product_id and not exists(select 1 from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) item where item->>'id'=pv.id);

    for v_variant in select value from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';
      insert into public.product_variants(id,product_id,sku,size,size_option_id,price_idr,status,sort_order)
      values(v_variant_id,v_product_id,v_variant->>'sku',v_variant->>'size',nullif(v_variant->>'sizeOptionId',''),(v_variant->>'priceIdr')::bigint,coalesce(v_variant->>'status','active'),coalesce((v_variant->>'sortOrder')::integer,0))
      on conflict(id) do update set product_id=excluded.product_id,sku=excluded.sku,size=excluded.size,size_option_id=excluded.size_option_id,price_idr=excluded.price_idr,status=excluded.status,sort_order=excluded.sort_order,updated_at=now();

      if v_role='owner' and v_variant?'costIdr' then
        insert into public.product_variant_costs(variant_id,cost_idr)
        values(v_variant_id,case when v_variant->>'costIdr' is null then null else (v_variant->>'costIdr')::bigint end)
        on conflict(variant_id) do update set cost_idr=excluded.cost_idr,updated_at=now();
      end if;
    end loop;
  end loop;

  insert into public.catalog_product_code_tombstones(product_code,deleted_product_id,deleted_at,deleted_by)
  select p.product_code,p.id,now(),(select auth.uid()) from public.products p
  where not exists(select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id)
  on conflict(product_code) do update set deleted_product_id=excluded.deleted_product_id,deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by;
  delete from public.products p where not exists(select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id);
  delete from public.occasions o where not exists(select 1 from jsonb_array_elements(p_occasions) item where item->>'id'=o.id);

  v_next_revision := v_current_revision+1;
  update public.catalog_sync_state set revision=v_next_revision,updated_at=now(),updated_by=(select auth.uid()) where id='primary';
  select jsonb_array_length(p_products) into v_product_count;
  select jsonb_array_length(p_occasions) into v_occasion_count;
  return jsonb_build_object('revision',v_next_revision,'productCount',v_product_count,'occasionCount',v_occasion_count);
end;
$$;

revoke all on function public.replace_catalog_snapshot(bigint, jsonb, jsonb) from public;
grant execute on function public.replace_catalog_snapshot(bigint, jsonb, jsonb) to authenticated;

commit;
