-- Phase 9 structural smoke checks (execute after migrations on a real Supabase project).
do $$
begin
  if to_regclass('public.staff_access_profiles') is null then raise exception 'staff_access_profiles missing'; end if;
  if to_regprocedure('public.get_current_staff_access_profile()') is null then raise exception 'staff session RPC missing'; end if;
  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname='public' and tablename='staff_access_profiles'
      and indexname='idx_staff_access_profiles_employee_unique'
  ) then raise exception 'employee mapping uniqueness missing'; end if;
  if exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='staff_access_profiles'
  ) then raise exception 'staff_access_profiles should not be in realtime publication'; end if;
end;
$$;
