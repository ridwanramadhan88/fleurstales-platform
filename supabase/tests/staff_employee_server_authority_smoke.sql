-- Staff login + HR employee are written together (provision_staff_employee,
-- update_staff_employee). Runs in a transaction and rolls back.
begin;

do $static$
begin
  if to_regprocedure('public.provision_staff_employee(uuid,jsonb,text)') is null then
    raise exception 'provision_staff_employee is missing';
  end if;
  if to_regprocedure('public.update_staff_employee(text,jsonb,boolean)') is null then
    raise exception 'update_staff_employee is missing';
  end if;
  if has_function_privilege('anon', 'public.update_staff_employee(text,jsonb,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.provision_staff_employee(uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'Staff employee RPCs must not be callable by anon';
  end if;
  if has_function_privilege('authenticated', 'private.write_hr_employee_entry(jsonb,boolean)', 'EXECUTE') then
    raise exception 'HR employee writer must stay private';
  end if;
end
$static$;

-- Fixture: one Owner, one HR, one Florist with login, one employee without login.
insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'smoke-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'smoke-hr@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'smoke-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated', 'smoke-new@fleurstales.test', '', now(), '{"fleurstales_employee_id":"emp-smoke-new"}', '{}', now(), now(), '', '', '', '');

insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('a0000000-0000-4000-8000-0000000000a1', 'smoke-owner', 'Smoke Owner', 'owner', true, 'smoke-owner', 'smoke-owner@fleurstales.test'),
  ('a0000000-0000-4000-8000-0000000000a2', 'emp-smoke-hr', 'Smoke HR', 'hr', true, 'smoke-hr', 'smoke-hr@fleurstales.test'),
  ('a0000000-0000-4000-8000-0000000000a3', 'emp-smoke-florist', 'Smoke Florist', 'florist', true, 'smoke-florist', 'smoke-florist@fleurstales.test');

insert into auth.sessions(id, user_id, created_at, updated_at)
values ('b0000000-0000-4000-8000-0000000000b3', 'a0000000-0000-4000-8000-0000000000a3', now(), now());

insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('hr', 10, jsonb_build_object('employees', jsonb_build_array(
  jsonb_build_object('id','emp-smoke-hr','name','Smoke HR','position','HR','branch','','systemRole','hr','status','active','phone','','hireDate','2026-01-01','username','smoke-hr','email','smoke-hr@fleurstales.test'),
  jsonb_build_object('id','emp-smoke-florist','name','Smoke Florist','position','Florist','branch','','systemRole','florist','status','active','phone','','hireDate','2026-01-01','username','smoke-florist','email','smoke-florist@fleurstales.test'),
  jsonb_build_object('id','emp-smoke-nologin','name','No Login','position','Florist','branch','','systemRole','florist','status','active','phone','','hireDate','2026-01-01')
)), now())
on conflict (domain) do update set snapshot = excluded.snapshot, revision = 10;

create temporary table smoke_result(step text, value jsonb) on commit drop;
grant all on smoke_result to authenticated;

-- ---- As HR -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;

-- Profile edit for an employee WITHOUT login works (HR only, no login needed).
insert into smoke_result select 'nologin', public.update_staff_employee('emp-smoke-nologin', '{"name":"No Login Renamed","phone":"081234567890"}');

-- Deactivate the florist, then a profile save (no status key) must not re-activate.
insert into smoke_result select 'deactivate', public.update_staff_employee('emp-smoke-florist', '{"status":"inactive"}');
insert into smoke_result select 'profile_after_deactivate', public.update_staff_employee('emp-smoke-florist', '{"name":"Smoke Florist 2"}');
insert into smoke_result select 'hr_username', public.update_staff_employee('emp-smoke-florist', '{"username":"smoke-florist-2"}', true);

-- HR stays inside its managed roles.
do $hr_credentials$
begin
  begin
    perform public.update_staff_employee('emp-smoke-florist', '{"systemRole":"finance"}');
    raise exception 'HR assigned a role outside its managed scope';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_staff_employee('emp-smoke-hr', '{"name":"Self HR"}');
    raise exception 'HR edited an HR-role employee outside its managed scope';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_staff_employee('emp-smoke-florist', '{"pin":"x"}');
    raise exception 'Unknown patch key accepted';
  exception when invalid_parameter_value then null;
  end;
end
$hr_credentials$;

