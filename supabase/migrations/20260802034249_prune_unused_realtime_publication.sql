-- Publish only tables consumed by the Business OS Realtime channel.
-- Catalog and Store use revision-aware bridges; roster mutations are
-- coalesced through staff_roster_refresh_events.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'branches',
    'occasions',
    'order_items',
    'order_payment_events',
    'product_images',
    'product_occasions',
    'product_variants',
    'products',
    'public_payment_accounts',
    'size_guide_targets',
    'size_guide_templates',
    'staff_access_profiles',
    'staff_attendance_records',
    'staff_schedule_defaults',
    'staff_schedule_overrides',
    'store_profile',
    'storefront_payment_settings'
  ] loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end $$;
