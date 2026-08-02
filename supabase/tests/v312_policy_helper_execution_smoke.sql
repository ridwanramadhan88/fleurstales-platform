-- Fleurstales Phase 1 policy-helper and authenticated RLS execution smoke test.
-- All fixtures are rolled back, including when this runs against production.

begin;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'private.current_staff_employee_id()',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute private.current_staff_employee_id()';
  end if;

  if not has_function_privilege(
    'authenticated',
    'private.has_action_permission(text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute private.has_action_permission(text)';
  end if;

  if has_function_privilege('anon','private.current_staff_employee_id()','EXECUTE')
     or has_function_privilege('anon','private.has_action_permission(text)','EXECUTE') then
    raise exception 'anon can execute authenticated-only policy helpers';
  end if;
end $$;

insert into auth.users(
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values(
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-4fff-8fff-000000000312',
  'authenticated',
  'authenticated',
  'phase1-policy-smoke@invalid.fleurstales',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.staff_access_profiles(
  user_id,
  employee_id,
  display_name,
  role,
  is_active,
  username,
  email
)
values(
  'ffffffff-ffff-4fff-8fff-000000000312',
  'phase1-policy-smoke',
  'Phase 1 Policy Smoke',
  'florist',
  true,
  'phase1-policy-smoke',
  'phase1-policy-smoke@invalid.fleurstales'
);

insert into public.staff_schedule_defaults(employee_id,days)
values
  ('phase1-policy-smoke','{"monday":{"start":"09:00","end":"17:00"}}'::jsonb),
  ('phase1-policy-other','{"monday":{"start":"10:00","end":"18:00"}}'::jsonb);

insert into public.staff_schedule_overrides(employee_id,schedule_date,shift)
values
  ('phase1-policy-smoke',current_date,'{"start":"09:00","end":"17:00"}'::jsonb),
  ('phase1-policy-other',current_date,'{"start":"10:00","end":"18:00"}'::jsonb);

insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record)
values
  ('phase1-policy-smoke-attendance','phase1-policy-smoke',current_date,'present','{"id":"phase1-policy-smoke-attendance"}'::jsonb),
  ('phase1-policy-other-attendance','phase1-policy-other',current_date,'present','{"id":"phase1-policy-other-attendance"}'::jsonb);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'ffffffff-ffff-4fff-8fff-000000000312',
  true
);

do $$
declare
  v_count integer;
begin
  if private.current_staff_employee_id() is distinct from 'phase1-policy-smoke' then
    raise exception 'Authenticated employee helper returned the wrong identity';
  end if;

  if private.has_action_permission('hr.view_employees') then
    raise exception 'Florist smoke identity unexpectedly has HR view permission';
  end if;

  select count(*) into v_count from public.staff_schedule_defaults;
  if v_count <> 1 then raise exception 'Schedule-default RLS returned % rows instead of 1',v_count; end if;

  select count(*) into v_count from public.staff_schedule_overrides;
  if v_count <> 1 then raise exception 'Schedule-override RLS returned % rows instead of 1',v_count; end if;

  select count(*) into v_count from public.staff_attendance_records;
  if v_count <> 1 then raise exception 'Attendance RLS returned % rows instead of 1',v_count; end if;

  insert into storage.objects(bucket_id,name,owner_id,metadata)
  values(
    'attendance-selfies',
    'phase1-policy-smoke/'||current_date::text||'/checkin-smoke.jpg',
    'ffffffff-ffff-4fff-8fff-000000000312',
    '{"mimetype":"image/jpeg","size":128}'::jsonb
  );

  select count(*) into v_count
  from storage.objects
  where bucket_id='attendance-selfies'
    and name='phase1-policy-smoke/'||current_date::text||'/checkin-smoke.jpg';
  if v_count <> 1 then raise exception 'Attendance Storage SELECT policy hid the caller object'; end if;
end $$;

reset role;
rollback;
