-- Fleurstales V3.5 backend wiring smoke test.
-- Run after all migrations against a staging Supabase project.
begin;

do $$
declare
  missing text;
begin
  select string_agg(name, ', ' order by name) into missing
  from (values
    ('quote_storefront_checkout'),
    ('create_internal_order'),
    ('get_my_staff_operations'),
    ('get_operational_roster'),
    ('save_my_attendance_record'),
    ('list_security_audit_events')
  ) required(name)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=required.name
  );
  if missing is not null then raise exception 'Missing V3.5 RPCs: %', missing; end if;
end $$;

do $$
declare
  missing text;
begin
  select string_agg(name, ', ' order by name) into missing
  from (values
    ('staff_schedule_defaults'),
    ('staff_schedule_overrides'),
    ('staff_attendance_records'),
    ('employee_point_events'),
    ('customers'),
    ('orders'),
    ('order_payment_events')
  ) required(name)
  where to_regclass('public.'||required.name) is null;
  if missing is not null then raise exception 'Missing V3.5 tables: %', missing; end if;
end $$;

-- New exposed tables must have RLS enabled.
do $$
declare bad text;
begin
  select string_agg(tablename, ', ') into bad
  from pg_tables
  where schemaname='public'
    and tablename in ('staff_schedule_defaults','staff_schedule_overrides','staff_attendance_records','employee_point_events')
    and rowsecurity=false;
  if bad is not null then raise exception 'RLS disabled on: %', bad; end if;
end $$;

-- Anonymous clients must not receive direct access to private staff data.
do $$
declare bad text;
begin
  select string_agg(table_name||':'||privilege_type, ', ') into bad
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
    and table_name in ('staff_schedule_defaults','staff_schedule_overrides','staff_attendance_records','employee_point_events','customers','orders','order_payment_events');
  if bad is not null then raise exception 'Unexpected anon grants: %', bad; end if;
end $$;

-- Tables expected by the OS live layer are published for Postgres Changes.
do $$
declare missing text;
begin
  select string_agg(name, ', ' order by name) into missing
  from (values ('customers'),('staff_schedule_defaults'),('staff_schedule_overrides'),('staff_attendance_records'),('employee_point_events')) expected(name)
  where not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename=expected.name
  );
  if missing is not null then raise exception 'Missing Realtime publication tables: %', missing; end if;
end $$;

rollback;
