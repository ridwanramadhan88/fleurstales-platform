-- Fleurstales V3.2 configured module authority hardening.
-- Close older direct-table/RPC role checks so Owner-configured permissions are
-- authoritative across CRM and Catalog as well as Orders/Payroll.

begin;

-- Sensitive mutations go through revision-aware RPCs; public/authenticated
-- table grants remain read-only where the app needs reads.
revoke insert, update, delete on public.store_profile from authenticated;
revoke insert, update, delete on public.branches from authenticated;
revoke insert, update, delete on public.public_payment_accounts from authenticated;
revoke insert, update, delete on public.storefront_payment_settings from authenticated;

revoke insert, update, delete on public.occasions from authenticated;
revoke insert, update, delete on public.products from authenticated;
revoke insert, update, delete on public.product_occasions from authenticated;
revoke insert, update, delete on public.product_variants from authenticated;
revoke insert, update, delete on public.product_variant_costs from authenticated;
revoke insert, update, delete on public.product_images from authenticated;
revoke insert, update, delete on public.size_guide_templates from authenticated;
revoke insert, update, delete on public.size_guide_targets from authenticated;

revoke insert, update, delete on public.customers from authenticated;
revoke insert, update, delete on public.customer_addresses from authenticated;

-- Catalog read policies: public active data remains public; authenticated access
-- to inactive/editor data follows the configured Catalog section.
drop policy if exists occasions_staff_read on public.occasions;
create policy occasions_staff_read on public.occasions for select to authenticated
  using (is_active = true or private.has_section_access('catalog','view'));

drop policy if exists products_staff_read on public.products;
create policy products_staff_read on public.products for select to authenticated
  using (is_active = true or private.has_section_access('catalog','view'));

drop policy if exists product_occasions_staff_read on public.product_occasions;
create policy product_occasions_staff_read on public.product_occasions for select to authenticated
  using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
    or private.has_section_access('catalog','view')
  );

drop policy if exists variants_staff_read on public.product_variants;
create policy variants_staff_read on public.product_variants for select to authenticated
  using (
    (status = 'active' and exists (select 1 from public.products p where p.id = product_id and p.is_active = true))
    or private.has_section_access('catalog','view')
  );

drop policy if exists product_images_staff_read on public.product_images;
create policy product_images_staff_read on public.product_images for select to authenticated
  using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
    or private.has_section_access('catalog','view')
  );

-- Finance-only cost visibility remains distinct from Catalog content access.
drop policy if exists variant_costs_finance_read on public.product_variant_costs;
create policy variant_costs_finance_read on public.product_variant_costs for select to authenticated
  using (private.has_section_access('finance','view'));

-- Direct mutation policies are removed because revision-aware RPCs own writes.
drop policy if exists occasions_editor_insert on public.occasions;
drop policy if exists occasions_editor_update on public.occasions;
drop policy if exists occasions_editor_delete on public.occasions;
drop policy if exists products_editor_insert on public.products;
drop policy if exists products_editor_update on public.products;
drop policy if exists products_editor_delete on public.products;
drop policy if exists product_occasions_editor_insert on public.product_occasions;
drop policy if exists product_occasions_editor_update on public.product_occasions;
drop policy if exists product_occasions_editor_delete on public.product_occasions;
drop policy if exists variants_editor_insert on public.product_variants;
drop policy if exists variants_editor_update on public.product_variants;
drop policy if exists variants_editor_delete on public.product_variants;
drop policy if exists variant_costs_finance_insert on public.product_variant_costs;
drop policy if exists variant_costs_finance_update on public.product_variant_costs;
drop policy if exists variant_costs_finance_delete on public.product_variant_costs;
drop policy if exists product_images_editor_insert on public.product_images;
drop policy if exists product_images_editor_update on public.product_images;
drop policy if exists product_images_editor_delete on public.product_images;
drop policy if exists customers_crm_insert on public.customers;
drop policy if exists customers_crm_update on public.customers;
drop policy if exists customers_crm_delete on public.customers;
drop policy if exists customer_addresses_crm_insert on public.customer_addresses;
drop policy if exists customer_addresses_crm_update on public.customer_addresses;
drop policy if exists customer_addresses_crm_delete on public.customer_addresses;

