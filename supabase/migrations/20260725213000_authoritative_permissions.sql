-- Fleurstales V3.2 authoritative authorization configuration
-- Owner Settings -> Postgres authorization helpers -> RLS/RPCs -> OS UI.
-- Permission data lives in the private schema and is exposed only through
-- revision-checked RPCs. Runtime authorization reads the database directly;
-- it never trusts browser state or user-editable JWT metadata.

begin;

create table if not exists private.authorization_state (
  id text primary key check (id = 'primary'),
  revision bigint not null default 1 check (revision >= 1),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into private.authorization_state (id, revision)
values ('primary', 1)
on conflict (id) do nothing;

create table if not exists private.role_section_permissions (
  role text not null check (role in ('owner','admin','finance','hr','florist')),
  section text not null check (section in ('dashboard','orders','stock','catalog','customers','revenue','finance','hr','scheduling','settings')),
  access_level text not null check (access_level in ('none','view','edit')),
  updated_at timestamptz not null default now(),
  primary key (role, section)
);

create table if not exists private.action_capability_registry (
  capability text primary key,
  parent_section text not null check (parent_section in ('dashboard','orders','stock','catalog','customers','revenue','finance','hr','scheduling','settings')),
  requires_edit boolean not null default true
);

create table if not exists private.role_action_permissions (
  role text not null check (role in ('owner','admin','finance','hr','florist')),
  capability text not null references private.action_capability_registry(capability) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, capability)
);

