-- Fleurstales Platform V3.11 focused production hardening.
-- Keeps the existing shared architecture and tightens only the reviewed
-- authentication, staff-access, attendance, roster, notification, RLS, and
-- release-safety boundaries.

begin;

-- ---------------------------------------------------------------------------
-- Staff access profiles: authenticated clients may read through RLS, but all
-- mutations must pass an authoritative RPC. Service-only helpers are provided
-- for the staff-admin Edge Function's Auth/profile transaction boundary.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table public.staff_access_profiles from authenticated;
drop policy if exists staff_access_owner_insert on public.staff_access_profiles;
drop policy if exists staff_access_owner_update on public.staff_access_profiles;
drop policy if exists staff_access_owner_delete on public.staff_access_profiles;

create or replace function public.service_create_staff_access_profile(
  p_user_id uuid,
  p_employee_id text,
  p_email text,
  p_username text,
  p_display_name text,
  p_role text,
  p_branch_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  if p_user_id is null or nullif(trim(coalesce(p_employee_id,'')),'') is null then raise exception 'INVALID_STAFF_IDENTITY' using errcode='22023'; end if;
  if p_role not in ('admin','finance','hr','florist') then raise exception 'INVALID_PROVISIONED_STAFF_ROLE' using errcode='22023'; end if;
  if v_username !~ '^[a-z][a-z0-9._-]*$' then raise exception 'INVALID_STAFF_USERNAME' using errcode='22023'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_STAFF_EMAIL' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null then raise exception 'INVALID_STAFF_DISPLAY_NAME' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'AUTH_USER_REQUIRED' using errcode='23503'; end if;

  insert into public.staff_access_profiles(user_id,employee_id,email,username,display_name,role,branch_id,is_active,created_at,updated_at)
  values(p_user_id,trim(p_employee_id),v_email,v_username,trim(p_display_name),p_role,p_branch_id,true,now(),now())
  returning * into v_profile;

  return jsonb_build_object(
    'userId',v_profile.user_id,'employeeId',v_profile.employee_id,'email',v_profile.email,
    'username',v_profile.username,'displayName',v_profile.display_name,'role',v_profile.role,
    'branchId',v_profile.branch_id,'isActive',v_profile.is_active
  );
end;
$$;
revoke execute on function public.service_create_staff_access_profile(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.service_create_staff_access_profile(uuid,text,text,text,text,text,text) to service_role;

create or replace function public.service_update_staff_access_email(p_user_id uuid,p_email text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  if p_user_id is null then raise exception 'STAFF_USER_REQUIRED' using errcode='22023'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_STAFF_EMAIL' using errcode='22023'; end if;
  update public.staff_access_profiles set email=v_email,updated_at=now() where user_id=p_user_id returning * into v_profile;
  if not found then raise exception 'STAFF_PROFILE_NOT_FOUND' using errcode='P0002'; end if;
  return jsonb_build_object('userId',v_profile.user_id,'employeeId',v_profile.employee_id,'email',v_profile.email);
end;
$$;
revoke execute on function public.service_update_staff_access_email(uuid,text) from public,anon,authenticated;
grant execute on function public.service_update_staff_access_email(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- staff-login rate limiting. Only the service role can consume/clear gates.
-- The private table stores hashes, never credentials or raw IP addresses.
-- ---------------------------------------------------------------------------
create table if not exists private.staff_login_rate_limits(
  scope text not null check(scope in ('username','ip')),
  key_hash text not null,
  attempt_count integer not null default 0 check(attempt_count>=0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key(scope,key_hash)
);
revoke all on table private.staff_login_rate_limits from public,anon,authenticated;

create or replace function private.consume_staff_login_scope(p_scope text,p_key_hash text,p_limit integer)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row private.staff_login_rate_limits%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  insert into private.staff_login_rate_limits(scope,key_hash,attempt_count,window_started_at,updated_at)
  values(p_scope,p_key_hash,1,v_now,v_now)
  on conflict(scope,key_hash) do nothing;

  select * into v_row from private.staff_login_rate_limits where scope=p_scope and key_hash=p_key_hash for update;
  if v_row.locked_until is not null and v_row.locked_until>v_now then return v_row.locked_until; end if;

  if v_row.window_started_at <= v_now-interval '15 minutes' then
    update private.staff_login_rate_limits
    set attempt_count=1,window_started_at=v_now,locked_until=null,updated_at=v_now
    where scope=p_scope and key_hash=p_key_hash;
    return null;
  end if;

  if v_row.attempt_count>=p_limit then
    update private.staff_login_rate_limits
    set locked_until=v_now+interval '15 minutes',updated_at=v_now
    where scope=p_scope and key_hash=p_key_hash;
    return v_now+interval '15 minutes';
  end if;

  update private.staff_login_rate_limits
  set attempt_count=attempt_count+1,updated_at=v_now
  where scope=p_scope and key_hash=p_key_hash;
  return null;
end;
$$;
revoke execute on function private.consume_staff_login_scope(text,text,integer) from public,anon,authenticated;

create or replace function public.service_consume_staff_login_attempt(p_username text,p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_ip_hash text:=lower(trim(coalesce(p_ip_hash,'')));
  v_username_key text;
  v_ip_key text;
  v_username_lock timestamptz;
  v_ip_lock timestamptz;
  v_lock timestamptz;
begin
  if v_username !~ '^[a-z][a-z0-9._-]*$' or v_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',900);
  end if;
  v_username_key:=encode(digest(v_username,'sha256'),'hex');
  v_ip_key:=encode(digest(v_ip_hash,'sha256'),'hex');
  v_username_lock:=private.consume_staff_login_scope('username',v_username_key,5);
  v_ip_lock:=private.consume_staff_login_scope('ip',v_ip_key,20);
  if v_username_lock is null then v_lock:=v_ip_lock;
  elsif v_ip_lock is null then v_lock:=v_username_lock;
  else v_lock:=greatest(v_username_lock,v_ip_lock);
  end if;
  delete from private.staff_login_rate_limits where updated_at<clock_timestamp()-interval '2 days';
  return jsonb_build_object(
    'allowed',v_lock is null,
    'retryAfterSeconds',case when v_lock is null then 0 else greatest(1,ceil(extract(epoch from (v_lock-clock_timestamp())))::integer) end
  );
end;
$$;
revoke execute on function public.service_consume_staff_login_attempt(text,text) from public,anon,authenticated;
grant execute on function public.service_consume_staff_login_attempt(text,text) to service_role;

create or replace function public.service_clear_staff_login_attempts(p_username text,p_ip_hash text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from private.staff_login_rate_limits
  where (scope='username' and key_hash=encode(digest(lower(trim(coalesce(p_username,''))),'sha256'),'hex'))
     or (scope='ip' and key_hash=encode(digest(lower(trim(coalesce(p_ip_hash,''))),'sha256'),'hex'));
end;
$$;
revoke execute on function public.service_clear_staff_login_attempts(text,text) from public,anon,authenticated;
grant execute on function public.service_clear_staff_login_attempts(text,text) to service_role;

-- ---------------------------------------------------------------------------
-- Attendance evidence: employees may upload once, but neither employees nor HR
-- can delete evidence through normal authenticated Storage access. The DB also
-- verifies the referenced JPEG object exists, belongs to the employee/date/kind,
-- and respects the 100 KiB bucket limit before committing attendance.
-- ---------------------------------------------------------------------------
drop policy if exists attendance_selfies_delete on storage.objects;

create or replace function private.attendance_selfie_object_is_valid(
  p_path text,
  p_employee_id text,
  p_attendance_date date,
  p_kind text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from storage.objects o
    where o.bucket_id='attendance-selfies'
      and o.name=p_path
      and (storage.foldername(o.name))[1]=p_employee_id
      and (storage.foldername(o.name))[2]=p_attendance_date::text
      and storage.filename(o.name) like p_kind||'-%'
      and lower(storage.filename(o.name)) like '%.jpg'
      and lower(coalesce(o.metadata->>'mimetype',''))='image/jpeg'
      and coalesce(nullif(o.metadata->>'size','')::bigint,102401)<=102400
  )
$$;
revoke execute on function private.attendance_selfie_object_is_valid(text,text,date,text) from public,anon,authenticated;

alter function public.save_my_attendance_record(jsonb) rename to save_my_attendance_record_v310_internal;
revoke execute on function public.save_my_attendance_record_v310_internal(jsonb) from public,anon,authenticated;

create or replace function public.save_my_attendance_record(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_date date:=timezone('Asia/Jakarta',now())::date;
  v_record_date date;
  v_is_checkout boolean:=nullif(p_record->>'checkOutSelfieDataUrl','') is not null;
  v_path text;
begin
  select * into v_profile from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true and role in ('admin','florist') limit 1;
  if not found then raise exception 'SELF_ATTENDANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  begin
    v_record_date:=nullif(p_record->>'date','')::date;
  exception when others then
    raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023';
  end;
  if v_record_date is distinct from v_date then raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023'; end if;
  v_path:=case when v_is_checkout then nullif(p_record->>'checkOutSelfieDataUrl','') else nullif(p_record->>'selfieDataUrl','') end;
  if v_path is null or not private.attendance_selfie_object_is_valid(v_path,v_profile.employee_id,v_date,case when v_is_checkout then 'checkout' else 'checkin' end) then
    raise exception 'ATTENDANCE_SELFIE_OBJECT_REQUIRED' using errcode='22023';
  end if;
  if exists(
    select 1 from public.staff_attendance_records ar
    where (ar.record->>'selfieDataUrl'=v_path or ar.record->>'checkOutSelfieDataUrl'=v_path)
      and not(ar.employee_id=v_profile.employee_id and ar.attendance_date=v_date)
  ) then
    raise exception 'ATTENDANCE_SELFIE_ALREADY_USED' using errcode='23505';
  end if;
  return public.save_my_attendance_record_v310_internal(p_record);
end;
$$;
revoke execute on function public.save_my_attendance_record(jsonb) from public,anon;
grant execute on function public.save_my_attendance_record(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Safe Admin roster invalidation. This table contains no attendance/schedule
-- payload. Admins receive only an INSERT signal and re-fetch the authorized
-- roster through get_operational_roster().
-- ---------------------------------------------------------------------------
create table if not exists public.staff_roster_refresh_events(
  id uuid primary key default gen_random_uuid(),
  roster_date date not null,
  created_at timestamptz not null default now()
);
alter table public.staff_roster_refresh_events enable row level security;
revoke all on table public.staff_roster_refresh_events from anon,authenticated;
grant select on table public.staff_roster_refresh_events to authenticated;
drop policy if exists staff_roster_refresh_events_admin_read on public.staff_roster_refresh_events;
create policy staff_roster_refresh_events_admin_read on public.staff_roster_refresh_events
for select to authenticated using(private.current_staff_role()='admin');

create or replace function private.emit_staff_roster_refresh_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_date date;
begin
  if tg_table_name='staff_attendance_records' then
    v_date:=case when tg_op='DELETE' then old.attendance_date else new.attendance_date end;
  elsif tg_table_name='staff_schedule_overrides' then
    v_date:=case when tg_op='DELETE' then old.schedule_date else new.schedule_date end;
  else
    v_date:=timezone('Asia/Jakarta',now())::date;
  end if;
  insert into public.staff_roster_refresh_events(roster_date) values(coalesce(v_date,timezone('Asia/Jakarta',now())::date));
  delete from public.staff_roster_refresh_events where created_at<now()-interval '2 days';
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function private.emit_staff_roster_refresh_event() from public,anon,authenticated;

drop trigger if exists emit_roster_refresh_from_schedule_defaults on public.staff_schedule_defaults;
create trigger emit_roster_refresh_from_schedule_defaults after insert or update or delete on public.staff_schedule_defaults
for each row execute function private.emit_staff_roster_refresh_event();
drop trigger if exists emit_roster_refresh_from_schedule_overrides on public.staff_schedule_overrides;
create trigger emit_roster_refresh_from_schedule_overrides after insert or update or delete on public.staff_schedule_overrides
for each row execute function private.emit_staff_roster_refresh_event();
drop trigger if exists emit_roster_refresh_from_attendance on public.staff_attendance_records;
create trigger emit_roster_refresh_from_attendance after insert or update or delete on public.staff_attendance_records
for each row execute function private.emit_staff_roster_refresh_event();

do $$ begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='staff_roster_refresh_events'
  ) then
    alter publication supabase_realtime add table public.staff_roster_refresh_events;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Notifications: Admin branch-scoped notifications follow the current runtime
-- branch rather than the profile's static home branch. Global notifications
-- remain global for the existing privileged role families.
-- ---------------------------------------------------------------------------
create or replace function private.can_read_staff_notification(p_notification public.staff_notifications)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
begin
  if (select auth.uid()) is null or p_notification.recipient_user_id<>(select auth.uid()) then return false; end if;
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if not found then return false; end if;
  if not private.notification_kind_allowed_for_role(v_profile.role,p_notification.kind) then return false; end if;
  if v_profile.role='admin' and p_notification.branch_id is not null
     and p_notification.branch_id is distinct from private.current_staff_branch_id() then return false; end if;
  return true;
end;
$$;
revoke execute on function private.can_read_staff_notification(public.staff_notifications) from public,anon,authenticated;
grant execute on function private.can_read_staff_notification(public.staff_notifications) to authenticated;

create or replace function private.notify_roles(
  p_roles text[],p_branch_id text,p_kind text,p_severity text,p_title text,p_message text,
  p_entity_type text,p_entity_id text,p_target text,p_target_id text default null
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  insert into public.staff_notifications(recipient_user_id,recipient_employee_id,kind,severity,title,message,branch_id,entity_type,entity_id,target,target_id)
  select sap.user_id,sap.employee_id,p_kind,p_severity,p_title,p_message,p_branch_id,p_entity_type,p_entity_id,p_target,p_target_id
  from public.staff_access_profiles sap
  where sap.is_active=true
    and sap.role=any(p_roles)
    and private.notification_kind_allowed_for_role(sap.role,p_kind)
    and (p_branch_id is null or sap.role in ('owner','finance','hr','admin') or sap.branch_id=p_branch_id)
    and sap.user_id is distinct from (select auth.uid());
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Capability-aligned RLS only where the configured permission already models
-- the same authority. Structural role invariants elsewhere remain unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists staff_schedule_defaults_read on public.staff_schedule_defaults;
create policy staff_schedule_defaults_read on public.staff_schedule_defaults for select to authenticated using(
  employee_id=private.current_staff_employee_id() or private.has_action_permission('hr.view_employees')
);
drop policy if exists staff_schedule_overrides_read on public.staff_schedule_overrides;
create policy staff_schedule_overrides_read on public.staff_schedule_overrides for select to authenticated using(
  employee_id=private.current_staff_employee_id() or private.has_action_permission('hr.view_employees')
);
drop policy if exists staff_attendance_records_read on public.staff_attendance_records;
create policy staff_attendance_records_read on public.staff_attendance_records for select to authenticated using(
  employee_id=private.current_staff_employee_id() or private.has_action_permission('hr.review_attendance')
);
drop policy if exists employee_point_events_read on public.employee_point_events;
create policy employee_point_events_read on public.employee_point_events for select to authenticated using(
  employee_id=private.current_staff_employee_id()
  or private.has_action_permission('hr.manage_points')
  or private.has_action_permission('finance.view_payroll')
);

commit;
