-- Run after applying the Fleurstales shared-core migrations in the Supabase SQL Editor.
-- Raises an exception when a required shared-data contract object is missing.

do $$
declare
  t text;
  expected_tables text[] := array[
    'staff_access_profiles','store_profile','branches','public_payment_accounts','storefront_payment_settings',
    'occasions','products','product_occasions','product_variants','product_variant_costs','product_images',
    'store_sync_state',
    'customers','customer_addresses','order_sequences','orders','order_items','order_payment_events','order_activities'
  ];
begin
  foreach t in array expected_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'Missing Phase 2 table: public.%', t;
    end if;
  end loop;

  if to_regprocedure('public.create_storefront_order(text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text)') is null then
    raise exception 'Missing create_storefront_order RPC';
  end if;

  if to_regprocedure('public.get_store_admin_state()') is null then
    raise exception 'Missing get_store_admin_state RPC';
  end if;

  if to_regprocedure('public.replace_public_store_snapshot(bigint,jsonb,jsonb,jsonb,text)') is null then
    raise exception 'Missing replace_public_store_snapshot RPC';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'branches' and column_name = 'sort_order'
  ) then
    raise exception 'Missing branches.sort_order required by Phase 6';
  end if;

  if not exists (select 1 from storage.buckets where id = 'product-images' and public = true) then
    raise exception 'Missing public product-images bucket';
  end if;

  if not exists (select 1 from storage.buckets where id = 'store-assets' and public = true) then
    raise exception 'Missing public store-assets bucket';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name = 'customers'
  ) then
    raise exception 'Security regression: anon has direct customers table privileges';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name = 'orders'
  ) then
    raise exception 'Security regression: anon has direct orders table privileges';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name = 'product_variant_costs'
  ) then
    raise exception 'Security regression: anon has product cost privileges';
  end if;

  raise notice 'Fleurstales shared-core smoke check passed.';
end;
$$;
