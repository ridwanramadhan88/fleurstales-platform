-- Atomic-release cleanup contracts. Read-only assertions only.

do $$
declare
  v_actual text[];
  v_expected constant text[] := array[
    'business_activities',
    'customers',
    'employee_point_events',
    'order_activities',
    'orders',
    'staff_notifications',
    'staff_roster_refresh_events'
  ];
begin
  select coalesce(array_agg(tablename order by tablename), array[]::text[])
  into v_actual
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public';

  if v_actual is distinct from v_expected then
    raise exception 'Unexpected supabase_realtime publication tables: %', v_actual;
  end if;

  if has_table_privilege('anon', 'public.operational_state', 'SELECT')
     or has_table_privilege('anon', 'public.operational_state', 'INSERT')
     or has_table_privilege('anon', 'public.operational_state', 'UPDATE')
     or has_table_privilege('anon', 'public.operational_state', 'DELETE')
     or has_table_privilege('authenticated', 'public.operational_state', 'SELECT')
     or has_table_privilege('authenticated', 'public.operational_state', 'INSERT')
     or has_table_privilege('authenticated', 'public.operational_state', 'UPDATE')
     or has_table_privilege('authenticated', 'public.operational_state', 'DELETE') then
    raise exception 'Retired operational_state is still available to browser roles';
  end if;

  if not has_table_privilege('anon', 'public.arrangement_types', 'SELECT')
     or not has_table_privilege('authenticated', 'public.arrangement_types', 'SELECT') then
    raise exception 'Arrangement types lost required public read access';
  end if;

  if has_table_privilege('anon', 'public.arrangement_types', 'TRUNCATE')
     or has_table_privilege('anon', 'public.arrangement_types', 'REFERENCES')
     or has_table_privilege('anon', 'public.arrangement_types', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.arrangement_types', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.arrangement_types', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.arrangement_types', 'TRIGGER') then
    raise exception 'Arrangement types retains excessive browser-role grants';
  end if;
end $$;