-- Create: login profile + HR row in one call.
insert into smoke_result select 'provision', public.provision_staff_employee(
  'a0000000-0000-4000-8000-0000000000a4',
  '{"id":"emp-smoke-new","name":"New Florist","systemRole":"florist","phone":"","hireDate":"2026-02-01","email":"smoke-new@fleurstales.test","username":"smoke-new","baseSalaryIdr":1000000,"pin":"must-not-persist"}'
);

-- Re-provisioning the same Auth user fails.
do $reprovision$
begin
  perform public.provision_staff_employee(
    'a0000000-0000-4000-8000-0000000000a4',
    '{"id":"emp-smoke-new","name":"New Florist","systemRole":"florist","hireDate":"2026-02-01","email":"smoke-new@fleurstales.test","username":"smoke-new"}'
  );
  raise exception 'Provisioning the same Auth user twice succeeded';
exception when unique_violation then null;
end
$reprovision$;

-- ---- As Owner ----------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into smoke_result select 'owner_username', public.update_staff_employee('emp-smoke-new', '{"username":"smoke-renamed"}', true);
do $duplicate$
begin
  perform public.update_staff_employee('emp-smoke-new', '{"username":"smoke-florist-2"}', true);
  raise exception 'Duplicate username accepted';
exception when unique_violation then null;
end
$duplicate$;
insert into smoke_result select 'reactivate', public.update_staff_employee('emp-smoke-florist', '{"status":"active"}');
reset role;

-- ---- Assertions ----------------------------------------------------------
do $assert$
declare
  v_hr jsonb := (select snapshot from private.operational_domain_state where domain = 'hr');
  v_emp jsonb;
begin
  select e into v_emp from jsonb_array_elements(v_hr->'employees') e where e->>'id' = 'emp-smoke-nologin';
  if v_emp->>'name' <> 'No Login Renamed' or v_emp->>'phone' <> '081234567890' then raise exception 'No-login profile edit was not stored: %', v_emp; end if;

  if (select value->'login'->>'isActive' from smoke_result where step = 'deactivate') <> 'false' then raise exception 'Deactivation did not disable the login'; end if;
  if (select value->'login'->>'isActive' from smoke_result where step = 'profile_after_deactivate') <> 'false' then raise exception 'Profile save re-activated a deactivated login'; end if;
  if (select value->'employee'->>'employmentEndDate' from smoke_result where step = 'deactivate') is null then raise exception 'Deactivation did not record the final employment day'; end if;
  if exists (select 1 from auth.sessions where user_id = 'a0000000-0000-4000-8000-0000000000a3') then raise exception 'Deactivation did not end the Auth sessions'; end if;

  select e into v_emp from jsonb_array_elements(v_hr->'employees') e where e->>'id' = 'emp-smoke-florist';
  if v_emp->>'status' <> 'active' or v_emp ? 'employmentEndDate' then raise exception 'Reactivation left stale separation data: %', v_emp; end if;
  if v_emp->>'name' <> 'Smoke Florist 2' then raise exception 'Florist rename lost'; end if;
  if v_emp->>'username' <> 'smoke-florist-2' or (select username from public.staff_access_profiles where employee_id = 'emp-smoke-florist') <> 'smoke-florist-2' then
    raise exception 'HR username change did not reach both HR and login';
  end if;
  if not (select is_active from public.staff_access_profiles where employee_id = 'emp-smoke-florist') then raise exception 'Reactivation did not enable the login'; end if;

  select e into v_emp from jsonb_array_elements(v_hr->'employees') e where e->>'id' = 'emp-smoke-new';
  if v_emp is null then raise exception 'Provisioned employee missing from HR'; end if;
  if v_emp ? 'pin' then raise exception 'Provisioning persisted a PIN'; end if;
  if (v_emp->>'baseSalaryIdr')::int <> 1000000 then raise exception 'Provisioning lost the base salary'; end if;
  if v_emp->>'username' <> 'smoke-renamed' or (select username from public.staff_access_profiles where employee_id = 'emp-smoke-new') <> 'smoke-renamed' then
    raise exception 'Owner username change did not reach both HR and login';
  end if;
  if (select (value->>'revision')::bigint from smoke_result where step = 'provision') <= 10 then raise exception 'HR revision did not advance'; end if;
  if (select revision from private.operational_domain_state where domain = 'hr') <> (select max((value->>'revision')::bigint) from smoke_result) then
    raise exception 'Returned revision does not match the stored HR revision';
  end if;
end
$assert$;

rollback;
