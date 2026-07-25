-- Fleurstales V3.3 staff/session foundation
-- - Durable internal Owner settings (staff roles, attendance, scheduling, payroll + revisions)
-- - Runtime operational branch context used by RLS
-- - Safe staff_access_profiles synchronization
-- - Role-family eligibility for configurable capabilities
-- - Exact one-proposal payroll payment semantics

begin;

-- ---------------------------------------------------------------------------
-- Capability semantics: roles define business-domain identity/scope; Owner
-- configuration may enable/disable capabilities only within that safe domain.
-- ---------------------------------------------------------------------------
alter table private.action_capability_registry
  add column if not exists allowed_roles text[] not null
  default array['owner','admin','finance','hr','florist']::text[];

update private.action_capability_registry
set allowed_roles = case capability
  when 'orders.read_all' then array['owner','admin','finance']::text[]
  when 'orders.read_assigned' then array['owner','florist']::text[]
  when 'orders.create' then array['owner','admin']::text[]
  when 'orders.edit' then array['owner','admin']::text[]
  when 'orders.assign' then array['owner','admin']::text[]
  when 'orders.advance_status' then array['owner','admin','florist']::text[]
  when 'orders.submit_change_request' then array['owner','admin']::text[]
  when 'orders.resolve_change_request' then array['owner','finance']::text[]
  when 'finance.view_collect_orders' then array['owner','finance']::text[]
  when 'finance.verify_order' then array['owner','finance']::text[]
  when 'finance.view_payroll' then array['owner','finance']::text[]
  when 'finance.approve_employee_payroll' then array['owner','finance']::text[]
  when 'finance.approve_all_payroll' then array['owner','finance']::text[]
  when 'finance.reject_employee_payroll' then array['owner','finance']::text[]
  when 'finance.record_final_payment' then array['owner','finance']::text[]
  when 'finance.adjust_payroll_schedule' then array['owner','finance']::text[]
  when 'finance.view_refunds' then array['owner','finance']::text[]
  when 'finance.approve_refund' then array['owner','finance']::text[]
  when 'finance.view_ledger' then array['owner','finance']::text[]
  when 'finance.create_ledger_entry' then array['owner','finance']::text[]
  when 'finance.verify_ledger_entry' then array['owner','finance']::text[]
  when 'hr.view_employees' then array['owner','hr']::text[]
  when 'hr.create_employee' then array['owner','hr']::text[]
  when 'hr.edit_employee' then array['owner','hr']::text[]
  when 'hr.review_attendance' then array['owner','hr']::text[]
  when 'hr.correct_attendance' then array['owner','hr']::text[]
  when 'hr.manage_points' then array['owner','hr']::text[]
  when 'hr.create_payroll_proposal' then array['owner','hr']::text[]
  when 'hr.edit_payroll_proposal' then array['owner','hr']::text[]
  when 'hr.resolve_rejected_employee' then array['owner','hr']::text[]
  else array['owner']::text[]
end;

