begin;

-- Catalog PR 4: preserve ordered Catalog history, lock order snapshots, and
-- record authoritative Catalog audit events.

alter table public.products add column if not exists archived_at timestamptz;
alter table public.product_variants add column if not exists archived_at timestamptz;

create index if not exists idx_products_archived_at on public.products(archived_at);
create index if not exists idx_product_variants_archived_at on public.product_variants(archived_at);

-- Once a line is ordered, later operational saves cannot silently refresh its
-- historical Product/variant/price/recipe snapshot unless the selected variant changes.
create or replace function private.preserve_order_item_catalog_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.variant_id is not distinct from new.variant_id then
    new.product_id := old.product_id;
    new.product_code_snapshot := old.product_code_snapshot;
    new.product_name_snapshot := old.product_name_snapshot;
    new.variant_sku_snapshot := old.variant_sku_snapshot;
    new.variant_size_snapshot := old.variant_size_snapshot;
    new.unit_price_idr := old.unit_price_idr;
    new.flower_recipe_snapshot := old.flower_recipe_snapshot;
  end if;
  return new;
end;
$$;
revoke execute on function private.preserve_order_item_catalog_snapshot() from public,anon,authenticated;

drop trigger if exists trg_order_items_preserve_catalog_snapshot on public.order_items;
create trigger trg_order_items_preserve_catalog_snapshot
before update on public.order_items
for each row execute function private.preserve_order_item_catalog_snapshot();

comment on column public.order_items.flower_recipe_snapshot is
  'Immutable order-time internal production recipe snapshot while variant_id is unchanged.';

-- Catalog audit is server-authoritative and records the same actor identity as
-- the existing private audit ledger.
create or replace function private.audit_catalog_product_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active is distinct from new.is_active
     or old.archived_at is distinct from new.archived_at then
    perform private.write_audit_event(
      'catalog.product.status','catalog_product',new.id,'succeeded',
      null,null,
      jsonb_build_object('isActive',old.is_active,'archivedAt',old.archived_at),
      jsonb_build_object('isActive',new.is_active,'archivedAt',new.archived_at),
      jsonb_build_object('productCode',new.product_code)
    );
  end if;
  return new;
end;
$$;

create or replace function private.audit_catalog_variant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed text[] := array[]::text[];
begin
  if old.price_idr is distinct from new.price_idr then v_changed := array_append(v_changed,'price'); end if;
  if old.status is distinct from new.status then v_changed := array_append(v_changed,'status'); end if;
  if old.size_option_id is distinct from new.size_option_id then v_changed := array_append(v_changed,'sizeOptionId'); end if;
  if old.archived_at is distinct from new.archived_at then v_changed := array_append(v_changed,'archive'); end if;
  if cardinality(v_changed) > 0 then
    perform private.write_audit_event(
      'catalog.variant.update','catalog_variant',new.id,'succeeded',
      null,null,
      jsonb_build_object(
        'priceIdr',old.price_idr,'status',old.status,
        'sizeOptionId',old.size_option_id,'archivedAt',old.archived_at
      ),
      jsonb_build_object(
        'priceIdr',new.price_idr,'status',new.status,
        'sizeOptionId',new.size_option_id,'archivedAt',new.archived_at
      ),
      jsonb_build_object('productId',new.product_id,'sku',new.sku,'changedFields',v_changed)
    );
  end if;
  return new;
end;
$$;

create or replace function private.audit_catalog_variant_cost_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
declare
  v_variant_id text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op='INSERT' then
    v_variant_id := new.variant_id;
    v_before := null;
    v_after := jsonb_build_object('costIdr',new.cost_idr);
  elsif tg_op='DELETE' then
    v_variant_id := old.variant_id;
    v_before := jsonb_build_object('costIdr',old.cost_idr);
    v_after := null;
  else
    if old.cost_idr is not distinct from new.cost_idr then return new; end if;
    v_variant_id := new.variant_id;
    v_before := jsonb_build_object('costIdr',old.cost_idr);
    v_after := jsonb_build_object('costIdr',new.cost_idr);
  end if;

  perform private.write_audit_event(
    'catalog.variant_cost.update','catalog_variant',v_variant_id,'succeeded',
    null,null,v_before,v_after,jsonb_build_object('field','cost')
  );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$;


revoke execute on function private.audit_catalog_product_change() from public,anon,authenticated;
revoke execute on function private.audit_catalog_variant_change() from public,anon,authenticated;
revoke execute on function private.audit_catalog_variant_cost_change() from public,anon,authenticated;

