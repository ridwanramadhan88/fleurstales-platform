-- Fleurstales V3.5 backend wiring completion.
-- Closes the remaining prototype-only paths without changing the public visual
-- experience: authoritative checkout quotes/promos, authenticated internal
-- Orders, atomic Order/Finance/points effects, safe staff schedule/attendance,
-- and server-backed CRM segmentation settings.

begin;

-- ---------------------------------------------------------------------------
-- Shared CRM segmentation settings used by voucher pricing.
-- ---------------------------------------------------------------------------
alter table private.internal_settings_state
  add column if not exists customer_segments jsonb not null default
    '{"mode":"either","minLifetimeSpend":1000000,"minOrderCount":5}'::jsonb;

create or replace function public.get_internal_settings_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state private.internal_settings_state%rowtype;
  v_role text := private.current_staff_role();
  v_payroll_visible boolean;
  v_people_visible boolean;
begin
  if (select auth.uid()) is null or v_role is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  select * into v_state from private.internal_settings_state where id='primary';
  if not found then raise exception 'INTERNAL_SETTINGS_NOT_INITIALIZED' using errcode='55000'; end if;

  v_people_visible := v_role='owner' or private.has_action_permission('hr.view_employees');
  v_payroll_visible := v_role='owner'
    or private.has_action_permission('finance.view_payroll')
    or private.has_action_permission('hr.create_payroll_proposal')
    or private.has_action_permission('hr.edit_payroll_proposal')
    or private.has_action_permission('hr.resolve_rejected_employee');

  return jsonb_build_object(
    'revision',v_state.revision,
    'staffRoles',case when v_people_visible then v_state.staff_roles else null end,
    'attendance',v_state.attendance,
    'scheduling',v_state.scheduling,
    'payroll',case when v_payroll_visible then v_state.payroll else null end,
    'customerSegments',v_state.customer_segments,
    'schedulingRevisions',v_state.scheduling_revisions,
    'payrollRevisions',case when v_payroll_visible then v_state.payroll_revisions else null end,
    'updatedAt',v_state.updated_at
  );
end;
$$;
revoke execute on function public.get_internal_settings_config() from public,anon;
grant execute on function public.get_internal_settings_config() to authenticated;

create or replace function public.save_internal_settings_config(
  p_expected_revision bigint,
  p_staff_roles jsonb,
  p_attendance jsonb,
  p_scheduling jsonb,
  p_payroll jsonb,
  p_customer_segments jsonb,
  p_scheduling_revisions jsonb,
  p_payroll_revisions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.internal_settings_state%rowtype;
  v_next bigint;
begin
  if (select auth.uid()) is null or private.current_staff_role() <> 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;
  if not private.has_action_permission('settings.edit_roles')
     or not private.has_action_permission('settings.edit_attendance')
     or not private.has_action_permission('settings.edit_scheduling')
     or not private.has_action_permission('settings.edit_payroll') then
    raise exception 'SETTINGS_AUTHORITY_REQUIRED' using errcode='42501';
  end if;
  if jsonb_typeof(p_staff_roles) <> 'object'
     or jsonb_typeof(p_attendance) <> 'object'
     or jsonb_typeof(p_scheduling) <> 'object'
     or jsonb_typeof(p_payroll) <> 'object'
     or jsonb_typeof(p_customer_segments) <> 'object'
     or jsonb_typeof(p_scheduling_revisions) <> 'array'
     or jsonb_typeof(p_payroll_revisions) <> 'array' then
    raise exception 'INVALID_INTERNAL_SETTINGS_PAYLOAD' using errcode='22023';
  end if;

  select * into v_state from private.internal_settings_state where id='primary' for update;
  if not found then raise exception 'INTERNAL_SETTINGS_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision <> coalesce(p_expected_revision,0) then
    raise exception 'REVISION_CONFLICT:internal_settings:expected=%:actual=%',p_expected_revision,v_state.revision using errcode='40001';
  end if;

  v_next := v_state.revision + 1;
  update private.internal_settings_state
  set revision=v_next,
      staff_roles=p_staff_roles,
      attendance=p_attendance,
      scheduling=p_scheduling,
      payroll=p_payroll,
      customer_segments=p_customer_segments,
      scheduling_revisions=p_scheduling_revisions,
      payroll_revisions=p_payroll_revisions,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id='primary';

  perform private.write_business_activity(
    'authorization','primary',null,'settings_updated',
    'Owner updated shared operational and customer settings.',
    jsonb_build_object('activityScope','internal_settings','revision',v_next)
  );
  return public.get_internal_settings_config();
end;
$$;
revoke execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
revoke execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- Safe staff schedule and attendance projection.
-- HR keeps its aggregate UI state, while normal staff receive only their own
-- records and record their own attendance through a dedicated RPC.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_schedule_defaults (
  employee_id text primary key,
  days jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.staff_schedule_overrides (
  employee_id text not null,
  schedule_date date not null,
  shift jsonb not null,
  note text,
  work_mode text,
  updated_at timestamptz not null default now(),
  primary key(employee_id,schedule_date)
);
create table if not exists public.staff_attendance_records (
  id text primary key,
  employee_id text not null,
  attendance_date date not null,
  status text not null check(status in ('present','late','absent','leave')),
  record jsonb not null,
  updated_at timestamptz not null default now(),
  unique(employee_id,attendance_date)
);
create table if not exists public.employee_point_events (
  id text primary key,
  employee_id text not null,
  category text not null check(category in ('admin_order_handled','florist_order_completed')),
  source_order_id text not null references public.orders(id) on delete cascade,
  source_order_number text not null,
  points integer not null,
  effective_date date not null,
  payroll_period_id text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','reversed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(employee_id,category,source_order_id)
);

-- Backfill normalized staff data immediately so the first Admin/Florist login
-- after migration does not fall back to profile branch or lose historical
-- attendance before HR performs another save.
do $$
declare
  v_snapshot jsonb;
  v_item jsonb;
  v_order public.orders%rowtype;
  v_category text;
begin
  select snapshot into v_snapshot from private.operational_domain_state where domain='hr';
  if v_snapshot is null then return; end if;

  for v_item in select value from jsonb_array_elements(coalesce(v_snapshot->'employeeDefaultSchedules','[]'::jsonb)) loop
    if nullif(v_item->>'employeeId','') is not null then
      insert into public.staff_schedule_defaults(employee_id,days,updated_at)
      values(v_item->>'employeeId',coalesce(v_item->'days','{}'::jsonb),now())
      on conflict(employee_id) do update set days=excluded.days,updated_at=now();
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_snapshot->'scheduleOverrides','[]'::jsonb)) loop
    if nullif(v_item->>'employeeId','') is not null and nullif(v_item->>'date','') is not null then
      insert into public.staff_schedule_overrides(employee_id,schedule_date,shift,note,work_mode,updated_at)
      values(v_item->>'employeeId',(v_item->>'date')::date,coalesce(v_item->'shift','{}'::jsonb),v_item->>'note',v_item->>'workMode',now())
      on conflict(employee_id,schedule_date) do update set shift=excluded.shift,note=excluded.note,work_mode=excluded.work_mode,updated_at=now();
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_snapshot->'attendance','[]'::jsonb)) loop
    if nullif(v_item->>'employeeId','') is not null
       and nullif(v_item->>'date','') is not null
       and v_item->>'status' in ('present','late','absent','leave') then
      insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record,updated_at)
      values(coalesce(nullif(v_item->>'id',''),'attendance_'||replace(gen_random_uuid()::text,'-','')),v_item->>'employeeId',(v_item->>'date')::date,v_item->>'status',v_item,now())
      on conflict(employee_id,attendance_date) do update set status=excluded.status,record=excluded.record,updated_at=now();
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_snapshot->'employeePointEntries','[]'::jsonb)) loop
    v_category:=v_item->>'category';
    if v_item->>'sourceType'='order'
       and v_category in ('admin_order_handled','florist_order_completed')
       and nullif(v_item->>'employeeId','') is not null
       and nullif(v_item->>'orderNumber','') is not null then
      select * into v_order from public.orders where order_number=v_item->>'orderNumber' limit 1;
      if found then
        insert into public.employee_point_events(id,employee_id,category,source_order_id,source_order_number,points,effective_date,payroll_period_id,status,metadata,created_at)
        values(coalesce(nullif(v_item->>'id',''),'point_'||replace(gen_random_uuid()::text,'-','')),v_item->>'employeeId',v_category,v_order.id,v_order.order_number,coalesce((v_item->>'points')::integer,0),coalesce(nullif(v_item->>'effectiveDate','')::date,v_order.completed_at::date,timezone('Asia/Jakarta',now())::date),coalesce(nullif(v_item->>'payrollPeriodId',''),'payroll-'||to_char(coalesce(nullif(v_item->>'effectiveDate','')::date,v_order.completed_at::date,timezone('Asia/Jakarta',now())::date),'YYYY-MM')),case when v_item->>'status' in ('pending','approved','rejected','reversed') then v_item->>'status' else 'pending' end,jsonb_build_object('backfilled',true),coalesce(nullif(v_item->>'createdAt','')::timestamptz,now()))
        on conflict(employee_id,category,source_order_id) do nothing;
      end if;
    end if;
  end loop;
