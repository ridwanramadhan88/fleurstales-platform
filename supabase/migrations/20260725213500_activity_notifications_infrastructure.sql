-- Fleurstales V3.2 durable operational activity + staff notifications.
-- Audit remains private/immutable; business activity is a scoped staff-facing
-- timeline; notifications are per-auth-user and marked read only through RPC.

begin;

alter table public.order_activities
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.business_activities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('order','payroll','authorization','customer','stock','finance','hr','system')),
  entity_id text,
  branch_id text,
  kind text not null,
  description text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_employee_id text,
  actor_name text not null,
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_business_activities_entity
  on public.business_activities(entity_type, entity_id, occurred_at desc);
create index if not exists idx_business_activities_branch
  on public.business_activities(branch_id, occurred_at desc);

create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_employee_id text,
  kind text not null,
  severity text not null default 'info' check (severity in ('critical','warning','info')),
  title text not null,
  message text,
  branch_id text,
  entity_type text,
  entity_id text,
  target text,
  target_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_notifications_recipient
  on public.staff_notifications(recipient_user_id, created_at desc);
create index if not exists idx_staff_notifications_unread
  on public.staff_notifications(recipient_user_id, created_at desc)
  where read_at is null;

alter table public.business_activities enable row level security;
alter table public.staff_notifications enable row level security;

revoke all on table public.business_activities from anon, authenticated;
revoke all on table public.staff_notifications from anon, authenticated;
grant select on table public.business_activities to authenticated;
grant select on table public.staff_notifications to authenticated;

create or replace function private.can_read_business_activity(p_activity public.business_activities)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_staff_role() = 'owner' then return true; end if;

  if p_activity.entity_type = 'order' and p_activity.entity_id is not null then
    return exists (
      select 1 from public.orders o
      where o.id = p_activity.entity_id
        and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
    );
  end if;

  if p_activity.entity_type = 'payroll' then
    return private.has_action_permission('finance.view_payroll')
      or private.has_action_permission('hr.create_payroll_proposal')
      or private.has_action_permission('hr.edit_payroll_proposal');
  end if;

  if p_activity.entity_type = 'authorization' then
    return private.has_action_permission('settings.edit_permissions');
  end if;

  if p_activity.entity_type = 'customer' then
    return private.has_section_access('customers', 'view');
  end if;

  if p_activity.entity_type = 'finance' then
    return private.has_section_access('finance', 'view');
  end if;

  if p_activity.entity_type = 'hr' then
    return private.has_section_access('hr', 'view');
  end if;

  if p_activity.entity_type = 'stock' then
    return private.feature_enabled('inventory') and private.has_section_access('stock', 'view');
  end if;

  return false;
end;
$$;

revoke execute on function private.can_read_business_activity(public.business_activities) from public, anon, authenticated;
grant execute on function private.can_read_business_activity(public.business_activities) to authenticated;

drop policy if exists business_activities_staff_read on public.business_activities;
create policy business_activities_staff_read on public.business_activities
for select to authenticated
using (private.can_read_business_activity(business_activities));

drop policy if exists staff_notifications_own_read on public.staff_notifications;
create policy staff_notifications_own_read on public.staff_notifications
for select to authenticated
using (recipient_user_id = (select auth.uid()));

