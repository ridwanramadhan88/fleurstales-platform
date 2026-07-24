-- Fleurstales shared Catalog synchronization
-- Phase 4: transactional OS catalog writes + optimistic concurrency.

begin;

alter table public.products add column if not exists sort_order integer not null default 0;
create index if not exists idx_products_sort_order on public.products(sort_order, name);

create table if not exists public.catalog_sync_state (
  id text primary key default 'primary' check (id = 'primary'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.catalog_sync_state (id, revision)
values ('primary', 0)
on conflict (id) do nothing;

-- Product display codes must never be reused after a permanent deletion.
create table if not exists public.catalog_product_code_tombstones (
  product_code text primary key,
  deleted_product_id text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id) on delete set null
);

alter table public.catalog_sync_state enable row level security;
alter table public.catalog_product_code_tombstones enable row level security;

revoke all on table public.catalog_sync_state from anon, authenticated;
revoke all on table public.catalog_product_code_tombstones from anon, authenticated;
grant select on table public.catalog_sync_state to authenticated;
grant select on table public.catalog_product_code_tombstones to authenticated;

create policy catalog_sync_state_editor_read on public.catalog_sync_state
for select to authenticated
using (private.has_staff_role(array['owner','admin']));

create policy catalog_tombstones_editor_read on public.catalog_product_code_tombstones
for select to authenticated
using (private.has_staff_role(array['owner','admin']));

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
  if not private.has_staff_role(array['owner','admin']) then
    raise exception 'Catalog admin access is required.' using errcode = '42501';
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
  if v_role is null or not (v_role = any(array['owner','admin'])) then
    raise exception 'Owner or Admin catalog access is required.' using errcode = '42501';
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

revoke all on function public.get_catalog_admin_state() from public;
revoke all on function public.replace_catalog_snapshot(bigint, jsonb, jsonb) from public;
grant execute on function public.get_catalog_admin_state() to authenticated;
grant execute on function public.replace_catalog_snapshot(bigint, jsonb, jsonb) to authenticated;

commit;