end $$;

alter table public.staff_schedule_defaults enable row level security;
alter table public.staff_schedule_overrides enable row level security;
alter table public.staff_attendance_records enable row level security;
alter table public.employee_point_events enable row level security;
revoke all on table public.staff_schedule_defaults,public.staff_schedule_overrides,public.staff_attendance_records,public.employee_point_events from anon,authenticated;
grant select on table public.staff_schedule_defaults,public.staff_schedule_overrides,public.staff_attendance_records,public.employee_point_events to authenticated;

drop policy if exists staff_schedule_defaults_read on public.staff_schedule_defaults;
create policy staff_schedule_defaults_read on public.staff_schedule_defaults for select to authenticated using (
  employee_id=(select employee_id from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1)
  or private.current_staff_role() in ('owner','hr')
);
drop policy if exists staff_schedule_overrides_read on public.staff_schedule_overrides;
create policy staff_schedule_overrides_read on public.staff_schedule_overrides for select to authenticated using (
  employee_id=(select employee_id from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1)
  or private.current_staff_role() in ('owner','hr')
);
drop policy if exists staff_attendance_records_read on public.staff_attendance_records;
create policy staff_attendance_records_read on public.staff_attendance_records for select to authenticated using (
  employee_id=(select employee_id from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1)
  or private.current_staff_role() in ('owner','hr')
);
drop policy if exists employee_point_events_read on public.employee_point_events;
create policy employee_point_events_read on public.employee_point_events for select to authenticated using (
  employee_id=(select employee_id from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1)
  or private.current_staff_role() in ('owner','hr','finance')
);

-- Preserve the proven HR validator, then mirror accepted schedules/attendance.
alter function public.save_hr_operational_state(bigint,jsonb) rename to save_hr_operational_state_v34_internal;
revoke execute on function public.save_hr_operational_state_v34_internal(bigint,jsonb) from public,anon,authenticated;

create or replace function public.save_hr_operational_state(p_expected_revision bigint,p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_item jsonb;
begin
  v_result := public.save_hr_operational_state_v34_internal(p_expected_revision,p_snapshot);

  delete from public.staff_schedule_defaults;
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'employeeDefaultSchedules','[]'::jsonb)) loop
    insert into public.staff_schedule_defaults(employee_id,days,updated_at)
    values(v_item->>'employeeId',coalesce(v_item->'days','{}'::jsonb),now())
    on conflict(employee_id) do update set days=excluded.days,updated_at=now();
  end loop;

  delete from public.staff_schedule_overrides;
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'scheduleOverrides','[]'::jsonb)) loop
    insert into public.staff_schedule_overrides(employee_id,schedule_date,shift,note,work_mode,updated_at)
    values(v_item->>'employeeId',(v_item->>'date')::date,coalesce(v_item->'shift','{}'::jsonb),v_item->>'note',v_item->>'workMode',now())
    on conflict(employee_id,schedule_date) do update set shift=excluded.shift,note=excluded.note,work_mode=excluded.work_mode,updated_at=now();
  end loop;

  delete from public.staff_attendance_records;
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'attendance','[]'::jsonb)) loop
    insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record,updated_at)
    values(v_item->>'id',v_item->>'employeeId',(v_item->>'date')::date,v_item->>'status',v_item,now())
    on conflict(id) do update set employee_id=excluded.employee_id,attendance_date=excluded.attendance_date,status=excluded.status,record=excluded.record,updated_at=now();
  end loop;
  return v_result;
end;
$$;
revoke execute on function public.save_hr_operational_state(bigint,jsonb) from public,anon;
grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated;

create or replace function public.get_my_staff_operations()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_employee_id text;
  v_employee jsonb;
begin
  select employee_id into v_employee_id from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if v_employee_id is null then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  select value into v_employee
  from private.operational_domain_state s,
       lateral jsonb_array_elements(coalesce(s.snapshot->'employees','[]'::jsonb)) e(value)
  where s.domain='hr' and value->>'id'=v_employee_id limit 1;
  return jsonb_build_object(
    'employee',v_employee,
    'employeeDefaultSchedules',coalesce((select jsonb_agg(jsonb_build_object('employeeId',employee_id,'days',days)) from public.staff_schedule_defaults where employee_id=v_employee_id),'[]'::jsonb),
    'scheduleOverrides',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('employeeId',employee_id,'date',schedule_date,'shift',shift,'note',note,'workMode',work_mode))) from public.staff_schedule_overrides where employee_id=v_employee_id),'[]'::jsonb),
    'attendance',coalesce((select jsonb_agg(record order by attendance_date desc) from public.staff_attendance_records where employee_id=v_employee_id),'[]'::jsonb)
  );
end;
$$;
revoke execute on function public.get_my_staff_operations() from public,anon;
grant execute on function public.get_my_staff_operations() to authenticated;