drop trigger if exists trg_catalog_product_audit on public.products;
create trigger trg_catalog_product_audit
after update on public.products
for each row execute function private.audit_catalog_product_change();

drop trigger if exists trg_catalog_variant_audit on public.product_variants;
create trigger trg_catalog_variant_audit
after update on public.product_variants
for each row execute function private.audit_catalog_variant_change();

drop trigger if exists trg_catalog_variant_cost_audit on public.product_variant_costs;
create trigger trg_catalog_variant_cost_audit
after insert or update or delete on public.product_variant_costs
for each row execute function private.audit_catalog_variant_cost_change();

create or replace function private.validate_catalog_snapshot_payload(p_products jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_product jsonb;
  v_variant jsonb;
  v_product_id text;
  v_product_type text;
  v_size_option_id text;
  v_template_id text;
  v_size jsonb;
  v_active_product boolean;
  v_variant_status text;
  v_price numeric;
begin
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'CATALOG_PRODUCTS_MUST_BE_ARRAY' using errcode = '22023';
  end if;

  if jsonb_array_length(p_products) = 0 then
    raise exception 'CATALOG_EMPTY_SNAPSHOT_REJECTED' using errcode = '22023';
  end if;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_product_id := nullif(trim(v_product->>'id'), '');
    v_product_type := nullif(trim(v_product->>'productType'), '');
    v_active_product := coalesce((v_product->>'isActive')::boolean, true);

    if v_product_id is null then
      raise exception 'CATALOG_PRODUCT_ID_REQUIRED' using errcode = '22023';
    end if;

    if jsonb_typeof(coalesce(v_product->'variants', '[]'::jsonb)) <> 'array' then
      raise exception 'CATALOG_VARIANTS_MUST_BE_ARRAY:%', v_product_id using errcode = '22023';
    end if;

    if v_active_product and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_product->'variants', '[]'::jsonb)) variant
      where coalesce(variant->>'status', 'active') = 'active'
    ) then
      raise exception 'CATALOG_ACTIVE_PRODUCT_REQUIRES_SELLABLE_VARIANT:%', v_product_id using errcode = '23514';
    end if;

    if exists (
      select 1
      from (
        select nullif(trim(variant->>'sizeOptionId'), '') as size_option_id
        from jsonb_array_elements(coalesce(v_product->'variants', '[]'::jsonb)) variant
        where nullif(trim(variant->>'sizeOptionId'), '') is not null
        group by nullif(trim(variant->>'sizeOptionId'), '')
        having count(*) > 1
      ) duplicate_size
    ) then
      raise exception 'CATALOG_DUPLICATE_SIZE_OPTION:%', v_product_id using errcode = '23505';
    end if;

    for v_variant in
      select value from jsonb_array_elements(coalesce(v_product->'variants', '[]'::jsonb))
    loop
      if nullif(trim(v_variant->>'id'), '') is null then
        raise exception 'CATALOG_VARIANT_ID_REQUIRED:%', v_product_id using errcode = '22023';
      end if;

      v_variant_status := coalesce(v_variant->>'status', 'active');
      begin
        v_price := (v_variant->>'priceIdr')::numeric;
      exception when others then
        raise exception 'CATALOG_VARIANT_PRICE_INVALID:%', v_variant->>'id' using errcode = '22023';
      end;

      if v_variant_status = 'active' and coalesce(v_price, 0) <= 0 then
        raise exception 'CATALOG_SELLABLE_VARIANT_PRICE_REQUIRED:%', v_variant->>'id' using errcode = '23514';
      end if;

      v_size_option_id := nullif(trim(v_variant->>'sizeOptionId'), '');
      if v_size_option_id is null then
        continue;
      end if;

      if v_variant_status <> 'active' then
        select size_entry.value
        into v_size
        from public.size_guide_templates template
        cross join lateral jsonb_array_elements(template.sizes) size_entry(value)
        where size_entry.value->>'id' = v_size_option_id
        limit 1;

        if v_size is null then
          raise exception 'CATALOG_HISTORICAL_SIZE_OPTION_MISSING:%:%', v_product_id, v_size_option_id using errcode = '23514';
        end if;
        continue;
      end if;

      select target.template_id
      into v_template_id
      from (
        select guide.template_id, 0 as priority
        from public.size_guide_targets guide
        where guide.scope = 'product'
          and guide.product_id = v_product_id

        union all

        select guide.template_id, 1 as priority
        from public.size_guide_targets guide
        where guide.scope = 'product_type'
          and guide.product_type = v_product_type
      ) target
      order by target.priority
      limit 1;

      if v_template_id is null then
        raise exception 'CATALOG_SIZE_TEMPLATE_REQUIRED:%:%', v_product_id, v_size_option_id using errcode = '23514';
      end if;

      select size_entry.value
      into v_size
      from public.size_guide_templates template
      cross join lateral jsonb_array_elements(template.sizes) size_entry(value)
      where template.id = v_template_id
        and size_entry.value->>'id' = v_size_option_id
      limit 1;

      if v_size is null then
        raise exception 'CATALOG_UNKNOWN_SIZE_OPTION:%:%', v_product_id, v_size_option_id using errcode = '23514';
      end if;

      if coalesce((v_size->>'isActive')::boolean, true) = false then
        raise exception 'CATALOG_ARCHIVED_SIZE_OPTION:%:%', v_product_id, v_size_option_id using errcode = '23514';
      end if;
    end loop;
  end loop;
