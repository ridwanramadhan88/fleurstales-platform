-- Owner / HR can email a staff member a password reset link (staff-admin
-- action `send_reset`) instead of typing a new password and handing it over.
--
-- This RPC is the authority + throttle gate; staff-admin sends the email only
-- after it succeeds. Same scope as editing the employee: Owner for every
-- non-owner login, HR only for its managed roles (hrManagedRoles).
-- Throttle: 3 links per employee per 15 minutes, counted from the audit log.

begin;

create or replace function public.authorize_staff_password_reset(p_employee_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := private.current_staff_role();
  v_managed text[] := private.hr_managed_employee_roles();
  v_profile public.staff_access_profiles%rowtype;
  v_email text;
  v_recent integer;
begin
  if (select auth.uid()) is null or v_actor_role is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_actor_role not in ('owner', 'hr') or not private.has_action_permission('hr.edit_employee') then
    raise exception 'STAFF_EDIT_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_profile from public.staff_access_profiles where employee_id = p_employee_id;
  if not found then raise exception 'STAFF_LOGIN_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_profile.role = 'owner' then raise exception 'OWNER_PROFILE_PROTECTED' using errcode = '42501'; end if;
  if v_actor_role = 'hr' and not (v_profile.role = any(v_managed)) then
    raise exception 'HR_MANAGED_ROLE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if not v_profile.is_active then raise exception 'STAFF_LOGIN_INACTIVE' using errcode = '42501'; end if;

  select lower(nullif(trim(coalesce(u.email, v_profile.email, '')), '')) into v_email
  from auth.users u where u.id = v_profile.user_id;
  if v_email is null then raise exception 'STAFF_RECOVERY_EMAIL_MISSING' using errcode = '22023'; end if;

  select count(*) into v_recent
  from public.business_activities
  where entity_type = 'hr' and entity_id = p_employee_id and kind = 'staff_password_reset_requested'
    and occurred_at > now() - interval '15 minutes';
  if v_recent >= 3 then raise exception 'RATE_LIMITED' using errcode = '42501'; end if;

  perform private.write_business_activity(
    'hr', p_employee_id, v_profile.branch_id, 'staff_password_reset_requested',
    'A password reset link was requested for a staff login.',
    jsonb_build_object('role', v_profile.role)
  );

  return jsonb_build_object('userId', v_profile.user_id, 'email', v_email);
end;
$$;
revoke execute on function public.authorize_staff_password_reset(text) from public, anon;
grant execute on function public.authorize_staff_password_reset(text) to authenticated;

notify pgrst, 'reload schema';

commit;