-- Editor-only sync metadata follows Catalog edit permission.
drop policy if exists catalog_sync_state_editor_read on public.catalog_sync_state;
create policy catalog_sync_state_editor_read on public.catalog_sync_state for select to authenticated
  using (private.has_section_access('catalog','edit'));
drop policy if exists catalog_tombstones_editor_read on public.catalog_product_code_tombstones;
create policy catalog_tombstones_editor_read on public.catalog_product_code_tombstones for select to authenticated
  using (private.has_section_access('catalog','edit'));

-- Storage mutation follows configured Catalog edit; public buckets still serve
-- public assets normally.
drop policy if exists product_images_storage_staff_select on storage.objects;
create policy product_images_storage_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and private.has_section_access('catalog','view'));
drop policy if exists product_images_storage_insert on storage.objects;
create policy product_images_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and private.has_section_access('catalog','edit'));
drop policy if exists product_images_storage_update on storage.objects;
create policy product_images_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and private.has_section_access('catalog','edit'))
  with check (bucket_id = 'product-images' and private.has_section_access('catalog','edit'));
drop policy if exists product_images_storage_delete on storage.objects;
create policy product_images_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and private.has_section_access('catalog','edit'));

-- CRM RPCs follow configured Customers edit permission.
create or replace function public.save_customer_profile(
  p_customer jsonb,
  p_base_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(trim(coalesce(p_customer->>'id', '')), '');
  v_name text := nullif(trim(coalesce(p_customer->>'name', '')), '');
  v_whatsapp text := nullif(trim(coalesce(p_customer->>'whatsappNumber', '')), '');
  v_normalized text := private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_email text := nullif(lower(trim(coalesce(p_customer->>'email', ''))), '');
  v_birthday date;
  v_preferred_branch text := nullif(trim(coalesce(p_customer->>'preferredBranchId', '')), '');
  v_existing public.customers%rowtype;
  v_saved public.customers%rowtype;
begin
  if not private.can_manage_customers() then
    raise exception 'CUSTOMER_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_name is null then raise exception 'Customer name is required.' using errcode = '22023'; end if;
  if length(v_normalized) < 8 or length(v_normalized) > 15 then
    raise exception 'A valid WhatsApp number is required.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_customer->>'birthday', '')), '') is not null then
    v_birthday := (p_customer->>'birthday')::date;
  end if;
  if v_preferred_branch is not null and not exists (select 1 from public.branches where id = v_preferred_branch) then
    raise exception 'Preferred branch does not exist.' using errcode = '23503';
  end if;

  if v_id is not null then
    select * into v_existing from public.customers where id = v_id for update;
  end if;

  if v_existing.id is not null then
    if p_base_revision is null or v_existing.revision <> p_base_revision then
      raise exception 'CUSTOMER_CONFLICT' using errcode = '40001';
    end if;
    if exists (
      select 1 from public.customers
      where normalized_whatsapp_number = v_normalized and id <> v_existing.id
    ) then
      raise exception 'A customer with this WhatsApp number already exists.' using errcode = '23505';
    end if;

    update public.customers
    set name = v_name,
        whatsapp_number = v_whatsapp,
        normalized_whatsapp_number = v_normalized,
        email = v_email,
        birthday = v_birthday,
        preferred_branch_id = v_preferred_branch,
        tags = coalesce(array(select jsonb_array_elements_text(coalesce(p_customer->'tags', '[]'::jsonb))), '{}'::text[]),
        notes = nullif(trim(coalesce(p_customer->>'notes', '')), ''),
        promo_code = nullif(trim(coalesce(p_customer->>'promoCode', '')), ''),
        revision = revision + 1,
        updated_at = now()
    where id = v_existing.id
    returning * into v_saved;
  else
    if v_id is null then v_id := 'cust_' || replace(gen_random_uuid()::text, '-', ''); end if;
    insert into public.customers (
      id, revision, name, whatsapp_number, normalized_whatsapp_number, email, birthday,
      preferred_branch_id, tags, notes, promo_code, created_source
    ) values (
      v_id, 1, v_name, v_whatsapp, v_normalized, v_email, v_birthday,
      v_preferred_branch,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_customer->'tags', '[]'::jsonb))), '{}'::text[]),
      nullif(trim(coalesce(p_customer->>'notes', '')), ''),
      nullif(trim(coalesce(p_customer->>'promoCode', '')), ''),
      case when p_customer->>'createdSource' = 'storefront' then 'storefront' else 'admin' end
    ) returning * into v_saved;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', v_saved.id,
    'revision', v_saved.revision,
    'name', v_saved.name,
    'whatsappNumber', v_saved.whatsapp_number,
    'normalizedWhatsappNumber', v_saved.normalized_whatsapp_number,
    'email', v_saved.email,
    'birthday', v_saved.birthday,
    'preferredBranchId', v_saved.preferred_branch_id,
    'tags', to_jsonb(v_saved.tags),
    'notes', v_saved.notes,
    'promoCode', v_saved.promo_code,
    'createdSource', v_saved.created_source,
    'lastOrderAt', v_saved.last_order_at,
    'createdAt', v_saved.created_at,
    'updatedAt', v_saved.updated_at
  ));