end;
$$;

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
      original_price_idr,is_customizable,sort_order,archived_at
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
      coalesce((v_product->>'sortOrder')::integer,0),
      null
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
      archived_at=null,
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

    update public.product_variants pv
    set status='inactive',
        archived_at=coalesce(pv.archived_at,clock_timestamp()),
        updated_at=clock_timestamp()
    where pv.product_id=v_product_id
      and pv.archived_at is null
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) item
        where item->>'id'=pv.id
      )
      and exists(select 1 from public.order_items oi where oi.variant_id=pv.id);

    delete from public.product_variants pv
    where pv.product_id=v_product_id
      and pv.archived_at is null
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb)) item
        where item->>'id'=pv.id
      )
      and not exists(select 1 from public.order_items oi where oi.variant_id=pv.id);

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
        id,product_id,sku,size,size_option_id,price_idr,status,sort_order,archived_at
      )
      values(
        v_variant_id,
        v_product_id,
        v_variant->>'sku',
        v_variant->>'size',
        nullif(v_variant->>'sizeOptionId',''),
        (v_variant->>'priceIdr')::bigint,
        coalesce(v_variant->>'status','active'),
        coalesce((v_variant->>'sortOrder')::integer,0),
        null
      )
      on conflict(id) do update set
        product_id=excluded.product_id,
        sku=excluded.sku,
        size=excluded.size,
        size_option_id=excluded.size_option_id,
        price_idr=excluded.price_idr,
        status=excluded.status,
        sort_order=excluded.sort_order,
        archived_at=null,
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

  update public.product_variants pv
  set status='inactive',
      archived_at=coalesce(pv.archived_at,clock_timestamp()),
      updated_at=clock_timestamp()
  where pv.archived_at is null
    and exists(
    select 1
    from public.products p
    where p.id=pv.product_id
      and not exists(select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id)
      and (
        exists(select 1 from public.order_items oi where oi.product_id=p.id)
        or exists(
          select 1 from public.order_items oi
          join public.product_variants linked on linked.id=oi.variant_id
          where linked.product_id=p.id
        )
      )
  );

  update public.products p
  set is_active=false,
      archived_at=coalesce(p.archived_at,clock_timestamp()),
      updated_at=clock_timestamp()
  where p.archived_at is null
    and not exists(
    select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id
  )
    and (
      exists(select 1 from public.order_items oi where oi.product_id=p.id)
      or exists(
        select 1 from public.order_items oi
        join public.product_variants linked on linked.id=oi.variant_id
        where linked.product_id=p.id
      )
    );

  delete from public.products p
  where p.archived_at is null
    and not exists(
    select 1 from jsonb_array_elements(p_products) item where item->>'id'=p.id
  )
    and not exists(select 1 from public.order_items oi where oi.product_id=p.id)
    and not exists(
      select 1 from public.order_items oi
      join public.product_variants linked on linked.id=oi.variant_id
      where linked.product_id=p.id
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
  v_storage_path text;
  v_sizes jsonb;
  v_variant record;
  v_template_id text;
  v_size jsonb;
  v_before_targets jsonb;
  v_after_targets jsonb;
begin
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_templates) <> 'array'
     or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'Size guide templates and targets must be JSON arrays.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select
        template->>'id' as template_id,
        size_entry->>'id' as size_id,
        count(*) as duplicate_count
      from jsonb_array_elements(p_templates) template
      cross join lateral jsonb_array_elements(coalesce(template->'sizes','[]'::jsonb)) size_entry
      where nullif(trim(size_entry->>'id'), '') is not null
      group by template->>'id', size_entry->>'id'
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'SIZE_GUIDE_DUPLICATE_CHILD_ID' using errcode = '23505';
  end if;

  for v_variant in
    select variant.id, variant.product_id, variant.size_option_id, variant.status, product.product_type
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.size_option_id is not null
      and variant.archived_at is null
      and product.archived_at is null
  loop
    if v_variant.status <> 'active' then
      select size_entry
      into v_size
      from jsonb_array_elements(p_templates) template
      cross join lateral jsonb_array_elements(coalesce(template->'sizes','[]'::jsonb)) size_entry
      where size_entry->>'id' = v_variant.size_option_id
      limit 1;

      if v_size is null then
        raise exception 'SIZE_GUIDE_HISTORICAL_CHILD_CANNOT_BE_REMOVED:%', v_variant.id using errcode = '23514';
      end if;
      continue;
    end if;

    select target.template_id
    into v_template_id
    from (
      select entry->>'templateId' as template_id, 0 as priority
      from jsonb_array_elements(p_targets) entry
      where entry->>'scope' = 'product'
        and entry->>'productId' = v_variant.product_id

      union all

      select entry->>'templateId' as template_id, 1 as priority
      from jsonb_array_elements(p_targets) entry
      where entry->>'scope' = 'product_type'
        and entry->>'productType' = v_variant.product_type
    ) target
    order by target.priority
    limit 1;

    if v_template_id is null then
      raise exception 'SIZE_GUIDE_REFERENCED_VARIANT_REQUIRES_TARGET:%', v_variant.id using errcode = '23514';
    end if;

    select size_entry
    into v_size
    from jsonb_array_elements(p_templates) template
    cross join lateral jsonb_array_elements(coalesce(template->'sizes','[]'::jsonb)) size_entry
    where template->>'id' = v_template_id
      and size_entry->>'id' = v_variant.size_option_id
    limit 1;

    if v_size is null then
      raise exception 'SIZE_GUIDE_REFERENCED_CHILD_CANNOT_BE_REMOVED:%', v_variant.id using errcode = '23514';
    end if;

    if coalesce((v_size->>'isActive')::boolean, true) = false then
      raise exception 'SIZE_GUIDE_ACTIVE_CHILD_CANNOT_BE_ARCHIVED:%', v_variant.id using errcode = '23514';
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id',target.id,
        'templateId',target.template_id,
        'scope',target.scope,
        'productType',target.product_type,
        'productId',target.product_id
      ))
      order by target.id
    ),
    '[]'::jsonb
  )
  into v_before_targets
  from public.size_guide_targets target;

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

    insert into public.size_guide_templates(
      id,name,sizes,storage_path,mime_type,byte_size,width,height,created_at,updated_at
    )
    values(
      v_template->>'id',
      trim(v_template->>'name'),
      v_sizes,
      v_storage_path,
      coalesce(v_template->>'mimeType','image/jpeg'),
      coalesce((v_template->>'byteSize')::integer,0),
      coalesce((v_template->>'width')::integer,800),
      coalesce((v_template->>'height')::integer,800),
      coalesce((v_template->>'createdAt')::timestamptz,now()),
      coalesce((v_template->>'updatedAt')::timestamptz,now())
    );
  end loop;

  for v_target in select value from jsonb_array_elements(p_targets)
  loop
    insert into public.size_guide_targets(
      id,template_id,scope,product_type,product_id
    )
    values(
      v_target->>'id',
      v_target->>'templateId',
      v_target->>'scope',
      nullif(v_target->>'productType',''),
      nullif(v_target->>'productId','')
    );
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id',target.id,
        'templateId',target.template_id,
        'scope',target.scope,
        'productType',target.product_type,
        'productId',target.product_id
      ))
      order by target.id
    ),
    '[]'::jsonb
  )
  into v_after_targets
  from public.size_guide_targets target;

  if v_before_targets is distinct from v_after_targets then
    perform private.write_audit_event(
      'catalog.size_template_assignments.update',
      'catalog_size_template_assignments',
      'library',
      'succeeded',
      null,null,
      v_before_targets,
      v_after_targets,
      jsonb_build_object('targetCount',jsonb_array_length(v_after_targets))
    );
  end if;

  return jsonb_build_object(
    'templateCount',jsonb_array_length(p_templates),
    'targetCount',jsonb_array_length(p_targets)
  );
end;
$$;

revoke all on function private.validate_catalog_snapshot_payload(jsonb) from public,anon,authenticated;
revoke all on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) from public;
grant execute on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) to authenticated;
revoke all on function public.replace_size_guide_library(jsonb,jsonb) from public;
grant execute on function public.replace_size_guide_library(jsonb,jsonb) to authenticated;

commit;
