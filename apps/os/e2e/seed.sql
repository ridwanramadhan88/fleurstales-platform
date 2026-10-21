-- End-to-end seed for a LOCAL, disposable Supabase stack only (supabase start).
-- Never run against staging or production. Creates one staff account per role
-- with a throwaway password supplied by the E2E runner (psql -v password=...).

\set ON_ERROR_STOP on

begin;

do $guard$
begin
  if exists (select 1 from public.staff_access_profiles where username not like 'e2e-%') then
    raise exception 'Refusing to seed E2E staff into a database that already has real staff accounts';
  end if;
end
$guard$;

delete from public.staff_access_profiles where username like 'e2e-%';
delete from auth.identities where user_id in (select id from auth.users where email like 'e2e-%@fleurstales.test');
delete from auth.users where email like 'e2e-%@fleurstales.test';

create temporary table e2e_staff(role text, username text, display_name text, user_id uuid, employee_id text) on commit drop;
insert into e2e_staff values
  ('owner',   'e2e-owner',   'E2E Owner',   'e2e00000-0000-4000-8000-000000000001', 'e2e-emp-owner'),
  ('admin',   'e2e-admin',   'E2E Admin',   'e2e00000-0000-4000-8000-000000000002', 'e2e-emp-admin'),
  ('finance', 'e2e-finance', 'E2E Finance', 'e2e00000-0000-4000-8000-000000000003', 'e2e-emp-finance'),
  ('hr',      'e2e-hr',      'E2E HR',      'e2e00000-0000-4000-8000-000000000004', 'e2e-emp-hr'),
  ('florist', 'e2e-florist', 'E2E Florist', 'e2e00000-0000-4000-8000-000000000005', 'e2e-emp-florist');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', s.user_id, 'authenticated', 'authenticated',
  s.username || '@fleurstales.test',
  extensions.crypt(:'password', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
from e2e_staff s;

insert into auth.identities(id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), s.user_id, s.user_id::text, 'email',
  jsonb_build_object('sub', s.user_id::text, 'email', s.username || '@fleurstales.test', 'email_verified', true),
  now(), now(), now()
from e2e_staff s;

insert into public.staff_access_profiles(user_id, employee_id, display_name, role, branch_id, is_active, username, email)
select s.user_id, s.employee_id, s.display_name, s.role, 'Kedamaian', true, s.username, s.username || '@fleurstales.test'
from e2e_staff s;

insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
select 'hr', 1, jsonb_build_object(
  'employees', (
    select jsonb_agg(jsonb_build_object(
      'id', s.employee_id,
      'name', s.display_name,
      'position', initcap(s.role),
      'branch', 'Kedamaian',
      'systemRole', s.role,
      'status', 'active',
      'phone', '0812000000' || right(s.employee_id, 1),
      'hireDate', '2026-01-01',
      'email', s.username || '@fleurstales.test',
      'username', s.username
    ) order by s.username)
    from e2e_staff s
  ),
  'attendance', '[]'::jsonb,
  'pointRules', '[]'::jsonb,
  'scheduleOverrides', '[]'::jsonb,
  'scheduleRevisions', '[]'::jsonb,
  'employeePointEntries', '[]'::jsonb,
  'attendanceReviewCases', '[]'::jsonb,
  'employeeDefaultSchedules', '[]'::jsonb,
  'weeklySchedulePublications', '[]'::jsonb
), now()
on conflict (domain) do update set snapshot = excluded.snapshot, revision = private.operational_domain_state.revision + 1, updated_at = now();

insert into private.operational_domain_state(domain, revision, snapshot, updated_at) values
  ('payroll', 1, '{"periods":[],"compensations":[],"payrollReviews":[],"employeePayrolls":[],"payrollProposals":[],"payrollProposalReviews":[],"payrollScheduleAdjustments":[]}'::jsonb, now()),
  ('finance', 1, '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb, now()),
  ('stock', 1, '{"items":[],"events":[],"transfers":[]}'::jsonb, now()),
  ('vouchers', 1, '{"vouchers":[]}'::jsonb, now()),
  ('order_drafts', 1, '[]'::jsonb, now())
on conflict (domain) do nothing;

commit;
