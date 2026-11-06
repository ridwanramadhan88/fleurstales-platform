-- authorize_staff_password_reset: scope + throttle + audit. Rolls back.
begin;

do $static$
begin
  if to_regprocedure('public.authorize_staff_password_reset(text)') is null then
    raise exception 'authorize_staff_password_reset is missing';
  end if;
  if has_function_privilege('anon', 'public.authorize_staff_password_reset(text)', 'EXECUTE') then
    raise exception 'Reset authorization must not be callable by anon';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'reset-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'reset-hr@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'reset-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000c4', 'authenticated', 'authenticated', 'reset-finance@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-0000000000c5', 'authenticated', 'authenticated', 'reset-off@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');

insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('c0000000-0000-4000-8000-0000000000c1', 'reset-owner', 'Reset Owner', 'owner', true, 'reset-owner', 'reset-owner@fleurstales.test'),
  ('c0000000-0000-4000-8000-0000000000c2', 'emp-reset-hr', 'Reset HR', 'hr', true, 'reset-hr', 'reset-hr@fleurstales.test'),
  ('c0000000-0000-4000-8000-0000000000c3', 'emp-reset-florist', 'Reset Florist', 'florist', true, 'reset-florist', 'reset-florist@fleurstales.test'),
  ('c0000000-0000-4000-8000-0000000000c4', 'emp-reset-finance', 'Reset Finance', 'finance', true, 'reset-finance', 'reset-finance@fleurstales.test'),
  ('c0000000-0000-4000-8000-0000000000c5', 'emp-reset-off', 'Reset Off', 'florist', false, 'reset-off', 'reset-off@fleurstales.test');

create temporary table reset_result(step text, value jsonb) on commit drop;
grant all on reset_result to authenticated;

-- HR: florist allowed (3x), 4th throttled; finance and inactive rejected.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
insert into reset_result select 'hr_florist', public.authorize_staff_password_reset('emp-reset-florist');
insert into reset_result select 'hr_florist_2', public.authorize_staff_password_reset('emp-reset-florist');
insert into reset_result select 'hr_florist_3', public.authorize_staff_password_reset('emp-reset-florist');
do $hr$
begin
  begin
    perform public.authorize_staff_password_reset('emp-reset-florist');
    raise exception 'Fourth reset link within 15 minutes was not throttled';
  exception when insufficient_privilege then
    if sqlerrm <> 'RATE_LIMITED' then raise; end if;
  end;
  begin
    perform public.authorize_staff_password_reset('emp-reset-finance');
    raise exception 'HR sent a reset link for a role outside its managed scope';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.authorize_staff_password_reset('emp-reset-off');
    raise exception 'Reset link allowed for an inactive login';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.authorize_staff_password_reset('reset-owner');
    raise exception 'Reset link allowed for the Owner login';
  exception when insufficient_privilege then null;
  end;
end
$hr$;
reset role;

-- Owner: finance allowed.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
insert into reset_result select 'owner_finance', public.authorize_staff_password_reset('emp-reset-finance');
reset role;

do $assert$
begin
  if (select value->>'email' from reset_result where step = 'hr_florist') <> 'reset-florist@fleurstales.test' then
    raise exception 'Reset gate returned the wrong recovery email';
  end if;
  if (select value->>'email' from reset_result where step = 'owner_finance') <> 'reset-finance@fleurstales.test' then
    raise exception 'Owner could not send a reset link for Finance';
  end if;
  if (select count(*) from public.business_activities where entity_id in ('emp-reset-florist', 'emp-reset-finance') and kind = 'staff_password_reset_requested') <> 4 then
    raise exception 'Reset link requests are not audited';
  end if;
end
$assert$;

rollback;
