begin;

-- Catalog PR 2: the Product Editor must commit Product + variants + image
-- metadata + flower recipes under one Catalog revision. Storage binaries are
-- uploaded first with unique object paths; this RPC owns the atomic database
-- commit. A stale revision rolls the entire database mutation back.

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
  v_recipe jsonb;
  v_image jsonb;
  v_link record;
  v_product_id text;
  v_variant_id text;
  v_recipe_id text;
  v_product_count integer;
  v_occasion_count integer;
  v_image_count integer;
  v_storage_path text;
  v_mime_type text;
  v_byte_size integer;
  v_width integer;
  v_height integer;
begin
  v_role := private.current_staff_role();
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_occasions) <> 'array' or jsonb_typeof(p_products) <> 'array' then
    raise exception 'Catalog payloads must be JSON arrays.' using errcode = '22023';
  end if;

  perform private.validate_catalog_snapshot_payload(p_products);

  insert into public.catalog_sync_state (id, revision)
  values ('primary', 0)
  on conflict (id) do nothing;

  select revision
  into v_current_revision
  from public.catalog_sync_state
  where id = 'primary'
  for update;

  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'CATALOG_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision
      using errcode = '40001';
  end if;

  for v_occasion in select value from jsonb_array_elements(p_occasions)
  loop
    insert into public.occasions(id,name,prefix,sort_order,is_active)
    values(
      v_occasion->>'id',
      v_occasion->>'name',
      v_occasion->>'prefix',
      coalesce((v_occasion->>'sortOrder')::integer,0),
      coalesce((v_occasion->>'isActive')::boolean,true)
    )
    on conflict(id) do update set
      name=excluded.name,
      prefix=excluded.prefix,
      sort_order=excluded.sort_order,
      is_active=excluded.is_active,
      updated_at=now();
  end loop;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_product_id := v_product->>'id';

    if jsonb_typeof(coalesce(v_product->'images','[]'::jsonb)) <> 'array' then
      raise exception 'CATALOG_PRODUCT_IMAGES_MUST_BE_ARRAY:%', v_product_id using errcode = '22023';
    end if;

    insert into public.products(
      id,product_code,primary_occasion_id,material,name,description,product_type,
      collection_series,pricing_type,order_type,is_featured,is_active,promo_label,
      original_price_idr,is_customizable,sort_order
    )
    values(
      v_product_id,
      v_product->>'productCode',
      nullif(v_product->>'primaryOccasionId',''),
      v_product->>'material',
      v_product->>'name',
      nullif(v_product->>'description',''),
      nullif(v_product->>'productType',''),
      nullif(v_product->>'collectionSeries',''),
      nullif(v_product->>'pricingType',''),
      nullif(v_product->>'orderType',''),
      coalesce((v_product->>'isFeatured')::boolean,false),
      coalesce((v_product->>'isActive')::boolean,true),
      nullif(v_product->>'promoLabel',''),
      case when v_product?'originalPriceIdr' and v_product->>'originalPriceIdr' is not null
        then (v_product->>'originalPriceIdr')::bigint else null end,
      coalesce((v_product->>'isCustomizable')::boolean,false),
      coalesce((v_product->>'sortOrder')::integer,0)
    )
    on conflict(id) do update set
      product_code=excluded.product_code,
      primary_occasion_id=excluded.primary_occasion_id,
      material=excluded.material,
      name=excluded.name,
      description=excluded.description,
      product_type=excluded.product_type,
      collection_series=excluded.collection_series,
      pricing_type=excluded.pricing_type,
      order_type=excluded.order_type,
      is_featured=excluded.is_featured,
      is_active=excluded.is_active,
      promo_label=excluded.promo_label,
      original_price_idr=excluded.original_price_idr,
      is_customizable=excluded.is_customizable,
      sort_order=excluded.sort_order,
      updated_at=now();

    delete from public.product_occasions where product_id=v_product_id;
    for v_link in
      select value as occasion_id, ordinality
      from jsonb_array_elements_text(coalesce(v_product->'occasionIds','[]'::jsonb)) with ordinality
    loop
      insert into public.product_occasions(product_id,occasion_id,sort_order)
      values(v_product_id,v_link.occasion_id,(v_link.ordinality-1)::integer)
      on conflict(product_id,occasion_id) do update set sort_order=excluded.sort_order;
    end loop;

    delete from public.product_variants pv
    where pv.product_id=v_product_id
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) item
        where item->>'id'=pv.id
      );

    for v_variant in
      select value from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';

      if jsonb_typeof(coalesce(v_variant->'images','[]'::jsonb)) <> 'array' then
        raise exception 'CATALOG_VARIANT_IMAGES_MUST_BE_ARRAY:%', v_variant_id using errcode = '22023';
      end if;
      if jsonb_typeof(coalesce(v_variant->'flowerRecipe','[]'::jsonb)) <> 'array' then
        raise exception 'CATALOG_VARIANT_RECIPE_MUST_BE_ARRAY:%', v_variant_id using errcode = '22023';
      end if;

      insert into public.product_variants(
        id,product_id,sku,size,size_option_id,price_idr,status,sort_order
      )
      values(
        v_variant_id,
        v_product_id,
        v_variant->>'sku',
        v_variant->>'size',
        nullif(v_variant->>'sizeOptionId',''),
        (v_variant->>'priceIdr')::bigint,
        coalesce(v_variant->>'status','active'),
        coalesce((v_variant->>'sortOrder')::integer,0)
      )
      on conflict(id) do update set
        product_id=excluded.product_id,
        sku=excluded.sku,
        size=excluded.size,
        size_option_id=excluded.size_option_id,
        price_idr=excluded.price_idr,
        status=excluded.status,
        sort_order=excluded.sort_order,
        updated_at=now();

      -- Only Owner can mutate Cost. Admin edits preserve any existing Cost row.
      if v_role='owner' and v_variant?'costIdr' then
        insert into public.product_variant_costs(variant_id,cost_idr)
        values(
          v_variant_id,
          case when v_variant->>'costIdr' is null then null else (v_variant->>'costIdr')::bigint end
        )
        on conflict(variant_id) do update set
          cost_idr=excluded.cost_idr,
          updated_at=now();
      end if;

      -- Recipes are replaced inside the same revision transaction as the
      -- Product/variant rows. Existing order snapshots are separate immutable
      -- values and are not changed here.
      delete from public.product_variant_flower_recipes where variant_id=v_variant_id;
      for v_recipe in
        select value from jsonb_array_elements(coalesce(v_variant->'flowerRecipe','[]'::jsonb))
      loop
        if coalesce(trim(v_recipe->>'flowerName'),'') = '' then
          raise exception 'CATALOG_RECIPE_FLOWER_REQUIRED:%', v_variant_id using errcode = '22023';
        end if;
        if coalesce((v_recipe->>'quantity')::numeric,0) <= 0 then
          raise exception 'CATALOG_RECIPE_QUANTITY_INVALID:%', v_variant_id using errcode = '22023';
        end if;
        if coalesce(v_recipe->>'unit','stem') not in ('stem','bunch') then
          raise exception 'CATALOG_RECIPE_UNIT_INVALID:%', v_variant_id using errcode = '22023';
        end if;

        v_recipe_id := coalesce(
          nullif(v_recipe->>'id',''),
          'flower_recipe_'||replace(gen_random_uuid()::text,'-','')
        );
        insert into public.product_variant_flower_recipes(
          id,variant_id,flower_name,quantity,unit,sort_order
        )
        values(
          v_recipe_id,
          v_variant_id,
          trim(v_recipe->>'flowerName'),
          (v_recipe->>'quantity')::numeric,
          coalesce(v_recipe->>'unit','stem'),
          coalesce((v_recipe->>'sortOrder')::integer,0)
        );
      end loop;
    end loop;

    -- Image metadata is also replaced inside this transaction. Binary objects
    -- are pre-uploaded under unique paths; stale/conflicting saves remove those
    -- newly-uploaded objects client-side and never commit this metadata.
    select
      jsonb_array_length(coalesce(v_product->'images','[]'::jsonb))
      + coalesce(sum(jsonb_array_length(coalesce(variant->'images','[]'::jsonb))),0)
    into v_image_count
    from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) variant;

    if v_image_count > 36 then
      raise exception 'CATALOG_IMAGE_LIMIT_EXCEEDED:%', v_product_id using errcode = '22023';
    end if;

    delete from public.product_images where product_id=v_product_id;

    for v_image in
      select value from jsonb_array_elements(coalesce(v_product->'images','[]'::jsonb))
    loop
      v_storage_path := coalesce(v_image->>'storagePath','');
      v_mime_type := coalesce(v_image->>'mimeType','image/jpeg');
      v_byte_size := case when v_image?'byteSize' and v_image->>'byteSize' is not null then (v_image->>'byteSize')::integer else null end;
      v_width := case when v_image?'width' and v_image->>'width' is not null then (v_image->>'width')::integer else null end;
      v_height := case when v_image?'height' and v_image->>'height' is not null then (v_image->>'height')::integer else null end;

      if coalesce(v_image->>'id','') = '' then raise exception 'CATALOG_IMAGE_ID_REQUIRED:%', v_product_id using errcode='22023'; end if;
      if v_storage_path = '' or v_storage_path !~ '^[a-z0-9._/-]+\.(jpg|jpeg|png|webp)$' then
        raise exception 'CATALOG_IMAGE_PATH_INVALID:%', v_storage_path using errcode='22023';
      end if;
      if v_mime_type not in ('image/jpeg','image/png','image/webp') then
        raise exception 'CATALOG_IMAGE_MIME_INVALID:%', v_mime_type using errcode='22023';
      end if;
      if v_byte_size is not null and (v_byte_size < 0 or v_byte_size > 102400) then
        raise exception 'CATALOG_IMAGE_SIZE_INVALID:%', v_image->>'id' using errcode='22023';
      end if;
      if (v_width is not null and v_width <= 0) or (v_height is not null and v_height <= 0) then
        raise exception 'CATALOG_IMAGE_DIMENSIONS_INVALID:%', v_image->>'id' using errcode='22023';
      end if;

      insert into public.product_images(
        id,product_id,variant_id,storage_path,alt_text,sort_order,is_primary,
        mime_type,byte_size,width,height
      )
      values(
        v_image->>'id',
        v_product_id,
        null,
        v_storage_path,
        nullif(v_image->>'altText',''),
        coalesce((v_image->>'sortOrder')::integer,0),
        coalesce((v_image->>'isPrimary')::boolean,false),
        v_mime_type,
        v_byte_size,
        v_width,
        v_height
      );
    end loop;

    for v_variant in
      select value from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';
      for v_image in
        select value from jsonb_array_elements(coalesce(v_variant->'images','[]'::jsonb))
      loop
        v_storage_path := coalesce(v_image->>'storagePath','');
        v_mime_type := coalesce(v_image->>'mimeType','image/jpeg');
        v_byte_size := case when v_image?'byteSize' and v_image->>'byteSize' is not null then (v_image->>'byteSize')::integer else null end;
        v_width := case when v_image?'width' and v_image->>'width' is not null then (v_image->>'width')::integer else null end;
        v_height := case when v_image?'height' and v_image->>'height' is not null then (v_image->>'height')::integer else null end;

        if coalesce(v_image->>'id','') = '' then raise exception 'CATALOG_IMAGE_ID_REQUIRED:%', v_variant_id using errcode='22023'; end if;
        if v_storage_path = '' or v_storage_path !~ '^[a-z0-9._/-]+\.(jpg|jpeg|png|webp)$' then
          raise exception 'CATALOG_IMAGE_PATH_INVALID:%', v_storage_path using errcode='22023';
        end if;
        if v_mime_type not in ('image/jpeg','image/png','image/webp') then
          raise exception 'CATALOG_IMAGE_MIME_INVALID:%', v_mime_type using errcode='22023';
        end if;
        if v_byte_size is not null and (v_byte_size < 0 or v_byte_size > 102400) then
          raise exception 'CATALOG_IMAGE_SIZE_INVALID:%', v_image->>'id' using errcode='22023';
        end if;
        if (v_width is not null and v_width <= 0) or (v_height is not null and v_height <= 0) then
          raise exception 'CATALOG_IMAGE_DIMENSIONS_INVALID:%', v_image->>'id' using errcode='22023';
        end if;

        insert into public.product_images(
          id,product_id,variant_id,storage_path,alt_text,sort_order,is_primary,
          mime_type,byte_size,width,height
        )
        values(
          v_image->>'id',
          v_product_id,
          v_variant_id,
          v_storage_path,
          nullif(v_image->>'altText',''),
          coalesce((v_image->>'sortOrder')::integer,0),
          coalesce((v_image->>'isPrimary')::boolean,false),
          v_mime_type,
          v_byte_size,
          v_width,
          v_height
        );
      end loop;
    end loop;
  end loop;

  insert into public.catalog_product_code_tombstones(product_code,deleted_product_id,deleted_at,deleted_by)
  select p.product_code,p.id,now(),(select auth.uid())
  from public.products p
  where not exists(
    select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id
  )
  on conflict(product_code) do update set
    deleted_product_id=excluded.deleted_product_id,
    deleted_at=excluded.deleted_at,
    deleted_by=excluded.deleted_by;

  delete from public.products p
  where not exists(
    select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id
  );

  delete from public.occasions o
  where not exists(
    select 1 from jsonb_array_elements(p_occasions) item where item->>'id'=o.id
  );

  v_next_revision := v_current_revision+1;
  update public.catalog_sync_state
  set revision=v_next_revision,
      updated_at=now(),
      updated_by=(select auth.uid())
  where id='primary';

  select jsonb_array_length(p_products) into v_product_count;
  select jsonb_array_length(p_occasions) into v_occasion_count;

  return jsonb_build_object(
    'revision',v_next_revision,
    'productCount',v_product_count,
    'occasionCount',v_occasion_count
  );
end;
$$;

revoke all on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) from public;
grant execute on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) to authenticated;

commit;