create or replace function public.save_my_attendance_record(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_state private.operational_domain_state%rowtype;
  v_records jsonb;
  v_revision bigint;
  v_existing jsonb;
  v_safe jsonb;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_now timestamptz:=now();
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if not found or v_profile.employee_id is null then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  if v_profile.role not in ('admin','florist') then raise exception 'SELF_ATTENDANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_record is null or jsonb_typeof(p_record)<>'object' then raise exception 'ATTENDANCE_RECORD_REQUIRED' using errcode='22023'; end if;
  if p_record->>'employeeId' is distinct from v_profile.employee_id then raise exception 'OWN_ATTENDANCE_ONLY' using errcode='42501'; end if;
  if p_record->>'source' is distinct from 'selfie' then raise exception 'SELFIE_ATTENDANCE_ONLY' using errcode='42501'; end if;
  if p_record->>'status' not in ('present','late') then raise exception 'INVALID_SELF_ATTENDANCE_STATUS' using errcode='22023'; end if;
  if nullif(p_record->>'id','') is null or nullif(p_record->>'date','') is null then raise exception 'ATTENDANCE_ID_DATE_REQUIRED' using errcode='22023'; end if;
  if (p_record->>'date')::date <> timezone('Asia/Jakarta',v_now)::date then raise exception 'SELF_ATTENDANCE_TODAY_ONLY' using errcode='22023'; end if;
  if coalesce(p_record->>'selfieDataUrl','') not like 'data:image/jpeg;base64,%' or length(p_record->>'selfieDataUrl')>150000 then raise exception 'VALID_CHECKIN_SELFIE_REQUIRED' using errcode='22023'; end if;
  v_check_in:=nullif(p_record->>'checkInAt','')::timestamptz;
  v_check_out:=nullif(p_record->>'checkOutAt','')::timestamptz;
  if v_check_in is null then raise exception 'CHECKIN_TIME_REQUIRED' using errcode='22023'; end if;

  select record into v_existing from public.staff_attendance_records
  where employee_id=v_profile.employee_id and attendance_date=(p_record->>'date')::date
  for update;

  if v_existing is null then
    if abs(extract(epoch from (v_now-v_check_in)))>1200 then raise exception 'CHECKIN_TIME_OUT_OF_RANGE' using errcode='22023'; end if;
    if v_check_out is not null then raise exception 'CHECKOUT_REQUIRES_EXISTING_CHECKIN' using errcode='22023'; end if;
  else
    if v_check_in is distinct from nullif(v_existing->>'checkInAt','')::timestamptz
       or p_record->>'selfieDataUrl' is distinct from v_existing->>'selfieDataUrl' then
      raise exception 'CHECKIN_EVIDENCE_IMMUTABLE' using errcode='42501';
    end if;
    if nullif(v_existing->>'checkOutAt','') is not null
       and (v_check_out is distinct from (v_existing->>'checkOutAt')::timestamptz
            or p_record->>'checkOutSelfieDataUrl' is distinct from v_existing->>'checkOutSelfieDataUrl') then
      raise exception 'CHECKOUT_EVIDENCE_IMMUTABLE' using errcode='42501';
    end if;
    if v_check_out is not null and nullif(v_existing->>'checkOutAt','') is null then
      if abs(extract(epoch from (v_now-v_check_out)))>1200 then raise exception 'CHECKOUT_TIME_OUT_OF_RANGE' using errcode='22023'; end if;
      if coalesce(p_record->>'checkOutSelfieDataUrl','') not like 'data:image/jpeg;base64,%' or length(p_record->>'checkOutSelfieDataUrl')>150000 then raise exception 'VALID_CHECKOUT_SELFIE_REQUIRED' using errcode='22023'; end if;
      if v_check_out<v_check_in then raise exception 'CHECKOUT_BEFORE_CHECKIN' using errcode='22023'; end if;
    end if;
  end if;

  v_safe:=p_record
    || jsonb_build_object(
      'id',coalesce(v_existing->>'id',p_record->>'id'),
      'employeeId',v_profile.employee_id,
      'status',coalesce(v_existing->>'status',p_record->>'status'),
      'actor',v_profile.display_name,
      'source','selfie',
      'createdAt',coalesce(v_existing->>'createdAt',p_record->>'createdAt',v_now::text)
    );

  insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record,updated_at)
  values(v_safe->>'id',v_profile.employee_id,(v_safe->>'date')::date,v_safe->>'status',v_safe,now())
  on conflict(employee_id,attendance_date) do update set status=excluded.status,record=excluded.record,updated_at=now();

  select * into v_state from private.operational_domain_state where domain='hr' for update;
  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
    values('hr',1,jsonb_build_object('attendance',jsonb_build_array(v_safe)),(select auth.uid()),now())
    returning revision into v_revision;
  else
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_records
    from jsonb_array_elements(coalesce(v_state.snapshot->'attendance','[]'::jsonb)) e(value)
    where not (value->>'employeeId'=v_profile.employee_id and value->>'date'=v_safe->>'date');
    v_records := coalesce(v_records,'[]'::jsonb) || jsonb_build_array(v_safe);
    update private.operational_domain_state
    set revision=revision+1,
        snapshot=jsonb_set(coalesce(snapshot,'{}'::jsonb),'{attendance}',v_records,true),
        updated_by=(select auth.uid()),updated_at=now()
    where domain='hr' returning revision into v_revision;
  end if;
  perform private.write_audit_event('attendance.self_service','attendance',v_safe->>'id','succeeded',null,v_revision,v_existing,v_safe);
  perform private.write_business_activity('hr',v_safe->>'id',private.current_staff_branch_id(),'attendance_recorded','Staff attendance was recorded.',jsonb_build_object('activityScope','attendance','employeeId',v_profile.employee_id,'date',v_safe->>'date'));
  return jsonb_build_object('record',v_safe,'revision',v_revision,'updatedAt',now());
end;
$$;
revoke execute on function public.save_my_attendance_record(jsonb) from public,anon;
grant execute on function public.save_my_attendance_record(jsonb) to authenticated;

create or replace function public.get_operational_roster(p_date date,p_branch_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if private.current_staff_role() not in ('owner','admin','hr') then raise exception 'ROSTER_ACCESS_REQUIRED' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'employeeId',sap.employee_id,'displayName',sap.display_name,'role',sap.role,
      'profileBranchId',sap.branch_id,'defaultSchedule',d.days,
      'override',o.shift,'overrideNote',o.note,'overrideWorkMode',o.work_mode,
      'attendance',case when a.record is null then null else a.record - 'selfieDataUrl' - 'checkOutSelfieDataUrl' end
    ) order by sap.display_name)
    from public.staff_access_profiles sap
    left join public.staff_schedule_defaults d on d.employee_id=sap.employee_id
    left join public.staff_schedule_overrides o on o.employee_id=sap.employee_id and o.schedule_date=p_date
    left join public.staff_attendance_records a on a.employee_id=sap.employee_id and a.attendance_date=p_date
    where sap.is_active=true
      and sap.role in ('admin','florist')
      and (p_branch_id is null or coalesce(o.shift->>'branchId',sap.branch_id)=p_branch_id)
  ),'[]'::jsonb);
