-- M2: the manager reads the daily attendance photo board; a florist cannot.
begin;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-4000-8000-0000000000f2', 'authenticated', 'authenticated', 'ab-manager@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-4000-8000-0000000000f3', 'authenticated', 'authenticated', 'ab-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-4000-8000-0000000000f4', 'authenticated', 'authenticated', 'ab-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email, branch_id) values
  ('a2000000-0000-4000-8000-0000000000f2', 'emp-ab-manager', 'AB Manajer', 'manager', true, 'ab-manager', 'ab-manager@fleurstales.test', null),
  ('a2000000-0000-4000-8000-0000000000f3', 'emp-ab-florist', 'AB Florist', 'florist', true, 'ab-florist', 'ab-florist@fleurstales.test', 'Kedamaian'),
  ('a2000000-0000-4000-8000-0000000000f4', 'emp-ab-admin', 'AB Admin', 'admin', true, 'ab-admin', 'ab-admin@fleurstales.test', 'Kedamaian');

set local session_replication_role = replica;
insert into public.staff_schedule_overrides(employee_id, schedule_date, shift)
values ('emp-ab-florist', (now() at time zone 'Asia/Jakarta')::date,
        '{"isWorking":true,"branchId":"Kedamaian","startTime":"08:00","endTime":"16:00"}'::jsonb);
insert into public.staff_attendance_records(id, employee_id, attendance_date, status, record) values
  ('att-ab-florist', 'emp-ab-florist', (now() at time zone 'Asia/Jakarta')::date, 'late',
   jsonb_build_object('source', 'selfie', 'checkInAt', now()::text,
     'selfieDataUrl', 'emp-ab-florist/2026-11-10/checkin-test.jpg',
     'checkInLocation', jsonb_build_object('detectedBranchName', 'Kedamaian', 'latitude', -5.39, 'longitude', 105.26))),
  ('att-ab-admin', 'emp-ab-admin', (now() at time zone 'Asia/Jakarta')::date, 'present',
   jsonb_build_object('source', 'selfie', 'checkInAt', now()::text, 'selfieDataUrl', 'data:image/jpeg;base64,AAAA'));
set local session_replication_role = origin;

select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
do $manager$
declare
  v_board jsonb := public.get_attendance_photo_board((now() at time zone 'Asia/Jakarta')::date);
  v_florist jsonb;
  v_admin jsonb;
begin
  select item into v_florist from jsonb_array_elements(v_board) item where item->>'employeeId' = 'emp-ab-florist';
  select item into v_admin from jsonb_array_elements(v_board) item where item->>'employeeId' = 'emp-ab-admin';
  if v_florist is null or v_admin is null then raise exception 'Board is missing staff rows'; end if;
  if not exists (select 1 from jsonb_array_elements(v_board) item where item->>'employeeId' = 'emp-ab-manager') then
    raise exception 'Board must list the manager too (not checked in yet)';
  end if;
  if v_florist->>'status' <> 'late' or v_florist->>'checkInPhotoPath' <> 'emp-ab-florist/2026-11-10/checkin-test.jpg'
     or v_florist->>'scheduledBranchId' <> 'Kedamaian' or v_florist->>'shiftStart' <> '08:00' then
    raise exception 'Florist board row is wrong: %', v_florist;
  end if;
  if v_admin->>'checkInPhotoPath' is not null then raise exception 'Inline photo data must not be sent in the board'; end if;
  if v_board::text like '%latitude%' then raise exception 'Board must not expose coordinates'; end if;
  begin
    perform public.get_attendance_photo_board((now() at time zone 'Asia/Jakarta')::date + 1);
    raise exception 'Future dates must be rejected';
  exception when invalid_parameter_value then null;
  end;
end
$manager$;
reset role;

select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
set local role authenticated;
do $florist$
begin
  begin
    perform public.get_attendance_photo_board((now() at time zone 'Asia/Jakarta')::date);
    raise exception 'Florist opened the attendance photo board';
  exception when insufficient_privilege then null;
  end;
end
$florist$;
reset role;

rollback;
