begin;

-- Catalog PR 1B: server-side privacy, invariant enforcement, and authoritative
-- Size Template persistence.

-- Cost is sensitive operational data. It is readable only by Owner and Finance,
-- independently from Catalog edit permission. Admin can edit Catalog content
-- without receiving Cost rows.
drop policy if exists variant_costs_finance_read on public.product_variant_costs;
drop policy if exists variant_costs_owner_finance_read on public.product_variant_costs;
create policy variant_costs_owner_finance_read
on public.product_variant_costs
for select to authenticated
using (private.current_staff_role() = any(array['owner','finance']));

-- Variant flower recipes are internal production data. Storefront/customer
-- clients must never read the live recipe table; Orders keep their immutable
-- order-time snapshot through the existing private trigger.
revoke select on table public.product_variant_flower_recipes from anon;
grant select on table public.product_variant_flower_recipes to authenticated;

drop policy if exists product_variant_flower_recipes_public_read on public.product_variant_flower_recipes;
drop policy if exists product_variant_flower_recipes_catalog_read on public.product_variant_flower_recipes;
create policy product_variant_flower_recipes_catalog_read
on public.product_variant_flower_recipes
for select to authenticated
using (private.current_staff_role() = any(array['owner','admin']));

comment on table public.product_variant_flower_recipes is
  'Internal production recipe by Catalog variant. Never expose through Storefront catalog reads; Orders use flower_recipe_snapshot.';

-- Even privileged writers cannot persist a sellable zero/negative-price variant.
alter table public.product_variants
  drop constraint if exists product_variants_active_positive_price_check;

alter table public.product_variants
  add constraint product_variants_active_positive_price_check
  check (status <> 'active' or price_idr > 0);

-- Validate aggregate Catalog invariants before the revision-aware snapshot RPC
-- mutates any row.
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

      if v_variant_status = 'active'
         and coalesce((v_size->>'isActive')::boolean, true) = false then
        raise exception 'CATALOG_ARCHIVED_SIZE_OPTION:%:%', v_product_id, v_size_option_id using errcode = '23514';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function private.validate_catalog_snapshot_payload(jsonb) from public, anon, authenticated;

-- Restore configured Catalog edit authority and enforce the aggregate validation
-- at the same transaction boundary that owns Catalog writes.
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
  if jsonb_typeof(p_occasions) <> 'array' or jsonb_typeof(p_products) <> 'array' then
    raise exception 'Catalog payloads must be JSON arrays.' using errcode = '22023';
  end if;

  perform private.validate_catalog_snapshot_payload(p_products);

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

      -- Only Owner may mutate Cost. Admin saves preserve existing Cost rows.
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

-- Recipe mutation follows configured Catalog edit authority but live recipe
-- reads remain Owner/Admin-only.
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
  v_current_revision bigint;
  v_product jsonb;
  v_variant jsonb;
  v_recipe jsonb;
  v_variant_id text;
  v_recipe_id text;
  v_count integer := 0;
begin
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode='42501';
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
    for v_variant in
      select value from jsonb_array_elements(coalesce(v_product->'variants','[]'::jsonb))
    loop
      v_variant_id := v_variant->>'id';
      if coalesce(v_variant_id,'') = '' then
        raise exception 'Catalog variant is missing id.' using errcode='22023';
      end if;

      delete from public.product_variant_flower_recipes where variant_id = v_variant_id;

      for v_recipe in
        select value from jsonb_array_elements(coalesce(v_variant->'flowerRecipe','[]'::jsonb))
      loop
        v_recipe_id := coalesce(
          nullif(v_recipe->>'id',''),
          'flower_recipe_'||replace(gen_random_uuid()::text,'-','')
        );
        insert into public.product_variant_flower_recipes(
          id, variant_id, flower_name, quantity, unit, sort_order
        )
        values(
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

-- Replacing the Size Template library must not orphan a stable size identity,
-- remove a historical referenced child, or archive a child still sold by any
-- active variant.
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
  loop
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

    if v_variant.status = 'active'
       and coalesce((v_size->>'isActive')::boolean, true) = false then
      raise exception 'SIZE_GUIDE_ACTIVE_CHILD_CANNOT_BE_ARCHIVED:%', v_variant.id using errcode = '23514';
    end if;
  end loop;

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

  return jsonb_build_object(
    'templateCount',jsonb_array_length(p_templates),
    'targetCount',jsonb_array_length(p_targets)
  );
end;
$$;

revoke all on function public.replace_size_guide_library(jsonb,jsonb) from public;
grant execute on function public.replace_size_guide_library(jsonb,jsonb) to authenticated;

commit;
