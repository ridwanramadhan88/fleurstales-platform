-- Fleurstales V3.6 live-database smoke checks.
-- Run after all migrations through 20260725233000.

do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='idempotency_request_hash') then
    raise exception 'orders.idempotency_request_hash is missing';
  end if;
  if to_regprocedure('public.create_storefront_order(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text)') is null then
    raise exception 'V3.6 storefront checkout function is missing';
  end if;
  if to_regprocedure('public.create_internal_order(jsonb)') is null then
    raise exception 'V3.6 internal order function is missing';
  end if;
  if to_regprocedure('public.save_my_attendance_record(jsonb)') is null then
    raise exception 'V3.6 attendance function is missing';
  end if;
  if to_regprocedure('private.customer_voucher_metrics(text)') is null then
    raise exception 'Verified voucher metrics helper is missing';
  end if;
  if to_regprocedure('private.geo_distance_meters(double precision,double precision,double precision,double precision)') is null then
    raise exception 'Server attendance distance helper is missing';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='idx_employee_point_events_source') then
    raise exception 'Employee-point source uniqueness is missing';
  end if;
  if has_function_privilege('anon','public.create_internal_order(jsonb)','execute') then
    raise exception 'anon must not execute internal order creation';
  end if;
  if not has_function_privilege('authenticated','public.create_internal_order(jsonb)','execute') then
    raise exception 'authenticated staff cannot execute internal order creation';
  end if;
end $$;

-- Confirm the direct table API cannot read the private idempotency hash through
-- an accidentally broad table-level grant. Column grants may still expose the
-- approved public Order projection without this column.
do $$
begin
  if has_column_privilege('anon','public.orders','idempotency_request_hash','select') then
    raise exception 'anon can read the idempotency request hash';
  end if;
end $$;
