-- Repair staff login-time activity writes and make staff recovery email
-- an explicit part of the access profile.

begin;

alter table public.staff_access_profiles
  add column if not exists email text;

update public.staff_access_profiles sap
set email=lower(u.email)
from auth.users u
where u.id=sap.user_id
  and u.email is not null
  and lower(u.email) not like '%@staff.fleurstales.local'
  and sap.email is null;

create unique index if not exists staff_access_profiles_email_lower_key
  on public.staff_access_profiles(lower(email))
  where email is not null;

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
    'userId',v_profile.user_id,
    'employeeId',v_profile.employee_id,
    'displayName',v_profile.display_name,
    'role',v_profile.role,
    'username',v_profile.username,
    'email',v_profile.email,
    'branchId',private.current_staff_branch_id(),
    'isActive',v_profile.is_active
  );
end;
$$;
revoke execute on function public.get_current_staff_access_profile() from public, anon;
grant execute on function public.get_current_staff_access_profile() to authenticated;

-- Runtime branch changes belong to the HR/staff activity domain. The former
-- "staff_runtime" value was outside the business_activities constraint.
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
      'hr',v_session_id::text,p_operational_branch_id,'operational_branch_changed',
      'Staff operational branch changed.',
      jsonb_build_object(
        'activityScope','staff_runtime',
        'sessionId',v_session_id,
        'scheduledBranchId',p_scheduled_branch_id,
        'previousOperationalBranchId',v_previous_operational,
        'operationalBranchId',p_operational_branch_id
      )
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

-- Shared settings changes are authorization activity, not a new activity type.
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
    'authorization','primary',null,'settings_updated',
    'Owner updated shared staff/attendance/scheduling/payroll settings.',
    jsonb_build_object('activityScope','internal_settings','revision',v_next)
  );

  return public.get_internal_settings_config();
end;
$$;
revoke execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- Map each operational state to one of the activity domains enforced by the
-- existing business_activities check constraint.
create or replace function private.persist_validated_operational_snapshot(
  p_domain text,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_previous jsonb;
  v_next_revision bigint;
  v_activity_domain text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_EXPECTED_REVISION' using errcode='22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'SNAPSHOT_OBJECT_REQUIRED' using errcode='22023';
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain=p_domain
  for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception 'REVISION_CONFLICT:%:expected=%:actual=0',p_domain,p_expected_revision using errcode='40001';
    end if;
    insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
    values(p_domain,1,p_snapshot,(select auth.uid()),now())
    returning * into v_state;
    v_previous := null;
  else
    if v_state.revision <> p_expected_revision then
      raise exception 'REVISION_CONFLICT:%:expected=%:actual=%',p_domain,p_expected_revision,v_state.revision using errcode='40001';
    end if;
    v_previous := v_state.snapshot;
    v_next_revision := v_state.revision + 1;
    update private.operational_domain_state
    set revision=v_next_revision,snapshot=p_snapshot,updated_by=(select auth.uid()),updated_at=now()
    where domain=p_domain and revision=p_expected_revision
    returning * into v_state;
    if not found then
      raise exception 'REVISION_CONFLICT:%:lost_update',p_domain using errcode='40001';
    end if;
  end if;

  perform private.write_audit_event(
    'operational.'||p_domain||'.save','operational_domain',p_domain,'succeeded',
    p_expected_revision,v_state.revision,v_previous,p_snapshot
  );
  v_activity_domain := case p_domain
    when 'hr' then 'hr'
    when 'payroll' then 'payroll'
    when 'finance' then 'finance'
    when 'vouchers' then 'finance'
    when 'stock' then 'stock'
    when 'order_drafts' then 'order'
    else 'system'
  end;
  perform private.write_business_activity(
    v_activity_domain,p_domain,null,'updated',
    upper(left(p_domain,1))||substr(p_domain,2)||' operational state updated',
    jsonb_build_object('activityScope',p_domain,'revision',v_state.revision)
  );

  return jsonb_build_object(
    'domain',v_state.domain,
    'revision',v_state.revision,
    'snapshot',v_state.snapshot,
    'updatedAt',v_state.updated_at
  );
end;
$$;
revoke execute on function private.persist_validated_operational_snapshot(text,bigint,jsonb) from public,anon,authenticated;

commit;