create or replace function private.write_business_activity(
  p_entity_type text,
  p_entity_id text,
  p_branch_id text,
  p_kind text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_id uuid;
begin
  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid()) and is_active = true
  limit 1;

  insert into public.business_activities(
    entity_type, entity_id, branch_id, kind, description,
    actor_user_id, actor_employee_id, actor_name, actor_role, metadata
  ) values (
    p_entity_type, p_entity_id, p_branch_id, p_kind, p_description,
    (select auth.uid()), v_profile.employee_id,
    coalesce(nullif(trim(v_profile.display_name), ''), coalesce(v_profile.role, 'System')),
    v_profile.role, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.notify_roles(
  p_roles text[],
  p_branch_id text,
  p_kind text,
  p_severity text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id text,
  p_target text,
  p_target_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.staff_notifications(
    recipient_user_id, recipient_employee_id, kind, severity, title, message,
    branch_id, entity_type, entity_id, target, target_id
  )
  select
    sap.user_id, sap.employee_id, p_kind, p_severity, p_title, p_message,
    p_branch_id, p_entity_type, p_entity_id, p_target, p_target_id
  from public.staff_access_profiles sap
  where sap.is_active = true
    and sap.role = any(p_roles)
    and (p_branch_id is null or sap.role in ('owner','finance','hr') or sap.branch_id = p_branch_id)
    and sap.user_id is distinct from (select auth.uid());

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.notify_employee(
  p_employee_id text,
  p_kind text,
  p_severity text,
  p_title text,
  p_message text,
  p_branch_id text,
  p_entity_type text,
  p_entity_id text,
  p_target text,
  p_target_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_employee_id is null then return 0; end if;

  insert into public.staff_notifications(
    recipient_user_id, recipient_employee_id, kind, severity, title, message,
    branch_id, entity_type, entity_id, target, target_id
  )
  select
    sap.user_id, sap.employee_id, p_kind, p_severity, p_title, p_message,
    p_branch_id, p_entity_type, p_entity_id, p_target, p_target_id
  from public.staff_access_profiles sap
  where sap.is_active = true
    and sap.employee_id = p_employee_id
    and sap.user_id is distinct from (select auth.uid());

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.write_business_activity(text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function private.notify_roles(text[],text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function private.notify_employee(text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;

-- Authorization changes originate in the earlier authoritative-permissions migration.
-- Emit activity/notifications here, after the durable event helpers exist, so the
-- permission migration has no forward dependency on later migration functions.
create or replace function private.on_authorization_state_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revision is distinct from old.revision then
    perform private.write_business_activity(
      'authorization','primary',null,'permissions_updated',
      'Owner updated role permissions and feature settings',
      jsonb_build_object('revision',new.revision)
    );
    perform private.notify_roles(
      array['admin','finance','hr','florist'],null,'authorization_changed','info',
      'Access settings updated','Your Fleurstales access settings were updated.',
      'authorization','primary',null,null
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.on_authorization_state_changed() from public, anon, authenticated;

drop trigger if exists authorization_state_changed_events on private.authorization_state;
create trigger authorization_state_changed_events
after update of revision on private.authorization_state
for each row execute function private.on_authorization_state_changed();

create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.staff_notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = (select auth.uid())
    and id = any(coalesce(p_ids, array[]::uuid[]));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- PostgreSQL exceptions roll back same-transaction audit inserts. Rejected
-- client mutations report the outcome in a fresh transaction through this
-- narrow RPC; actor identity remains server-derived.
create or replace function public.record_mutation_conflict(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_expected_revision bigint default null,
  p_observed_revision bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_staff_role() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_action not in ('authorization.save','operational.save','payroll.save','order.save') then
    raise exception 'INVALID_CONFLICT_ACTION' using errcode = '22023';
  end if;
  if p_entity_type not in ('authorization','operational_domain','payroll','order') then
    raise exception 'INVALID_CONFLICT_ENTITY' using errcode = '22023';
  end if;

  perform private.write_audit_event(
    p_action, p_entity_type, p_entity_id, 'conflict',
    p_expected_revision, p_observed_revision,
    null, null,
    jsonb_build_object('reportedAfterRollback', true)
  );
end;
$$;

revoke execute on function public.record_mutation_conflict(text,text,text,bigint,bigint) from public, anon;
grant execute on function public.record_mutation_conflict(text,text,text,bigint,bigint) to authenticated;

-- Enable scoped Realtime events. Adding to the publication is idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_activities'
  ) then
    alter publication supabase_realtime add table public.business_activities;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_notifications'
  ) then
    alter publication supabase_realtime add table public.staff_notifications;
  end if;
end;
$$;

commit;
