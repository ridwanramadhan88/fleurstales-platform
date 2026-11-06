-- Staff accounts: the server owns the employee record together with the login.
--
-- Before this migration the login (staff_access_profiles + Supabase Auth) was
-- written by the staff-admin Edge Function, while the HR employee row was added
-- or edited later by the browser through the generic HR snapshot save. When the
-- second write failed or used a stale copy, production drifted:
--   * a login without an HR employee (create succeeded, HR save failed),
--   * a username changed on the login but not in HR,
--   * an employee deactivated in HR whose login was re-activated seconds later
--     because "Save profile" re-sent a stale `isActive: true`.
--
-- The two RPCs below change the login profile and the HR employee row in ONE
-- transaction and return the new HR revision so the browser can adopt it
-- instead of re-saving its own copy.
--   provision_staff_employee(...)  login profile + new HR employee (create)
--   update_staff_employee(...)     patch: only the keys that are sent change;
--                                  status changes only when `status` is sent.

begin;

-- Production already grants these (Supabase default privileges at project
-- creation); a fresh migration replay (CI, E2E) did not, so staff-admin's
-- service-role reads failed there. Aligns replay with production; no change
-- for production itself.
grant select, insert, update, delete on table public.staff_access_profiles to service_role;

create or replace function private.staff_employee_role_label(p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then 'Owner'
    when 'admin' then 'Admin'
    when 'finance' then 'Finance'
    when 'hr' then 'HR'
    when 'florist' then 'Florist'
    else p_role
  end
$$;
revoke execute on function private.staff_employee_role_label(text) from public, anon, authenticated;

-- Writes one employee object into the HR snapshot (replace by id, or prepend
-- when p_insert) and bumps the HR revision. Caller must hold the row lock.
create or replace function private.write_hr_employee_entry(p_employee jsonb, p_insert boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_employees jsonb;
  v_revision bigint;
begin
  select * into v_state from private.operational_domain_state where domain = 'hr' for update;
  if not found then
    if not p_insert then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002'; end if;
    insert into private.operational_domain_state(domain, revision, snapshot, updated_by, updated_at)
    values ('hr', 1, jsonb_build_object('employees', jsonb_build_array(p_employee)), (select auth.uid()), now())
    returning revision into v_revision;
    return v_revision;
  end if;

  v_employees := coalesce(v_state.snapshot->'employees', '[]'::jsonb);
  if p_insert then
    if exists (select 1 from jsonb_array_elements(v_employees) e where e->>'id' = p_employee->>'id') then
      raise exception 'EMPLOYEE_ALREADY_EXISTS' using errcode = '23505';
    end if;
    v_employees := jsonb_build_array(p_employee) || v_employees;
  else
    if not exists (select 1 from jsonb_array_elements(v_employees) e where e->>'id' = p_employee->>'id') then
      raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
    end if;
    select coalesce(jsonb_agg(case when e->>'id' = p_employee->>'id' then p_employee else e end order by ordinality), '[]'::jsonb)
    into v_employees
    from jsonb_array_elements(v_employees) with ordinality as items(e, ordinality);
  end if;

  update private.operational_domain_state
  set snapshot = jsonb_set(coalesce(snapshot, '{}'::jsonb), '{employees}', v_employees, true),
      revision = revision + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
  where domain = 'hr'
  returning revision into v_revision;
  return v_revision;
end;
$$;
revoke execute on function private.write_hr_employee_entry(jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Create: login profile + HR employee in one transaction.
-- Called by staff-admin with the actor's session right after it created the
-- Supabase Auth user. If this raises, staff-admin deletes that Auth user.
-- ---------------------------------------------------------------------------
create or replace function public.provision_staff_employee(
  p_user_id uuid,
  p_employee jsonb,
  p_branch_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := private.current_staff_role();
  v_employee_id text := nullif(trim(coalesce(p_employee->>'id', '')), '');
  v_role text := p_employee->>'systemRole';
  v_name text := nullif(trim(coalesce(p_employee->>'name', '')), '');
  v_phone text := trim(coalesce(p_employee->>'phone', ''));
  v_hire_date text := coalesce(p_employee->>'hireDate', '');
  v_username text := lower(trim(coalesce(p_employee->>'username', '')));
  v_email text := lower(trim(coalesce(p_employee->>'email', '')));
  v_auth auth.users%rowtype;
  v_employee jsonb;
  v_revision bigint;
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_employee is null or jsonb_typeof(p_employee) <> 'object' then raise exception 'INVALID_STAFF_EMPLOYEE' using errcode = '22023'; end if;
  if v_employee_id is null or v_employee_id !~ '^emp-[A-Za-z0-9-]+$' then raise exception 'INVALID_STAFF_EMPLOYEE' using errcode = '22023'; end if;
  if not coalesce(public.can_invite_staff_role(v_role), false) then raise exception 'STAFF_INVITE_FORBIDDEN' using errcode = '42501'; end if;
  if v_name is null then raise exception 'INVALID_STAFF_DISPLAY_NAME' using errcode = '22023'; end if;
  if v_phone <> '' and v_phone !~ '^\+?[0-9][0-9 ()-]{7,19}$' then raise exception 'INVALID_STAFF_PHONE' using errcode = '22023'; end if;
  if v_hire_date !~ '^\d{4}-\d{2}-\d{2}$' or v_hire_date::date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'INVALID_STAFF_HIRE_DATE' using errcode = '22023';
  end if;

  -- The Auth user must be the one staff-admin just created for this employee.
  select * into v_auth from auth.users where id = p_user_id;
  if not found then raise exception 'AUTH_USER_REQUIRED' using errcode = '23503'; end if;
  if coalesce(v_auth.raw_app_meta_data->>'fleurstales_employee_id', '') <> v_employee_id
     or v_auth.created_at < now() - interval '15 minutes' then
    raise exception 'STAFF_AUTH_USER_MISMATCH' using errcode = '42501';
  end if;
  if lower(coalesce(v_auth.email, '')) <> v_email then raise exception 'STAFF_AUTH_USER_MISMATCH' using errcode = '42501'; end if;
  if exists (select 1 from public.staff_access_profiles where user_id = p_user_id or employee_id = v_employee_id) then
    raise exception 'EMPLOYEE_ALREADY_HAS_LOGIN' using errcode = '23505';
  end if;
  if exists (
    select 1 from private.operational_domain_state s, jsonb_array_elements(coalesce(s.snapshot->'employees', '[]'::jsonb)) e
    where s.domain = 'hr' and (lower(coalesce(e->>'username', '')) = v_username or lower(coalesce(e->>'email', '')) = v_email)
  ) then
    raise exception 'USERNAME_OR_EMAIL_ALREADY_IN_HR' using errcode = '23505';
  end if;

  -- Validates username/email format and uniqueness, inserts the profile.
  perform public.service_create_staff_access_profile(p_user_id, v_employee_id, v_email, v_username, v_name, v_role, p_branch_id);

  -- Identity fields are server-owned; the rest (e.g. base salary) comes from
  -- the browser's employee builder, exactly as the generic HR save allowed.
  v_employee := (p_employee - 'pin' - 'employmentEndDate' - 'separationReason' - 'separatedAt' - 'separatedBy')
    || jsonb_build_object(
      'id', v_employee_id,
      'name', v_name,
      'phone', v_phone,
      'hireDate', v_hire_date,
      'systemRole', v_role,
      'position', private.staff_employee_role_label(v_role),
      'status', 'active',
      'branch', coalesce(p_employee->>'branch', ''),
      'email', v_email,
      'username', v_username
    );
  v_revision := private.write_hr_employee_entry(v_employee, true);

  perform private.write_business_activity(
    'hr', v_employee_id, p_branch_id, 'staff_employee_created',
    'Staff login and employee record created together.',
    jsonb_build_object('role', v_role, 'username', v_username)
  );

  return jsonb_build_object('revision', v_revision, 'employee', v_employee, 'userId', p_user_id);
end;
$$;
revoke execute on function public.provision_staff_employee(uuid, jsonb, text) from public, anon;
grant execute on function public.provision_staff_employee(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Update: patch the HR employee row and (when it exists) the login profile.
-- Allowed keys: name, phone, hireDate, systemRole, username, email, status.
-- HR stays inside its managed roles (hrManagedRoles) for every key.
-- Also the authority gate for password changes made by staff-admin: it calls
-- this with an empty patch first, so permission is checked before Auth changes.
-- ---------------------------------------------------------------------------
create or replace function public.update_staff_employee(
  p_employee_id text,
  p_patch jsonb,
  p_require_login boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := private.current_staff_role();
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_key text;
  v_current jsonb;
  v_next jsonb;
  v_profile public.staff_access_profiles%rowtype;
  v_has_profile boolean := false;
  v_role text;
  v_username text;
  v_email text;
  v_status text;
  v_actor_name text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_revision bigint;
  v_changed text[] := array[]::text[];
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_actor_role not in ('owner', 'hr') or not private.has_action_permission('hr.edit_employee') then
    raise exception 'STAFF_EDIT_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(v_patch) <> 'object' then raise exception 'INVALID_STAFF_UPDATE' using errcode = '22023'; end if;
  for v_key in select jsonb_object_keys(v_patch) loop
    if v_key not in ('name', 'phone', 'hireDate', 'systemRole', 'username', 'email', 'status') then
      raise exception 'INVALID_STAFF_UPDATE_KEY:%', v_key using errcode = '22023';
    end if;
  end loop;

  perform 1 from private.operational_domain_state where domain = 'hr' for update;
  select e into v_current
  from private.operational_domain_state s, jsonb_array_elements(coalesce(s.snapshot->'employees', '[]'::jsonb)) e
  where s.domain = 'hr' and e->>'id' = p_employee_id
  limit 1;
  if v_current is null then raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_profile from public.staff_access_profiles where employee_id = p_employee_id for update;
  v_has_profile := found;
  if p_require_login and not v_has_profile then raise exception 'STAFF_LOGIN_NOT_FOUND' using errcode = 'P0002'; end if;

  if coalesce(v_current->>'systemRole', '') = 'owner' or (v_has_profile and v_profile.role = 'owner') then
    raise exception 'OWNER_PROFILE_PROTECTED' using errcode = '42501';
  end if;
  if v_actor_role = 'hr' and not (coalesce(v_current->>'systemRole', '') = any(v_managed)) then
    raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  -- HR may change role, username and email only inside its managed roles
  -- (same rule as the OS screen); Owner may assign any enabled non-owner role.
  if v_actor_role = 'hr' and v_patch ? 'systemRole' and not ((v_patch->>'systemRole') = any(v_managed)) then
    raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  v_next := v_current - 'pin';

  if v_patch ? 'name' then
    if nullif(trim(coalesce(v_patch->>'name', '')), '') is null then raise exception 'INVALID_STAFF_DISPLAY_NAME' using errcode = '22023'; end if;
    v_next := v_next || jsonb_build_object('name', trim(v_patch->>'name'));
  end if;
  if v_patch ? 'phone' then
    if trim(coalesce(v_patch->>'phone', '')) <> '' and trim(v_patch->>'phone') !~ '^\+?[0-9][0-9 ()-]{7,19}$' then
      raise exception 'INVALID_STAFF_PHONE' using errcode = '22023';
    end if;
    v_next := v_next || jsonb_build_object('phone', trim(coalesce(v_patch->>'phone', '')));
  end if;
  if v_patch ? 'hireDate' then
    if coalesce(v_patch->>'hireDate', '') !~ '^\d{4}-\d{2}-\d{2}$' or (v_patch->>'hireDate')::date > v_today then
      raise exception 'INVALID_STAFF_HIRE_DATE' using errcode = '22023';
    end if;
    v_next := v_next || jsonb_build_object('hireDate', v_patch->>'hireDate');
  end if;
  if v_patch ? 'systemRole' then
    v_role := v_patch->>'systemRole';
    if v_role is distinct from v_current->>'systemRole' then
      if v_role not in ('admin', 'finance', 'hr', 'florist') or not (v_role = any(v_enabled)) then
        raise exception 'STAFF_ROLE_DISABLED' using errcode = '42501';
      end if;
    end if;
    v_next := v_next || jsonb_build_object('systemRole', v_role, 'position', private.staff_employee_role_label(v_role));
  end if;
  if v_patch ? 'username' then
    v_username := lower(trim(coalesce(v_patch->>'username', '')));
    if v_username !~ '^[a-z][a-z0-9._-]*$' then raise exception 'INVALID_STAFF_USERNAME' using errcode = '22023'; end if;
    if exists (select 1 from public.staff_access_profiles where lower(username) = v_username and employee_id <> p_employee_id)
       or exists (
         select 1 from private.operational_domain_state s, jsonb_array_elements(coalesce(s.snapshot->'employees', '[]'::jsonb)) e
         where s.domain = 'hr' and e->>'id' <> p_employee_id and lower(coalesce(e->>'username', '')) = v_username
       ) then
      raise exception 'USERNAME_ALREADY_IN_USE' using errcode = '23505';
    end if;
    v_next := v_next || jsonb_build_object('username', v_username);
  end if;
  if v_patch ? 'email' then
    v_email := lower(trim(coalesce(v_patch->>'email', '')));
    if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_STAFF_EMAIL' using errcode = '22023'; end if;
    if exists (select 1 from public.staff_access_profiles where lower(email) = v_email and employee_id <> p_employee_id)
       or exists (
         select 1 from private.operational_domain_state s, jsonb_array_elements(coalesce(s.snapshot->'employees', '[]'::jsonb)) e
         where s.domain = 'hr' and e->>'id' <> p_employee_id and lower(coalesce(e->>'email', '')) = v_email
       ) then
      raise exception 'EMAIL_ALREADY_IN_USE' using errcode = '23505';
    end if;
    v_next := v_next || jsonb_build_object('email', v_email);
  end if;
  if v_patch ? 'status' then
    v_status := v_patch->>'status';
    if v_status not in ('active', 'inactive') then raise exception 'INVALID_STAFF_STATUS' using errcode = '22023'; end if;
    if v_status is distinct from v_current->>'status' then
      if v_status = 'inactive' then
        select display_name into v_actor_name from public.staff_access_profiles where user_id = (select auth.uid());
        v_next := v_next || jsonb_build_object(
          'status', 'inactive',
          'employmentEndDate', coalesce(v_current->>'employmentEndDate', v_today::text),
          'separationReason', coalesce(v_current->>'separationReason', 'Employee deactivated'),
          'separatedAt', coalesce(v_current->>'separatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          'separatedBy', coalesce(v_current->>'separatedBy', nullif(trim(coalesce(v_actor_name, '')), ''), 'HR')
        );
      else
        -- Reactivation starts a new employment state; payroll history keeps its
        -- own snapshots, so the stale end date must not carry forward.
        v_next := (v_next - 'employmentEndDate' - 'separationReason' - 'separatedAt' - 'separatedBy')
          || jsonb_build_object('status', 'active');
      end if;
    end if;
  end if;

  select coalesce(array_agg(k order by k), array[]::text[]) into v_changed
  from jsonb_object_keys(v_next) k
  where (v_next->k) is distinct from (v_current->k);
  select v_changed || coalesce(array_agg(k order by k), array[]::text[]) into v_changed
  from jsonb_object_keys(v_current) k
  where k <> 'pin' and not (v_next ? k);

  if v_has_profile then
    update public.staff_access_profiles
    set display_name = coalesce(v_next->>'name', display_name),
        role = coalesce(v_next->>'systemRole', role),
        username = coalesce(nullif(v_next->>'username', ''), username),
        email = coalesce(nullif(v_next->>'email', ''), email),
        is_active = case when v_patch ? 'status' then (v_next->>'status') = 'active' else is_active end,
        updated_at = now()
    where user_id = v_profile.user_id
    returning * into v_profile;

    if v_patch ? 'status' and (v_next->>'status') = 'inactive' then
      -- Deactivation ends existing sessions; the database already rejects an
      -- inactive profile, this also stops token refresh.
      delete from private.staff_runtime_context where user_id = v_profile.user_id;
      delete from auth.sessions where user_id = v_profile.user_id;
    end if;
  end if;

  if cardinality(v_changed) > 0 then
    v_revision := private.write_hr_employee_entry(v_next, false);
    perform private.write_business_activity(
      'hr', p_employee_id, nullif(v_next->>'branch', ''), 'staff_employee_updated',
      'Employee record and staff login updated together.',
      jsonb_build_object('changed', to_jsonb(v_changed), 'isActive', case when v_has_profile then v_profile.is_active end)
    );
  else
    select revision into v_revision from private.operational_domain_state where domain = 'hr';
  end if;

  return jsonb_build_object(
    'revision', v_revision,
    'employee', v_next,
    'previous', v_current - 'pin',
    'changed', to_jsonb(v_changed),
    'login', case when v_has_profile then jsonb_build_object(
      'userId', v_profile.user_id, 'email', v_profile.email, 'username', v_profile.username,
      'role', v_profile.role, 'isActive', v_profile.is_active
    ) end
  );
end;
$$;
revoke execute on function public.update_staff_employee(text, jsonb, boolean) from public, anon;
grant execute on function public.update_staff_employee(text, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
