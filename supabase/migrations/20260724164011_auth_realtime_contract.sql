-- Fleurstales Phase 9: Auth/session mapping + Realtime contract preparation
-- No live Auth provider is enabled by this migration; it only hardens the mapping contract.

begin;

create unique index if not exists idx_staff_access_profiles_employee_unique
  on public.staff_access_profiles(employee_id)
  where employee_id is not null;

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
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid())
  limit 1;

  if not found or v_profile.is_active is not true then
    return null;
  end if;

  return jsonb_build_object(
    'userId', v_profile.user_id,
    'employeeId', v_profile.employee_id,
    'displayName', v_profile.display_name,
    'role', v_profile.role,
    'branchId', v_profile.branch_id,
    'isActive', v_profile.is_active
  );
end;
$$;

revoke execute on function public.get_current_staff_access_profile() from public;
grant execute on function public.get_current_staff_access_profile() to authenticated;

-- Staff profile updates can invalidate an active staff session. Publish only the
-- mapping row; RLS still controls what authenticated clients can receive.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_access_profiles'
  ) then
    alter publication supabase_realtime add table public.staff_access_profiles;
  end if;
end;
$$;

commit;
