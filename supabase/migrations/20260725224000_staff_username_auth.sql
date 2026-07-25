-- Staff username login bridge. Supabase Auth remains the password/session owner.
begin;

alter table public.staff_access_profiles add column if not exists username text;
create unique index if not exists idx_staff_access_profiles_username_unique
  on public.staff_access_profiles (lower(username)) where username is not null;

create or replace function public.sync_staff_access_profile(
  p_employee_id text,
  p_display_name text,
  p_role text,
  p_is_active boolean,
  p_branch_id text default null,
  p_username text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_role text := private.current_staff_role();
  v_target public.staff_access_profiles%rowtype;
  v_managed text[] := private.hr_managed_employee_roles();
  v_enabled text[] := private.enabled_staff_roles();
  v_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_role not in ('owner','admin','finance','hr','florist') then raise exception 'INVALID_STAFF_ROLE' using errcode='22023'; end if;
  if p_role <> 'owner' and not (p_role = any(v_enabled)) then raise exception 'STAFF_ROLE_DISABLED' using errcode='42501'; end if;
  if v_username is not null and v_username !~ '^[a-z][a-z0-9._-]*$' then raise exception 'INVALID_STAFF_USERNAME' using errcode='22023'; end if;
  select * into v_target from public.staff_access_profiles where employee_id=p_employee_id for update;
  if not found then return null; end if;
  if v_actor_role <> 'owner' then
    if not private.has_action_permission('hr.edit_employee') then raise exception 'STAFF_EDIT_FORBIDDEN' using errcode='42501'; end if;
    if not (v_target.role = any(v_managed)) or not (p_role = any(v_managed)) then raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode='42501'; end if;
  end if;
  if v_target.role='owner' and (p_role<>'owner' or p_is_active is not true) and
     (select count(*) from public.staff_access_profiles where role='owner' and is_active=true and user_id<>v_target.user_id) = 0 then
    raise exception 'LAST_ACTIVE_OWNER_PROTECTED' using errcode='42501';
  end if;
  if v_username is not null and exists (select 1 from public.staff_access_profiles where lower(username)=v_username and user_id<>v_target.user_id) then raise exception 'STAFF_USERNAME_IN_USE' using errcode='23505'; end if;
  update public.staff_access_profiles
  set display_name=trim(p_display_name), role=p_role, username=v_username, is_active=p_is_active, branch_id=p_branch_id, updated_at=now()
  where user_id=v_target.user_id returning * into v_target;
  perform private.write_business_activity('staff_access',p_employee_id,p_branch_id,'staff_access_synced','Staff login access synchronized with HR.',jsonb_build_object('role',p_role,'username',v_username,'isActive',p_is_active));
  return jsonb_build_object('userId',v_target.user_id,'employeeId',v_target.employee_id,'displayName',v_target.display_name,'role',v_target.role,'username',v_target.username,'branchId',v_target.branch_id,'isActive',v_target.is_active);
end;
$$;

revoke execute on function public.sync_staff_access_profile(text,text,text,boolean,text) from public, anon, authenticated;
revoke execute on function public.sync_staff_access_profile(text,text,text,boolean,text,text) from public, anon;
grant execute on function public.sync_staff_access_profile(text,text,text,boolean,text,text) to authenticated;
commit;
