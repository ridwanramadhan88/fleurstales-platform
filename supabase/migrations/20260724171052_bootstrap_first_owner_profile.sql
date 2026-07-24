-- Securely map the first verified Fleurstales owner email to an OS access
-- profile. The mapping remains attached to the Auth user UUID if the account
-- email is changed later.

begin;

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
      null,
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

drop trigger if exists bootstrap_fleurstales_owner_profile on auth.users;
create trigger bootstrap_fleurstales_owner_profile
after insert or update of email on auth.users
for each row
execute function private.bootstrap_fleurstales_owner_profile();

-- Also cover an account that may have been invited immediately before this
-- migration was applied.
insert into public.staff_access_profiles (
  user_id,
  employee_id,
  display_name,
  role,
  branch_id,
  is_active
)
select
  users.id,
  null,
  'Fleurstales Owner',
  'owner',
  null,
  true
from auth.users as users
where lower(coalesce(users.email, '')) = 'rdwnrmdhn88@gmail.com'
  and not exists (
    select 1
    from public.staff_access_profiles
    where role = 'owner'
      and is_active = true
  )
on conflict (user_id) do nothing;

commit;