end;
$$;

create or replace function public.delete_customer_profile(
  p_customer_id text,
  p_base_revision bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.customers%rowtype;
begin
  if not private.can_manage_customers() then
    raise exception 'CUSTOMER_DELETE_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into v_existing from public.customers where id = p_customer_id for update;
  if not found then return; end if;
  if v_existing.revision <> p_base_revision then
    raise exception 'CUSTOMER_CONFLICT' using errcode = '40001';
  end if;
  delete from public.customers where id = p_customer_id;
end;
$$;

-- Catalog RPCs follow configured Catalog edit permission.
create or replace function public.get_catalog_admin_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_deleted_codes jsonb;
begin
  if not private.has_section_access('catalog','view') then
    raise exception 'CATALOG_VIEW_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select revision into v_revision
  from public.catalog_sync_state
  where id = 'primary';

  select coalesce(jsonb_agg(t.product_code order by t.deleted_at, t.product_code), '[]'::jsonb)
    into v_deleted_codes
  from public.catalog_product_code_tombstones t;

  return jsonb_build_object(
    'revision', coalesce(v_revision, 0),
    'deletedProductCodes', v_deleted_codes
  );
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
  v_link record;
  v_product_id text;
  v_variant_id text;
  v_product_count integer;
  v_occasion_count integer;
begin
  v_role := private.current_staff_role();
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_occasions) <> 'array' then
    raise exception 'p_occasions must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'p_products must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_products) = 0 then
    raise exception 'Refusing to replace the catalog with an empty product snapshot.' using errcode = '22023';
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

  -- Upsert occasions first so product foreign keys always resolve.
  for v_occasion in select value from jsonb_array_elements(p_occasions)
  loop
    insert into public.occasions (
      id, name, prefix, sort_order, is_active
    ) values (
      v_occasion->>'id',
      v_occasion->>'name',
      v_occasion->>'prefix',
      coalesce((v_occasion->>'sortOrder')::integer, 0),
      coalesce((v_occasion->>'isActive')::boolean, true)
    )
    on conflict (id) do update set
      name = excluded.name,
      prefix = excluded.prefix,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      updated_at = now();
  end loop;

  -- Upsert master products, their occasion links and variants.
  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_product_id := v_product->>'id';
    if coalesce(v_product_id, '') = '' then
      raise exception 'Catalog product is missing id.' using errcode = '22023';
    end if;

    insert into public.products (
      id,
      product_code,
      primary_occasion_id,
      material,
      name,
      description,
      product_type,
      collection_series,
      pricing_type,
      order_type,
      is_featured,
      is_active,
      promo_label,
      original_price_idr,
      is_customizable,
      sort_order
    ) values (
      v_product_id,
      v_product->>'productCode',
      nullif(v_product->>'primaryOccasionId', ''),
      v_product->>'material',
      v_product->>'name',
      nullif(v_product->>'description', ''),
      nullif(v_product->>'productType', ''),
      nullif(v_product->>'collectionSeries', ''),
      nullif(v_product->>'pricingType', ''),
      nullif(v_product->>'orderType', ''),
      coalesce((v_product->>'isFeatured')::boolean, false),
      coalesce((v_product->>'isActive')::boolean, true),
      nullif(v_product->>'promoLabel', ''),
      case when v_product ? 'originalPriceIdr' and v_product->>'originalPriceIdr' is not null
        then (v_product->>'originalPriceIdr')::bigint else null end,
      coalesce((v_product->>'isCustomizable')::boolean, false),
      coalesce((v_product->>'sortOrder')::integer, 0)
    )
    on conflict (id) do update set
      product_code = excluded.product_code,
      primary_occasion_id = excluded.primary_occasion_id,
      material = excluded.material,
      name = excluded.name,
      description = excluded.description,
      product_type = excluded.product_type,
      collection_series = excluded.collection_series,
      pricing_type = excluded.pricing_type,
      order_type = excluded.order_type,
      is_featured = excluded.is_featured,
      is_active = excluded.is_active,
      promo_label = excluded.promo_label,
      original_price_idr = excluded.original_price_idr,
      is_customizable = excluded.is_customizable,
      sort_order = excluded.sort_order,
      updated_at = now();

    delete from public.product_occasions
    where product_id = v_product_id;

    for v_link in
      select value as occasion_id, ordinality
      from jsonb_array_elements_text(coalesce(v_product->'occasionIds', '[]'::jsonb)) with ordinality
    loop
      insert into public.product_occasions (product_id, occasion_id, sort_order)
      values (v_product_id, v_link.occasion_id, (v_link.ordinality - 1)::integer)
      on conflict (product_id, occasion_id) do update set sort_order = excluded.sort_order;
    end loop;

    -- Remove variants deleted in this snapshot before upserting current ones.
    delete from public.product_variants pv
    where pv.product_id = v_product_id
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(v_product->'variants', '[]'::jsonb)) item
        where item->>'id' = pv.id
      );

    for v_variant in select value from jsonb_array_elements(coalesce(v_product->'variants', '[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';
      insert into public.product_variants (
        id, product_id, sku, size, price_idr, status, sort_order
      ) values (
        v_variant_id,
        v_product_id,
        v_variant->>'sku',
        v_variant->>'size',
        (v_variant->>'priceIdr')::bigint,
        coalesce(v_variant->>'status', 'active'),
        coalesce((v_variant->>'sortOrder')::integer, 0)
      )
      on conflict (id) do update set
        product_id = excluded.product_id,
        sku = excluded.sku,
        size = excluded.size,
        price_idr = excluded.price_idr,
        status = excluded.status,
        sort_order = excluded.sort_order,
        updated_at = now();

      -- Cost remains Finance-private. Only Owner catalog saves may change it;
      -- Admin product edits preserve any existing cost row untouched.
      if v_role = 'owner' and v_variant ? 'costIdr' then
        insert into public.product_variant_costs (variant_id, cost_idr)
        values (
          v_variant_id,
          case when v_variant->>'costIdr' is null then null else (v_variant->>'costIdr')::bigint end
        )
        on conflict (variant_id) do update set
          cost_idr = excluded.cost_idr,
          updated_at = now();
      end if;
    end loop;
  end loop;

  -- Permanent product removals create a code tombstone before delete so a
  -- future client cannot accidentally reuse the retired display identifier.
  insert into public.catalog_product_code_tombstones (
    product_code, deleted_product_id, deleted_at, deleted_by
  )
  select p.product_code, p.id, now(), (select auth.uid())
  from public.products p
  where not exists (
    select 1
    from jsonb_array_elements(p_products) item
    where item->>'id' = p.id
  )
  on conflict (product_code) do update set
    deleted_product_id = excluded.deleted_product_id,
    deleted_at = excluded.deleted_at,
    deleted_by = excluded.deleted_by;

  delete from public.products p
  where not exists (
    select 1
    from jsonb_array_elements(p_products) item
    where item->>'id' = p.id
  );

  -- Remove occasions that were explicitly removed from the OS snapshot.
  -- Restrict FKs intentionally make this fail instead of orphaning products.
  delete from public.occasions o
  where not exists (
    select 1
    from jsonb_array_elements(p_occasions) item
    where item->>'id' = o.id
  );

  v_next_revision := v_current_revision + 1;
  update public.catalog_sync_state
  set revision = v_next_revision,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = 'primary';

  select jsonb_array_length(p_products) into v_product_count;
  select jsonb_array_length(p_occasions) into v_occasion_count;

  return jsonb_build_object(
    'revision', v_next_revision,
    'productCount', v_product_count,
    'occasionCount', v_occasion_count
  );
end;
$$;

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
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
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
begin
  v_role := private.current_staff_role();
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_templates) <> 'array' or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'Size guide templates and targets must be JSON arrays.' using errcode = '22023';
  end if;

  delete from public.size_guide_targets;
  delete from public.size_guide_templates;

  for v_template in select value from jsonb_array_elements(p_templates)
  loop
    insert into public.size_guide_templates (
      id, name, storage_path, mime_type, byte_size, width, height, created_at, updated_at
    ) values (
      v_template->>'id',
      trim(v_template->>'name'),
      v_template->>'storagePath',
      coalesce(v_template->>'mimeType', 'image/jpeg'),
      (v_template->>'byteSize')::integer,
      (v_template->>'width')::integer,
      (v_template->>'height')::integer,
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

-- Store settings use the same backend capability model.
create or replace function public.get_store_admin_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if not private.has_action_permission('settings.edit_store_profile') then
    raise exception 'STORE_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select revision, updated_at
    into v_revision, v_updated_at
  from public.store_sync_state
  where id = 'primary';

  return jsonb_build_object(
    'revision', coalesce(v_revision, 0),
    'updatedAt', v_updated_at
  );
end;
$$;

create or replace function public.replace_public_store_snapshot(
  p_base_revision bigint,
  p_profile jsonb,
  p_branches jsonb,
  p_payment_accounts jsonb,
  p_payment_instructions text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_revision bigint;
  v_next_revision bigint;
  v_branch jsonb;
  v_account jsonb;
  v_branch_count integer;
  v_account_count integer;
  v_active_branch_count integer;
  v_active_account_count integer;
  v_default_account_count integer;
  v_duplicate_count integer;
  v_default_branch_count integer;
begin
  if not (
    private.has_action_permission('settings.edit_store_profile')
    and private.has_action_permission('settings.edit_branches')
    and private.has_action_permission('settings.edit_payment_methods')
  ) then
    raise exception 'STORE_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_profile) <> 'object' then
    raise exception 'p_profile must be a JSON object.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_branches) <> 'array' then
    raise exception 'p_branches must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payment_accounts) <> 'array' then
    raise exception 'p_payment_accounts must be a JSON array.' using errcode = '22023';
  end if;
  if coalesce(nullif(trim(p_profile->>'storeName'), ''), '') = '' then
    raise exception 'Store name is required.' using errcode = '22023';
  end if;
  if coalesce(nullif(trim(p_payment_instructions), ''), '') = '' then
    raise exception 'Payment instructions are required.' using errcode = '22023';
  end if;

  select count(*) into v_active_branch_count
  from jsonb_array_elements(p_branches) branch
  where coalesce((branch->>'isActive')::boolean, true) = true;
  if v_active_branch_count = 0 then
    raise exception 'At least one active branch is required.' using errcode = '22023';
  end if;

  select count(*) - count(distinct branch->>'id') into v_duplicate_count
  from jsonb_array_elements(p_branches) branch;
  if v_duplicate_count > 0 then
    raise exception 'Branch ids must be unique.' using errcode = '22023';
  end if;

  select count(*) - count(distinct upper(trim(branch->>'code'))) into v_duplicate_count
  from jsonb_array_elements(p_branches) branch;
  if v_duplicate_count > 0 then
    raise exception 'Branch codes must be unique.' using errcode = '22023';
  end if;

  select count(*) into v_default_branch_count
  from jsonb_array_elements(p_branches) branch
  where coalesce((branch->>'isActive')::boolean, true) = true
    and coalesce((branch->>'isDefault')::boolean, false) = true;
  if v_default_branch_count > 1 then
    raise exception 'At most one active branch may be the default.' using errcode = '22023';
  end if;

  select count(*) into v_active_account_count
  from jsonb_array_elements(p_payment_accounts) account
  where coalesce((account->>'isActive')::boolean, true) = true;
  if v_active_account_count = 0 then
    raise exception 'At least one active payment account is required.' using errcode = '22023';
  end if;

  select count(*) into v_default_account_count
  from jsonb_array_elements(p_payment_accounts) account
  where coalesce((account->>'isActive')::boolean, true) = true
    and coalesce((account->>'isDefault')::boolean, false) = true;
  if v_default_account_count <> 1 then
    raise exception 'Exactly one active payment account must be the default.' using errcode = '22023';
  end if;


  select count(*) - count(distinct account->>'id') into v_duplicate_count
  from jsonb_array_elements(p_payment_accounts) account;
  if v_duplicate_count > 0 then
    raise exception 'Payment account ids must be unique.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payment_accounts) account
    cross join lateral jsonb_array_elements_text(coalesce(account->'branchIds', '[]'::jsonb)) branch_id
    where not exists (
      select 1 from jsonb_array_elements(p_branches) branch
      where branch->>'id' = branch_id
    )
  ) then
    raise exception 'Payment account references an unknown branch.' using errcode = '22023';
  end if;

  insert into public.store_sync_state (id, revision)
  values ('primary', 0)
  on conflict (id) do nothing;

  select revision into v_current_revision
  from public.store_sync_state
  where id = 'primary'
  for update;

  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'STORE_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision
      using errcode = '40001';
  end if;

  insert into public.store_profile (
    id, store_name, legal_name, logo_url, phone, whatsapp, email, address, currency, timezone
  ) values (
    'primary',
    trim(p_profile->>'storeName'),
    nullif(trim(p_profile->>'legalName'), ''),
    nullif(trim(p_profile->>'logoUrl'), ''),
    coalesce(trim(p_profile->>'phone'), ''),
    coalesce(trim(p_profile->>'whatsapp'), ''),
    coalesce(trim(p_profile->>'email'), ''),
    coalesce(trim(p_profile->>'address'), ''),
    'IDR',
    'Asia/Jakarta'
  )
  on conflict (id) do update set
    store_name = excluded.store_name,
    legal_name = excluded.legal_name,
    logo_url = excluded.logo_url,
    phone = excluded.phone,
    whatsapp = excluded.whatsapp,
    email = excluded.email,
    address = excluded.address,
    currency = excluded.currency,
    timezone = excluded.timezone,
    updated_at = now();

  -- Clear defaults before upserting to avoid transient unique-index conflicts.
  update public.branches set is_default = false where is_default = true;

  for v_branch in select value from jsonb_array_elements(p_branches)
  loop
    if coalesce(nullif(trim(v_branch->>'id'), ''), '') = '' then
      raise exception 'Branch id is required.' using errcode = '22023';
    end if;
    if coalesce(nullif(trim(v_branch->>'code'), ''), '') = '' then
      raise exception 'Branch code is required.' using errcode = '22023';
    end if;
    if coalesce((v_branch->>'deliveryFeeIdr')::bigint, 0) < 0 then
      raise exception 'Branch delivery fee cannot be negative.' using errcode = '22023';
    end if;

    insert into public.branches (
      id, name, code, address, phone, is_active, is_default, sort_order,
      delivery_fee_idr, opening_hours, latitude, longitude
    ) values (
      trim(v_branch->>'id'),
      trim(v_branch->>'name'),
      upper(trim(v_branch->>'code')),
      coalesce(trim(v_branch->>'address'), ''),
      coalesce(trim(v_branch->>'phone'), ''),
      coalesce((v_branch->>'isActive')::boolean, true),
      coalesce((v_branch->>'isDefault')::boolean, false),
      coalesce((v_branch->>'sortOrder')::integer, 0),
      coalesce((v_branch->>'deliveryFeeIdr')::bigint, 0),
      coalesce(v_branch->'openingHours', '{}'::jsonb),
      case when v_branch ? 'latitude' and v_branch->>'latitude' is not null then (v_branch->>'latitude')::double precision else null end,
      case when v_branch ? 'longitude' and v_branch->>'longitude' is not null then (v_branch->>'longitude')::double precision else null end
    )
    on conflict (id) do update set
      name = excluded.name,
      code = excluded.code,
      address = excluded.address,
      phone = excluded.phone,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      sort_order = excluded.sort_order,
      delivery_fee_idr = excluded.delivery_fee_idr,
      opening_hours = excluded.opening_hours,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = now();
  end loop;

  -- Branch rows may be referenced by historical Orders/HR data. Never delete
  -- omitted rows from a full snapshot; retire them instead.
  update public.branches branch
  set is_active = false,
      is_default = false,
      updated_at = now()
  where not exists (
    select 1 from jsonb_array_elements(p_branches) item
    where item->>'id' = branch.id
  );

  update public.public_payment_accounts set is_default = false where is_default = true;

  for v_account in select value from jsonb_array_elements(p_payment_accounts)
  loop
    if coalesce(nullif(trim(v_account->>'id'), ''), '') = '' then
      raise exception 'Payment account id is required.' using errcode = '22023';
    end if;

    insert into public.public_payment_accounts (
      id, bank_name, account_number, account_holder, type,
      is_active, is_default, display_order, is_customer_visible, branch_ids
    ) values (
      trim(v_account->>'id'),
      trim(v_account->>'bankName'),
      trim(v_account->>'accountNumber'),
      trim(v_account->>'accountHolder'),
      coalesce(nullif(v_account->>'type', ''), 'bank_transfer'),
      coalesce((v_account->>'isActive')::boolean, true),
      coalesce((v_account->>'isDefault')::boolean, false),
      coalesce((v_account->>'displayOrder')::integer, 0),
      coalesce((v_account->>'isCustomerVisible')::boolean, true),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_account->'branchIds', '[]'::jsonb))), '{}'::text[])
    )
    on conflict (id) do update set
      bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      type = excluded.type,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      display_order = excluded.display_order,
      is_customer_visible = excluded.is_customer_visible,
      branch_ids = excluded.branch_ids,
      updated_at = now();
  end loop;

  delete from public.public_payment_accounts account
  where not exists (
    select 1 from jsonb_array_elements(p_payment_accounts) item
    where item->>'id' = account.id
  );

  insert into public.storefront_payment_settings (id, payment_instructions)
  values ('primary', trim(p_payment_instructions))
  on conflict (id) do update set
    payment_instructions = excluded.payment_instructions,
    updated_at = now();

  v_next_revision := v_current_revision + 1;
  update public.store_sync_state
  set revision = v_next_revision,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = 'primary';

  select jsonb_array_length(p_branches) into v_branch_count;
  select jsonb_array_length(p_payment_accounts) into v_account_count;

  return jsonb_build_object(
    'revision', v_next_revision,
    'branchCount', v_branch_count,
    'paymentAccountCount', v_account_count
  );
end;
$$;


revoke execute on function public.save_customer_profile(jsonb,bigint) from public, anon;
grant execute on function public.save_customer_profile(jsonb,bigint) to authenticated;
revoke execute on function public.delete_customer_profile(text,bigint) from public, anon;
grant execute on function public.delete_customer_profile(text,bigint) to authenticated;
revoke execute on function public.get_catalog_admin_state() from public, anon;
grant execute on function public.get_catalog_admin_state() to authenticated;
revoke execute on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) from public, anon;
grant execute on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) to authenticated;
revoke execute on function public.replace_product_images_metadata(bigint,text,jsonb) from public, anon;
grant execute on function public.replace_product_images_metadata(bigint,text,jsonb) to authenticated;
revoke execute on function public.replace_size_guide_library(jsonb,jsonb) from public, anon;
grant execute on function public.replace_size_guide_library(jsonb,jsonb) to authenticated;
revoke execute on function public.get_store_admin_state() from public, anon;
grant execute on function public.get_store_admin_state() to authenticated;
revoke execute on function public.replace_public_store_snapshot(bigint,jsonb,jsonb,jsonb,text) from public, anon;
grant execute on function public.replace_public_store_snapshot(bigint,jsonb,jsonb,jsonb,text) to authenticated;

commit;