end;
$$;
revoke execute on function public.get_operational_roster(date,text) from public,anon;
grant execute on function public.get_operational_roster(date,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Authoritative voucher quote shared by preview and final checkout.
-- ---------------------------------------------------------------------------
create or replace function private.resolve_checkout_quote(
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time,
  p_items jsonb,
  p_payment_method text,
  p_promo_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_branch public.branches%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_qty integer;
  v_subtotal bigint:=0;
  v_delivery bigint:=0;
  v_discount bigint:=0;
  v_code text:=upper(trim(coalesce(p_promo_code,'')));
  v_voucher jsonb;
  v_customer public.customers%rowtype;
  v_normalized text:=private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_spend bigint:=0;
  v_count integer:=0;
  v_segments jsonb;
  v_is_vip boolean:=false;
  v_customer_found boolean:=false;
  v_eligible boolean:=false;
  v_percent integer:=0;
  v_message text;
  v_day_key text;
  v_hours jsonb;
begin
  if nullif(trim(coalesce(p_customer->>'name','')),'') is null then raise exception 'Customer name is required.' using errcode='22023'; end if;
  if length(v_normalized)<8 or length(v_normalized)>15 then raise exception 'A valid WhatsApp number is required.' using errcode='22023'; end if;
  select * into v_branch from public.branches where id=p_branch_id and is_active=true;
  if not found then raise exception 'Selected branch is unavailable.' using errcode='22023'; end if;
  if p_fulfillment not in ('delivery','pickup') then raise exception 'Invalid fulfillment type.' using errcode='22023'; end if;
  if p_payment_method not in ('transfer','cash') then raise exception 'Invalid payment method.' using errcode='22023'; end if;
  if p_fulfillment='delivery' and p_payment_method='cash' then raise exception 'Cash payment is only available for pickup orders.' using errcode='22023'; end if;
  if p_payment_method='transfer' and not exists (
    select 1 from public.public_payment_accounts account
    where account.is_active=true and account.is_customer_visible=true
      and (cardinality(account.branch_ids)=0 or p_branch_id=any(account.branch_ids))
  ) then raise exception 'Bank transfer is unavailable for this branch.' using errcode='22023'; end if;
  if p_schedule_date is null or p_schedule_time is null then raise exception 'Schedule date and time are required.' using errcode='22023'; end if;
  if p_schedule_date < timezone('Asia/Jakarta',now())::date then raise exception 'Schedule date cannot be in the past.' using errcode='22023'; end if;
  v_day_key:=lower(trim(to_char(p_schedule_date,'FMDay')));
  v_hours:=v_branch.opening_hours->v_day_key;
  if v_hours is null or coalesce((v_hours->>'isOpen')::boolean,false)=false then raise exception 'Selected branch is closed on this date.' using errcode='22023'; end if;
  if p_schedule_time < (v_hours->>'opensAt')::time or p_schedule_time > (v_hours->>'closesAt')::time then raise exception 'Selected time is outside branch opening hours.' using errcode='22023'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Order must contain between 1 and 20 items.' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0);
    if v_qty<1 or v_qty>99 then raise exception 'Item quantity must be between 1 and 99.' using errcode='22023'; end if;
    select * into v_product from public.products where id=nullif(v_item->>'productId','') and is_active=true;
    if not found then raise exception 'A selected product is unavailable.' using errcode='22023'; end if;
    select * into v_variant from public.product_variants where id=nullif(v_item->>'variantId','') and product_id=v_product.id and status='active';
    if not found then raise exception 'A selected product variant is unavailable.' using errcode='22023'; end if;
    v_subtotal:=v_subtotal+(v_variant.price_idr*v_qty);
  end loop;
  v_delivery:=case when p_fulfillment='delivery' then v_branch.delivery_fee_idr else 0 end;

  if v_code<>'' then
    select value into v_voucher
    from private.operational_domain_state s,
         lateral jsonb_array_elements(coalesce(s.snapshot->'vouchers','[]'::jsonb)) e(value)
    where s.domain='vouchers' and upper(trim(value->>'code'))=v_code limit 1;
    if v_voucher is null then
      v_message:='Voucher code was not found.';
    elsif coalesce((v_voucher->>'isActive')::boolean,false)=false then
      v_message:='Voucher is inactive.';
    elsif nullif(v_voucher->>'startDate','') is not null and timezone('Asia/Jakarta',now())::date < (v_voucher->>'startDate')::date then
      v_message:='Voucher is not active yet.';
    elsif nullif(v_voucher->>'endDate','') is not null and timezone('Asia/Jakarta',now())::date > (v_voucher->>'endDate')::date then
      v_message:='Voucher has expired.';
    elsif v_subtotal < coalesce((v_voucher->>'minOrderIdr')::bigint,0) then
      v_message:='Order minimum has not been reached.';
    else
      select * into v_customer from public.customers where normalized_whatsapp_number=v_normalized limit 1;
      v_customer_found:=found;
      if v_customer_found then
        select coalesce(sum(total_idr),0),count(*) into v_spend,v_count
        from public.orders where customer_id=v_customer.id and status not in ('cancelled','failed') and payment_status<>'refunded';
      end if;
      select customer_segments into v_segments from private.internal_settings_state where id='primary';
      v_is_vip:=case coalesce(v_segments->>'mode','either')
        when 'spend' then v_spend>=coalesce((v_segments->>'minLifetimeSpend')::bigint,1000000)
        when 'orders' then v_count>=coalesce((v_segments->>'minOrderCount')::integer,5)
        else v_spend>=coalesce((v_segments->>'minLifetimeSpend')::bigint,1000000) or v_count>=coalesce((v_segments->>'minOrderCount')::integer,5)
      end;
      v_eligible:=case coalesce(v_voucher->>'eligibility','all')
        when 'all' then true
        when 'vip' then v_is_vip
        when 'selected' then v_customer_found and coalesce(v_voucher->'selectedCustomerIds','[]'::jsonb) ? v_customer.id
        else false end;
      if not v_eligible then v_message:='Voucher is unavailable for this order.';
      else
        v_percent:=greatest(0,least(100,coalesce((v_voucher->>'percentOff')::integer,0)));
        v_discount:=round(v_subtotal*v_percent/100.0)::bigint;
        v_message:='Voucher applied.';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'itemsSubtotalIdr',v_subtotal,
    'deliveryFeeIdr',v_delivery,
    'discountIdr',v_discount,
    'totalIdr',greatest(0,v_subtotal-v_discount+v_delivery),
    'promoCode',case when v_code='' then null else v_code end,
    'promoAccepted',v_code<>'' and v_discount>0,
    'promoMessage',v_message
  );
end;
$$;
revoke execute on function private.resolve_checkout_quote(jsonb,text,text,date,time,jsonb,text,text) from public,anon,authenticated;

create or replace function public.quote_storefront_checkout(
  p_idempotency_key text,
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_instructions text default null,
  p_order_note text default null,
  p_greeting_message text default null,
  p_greeting_card_name text default null,
  p_payment_method text default 'transfer',
  p_promo_code text default null
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.resolve_checkout_quote(p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,p_items,p_payment_method,p_promo_code)
$$;
revoke execute on function public.quote_storefront_checkout(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text) from public;
grant execute on function public.quote_storefront_checkout(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text) to anon,authenticated;

-- Preserve the complete V3.4 checkout implementation and post the same quote
-- result into the Order in the same transaction.
alter function public.create_storefront_order(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text)
  rename to create_storefront_order_v34_internal;
revoke execute on function public.create_storefront_order_v34_internal(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text) from public,anon,authenticated;

create or replace function public.create_storefront_order(
  p_idempotency_key text,p_customer jsonb,p_branch_id text,p_fulfillment text,
  p_schedule_date date,p_schedule_time time,p_items jsonb,
  p_delivery_address text default null,p_delivery_instructions text default null,
  p_order_note text default null,p_greeting_message text default null,
  p_greeting_card_name text default null,p_payment_method text default 'transfer',
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_existing public.orders%rowtype;
  v_quote jsonb;
  v_result jsonb;
  v_order_id text;
begin
  select * into v_existing from public.orders where storefront_idempotency_key=trim(p_idempotency_key) limit 1;
  if found then
    return jsonb_build_object('orderId',v_existing.id,'orderNumber',v_existing.order_number,'customerId',v_existing.customer_id,'itemsSubtotalIdr',v_existing.items_subtotal_idr,'deliveryFeeIdr',v_existing.delivery_fee_idr,'discountIdr',v_existing.discount_idr,'totalIdr',v_existing.total_idr,'deduplicated',true);
  end if;
  v_quote:=private.resolve_checkout_quote(p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,p_items,p_payment_method,p_promo_code);
  if nullif(trim(coalesce(p_promo_code,'')),'') is not null and coalesce((v_quote->>'promoAccepted')::boolean,false)=false then
    raise exception '%',coalesce(v_quote->>'promoMessage','Voucher is not valid.') using errcode='22023';
  end if;
  v_result:=public.create_storefront_order_v34_internal(p_idempotency_key,p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,p_items,p_delivery_address,p_delivery_instructions,p_order_note,p_greeting_message,p_greeting_card_name,p_payment_method,p_promo_code);
  v_order_id:=v_result->>'orderId';
  update public.orders set
    discount_idr=(v_quote->>'discountIdr')::bigint,
    total_idr=(v_quote->>'totalIdr')::bigint,
    promo_code=nullif(v_quote->>'promoCode',''),
    updated_at=now()
  where id=v_order_id;
  return v_result || jsonb_build_object('discountIdr',(v_quote->>'discountIdr')::bigint,'totalIdr',(v_quote->>'totalIdr')::bigint,'deduplicated',false);
end;
$$;
revoke execute on function public.create_storefront_order(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text) from public;
grant execute on function public.create_storefront_order(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text) to anon,authenticated;

-- Shared voucher-only resolver for custom/mixed internal Orders. Catalog
-- Storefront Orders use resolve_checkout_quote, which also re-resolves prices.
create or replace function private.resolve_voucher_discount(
  p_customer jsonb,
  p_subtotal bigint,
  p_promo_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text:=upper(trim(coalesce(p_promo_code,'')));
  v_voucher jsonb;
  v_customer public.customers%rowtype;
  v_normalized text:=private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_spend bigint:=0;
  v_count integer:=0;
  v_segments jsonb;
  v_is_vip boolean:=false;
  v_customer_found boolean:=false;
  v_eligible boolean:=false;
  v_percent integer:=0;
  v_discount bigint:=0;
  v_message text;
begin
  if v_code='' then
    return jsonb_build_object('discountIdr',0,'promoCode',null,'promoAccepted',false,'promoMessage',null);
  end if;
  select value into v_voucher
  from private.operational_domain_state s,
       lateral jsonb_array_elements(coalesce(s.snapshot->'vouchers','[]'::jsonb)) e(value)
  where s.domain='vouchers' and upper(trim(value->>'code'))=v_code limit 1;
  if v_voucher is null then v_message:='Voucher code was not found.';
  elsif coalesce((v_voucher->>'isActive')::boolean,false)=false then v_message:='Voucher is inactive.';
  elsif nullif(v_voucher->>'startDate','') is not null and timezone('Asia/Jakarta',now())::date < (v_voucher->>'startDate')::date then v_message:='Voucher is not active yet.';
  elsif nullif(v_voucher->>'endDate','') is not null and timezone('Asia/Jakarta',now())::date > (v_voucher->>'endDate')::date then v_message:='Voucher has expired.';
  elsif greatest(0,coalesce(p_subtotal,0)) < coalesce((v_voucher->>'minOrderIdr')::bigint,0) then v_message:='Order minimum has not been reached.';
  else
    select * into v_customer from public.customers where normalized_whatsapp_number=v_normalized limit 1;
    v_customer_found:=found;
    if v_customer_found then
      select coalesce(sum(total_idr),0),count(*) into v_spend,v_count
      from public.orders where customer_id=v_customer.id and status not in ('cancelled','failed') and payment_status<>'refunded';
    end if;
    select customer_segments into v_segments from private.internal_settings_state where id='primary';
    v_is_vip:=case coalesce(v_segments->>'mode','either')
      when 'spend' then v_spend>=coalesce((v_segments->>'minLifetimeSpend')::bigint,1000000)
      when 'orders' then v_count>=coalesce((v_segments->>'minOrderCount')::integer,5)
      else v_spend>=coalesce((v_segments->>'minLifetimeSpend')::bigint,1000000) or v_count>=coalesce((v_segments->>'minOrderCount')::integer,5)
    end;
    v_eligible:=case coalesce(v_voucher->>'eligibility','all')
      when 'all' then true
      when 'vip' then v_is_vip
      when 'selected' then v_customer_found and coalesce(v_voucher->'selectedCustomerIds','[]'::jsonb) ? v_customer.id
      else false end;
    if not v_eligible then v_message:='This customer is not eligible for the voucher.';
    else
      v_percent:=greatest(0,least(100,coalesce((v_voucher->>'percentOff')::integer,0)));
      v_discount:=round(greatest(0,p_subtotal)*v_percent/100.0)::bigint;
      v_message:='Voucher applied.';
    end if;
  end if;
  return jsonb_build_object('discountIdr',v_discount,'promoCode',v_code,'promoAccepted',v_discount>0,'promoMessage',v_message);
end;
$$;
revoke execute on function private.resolve_voucher_discount(jsonb,bigint,text) from public,anon,authenticated;

-- Automatic Order/refund/Payroll ledger rows are server-owned. The client
-- Finance snapshot may add only genuine manual ledger entries; this prevents a
-- browser-side optimistic Order mutation from creating Finance state if the
-- authoritative Order transaction is rejected.
alter function public.save_finance_operational_state(bigint,jsonb)
  rename to save_finance_operational_state_v34_internal;
revoke execute on function public.save_finance_operational_state_v34_internal(bigint,jsonb) from public,anon,authenticated;

create or replace function public.save_finance_operational_state(p_expected_revision bigint,p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_previous jsonb;
begin
  select coalesce(snapshot,'{}'::jsonb) into v_previous
  from private.operational_domain_state where domain='finance';
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'transactions','[]'::jsonb)) n
    where not exists (
      select 1 from jsonb_array_elements(coalesce(v_previous->'transactions','[]'::jsonb)) o
      where o->>'id'=n->>'id'
    ) and (
      coalesce((n->>'isSystemGenerated')::boolean,false)=true
      or coalesce(n->>'source','') in ('order_payment','order_refund','payroll')
    )
  ) then
    raise exception 'SERVER_OWNED_FINANCE_ENTRY' using errcode='42501';
  end if;
  return public.save_finance_operational_state_v34_internal(p_expected_revision,p_snapshot);
end;
$$;
revoke execute on function public.save_finance_operational_state(bigint,jsonb) from public,anon;
grant execute on function public.save_finance_operational_state(bigint,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic finance and points side-effects for every accepted Order mutation.
-- ---------------------------------------------------------------------------
create or replace function private.sync_order_finance_transactions(p_order_id text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_state private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_original_transactions jsonb;
  v_event public.order_payment_events%rowtype;
  v_tx jsonb;
  v_tx_id text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return; end if;
  select * into v_state from private.operational_domain_state where domain='finance' for update;
  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_at)
    values('finance',1,'{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb,now())
    returning * into v_state;
  end if;
  v_transactions:=coalesce(v_state.snapshot->'transactions','[]'::jsonb);
  v_original_transactions:=v_transactions;
  for v_event in select * from public.order_payment_events where order_id=p_order_id and ledger_transaction_id is null order by occurred_at loop
    if v_event.type not in ('payment_received','refund_completed') or v_event.amount_idr<=0 then continue; end if;
    v_tx_id:='txn_'||replace(gen_random_uuid()::text,'-','');
    v_tx:=jsonb_strip_nulls(jsonb_build_object(
      'id',v_tx_id,
      'type',case when v_event.type='refund_completed' then 'expense' else 'income' end,
      'category',case when v_event.type='refund_completed' then 'order_refund' else case when v_order.source='walk_in' then 'walk_in_sale' else 'order_payment' end end,
      'branch',v_order.branch_id,'scope','branch','amount',v_event.amount_idr,
      'method',coalesce(v_event.method,'other'),
      'status',case when v_event.type='refund_completed' or v_order.finance_verified then 'verified' else 'pending' end,
      'name',case when v_event.type='refund_completed' then 'Order refund' else 'Order payment' end,
      'description',coalesce(v_event.note,''),'orderNumber',v_order.order_number,
      'reference',v_event.reference,'source',case when v_event.type='refund_completed' then 'order_refund' else 'order_payment' end,
      'entryMode','automatic','sourceEventId',v_event.id,'idempotencyKey',v_event.idempotency_key,
      'isSystemGenerated',true,'actor',coalesce(v_event.actor_name,'System'),
      'createdAt',v_event.occurred_at,'updatedAt',now()
    ));
    if not exists(select 1 from jsonb_array_elements(v_transactions) x where x->>'idempotencyKey'=v_event.idempotency_key) then
      v_transactions:=jsonb_build_array(v_tx)||v_transactions;
    else
      select x->>'id' into v_tx_id from jsonb_array_elements(v_transactions) x where x->>'idempotencyKey'=v_event.idempotency_key limit 1;
    end if;
    update public.order_payment_events set ledger_transaction_id=v_tx_id where id=v_event.id;
  end loop;
  if v_order.finance_verified then
    select coalesce(jsonb_agg(case when x->>'orderNumber'=v_order.order_number and x->>'source'='order_payment' then x||jsonb_build_object('status','verified','updatedAt',now()) else x end),'[]'::jsonb)
    into v_transactions from jsonb_array_elements(v_transactions) x;
  end if;
  if v_transactions is distinct from v_original_transactions then
    update private.operational_domain_state set revision=revision+1,snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),updated_by=(select auth.uid()),updated_at=now() where domain='finance';
    perform private.write_business_activity('finance',p_order_id,v_order.branch_id,'order_ledger_synced','Order payment/refund synchronized to Finance.',jsonb_build_object('orderNumber',v_order.order_number));
  end if;
end;
$$;
revoke execute on function private.sync_order_finance_transactions(text) from public,anon,authenticated;

create or replace function private.payroll_period_for_date(p_date date)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_settings jsonb;
  v_start integer;
  v_payment_month date;
begin
  select payroll into v_settings from private.internal_settings_state where id='primary';
  v_start:=coalesce((v_settings->>'periodStartDay')::integer,21);
  v_payment_month:=date_trunc('month',case when extract(day from p_date)>=v_start then p_date+interval '1 month' else p_date end)::date;
  return 'payroll-'||to_char(v_payment_month,'YYYY-MM');
end;
$$;
revoke execute on function private.payroll_period_for_date(date) from public,anon,authenticated;

create or replace function private.sync_order_contribution_points(p_order_id text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_hr private.operational_domain_state%rowtype;
  v_rules jsonb;
  v_entries jsonb;
  v_employee_id text;
  v_category text;
  v_points integer;
  v_minimum bigint;
  v_source_id text;
  v_entry jsonb;
  v_period text;
  v_inserted integer;
  v_changed boolean:=false;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found or v_order.status not in ('delivered','picked_up') or v_order.completed_at is null or v_order.payment_status='refunded' then return; end if;
  select * into v_hr from private.operational_domain_state where domain='hr' for update;
  if not found then return; end if;
  v_rules:=coalesce(v_hr.snapshot->'pointRules','{}'::jsonb);
  v_minimum:=coalesce((v_rules->>'collectOrderMinimumProductSubtotalIdr')::bigint,200000);
  if v_order.items_subtotal_idr<v_minimum or v_order.completed_at<coalesce((v_rules->>'orderContributionActiveFrom')::timestamptz,'2026-07-17T12:00:00+07:00'::timestamptz) then return; end if;
  v_points:=coalesce((v_rules->>'collectOrderPoints')::integer,1);
  v_period:=private.payroll_period_for_date(v_order.completed_at::date);
  v_entries:=coalesce(v_hr.snapshot->'employeePointEntries','[]'::jsonb);
  for v_employee_id,v_category in select * from (values(v_order.admin_handled_employee_id,'admin_order_handled'),(v_order.florist_assigned_employee_id,'florist_order_completed')) q(employee_id,category) loop
    if v_employee_id is null then continue; end if;
    v_source_id:='order:'||v_order.order_number||':'||v_category;
    insert into public.employee_point_events(id,employee_id,category,source_order_id,source_order_number,points,effective_date,payroll_period_id,status,metadata)
    values('point_'||replace(gen_random_uuid()::text,'-',''),v_employee_id,v_category,v_order.id,v_order.order_number,v_points,v_order.completed_at::date,v_period,'pending',jsonb_build_object('sourceAmountIdr',v_order.items_subtotal_idr,'sourceCompletedAt',v_order.completed_at))
    on conflict(employee_id,category,source_order_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted>0 and not exists(select 1 from jsonb_array_elements(v_entries) e where e->>'sourceId'=v_source_id) then
      v_entry:=jsonb_build_object('id','point_'||replace(gen_random_uuid()::text,'-',''),'employeeId',v_employee_id,'category',v_category,'points',v_points,'sourceType','order','sourceId',v_source_id,'effectiveDate',v_order.completed_at::date,'payrollPeriodId',v_period,'periodKey',replace(v_period,'payroll-',''),'orderNumber',v_order.order_number,'sourceAmountIdr',v_order.items_subtotal_idr,'sourceCompletedAt',v_order.completed_at,'ordinal',1,'minimumIncluded',0,'reason','Automatic contribution from completed order','status','pending','createdBy','System','createdAt',now());
      v_entries:=jsonb_build_array(v_entry)||v_entries;
      v_changed:=true;
    end if;
  end loop;
  if v_changed then
    update private.operational_domain_state
    set revision=revision+1,snapshot=jsonb_set(snapshot,'{employeePointEntries}',v_entries,true),updated_at=now()
    where domain='hr';
    perform private.write_business_activity('hr',p_order_id,v_order.branch_id,'order_points_generated','Order contribution points were generated.',jsonb_build_object('orderNumber',v_order.order_number,'payrollPeriodId',v_period));
    perform private.write_audit_event('order.points.generate','order',p_order_id,'succeeded',null,null,null,jsonb_build_object('orderNumber',v_order.order_number,'payrollPeriodId',v_period));
  end if;
end;
$$;
revoke execute on function private.sync_order_contribution_points(text) from public,anon,authenticated;

alter function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  rename to save_order_operational_state_v34_internal;
revoke execute on function public.save_order_operational_state_v34_internal(text,integer,integer,jsonb,jsonb,jsonb) from public,anon,authenticated;
create or replace function public.save_order_operational_state(p_order_id text,p_expected_revision integer,p_next_revision integer,p_state jsonb,p_items jsonb,p_payment_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  v_result:=public.save_order_operational_state_v34_internal(p_order_id,p_expected_revision,p_next_revision,p_state,p_items,p_payment_events);
  perform private.sync_order_finance_transactions(p_order_id);
  perform private.sync_order_contribution_points(p_order_id);
  return v_result;
end;
$$;
revoke execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated internal Order creation (WhatsApp / walk-in).
-- ---------------------------------------------------------------------------
create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_key text:=trim(coalesce(p_payload->>'idempotencyKey',''));
  v_existing public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_customer_json jsonb:=coalesce(p_payload->'customer','{}'::jsonb);
  v_normalized text;
  v_branch public.branches%rowtype;
  v_order_id text;
  v_order_number text;
  v_quote jsonb;
  v_items jsonb:=coalesce(p_payload->'items','[]'::jsonb);
  v_quote_items jsonb:='[]'::jsonb;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_qty integer;
  v_unit bigint;
  v_subtotal bigint:=0;
  v_delivery bigint:=0;
  v_discount bigint:=0;
  v_total bigint:=0;
  v_deposit bigint:=greatest(0,coalesce((p_payload->>'depositAmountIdr')::bigint,0));
  v_paid bigint:=0;
  v_status text;
  v_event_id text;
  v_event_key text;
  v_fulfillment text:=p_payload->>'fulfillment';
  v_source text:=p_payload->>'source';
  v_payment_method text:=nullif(p_payload->>'paymentMethod','');
  v_schedule_date date;
  v_schedule_time time;
  v_day_key text;
  v_hours jsonb;
  v_promo jsonb;
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  if not private.has_action_permission('orders.create') then raise exception 'ORDER_CREATE_PERMISSION_REQUIRED' using errcode='42501'; end if;
  if length(v_key)<16 or length(v_key)>128 then raise exception 'VALID_IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  select * into v_existing from public.orders where storefront_idempotency_key=v_key limit 1;
  if found then return jsonb_build_object('orderId',v_existing.id,'orderNumber',v_existing.order_number,'customerId',v_existing.customer_id,'itemsSubtotalIdr',v_existing.items_subtotal_idr,'deliveryFeeIdr',v_existing.delivery_fee_idr,'discountIdr',v_existing.discount_idr,'totalIdr',v_existing.total_idr,'paidAmountIdr',v_existing.paid_amount_idr,'deduplicated',true); end if;
  if v_source not in ('whatsapp','walk_in') then raise exception 'INVALID_INTERNAL_ORDER_SOURCE' using errcode='22023'; end if;
  if v_fulfillment not in ('delivery','pickup') then raise exception 'INVALID_FULFILLMENT' using errcode='22023'; end if;
  select * into v_branch from public.branches where id=p_payload->>'branchId' and is_active=true;
  if not found then raise exception 'Selected branch is unavailable.' using errcode='22023'; end if;
  if v_profile.role='admin' and private.current_staff_branch_id() is distinct from v_branch.id then raise exception 'ADMIN_BRANCH_SCOPE_REQUIRED' using errcode='42501'; end if;
  if v_payment_method not in ('transfer','cash') then raise exception 'INVALID_PAYMENT_METHOD' using errcode='22023'; end if;
  if coalesce(p_payload->>'paymentStatus','') not in ('unpaid','partial','paid') then raise exception 'INVALID_PAYMENT_STATUS' using errcode='22023'; end if;
  if v_fulfillment='delivery' and v_payment_method='cash' then raise exception 'Cash payment is only available for pickup orders.' using errcode='22023'; end if;
  if v_fulfillment='delivery' and nullif(trim(coalesce(p_payload->>'deliveryAddress','')),'') is null then raise exception 'Delivery address is required.' using errcode='22023'; end if;
  v_schedule_date:=nullif(p_payload->>'scheduleDate','')::date;
  v_schedule_time:=nullif(p_payload->>'scheduleTime','')::time;
  if v_schedule_date is null or v_schedule_time is null then raise exception 'Schedule date and time are required.' using errcode='22023'; end if;
  if v_schedule_date < timezone('Asia/Jakarta',now())::date then raise exception 'Schedule date cannot be in the past.' using errcode='22023'; end if;
  v_day_key:=lower(trim(to_char(v_schedule_date,'FMDay')));
  v_hours:=v_branch.opening_hours->v_day_key;
  if v_hours is null or coalesce((v_hours->>'isOpen')::boolean,false)=false then raise exception 'Selected branch is closed on this date.' using errcode='22023'; end if;
  if v_schedule_time < (v_hours->>'opensAt')::time or v_schedule_time > (v_hours->>'closesAt')::time then raise exception 'Selected time is outside branch opening hours.' using errcode='22023'; end if;
  if v_payment_method='transfer' and not exists (
    select 1 from public.public_payment_accounts account
    where account.is_active=true and account.is_customer_visible=true
      and (cardinality(account.branch_ids)=0 or v_branch.id=any(account.branch_ids))
  ) then raise exception 'Bank transfer is unavailable for this branch.' using errcode='22023'; end if;
  v_normalized:=private.normalize_whatsapp(v_customer_json->>'whatsappNumber');
  if nullif(trim(v_customer_json->>'name'),'') is null or length(v_normalized)<8 then raise exception 'VALID_CUSTOMER_REQUIRED' using errcode='22023'; end if;
  insert into public.customers(id,revision,name,whatsapp_number,normalized_whatsapp_number,email,birthday,preferred_branch_id,created_source,last_order_at)
  values('cust_'||replace(gen_random_uuid()::text,'-',''),1,trim(v_customer_json->>'name'),coalesce(nullif(trim(v_customer_json->>'whatsappNumber'),''),v_normalized),v_normalized,nullif(lower(trim(v_customer_json->>'email')),''),nullif(v_customer_json->>'birthday','')::date,v_branch.id,'admin',now())
  on conflict(normalized_whatsapp_number) do update set
    email=case when coalesce(v_customer_json->'acceptedProfileUpdates','{}'::jsonb) ? 'email'
      then nullif(lower(trim(v_customer_json->'acceptedProfileUpdates'->>'email')),'') else public.customers.email end,
    birthday=case when coalesce(v_customer_json->'acceptedProfileUpdates','{}'::jsonb) ? 'birthday'
      then nullif(v_customer_json->'acceptedProfileUpdates'->>'birthday','')::date else public.customers.birthday end,
    preferred_branch_id=case when coalesce(v_customer_json->'acceptedProfileUpdates','{}'::jsonb) ? 'preferredBranchId'
      then nullif(v_customer_json->'acceptedProfileUpdates'->>'preferredBranchId','') else public.customers.preferred_branch_id end,
    last_order_at=now(),updated_at=now()
  returning * into v_customer;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<1 or jsonb_array_length(v_items)>20 then raise exception 'ORDER_ITEMS_REQUIRED' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0);
    if v_qty<1 or v_qty>99 then raise exception 'Item quantity must be between 1 and 99.' using errcode='22023'; end if;
    if coalesce(v_item->>'mode','catalog')='catalog' then
      select * into v_product from public.products where id=v_item->>'productId' and is_active=true;
      if not found then raise exception 'A selected product is unavailable.' using errcode='22023'; end if;
      select * into v_variant from public.product_variants where id=v_item->>'variantId' and product_id=v_product.id and status='active';
      if not found then raise exception 'A selected product variant is unavailable.' using errcode='22023'; end if;
      v_unit:=v_variant.price_idr;
      v_quote_items:=v_quote_items||jsonb_build_array(jsonb_build_object('productId',v_product.id,'variantId',v_variant.id,'quantity',v_qty));
    else
      v_unit:=coalesce((v_item->>'unitPriceIdr')::bigint,0);
      if v_unit<=0 then raise exception 'CUSTOM_ITEM_PRICE_REQUIRED' using errcode='22023'; end if;
      if nullif(trim(v_item->>'productName'),'') is null then raise exception 'CUSTOM_ITEM_NAME_REQUIRED' using errcode='22023'; end if;
    end if;
    v_subtotal:=v_subtotal+v_unit*v_qty;
  end loop;
  if jsonb_array_length(v_quote_items)=jsonb_array_length(v_items) then
    v_quote:=private.resolve_checkout_quote(v_customer_json,v_branch.id,v_fulfillment,(p_payload->>'scheduleDate')::date,(p_payload->>'scheduleTime')::time,v_quote_items,coalesce(p_payload->>'paymentMethod','transfer'),p_payload->>'promoCode');
    v_subtotal:=(v_quote->>'itemsSubtotalIdr')::bigint; v_delivery:=(v_quote->>'deliveryFeeIdr')::bigint; v_discount:=(v_quote->>'discountIdr')::bigint;
  else
    v_delivery:=case when v_fulfillment='delivery' then v_branch.delivery_fee_idr else 0 end;
    v_promo:=private.resolve_voucher_discount(v_customer_json,v_subtotal,p_payload->>'promoCode');
    if nullif(trim(coalesce(p_payload->>'promoCode','')),'') is not null and coalesce((v_promo->>'promoAccepted')::boolean,false)=false then
      raise exception '%',coalesce(v_promo->>'promoMessage','Voucher is not valid.') using errcode='22023';
    end if;
    v_discount:=coalesce((v_promo->>'discountIdr')::bigint,0);
  end if;
  if jsonb_array_length(v_quote_items)=jsonb_array_length(v_items)
     and nullif(trim(coalesce(p_payload->>'promoCode','')),'') is not null
     and coalesce((v_quote->>'promoAccepted')::boolean,false)=false then
    raise exception '%',coalesce(v_quote->>'promoMessage','Voucher is not valid.') using errcode='22023';
  end if;
  v_total:=greatest(0,v_subtotal-v_discount+v_delivery);
  v_paid:=least(v_total,case p_payload->>'paymentStatus' when 'paid' then v_total when 'partial' then v_deposit else 0 end);
  v_status:=case when v_paid>0 then 'pending_verification' else 'pending_verification' end;
  v_order_id:='order_'||replace(gen_random_uuid()::text,'-','');
  v_order_number:=private.allocate_order_number(v_branch.id,now());
  insert into public.orders(id,order_number,revision,storefront_idempotency_key,customer_id,customer_name_snapshot,customer_whatsapp_snapshot,customer_email_snapshot,source,fulfillment,status,branch_id,total_idr,items_subtotal_idr,discount_idr,delivery_fee_idr,payment_status,payment_method,paid_amount_idr,schedule_label,schedule_date,schedule_time,requested_pickup_date,requested_pickup_time,order_note,greeting_message,greeting_card_name,delivery_address,delivery_instructions,promo_code,admin_handled_employee_id,admin_handled_by_name,created_at,updated_at)
  values(v_order_id,v_order_number,1,v_key,v_customer.id,v_customer.name,v_customer.whatsapp_number,v_customer.email,v_source,v_fulfillment,v_status,v_branch.id,v_total,v_subtotal,v_discount,v_delivery,case when v_paid>=v_total and v_total>0 then 'paid' when v_paid>0 then 'partial' else 'unpaid' end,v_payment_method,v_paid,to_char(v_schedule_date,'DD Mon YYYY')||' · '||to_char(v_schedule_time,'HH24:MI'),v_schedule_date,v_schedule_time,case when v_fulfillment='pickup' then v_schedule_date else null end,case when v_fulfillment='pickup' then v_schedule_time else null end,nullif(p_payload->>'orderNote',''),nullif(p_payload->>'greetingMessage',''),nullif(p_payload->>'greetingCardName',''),nullif(p_payload->>'deliveryAddress',''),nullif(p_payload->>'deliveryInstructions',''),nullif(upper(trim(p_payload->>'promoCode')),''),v_profile.employee_id,v_profile.display_name,now(),now());
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0);
    if v_qty<1 or v_qty>99 then raise exception 'Item quantity must be between 1 and 99.' using errcode='22023'; end if;
    if coalesce(v_item->>'mode','catalog')='catalog' then
      select * into v_product from public.products where id=v_item->>'productId';
      select * into v_variant from public.product_variants where id=v_item->>'variantId';
      v_unit:=v_variant.price_idr;
      insert into public.order_items(id,order_id,product_id,variant_id,product_code_snapshot,product_name_snapshot,variant_sku_snapshot,variant_size_snapshot,quantity,unit_price_idr)
      values('line_'||replace(gen_random_uuid()::text,'-',''),v_order_id,v_product.id,v_variant.id,v_product.product_code,v_product.name,v_variant.sku,v_variant.size,v_qty,v_unit);
    else
      v_unit:=coalesce((v_item->>'unitPriceIdr')::bigint,0);
      insert into public.order_items(id,order_id,product_name_snapshot,quantity,unit_price_idr)
      values('line_'||replace(gen_random_uuid()::text,'-',''),v_order_id,trim(v_item->>'productName'),v_qty,v_unit);
    end if;
  end loop;
  if v_paid>0 then
    v_event_id:='pay_'||replace(gen_random_uuid()::text,'-',''); v_event_key:=v_key||':initial-payment';
    insert into public.order_payment_events(id,order_id,type,amount_idr,previous_paid_amount_idr,resulting_paid_amount_idr,resulting_status,method,actor_id,actor_name,occurred_at,idempotency_key)
    values(v_event_id,v_order_id,'payment_received',v_paid,0,v_paid,case when v_paid>=v_total then 'paid' else 'partial' end,v_payment_method,v_profile.employee_id,v_profile.display_name,now(),v_event_key);
  end if;
  insert into public.order_activities(id,order_id,kind,description,actor,occurred_at,metadata)
  values('activity_'||replace(gen_random_uuid()::text,'-',''),v_order_id,'created','Internal order created in Business OS.',v_profile.display_name,now(),jsonb_build_object('source',v_source));
  perform private.write_business_activity('order',v_order_id,v_branch.id,'created','Internal order created in Business OS.',jsonb_build_object('orderNumber',v_order_number,'source',v_source));
  perform private.notify_roles(array['owner','finance'],v_branch.id,'order_pending_verification','warning','Order awaiting verification',v_order_number||' was created in Business OS.','order',v_order_id,'finance_orders',v_order_number);
  perform private.sync_order_finance_transactions(v_order_id);
  return jsonb_build_object('orderId',v_order_id,'orderNumber',v_order_number,'customerId',v_customer.id,'itemsSubtotalIdr',v_subtotal,'deliveryFeeIdr',v_delivery,'discountIdr',v_discount,'totalIdr',v_total,'paidAmountIdr',v_paid,'deduplicated',false);
end;
$$;
revoke execute on function public.create_internal_order(jsonb) from public,anon;
grant execute on function public.create_internal_order(jsonb) to authenticated;

-- Realtime publication for newly normalized staff/CRM tables.
do $$ begin
  alter publication supabase_realtime add table public.customers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.staff_schedule_defaults;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.staff_schedule_overrides;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.staff_attendance_records;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.employee_point_events;
exception when duplicate_object then null; end $$;

commit;