create or replace function private.has_action_permission_for_role(p_role text, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_registry private.action_capability_registry%rowtype;
  v_enabled boolean;
begin
  select * into v_registry
  from private.action_capability_registry
  where capability = p_capability;
  if not found then return false; end if;

  if not (p_role = any(v_registry.allowed_roles)) then return false; end if;

  -- Governance is permanently Owner-only and Owner cannot lock themselves out.
  if p_capability like 'settings.%' then return p_role = 'owner'; end if;

  select rap.enabled into v_enabled
  from private.role_action_permissions rap
  where rap.role = p_role and rap.capability = p_capability;
  if not coalesce(v_enabled, false) then return false; end if;

  return private.has_section_access_for_role(
    p_role,
    v_registry.parent_section,
    case when v_registry.requires_edit then 'edit' else 'view' end
  );
end;
$$;

revoke execute on function private.has_action_permission_for_role(text,text) from public, anon, authenticated;

-- Coarse workspace access follows the same principle: Owner may configure
-- access within a role's safe business domain, but cannot turn a role into a
-- different authority family just by changing a matrix cell.
create or replace function private.section_role_eligible(p_role text,p_section text)
returns boolean
language sql
immutable
security definer
set search_path=''
as $$
  select case p_role
    when 'owner' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','finance','hr','scheduling','settings')
    when 'admin' then p_section in ('dashboard','orders','stock','catalog','customers')
    when 'finance' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','finance')
    when 'hr' then p_section in ('dashboard','hr','scheduling')
    when 'florist' then p_section='dashboard'
    else false
  end
$$;
revoke execute on function private.section_role_eligible(text,text) from public,anon,authenticated;

create or replace function private.section_access_for_role(p_role text,p_section text)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case
    when not private.section_role_eligible(p_role,p_section) then 'none'
    when p_role='owner' and p_section in ('settings','scheduling') then 'edit'
    else coalesce((select rsp.access_level from private.role_section_permissions rsp where rsp.role=p_role and rsp.section=p_section),'none')
  end
$$;
revoke execute on function private.section_access_for_role(text,text) from public,anon,authenticated;

create or replace function private.guard_role_section_domain()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.section_role_eligible(new.role,new.section) then
    new.access_level := 'none';
  elsif new.role='owner' and new.access_level='none' then
    new.access_level := 'edit';
  end if;
  if new.section='settings' then
    new.access_level := case when new.role='owner' then 'edit' else 'none' end;
  elsif new.role='owner' and new.section='scheduling' then
    new.access_level := 'edit';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_role_section_domain() from public;

update private.role_section_permissions rsp
set access_level='none',updated_at=now()
where not private.section_role_eligible(rsp.role,rsp.section);

drop trigger if exists guard_role_section_domain on private.role_section_permissions;
create trigger guard_role_section_domain
before insert or update on private.role_section_permissions
for each row execute function private.guard_role_section_domain();

-- ---------------------------------------------------------------------------
-- Internal Owner settings. These were previously device-local even though
-- Scheduling/Payroll are shared operational inputs.
-- ---------------------------------------------------------------------------
create table if not exists private.internal_settings_state (
  id text primary key check (id = 'primary'),
  revision bigint not null default 1 check (revision >= 1),
  staff_roles jsonb not null default '{}'::jsonb,
  attendance jsonb not null default '{}'::jsonb,
  scheduling jsonb not null default '{}'::jsonb,
  payroll jsonb not null default '{}'::jsonb,
  scheduling_revisions jsonb not null default '[]'::jsonb,
  payroll_revisions jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

revoke all on table private.internal_settings_state from public, anon, authenticated;

insert into private.internal_settings_state(
  id, revision, staff_roles, attendance, scheduling, payroll,
  scheduling_revisions, payroll_revisions
) values (
  'primary', 1,
  '{"roles":["owner","admin","finance","hr","florist"],"defaultRole":"florist","hrManagedRoles":{"employees":["admin","florist"],"attendance":["admin","florist"],"scheduling":["admin","florist"],"points":["admin","florist"],"payroll":["admin","florist"]}}'::jsonb,
  '{"locationRadiusMeters":100,"lateGraceMinutes":10,"checkoutGraceMinutes":30}'::jsonb,
  '{"defaultWeeklySchedule":{"monday":{"mode":"follow_branch_hours","isWorking":true,"startTime":"09:00","endTime":"18:00"},"tuesday":{"mode":"follow_branch_hours","isWorking":true,"startTime":"09:00","endTime":"18:00"},"wednesday":{"mode":"follow_branch_hours","isWorking":true,"startTime":"09:00","endTime":"18:00"},"thursday":{"mode":"follow_branch_hours","isWorking":true,"startTime":"09:00","endTime":"18:00"},"friday":{"mode":"follow_branch_hours","isWorking":true,"startTime":"09:00","endTime":"18:00"},"saturday":{"mode":"follow_branch_hours","isWorking":true,"startTime":"09:00","endTime":"18:00"},"sunday":{"mode":"off","isWorking":false,"startTime":"09:00","endTime":"18:00"}},"minimumCoverage":{"admin":1,"florist":2}}'::jsonb,
  '{"frequency":"monthly","periodStartDay":21,"periodEndDay":20,"hrSubmissionDay":24,"financeReviewDay":27,"paymentDay":28,"timezone":"Asia/Jakarta","pointValueIdr":1000,"baseSalaryByRole":{"admin":4500000,"finance":5000000,"hr":4500000,"florist":4000000}}'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
)
on conflict (id) do nothing;

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
    'revision', v_state.revision,
    'staffRoles', case when v_people_visible then v_state.staff_roles else null end,
    -- Attendance and scheduling rules are operational inputs for staff self-service.
    'attendance', v_state.attendance,
    'scheduling', v_state.scheduling,
    'payroll', case when v_payroll_visible then v_state.payroll else null end,
    'schedulingRevisions', v_state.scheduling_revisions,
    'payrollRevisions', case when v_payroll_visible then v_state.payroll_revisions else null end,
    'updatedAt', v_state.updated_at
  );
end;
$$;

revoke execute on function public.get_internal_settings_config() from public, anon;
grant execute on function public.get_internal_settings_config() to authenticated;

create or replace function public.save_internal_settings_config(
  p_expected_revision bigint,
  p_staff_roles jsonb,
  p_attendance jsonb,
  p_scheduling jsonb,
  p_payroll jsonb,
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
     or jsonb_typeof(p_scheduling_revisions) <> 'array'
     or jsonb_typeof(p_payroll_revisions) <> 'array' then
    raise exception 'INVALID_INTERNAL_SETTINGS_PAYLOAD' using errcode='22023';
  end if;

  select * into v_state from private.internal_settings_state where id='primary' for update;
  if not found then raise exception 'INTERNAL_SETTINGS_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision <> coalesce(p_expected_revision,0) then
    raise exception 'REVISION_CONFLICT:internal_settings:expected=%:actual=%', p_expected_revision, v_state.revision using errcode='40001';
  end if;

  v_next := v_state.revision + 1;
  update private.internal_settings_state
  set revision=v_next,
      staff_roles=p_staff_roles,
      attendance=p_attendance,
      scheduling=p_scheduling,
      payroll=p_payroll,
      scheduling_revisions=p_scheduling_revisions,
      payroll_revisions=p_payroll_revisions,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id='primary';

  perform private.write_business_activity(
    'internal_settings','primary',null,'settings_updated',
    'Owner updated shared staff/attendance/scheduling/payroll settings.',
    jsonb_build_object('revision',v_next)
  );

  return public.get_internal_settings_config();
end;
$$;

revoke execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Runtime branch context: schedule selects the default, user override selects
-- the active operational branch. RLS reads this context rather than treating
-- staff_access_profiles.branch_id as a mutable session value.
-- ---------------------------------------------------------------------------
create table if not exists private.staff_runtime_context (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operational_date date not null,
  scheduled_branch_id text references public.branches(id),
  operational_branch_id text references public.branches(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_staff_runtime_context_user_date
  on private.staff_runtime_context(user_id,operational_date);
revoke all on table private.staff_runtime_context from public, anon, authenticated;

create or replace function private.current_staff_branch_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select src.operational_branch_id
      from private.staff_runtime_context src
      where src.user_id=(select auth.uid())
        and src.session_id::text=(select auth.jwt()->>'session_id')
        and src.operational_date=(now() at time zone 'Asia/Jakarta')::date
      limit 1
    ),
    (
      select sap.branch_id
      from public.staff_access_profiles sap
      where sap.user_id=(select auth.uid()) and sap.is_active=true
      limit 1
    )
  )
$$;
revoke execute on function private.current_staff_branch_id() from public, anon, authenticated;

create or replace function public.set_staff_runtime_context(
  p_scheduled_branch_id text,
  p_operational_branch_id text,
  p_operational_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_session_id uuid := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  v_previous_operational text;
begin
  if (select auth.uid()) is null or v_role is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_session_id is null then raise exception 'AUTH_SESSION_REQUIRED' using errcode='42501'; end if;
  if p_operational_date <> v_today then raise exception 'RUNTIME_CONTEXT_DATE_MUST_BE_TODAY' using errcode='22023'; end if;
  if v_role in ('admin','florist') and p_operational_branch_id is null then
    raise exception 'OPERATIONAL_BRANCH_REQUIRED' using errcode='22023';
  end if;
  if p_scheduled_branch_id is not null and not exists(select 1 from public.branches where id=p_scheduled_branch_id and is_active=true) then
    raise exception 'INVALID_SCHEDULED_BRANCH' using errcode='22023';
  end if;
  if p_operational_branch_id is not null and not exists(select 1 from public.branches where id=p_operational_branch_id and is_active=true) then
    raise exception 'INVALID_OPERATIONAL_BRANCH' using errcode='22023';
  end if;

  select operational_branch_id into v_previous_operational
  from private.staff_runtime_context
  where session_id=v_session_id
    and user_id=(select auth.uid())
    and operational_date=p_operational_date;

  insert into private.staff_runtime_context(session_id,user_id,operational_date,scheduled_branch_id,operational_branch_id,updated_at)
  values (v_session_id,(select auth.uid()),p_operational_date,p_scheduled_branch_id,p_operational_branch_id,now())
  on conflict(session_id) do update
  set user_id=excluded.user_id,
      operational_date=excluded.operational_date,
      scheduled_branch_id=excluded.scheduled_branch_id,
      operational_branch_id=excluded.operational_branch_id,
      updated_at=excluded.updated_at;

  if v_previous_operational is distinct from p_operational_branch_id then
    perform private.write_business_activity(
      'staff_runtime',v_session_id::text,p_operational_branch_id,'operational_branch_changed',
      'Staff operational branch changed.',
      jsonb_build_object('sessionId',v_session_id,'scheduledBranchId',p_scheduled_branch_id,'previousOperationalBranchId',v_previous_operational,'operationalBranchId',p_operational_branch_id)
    );
  end if;

  return jsonb_build_object(
    'sessionId',v_session_id,
    'scheduledBranchId',p_scheduled_branch_id,
    'operationalBranchId',p_operational_branch_id,
    'operationalDate',p_operational_date,
    'updatedAt',now()
  );
end;
$$;
revoke execute on function public.set_staff_runtime_context(text,text,date) from public, anon;
grant execute on function public.set_staff_runtime_context(text,text,date) to authenticated;

-- Current profile now reports the same branch RLS is using.
create or replace function public.get_current_staff_access_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) limit 1;
  if not found or v_profile.is_active is not true then return null; end if;
  return jsonb_build_object(
    'userId',v_profile.user_id,'employeeId',v_profile.employee_id,'displayName',v_profile.display_name,
    'role',v_profile.role,'branchId',private.current_staff_branch_id(),'isActive',v_profile.is_active
  );
end;
$$;
revoke execute on function public.get_current_staff_access_profile() from public, anon;
grant execute on function public.get_current_staff_access_profile() to authenticated;

-- Existing Auth mappings follow HR role/name/status changes without requiring
-- service credentials in the browser. Creating Auth users remains Edge-only.
create or replace function private.hr_managed_employee_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(
    select jsonb_array_elements_text(coalesce(s.staff_roles#>'{hrManagedRoles,employees}','[]'::jsonb))
    from private.internal_settings_state s where s.id='primary'
  ), array[]::text[])
$$;
revoke execute on function private.hr_managed_employee_roles() from public, anon, authenticated;

create or replace function private.enabled_staff_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(
    select jsonb_array_elements_text(coalesce(s.staff_roles->'roles','[]'::jsonb))
    from private.internal_settings_state s where s.id='primary'
  ), array['owner','admin','finance','hr','florist']::text[])
$$;
revoke execute on function private.enabled_staff_roles() from public, anon, authenticated;

create or replace function public.can_invite_staff_role(p_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_role text := private.current_staff_role();
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
begin
  if (select auth.uid()) is null or v_actor_role is null then return false; end if;
  if p_role not in ('admin','finance','hr','florist') or not (p_role = any(v_enabled)) then return false; end if;
  if v_actor_role='owner' then return true; end if;
  return v_actor_role='hr'
    and private.has_action_permission('hr.create_employee')
    and p_role = any(v_managed);
end;
$$;
revoke execute on function public.can_invite_staff_role(text) from public, anon;
grant execute on function public.can_invite_staff_role(text) to authenticated;

create or replace function public.sync_staff_access_profile(
  p_employee_id text,
  p_display_name text,
  p_role text,
  p_is_active boolean,
  p_branch_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := private.current_staff_role();
  v_target public.staff_access_profiles%rowtype;
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_role not in ('owner','admin','finance','hr','florist') then raise exception 'INVALID_STAFF_ROLE' using errcode='22023'; end if;
  if p_role <> 'owner' and not (p_role = any(v_enabled)) then raise exception 'STAFF_ROLE_DISABLED' using errcode='42501'; end if;
  select * into v_target from public.staff_access_profiles where employee_id=p_employee_id for update;
  if not found then return null; end if;

  if v_actor_role <> 'owner' then
    if not private.has_action_permission('hr.edit_employee') then raise exception 'STAFF_EDIT_FORBIDDEN' using errcode='42501'; end if;
    if not (v_target.role = any(v_managed)) or not (p_role = any(v_managed)) then
      raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode='42501';
    end if;
  end if;

  if v_target.role='owner' and (p_role<>'owner' or p_is_active is not true) and
     (select count(*) from public.staff_access_profiles where role='owner' and is_active=true and user_id<>v_target.user_id) = 0 then
    raise exception 'LAST_ACTIVE_OWNER_PROTECTED' using errcode='42501';
  end if;

  update public.staff_access_profiles
  set display_name=trim(p_display_name), role=p_role, is_active=p_is_active, branch_id=p_branch_id, updated_at=now()
  where user_id=v_target.user_id
  returning * into v_target;

  perform private.write_business_activity(
    'staff_access',p_employee_id,p_branch_id,'staff_access_synced','Staff login access synchronized with HR.',
    jsonb_build_object('role',p_role,'isActive',p_is_active)
  );

  return jsonb_build_object('userId',v_target.user_id,'employeeId',v_target.employee_id,'displayName',v_target.display_name,'role',v_target.role,'branchId',v_target.branch_id,'isActive',v_target.is_active);
end;
$$;
revoke execute on function public.sync_staff_access_profile(text,text,text,boolean,text) from public, anon;
grant execute on function public.sync_staff_access_profile(text,text,text,boolean,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Payroll final-payment exactness: one command must transition exactly one
-- proposal to paid, therefore exactly one Finance expense is created.
-- ---------------------------------------------------------------------------
create or replace function public.payroll_record_payment(p_expected_revision bigint,p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_previous jsonb := '{}'::jsonb;
  v_newly_paid integer := 0;
begin
  select snapshot into v_previous from private.operational_domain_state where domain='payroll';
  v_previous := coalesce(v_previous,'{}'::jsonb);
  select count(*) into v_newly_paid
  from jsonb_array_elements(coalesce(p_snapshot->'payrollProposals','[]'::jsonb)) p
  where p->>'status'='paid'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(v_previous->'payrollProposals','[]'::jsonb)) old
      where old->>'id'=p->>'id' and old->>'status'='paid'
    );
  if v_newly_paid <> 1 then
    raise exception 'PAYROLL_PAYMENT_REQUIRES_EXACTLY_ONE_PROPOSAL:%',v_newly_paid using errcode='22023';
  end if;
  return private.apply_payroll_workflow_state('record_payment',p_expected_revision,p_snapshot);
end;
$$;
revoke execute on function public.payroll_record_payment(bigint,jsonb) from public, anon;
grant execute on function public.payroll_record_payment(bigint,jsonb) to authenticated;

commit;
