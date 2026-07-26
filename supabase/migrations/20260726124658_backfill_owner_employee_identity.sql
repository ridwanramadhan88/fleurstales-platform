-- Keep the bootstrapped Owner compatible with operational RPCs that require
-- every active staff profile to have a stable employee identity.

begin;

do $$
declare
  v_owner_user_id uuid;
begin
  select users.id
  into v_owner_user_id
  from auth.users as users
  where lower(coalesce(users.email, '')) = 'rdwnrmdhn88@gmail.com'
  order by users.created_at
  limit 1;

  if v_owner_user_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.staff_access_profiles
    where employee_id = 'owner-1'
      and user_id <> v_owner_user_id
  ) then
    raise exception 'OWNER_EMPLOYEE_ID_IN_USE' using errcode = '23505';
  end if;

  update public.staff_access_profiles
  set employee_id = 'owner-1',
      updated_at = now()
  where user_id = v_owner_user_id
    and role = 'owner'
    and is_active = true
    and employee_id is null;
end;
$$;

create or replace function private.bootstrap_fleurstales_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = 'rdwnrmdhn88@gmail.com'
    and not exists (
      select 1
      from public.staff_access_profiles
      where role = 'owner'
        and is_active = true
    )
  then
    insert into public.staff_access_profiles (
      user_id,
      employee_id,
      display_name,
      role,
      branch_id,
      is_active
    )
    values (
      new.id,
      'owner-1',
      'Fleurstales Owner',
      'owner',
      null,
      true
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.bootstrap_fleurstales_owner_profile() from public;

commit;