create table if not exists private.feature_settings (
  feature_key text primary key check (feature_key in ('inventory')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

revoke all on table private.authorization_state from public, anon, authenticated;
revoke all on table private.role_section_permissions from public, anon, authenticated;
revoke all on table private.action_capability_registry from public, anon, authenticated;
revoke all on table private.role_action_permissions from public, anon, authenticated;
revoke all on table private.feature_settings from public, anon, authenticated;

insert into private.action_capability_registry (capability, parent_section, requires_edit) values
  ('orders.read_all','orders',false),
  ('orders.read_assigned','dashboard',false),
  ('orders.create','orders',true),
  ('orders.edit','orders',true),
  ('orders.assign','orders',true),
  ('orders.advance_status','orders',true),
  ('orders.submit_change_request','orders',true),
  ('orders.resolve_change_request','finance',true),
  ('finance.view_collect_orders','finance',false),
  ('finance.verify_order','finance',true),
  ('finance.view_payroll','finance',false),
  ('finance.approve_employee_payroll','finance',true),
  ('finance.approve_all_payroll','finance',true),
  ('finance.reject_employee_payroll','finance',true),
  ('finance.record_final_payment','finance',true),
  ('finance.adjust_payroll_schedule','finance',true),
  ('finance.view_refunds','finance',false),
  ('finance.approve_refund','finance',true),
  ('finance.view_ledger','finance',false),
  ('finance.create_ledger_entry','finance',true),
  ('finance.verify_ledger_entry','finance',true),
  ('hr.view_employees','hr',false),
  ('hr.create_employee','hr',true),
  ('hr.edit_employee','hr',true),
  ('hr.review_attendance','hr',false),
  ('hr.correct_attendance','hr',true),
  ('hr.manage_points','hr',true),
  ('hr.create_payroll_proposal','hr',true),
  ('hr.edit_payroll_proposal','hr',true),
  ('hr.resolve_rejected_employee','hr',true),
  ('settings.edit_store_profile','settings',true),
  ('settings.edit_branches','settings',true),
  ('settings.edit_roles','settings',true),
  ('settings.edit_permissions','settings',true),
  ('settings.edit_payment_methods','settings',true),
  ('settings.edit_attendance','settings',true),
  ('settings.edit_scheduling','settings',true),
  ('settings.edit_payroll','settings',true)
on conflict (capability) do update
set parent_section = excluded.parent_section,
    requires_edit = excluded.requires_edit;

-- Seed the current V3.1 section matrix. Owner edits are preserved on later runs.
insert into private.role_section_permissions (role, section, access_level) values
  ('owner','dashboard','edit'),('owner','orders','edit'),('owner','stock','edit'),('owner','catalog','edit'),('owner','customers','edit'),('owner','revenue','edit'),('owner','finance','edit'),('owner','hr','edit'),('owner','scheduling','edit'),('owner','settings','edit'),
  ('admin','dashboard','edit'),('admin','orders','edit'),('admin','stock','edit'),('admin','catalog','edit'),('admin','customers','edit'),('admin','revenue','none'),('admin','finance','none'),('admin','hr','none'),('admin','scheduling','none'),('admin','settings','none'),
  ('finance','dashboard','edit'),('finance','orders','view'),('finance','stock','view'),('finance','catalog','view'),('finance','customers','view'),('finance','revenue','view'),('finance','finance','edit'),('finance','hr','none'),('finance','scheduling','none'),('finance','settings','none'),
  ('hr','dashboard','view'),('hr','orders','none'),('hr','stock','none'),('hr','catalog','none'),('hr','customers','none'),('hr','revenue','none'),('hr','finance','none'),('hr','hr','edit'),('hr','scheduling','edit'),('hr','settings','none'),
  ('florist','dashboard','view'),('florist','orders','none'),('florist','stock','none'),('florist','catalog','none'),('florist','customers','none'),('florist','revenue','none'),('florist','finance','none'),('florist','hr','none'),('florist','scheduling','none'),('florist','settings','none')
on conflict (role, section) do nothing;

-- Seed detailed capabilities. Owner is enabled for every capability. Florist's
-- assigned-work capability intentionally belongs to Dashboard, so Orders can
-- remain hidden while My Work still functions.
insert into private.role_action_permissions (role, capability, enabled)
select 'owner', capability, true from private.action_capability_registry
on conflict (role, capability) do nothing;

insert into private.role_action_permissions (role, capability, enabled) values
  ('admin','orders.read_all',true),('admin','orders.create',true),('admin','orders.edit',true),('admin','orders.assign',true),('admin','orders.advance_status',true),('admin','orders.submit_change_request',true),
  ('finance','orders.read_all',true),('finance','orders.resolve_change_request',true),
  ('finance','finance.view_collect_orders',true),('finance','finance.verify_order',true),('finance','finance.view_payroll',true),('finance','finance.approve_employee_payroll',true),('finance','finance.approve_all_payroll',true),('finance','finance.reject_employee_payroll',true),('finance','finance.record_final_payment',true),('finance','finance.adjust_payroll_schedule',true),('finance','finance.view_refunds',true),('finance','finance.approve_refund',true),('finance','finance.view_ledger',true),('finance','finance.create_ledger_entry',true),('finance','finance.verify_ledger_entry',true),
  ('hr','hr.view_employees',true),('hr','hr.create_employee',true),('hr','hr.edit_employee',true),('hr','hr.review_attendance',true),('hr','hr.correct_attendance',true),('hr','hr.manage_points',true),('hr','hr.create_payroll_proposal',true),('hr','hr.edit_payroll_proposal',true),('hr','hr.resolve_rejected_employee',true),
  ('florist','orders.read_assigned',true)
on conflict (role, capability) do nothing;

insert into private.feature_settings(feature_key, enabled)
values ('inventory', false)
on conflict (feature_key) do nothing;

create or replace function private.section_access_for_role(p_role text, p_section text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_role = 'owner' and p_section in ('settings','scheduling') then 'edit'
    when p_role <> 'owner' and p_section = 'settings' then 'none'
    else coalesce((
      select rsp.access_level
      from private.role_section_permissions rsp
      where rsp.role = p_role and rsp.section = p_section
    ), 'none')
  end
$$;

create or replace function private.has_section_access_for_role(
  p_role text,
  p_section text,
  p_required text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_required
    when 'edit' then private.section_access_for_role(p_role, p_section) = 'edit'
    else private.section_access_for_role(p_role, p_section) in ('view','edit')
  end
$$;

create or replace function private.has_section_access(p_section text, p_required text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_section_access_for_role(private.current_staff_role(), p_section, p_required)
$$;

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

  -- Governance is never delegable and Owner can never lock themselves out.
  if p_capability like 'settings.%' then
    return p_role = 'owner';
  end if;

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

create or replace function private.has_action_permission(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_action_permission_for_role(private.current_staff_role(), p_capability)
$$;

create or replace function private.feature_enabled(p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select fs.enabled from private.feature_settings fs where fs.feature_key = p_feature_key), false)
$$;

revoke execute on function private.section_access_for_role(text,text) from public, anon, authenticated;
revoke execute on function private.has_section_access_for_role(text,text,text) from public, anon, authenticated;
revoke execute on function private.has_section_access(text,text) from public, anon, authenticated;
-- This boolean helper is referenced directly by RLS policies. Authenticated
-- needs EXECUTE for policy evaluation; private schema/Data API exposure remains revoked.
grant execute on function private.has_section_access(text,text) to authenticated;
revoke execute on function private.has_action_permission_for_role(text,text) from public, anon, authenticated;
revoke execute on function private.has_action_permission(text) from public, anon, authenticated;
revoke execute on function private.feature_enabled(text) from public, anon, authenticated;

create or replace function public.get_authorization_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if (select auth.uid()) is null or private.current_staff_role() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select revision into v_revision from private.authorization_state where id = 'primary';

  return jsonb_build_object(
    'revision', coalesce(v_revision, 1),
    'sections', coalesce((
      select jsonb_object_agg(role, section_map order by role)
      from (
        select role, jsonb_object_agg(section, access_level order by section) as section_map
        from private.role_section_permissions
        group by role
      ) s
    ), '{}'::jsonb),
    'actions', coalesce((
      select jsonb_object_agg(role, action_map order by role)
      from (
        select rap.role, jsonb_object_agg(rap.capability, rap.enabled order by rap.capability) as action_map
        from private.role_action_permissions rap
        group by rap.role
      ) a
    ), '{}'::jsonb),
    'features', coalesce((select jsonb_object_agg(feature_key, enabled order by feature_key) from private.feature_settings), '{}'::jsonb),
    'updatedAt', (select updated_at from private.authorization_state where id = 'primary')
  );
end;
$$;

revoke execute on function public.get_authorization_config() from public, anon;
grant execute on function public.get_authorization_config() to authenticated;

create or replace function public.save_authorization_config(
  p_expected_revision bigint,
  p_sections jsonb,
  p_actions jsonb,
  p_features jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.authorization_state%rowtype;
  v_role text;
  v_section text;
  v_access text;
  v_capability text;
  v_enabled boolean;
  v_parent text;
  v_requires_edit boolean;
  v_next_revision bigint;
begin
  if (select auth.uid()) is null or private.current_staff_role() <> 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_EXPECTED_REVISION' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sections) <> 'object' or jsonb_typeof(p_actions) <> 'object' then
    raise exception 'INVALID_AUTHORIZATION_CONFIG' using errcode = '22023';
  end if;

  select * into v_state
  from private.authorization_state
  where id = 'primary'
  for update;

  if v_state.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT:authorization:expected=%:actual=%', p_expected_revision, v_state.revision
      using errcode = '40001';
  end if;

  -- Validate a complete 5 x 10 section matrix before mutating anything.
  foreach v_role in array array['owner','admin','finance','hr','florist'] loop
    foreach v_section in array array['dashboard','orders','stock','catalog','customers','revenue','finance','hr','scheduling','settings'] loop
      v_access := p_sections #>> array[v_role, v_section];
      if v_access not in ('none','view','edit') then
        raise exception 'INVALID_SECTION_PERMISSION:%:%', v_role, v_section using errcode = '22023';
      end if;
      -- Owner is the recovery authority. Direct RPC callers cannot remove
      -- Owner section visibility even if they bypass the Settings UI.
      if v_role = 'owner' and v_access = 'none' then
        v_access := 'edit';
      end if;
      if v_section = 'settings' then
        v_access := case when v_role = 'owner' then 'edit' else 'none' end;
      elsif v_role = 'owner' and v_section = 'scheduling' then
        v_access := 'edit';
      end if;

      insert into private.role_section_permissions(role, section, access_level, updated_at)
      values (v_role, v_section, v_access, now())
      on conflict (role, section) do update
      set access_level = excluded.access_level, updated_at = excluded.updated_at;
    end loop;
  end loop;

  for v_capability, v_parent, v_requires_edit in
    select capability, parent_section, requires_edit
    from private.action_capability_registry
  loop
    foreach v_role in array array['owner','admin','finance','hr','florist'] loop
      v_enabled := coalesce((p_actions #>> array[v_role, v_capability])::boolean, false);
      if v_capability like 'settings.%' then
        v_enabled := v_role = 'owner';
      elsif v_enabled and not private.has_section_access_for_role(
        v_role,
        v_parent,
        case when v_requires_edit then 'edit' else 'view' end
      ) then
        v_enabled := false;
      end if;

      insert into private.role_action_permissions(role, capability, enabled, updated_at)
      values (v_role, v_capability, v_enabled, now())
      on conflict (role, capability) do update
      set enabled = excluded.enabled, updated_at = excluded.updated_at;
    end loop;
  end loop;

  if p_features ? 'inventory' then
    insert into private.feature_settings(feature_key, enabled, updated_at)
    values ('inventory', coalesce((p_features->>'inventory')::boolean, false), now())
    on conflict(feature_key) do update
    set enabled = excluded.enabled, updated_at = excluded.updated_at;
  end if;

  v_next_revision := v_state.revision + 1;
  update private.authorization_state
  set revision = v_next_revision, updated_by = (select auth.uid()), updated_at = now()
  where id = 'primary';

  perform private.write_audit_event(
    'authorization.save', 'authorization_config', 'primary', 'succeeded',
    p_expected_revision, v_next_revision, null,
    jsonb_build_object('sections', p_sections, 'actions', p_actions, 'features', p_features)
  );


  return public.get_authorization_config();
end;
$$;

revoke execute on function public.save_authorization_config(bigint,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_authorization_config(bigint,jsonb,jsonb,jsonb) to authenticated;

-- Replace key data policies with configuration-driven authorization.
drop policy if exists customers_crm_read on public.customers;
create policy customers_crm_read on public.customers
for select to authenticated
using (private.has_section_access('customers','view'));

drop policy if exists customer_addresses_crm_read on public.customer_addresses;
create policy customer_addresses_crm_read on public.customer_addresses
for select to authenticated
using (private.has_section_access('customers','view'));

-- Existing CRM save/delete RPCs remain the only mutation boundary; make their
-- internal role checks permission-aware by exposing a helper with the same
-- database-source-of-truth semantics.
create or replace function private.can_manage_customers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.has_section_access('customers','edit') $$;
revoke execute on function private.can_manage_customers() from public, anon, authenticated;

-- Order row scope now respects configured capabilities. Florist assignment is
-- employee-scoped rather than branch-scoped so an intentional cross-branch
-- assignment remains visible to the assigned florist.
create or replace function private.can_read_order_row(p_branch_id text, p_florist_employee_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
  v_branch_id text := private.current_staff_branch_id();
  v_employee_id text := private.current_staff_employee_id();
begin
  if v_role in ('owner','finance') and private.has_action_permission('orders.read_all') then
    return true;
  end if;
  if v_role = 'admin' and private.has_action_permission('orders.read_all') then
    return v_branch_id is not null and v_branch_id = p_branch_id;
  end if;
  if v_role = 'florist' and private.has_action_permission('orders.read_assigned') then
    return v_employee_id is not null and v_employee_id = p_florist_employee_id;
  end if;
  return false;
end;
$$;

-- Generic operational domains use the configured section model. Payroll gets
-- a dedicated workflow boundary in the next migration and is intentionally
-- removed from generic write authorization there.
create or replace function private.can_read_operational_domain(p_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_domain
    when 'hr' then private.has_section_access('hr','view')
    when 'payroll' then private.has_action_permission('hr.create_payroll_proposal')
      or private.has_action_permission('hr.edit_payroll_proposal')
      or private.has_action_permission('hr.resolve_rejected_employee')
      or private.has_action_permission('finance.view_payroll')
    when 'finance' then private.has_section_access('finance','view')
    when 'stock' then private.feature_enabled('inventory') and private.has_section_access('stock','view')
    when 'vouchers' then private.has_section_access('finance','view') or private.has_section_access('orders','edit')
    when 'order_drafts' then private.has_action_permission('orders.create') or private.has_action_permission('orders.edit')
    else false
  end;
end;
$$;

create or replace function private.can_write_operational_domain(p_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_domain
    when 'hr' then private.has_section_access('hr','edit')
    when 'payroll' then false -- dedicated workflow RPC only
    when 'finance' then private.has_section_access('finance','edit')
    when 'stock' then private.feature_enabled('inventory') and private.has_section_access('stock','edit')
    when 'vouchers' then private.has_section_access('finance','edit') or private.has_section_access('orders','edit')
    when 'order_drafts' then private.has_action_permission('orders.create') or private.has_action_permission('orders.edit')
    else false
  end;
end;
$$;

-- Size-guide mutation policies follow Catalog Manage access instead of a
-- hard-coded Owner/Admin role list.
drop policy if exists size_guide_templates_editor_insert on public.size_guide_templates;
drop policy if exists size_guide_templates_editor_update on public.size_guide_templates;
drop policy if exists size_guide_templates_editor_delete on public.size_guide_templates;
create policy size_guide_templates_editor_insert on public.size_guide_templates for insert to authenticated
  with check (private.has_section_access('catalog','edit'));
create policy size_guide_templates_editor_update on public.size_guide_templates for update to authenticated
  using (private.has_section_access('catalog','edit')) with check (private.has_section_access('catalog','edit'));
create policy size_guide_templates_editor_delete on public.size_guide_templates for delete to authenticated
  using (private.has_section_access('catalog','edit'));

drop policy if exists size_guide_targets_editor_insert on public.size_guide_targets;
drop policy if exists size_guide_targets_editor_update on public.size_guide_targets;
drop policy if exists size_guide_targets_editor_delete on public.size_guide_targets;
create policy size_guide_targets_editor_insert on public.size_guide_targets for insert to authenticated
  with check (private.has_section_access('catalog','edit'));
create policy size_guide_targets_editor_update on public.size_guide_targets for update to authenticated
  using (private.has_section_access('catalog','edit')) with check (private.has_section_access('catalog','edit'));
create policy size_guide_targets_editor_delete on public.size_guide_targets for delete to authenticated
  using (private.has_section_access('catalog','edit'));

drop policy if exists size_guides_storage_staff_select on storage.objects;
create policy size_guides_storage_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'size-guides' and private.has_section_access('catalog','view'));
drop policy if exists size_guides_storage_insert on storage.objects;
create policy size_guides_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'size-guides' and private.has_section_access('catalog','edit'));
drop policy if exists size_guides_storage_update on storage.objects;
create policy size_guides_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'size-guides' and private.has_section_access('catalog','edit'))
  with check (bucket_id = 'size-guides' and private.has_section_access('catalog','edit'));
drop policy if exists size_guides_storage_delete on storage.objects;
create policy size_guides_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'size-guides' and private.has_section_access('catalog','edit'));

-- Explicit function grants: current Supabase projects increasingly require
-- deliberate Data API exposure rather than relying on defaults.
grant execute on function public.get_authorization_config() to authenticated;
grant execute on function public.save_authorization_config(bigint,jsonb,jsonb,jsonb) to authenticated;

commit;
