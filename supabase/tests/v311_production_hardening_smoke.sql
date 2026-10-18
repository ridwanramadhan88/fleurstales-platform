-- Fleurstales V3.11 focused production-hardening smoke checks.
-- Run after all migrations through 20260726090000. Later migrations may
-- intentionally strengthen or supersede specific authorization semantics.

do $$
declare
  v_source text;
begin
  if has_table_privilege('authenticated','public.staff_access_profiles','INSERT')
     or has_table_privilege('authenticated','public.staff_access_profiles','UPDATE')
     or has_table_privilege('authenticated','public.staff_access_profiles','DELETE') then
    raise exception 'Authenticated clients still have direct staff_access_profiles write privileges';
  end if;
  if not has_table_privilege('authenticated','public.staff_access_profiles','SELECT') then
    raise exception 'Authenticated staff lost staff_access_profiles read access';
  end if;
  if has_function_privilege('authenticated','public.service_create_staff_access_profile(uuid,text,text,text,text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.service_update_staff_access_email(uuid,text)','EXECUTE') then
    raise exception 'Service-only staff profile RPCs are exposed to authenticated clients';
  end if;
  if not has_function_privilege('service_role','public.service_create_staff_access_profile(uuid,text,text,text,text,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.service_update_staff_access_email(uuid,text)','EXECUTE') then
    raise exception 'Service role cannot execute staff profile provisioning RPCs';
  end if;
  select pg_get_functiondef('public.service_create_staff_access_profile(uuid,text,text,text,text,text,text)'::regprocedure) into v_source;
  if position('INVALID_PROVISIONED_STAFF_ROLE' in v_source)=0 then
    raise exception 'Service provisioning RPC is missing role-family validation';
  end if;
end $$;

do $$
begin
  if to_regclass('private.staff_login_rate_limits') is null then raise exception 'Staff login throttle table is missing'; end if;
  if to_regprocedure('public.service_consume_staff_login_attempt(text,text)') is null
     or to_regprocedure('public.service_clear_staff_login_attempts(text,text)') is null then
    raise exception 'Staff login throttle RPCs are incomplete';
  end if;
  if has_function_privilege('authenticated','public.service_consume_staff_login_attempt(text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.service_clear_staff_login_attempts(text,text)','EXECUTE') then
    raise exception 'Authenticated clients can manipulate staff login throttles';
  end if;
end $$;

do $$
declare
  v_ip_a text:=encode(extensions.digest('smoke-ip-a','sha256'::text),'hex');
  v_ip_b text:=encode(extensions.digest('smoke-ip-b','sha256'::text),'hex');
  v_result jsonb;
  v_allowed integer:=0;
  i integer;
begin
  -- Repeated failures from one username+IP pair must eventually lock that pair.
  for i in 1..8 loop
    v_result:=public.service_consume_staff_login_attempt('smoke.lockout',v_ip_a);
    if (v_result->>'allowed')::boolean then v_allowed:=v_allowed+1; end if;
  end loop;
  if v_allowed < 3 or v_allowed > 5 then
    raise exception 'Pair lock should allow only a handful of attempts, allowed %', v_allowed;
  end if;
  if (v_result->>'allowed')::boolean is not false then raise exception 'Pair lock must block repeated attempts from the same IP'; end if;
  -- The same username from another IP must not be locked out by those failures.
  v_result:=public.service_consume_staff_login_attempt('smoke.lockout',v_ip_b);
  if (v_result->>'allowed')::boolean is not true then raise exception 'Another IP must not be locked out by a different IP''s failures'; end if;
  perform public.service_clear_staff_login_attempts('smoke.lockout',v_ip_a);
  perform public.service_clear_staff_login_attempts('smoke.lockout',v_ip_b);
end $$;

do $$
declare
  v_source text;
begin
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='attendance_selfies_delete') then
    raise exception 'Attendance selfie evidence is still deletable by authenticated staff';
  end if;
  if to_regprocedure('private.attendance_selfie_object_is_valid(text,text,date,text)') is null then
    raise exception 'Attendance selfie object validator is missing';
  end if;
  if has_function_privilege('authenticated','public.save_my_attendance_record_v310_internal(jsonb)','EXECUTE') then
    raise exception 'Authenticated clients can bypass the V3.11 attendance evidence wrapper';
  end if;
  select pg_get_functiondef('public.save_my_attendance_record(jsonb)'::regprocedure) into v_source;
  if position('attendance_selfie_object_is_valid' in v_source)=0
     or position('ATTENDANCE_SELFIE_OBJECT_REQUIRED' in v_source)=0 then
    raise exception 'Attendance writer does not verify Storage evidence';
  end if;
end $$;

do $$
declare
  v_source text;
begin
  if to_regclass('public.staff_roster_refresh_events') is null then raise exception 'Safe roster refresh table is missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='staff_roster_refresh_events' and policyname='staff_roster_refresh_events_admin_read') then
    raise exception 'Admin roster refresh RLS policy is missing';
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='staff_roster_refresh_events') then
    raise exception 'Roster refresh events are not published to Realtime';
  end if;

  -- Notifications are read/awareness surfaces. Later staff-read hardening makes
  -- Admin notification visibility company-wide; branch ownership belongs at
  -- the authoritative Order mutation boundary instead.
  select pg_get_functiondef('private.can_read_staff_notification(public.staff_notifications)'::regprocedure) into v_source;
  if position('notification_kind_allowed_for_role' in v_source)=0 then
    raise exception 'Admin notification reads lost role/capability filtering';
  end if;
  if position('current_staff_branch_id' in v_source)>0 then
    raise exception 'Admin notification reads were re-narrowed to runtime branch';
  end if;
  if to_regprocedure('private.enforce_admin_order_mutation_branch()') is null then
    raise exception 'Admin operational branch authority is missing from Order mutation boundary';
  end if;
end $$;

do $$
declare
  v_policy text;
begin
  select qual into v_policy from pg_policies where schemaname='public' and tablename='staff_schedule_defaults' and policyname='staff_schedule_defaults_read';
  if position('hr.view_employees' in coalesce(v_policy,''))=0 then raise exception 'Schedule defaults RLS is not capability-aligned'; end if;
  select qual into v_policy from pg_policies where schemaname='public' and tablename='staff_attendance_records' and policyname='staff_attendance_records_read';
  if position('hr.review_attendance' in coalesce(v_policy,''))=0 then raise exception 'Attendance RLS is not capability-aligned'; end if;
  select qual into v_policy from pg_policies where schemaname='public' and tablename='employee_point_events' and policyname='employee_point_events_read';
  if position('hr.manage_points' in coalesce(v_policy,''))=0 or position('finance.view_payroll' in coalesce(v_policy,''))=0 then
    raise exception 'Employee point RLS is not capability-aligned';
  end if;
end $$;