-- Customer birthday notifications: every active Admin, once per day,
-- 29 Feb -> 28 Feb in non-leap years, cron job registered. Rolls back.
begin;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'bday-admin1@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'bday-admin2@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-0000000000e3', 'authenticated', 'authenticated', 'bday-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-0000000000e4', 'authenticated', 'authenticated', 'bday-off@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('e0000000-0000-4000-8000-0000000000e1', 'emp-bday-a1', 'Bday Admin 1', 'admin', true, 'bday-admin1', 'bday-admin1@fleurstales.test'),
  ('e0000000-0000-4000-8000-0000000000e2', 'emp-bday-a2', 'Bday Admin 2', 'admin', true, 'bday-admin2', 'bday-admin2@fleurstales.test'),
  ('e0000000-0000-4000-8000-0000000000e3', 'emp-bday-f', 'Bday Florist', 'florist', true, 'bday-florist', 'bday-florist@fleurstales.test'),
  ('e0000000-0000-4000-8000-0000000000e4', 'emp-bday-off', 'Bday Off', 'admin', false, 'bday-off', 'bday-off@fleurstales.test');

insert into public.customers(id, name, whatsapp_number, normalized_whatsapp_number, birthday)
values
  ('cust_bday_today', 'Ulang Tahun Hari Ini', '081211110001', '6281211110001', date '1990-03-15'),
  ('cust_bday_other', 'Bukan Hari Ini', '081211110002', '6281211110002', date '1990-03-16'),
  ('cust_bday_leap', 'Lahir Kabisat', '081211110003', '6281211110003', date '1992-02-29');

do $smoke$
declare
  v_count integer;
begin
  -- Recipients = only the active Admins (2), never the florist or inactive admin.
  delete from public.staff_notifications where kind = 'customer_birthday';
  v_count := private.notify_customer_birthdays(date '2027-03-15');
  if v_count < 2 then raise exception 'Expected each active Admin to be notified, got %', v_count; end if;
  if exists (
    select 1 from public.staff_notifications n join public.staff_access_profiles p on p.user_id = n.recipient_user_id
    where n.kind = 'customer_birthday' and (p.role <> 'admin' or not p.is_active)
  ) then raise exception 'Birthday notification reached a non-Admin or inactive account'; end if;
  if not exists (
    select 1 from public.staff_notifications
    where kind = 'customer_birthday' and entity_id = 'cust_bday_today' and recipient_user_id = 'e0000000-0000-4000-8000-0000000000e1'
      and title = 'Ulang tahun pelanggan hari ini' and message like 'Ulang Tahun Hari Ini · %' and target = 'customers'
  ) then raise exception 'Birthday notification content is wrong'; end if;
  if exists (select 1 from public.staff_notifications where kind = 'customer_birthday' and entity_id = 'cust_bday_other') then
    raise exception 'Customer whose birthday is not today was notified';
  end if;

  -- Running twice on the same day sends nothing the second time.
  delete from public.staff_notifications where kind = 'customer_birthday';
  insert into public.customers(id, name, whatsapp_number, normalized_whatsapp_number, birthday)
  values ('cust_bday_now', 'Ulang Tahun Sekarang', '081211110004', '6281211110004',
    make_date(1988, extract(month from timezone('Asia/Jakarta', now()))::int, extract(day from timezone('Asia/Jakarta', now()))::int));
  v_count := private.notify_customer_birthdays();
  if v_count < 2 then raise exception 'First run today should notify, got %', v_count; end if;
  v_count := private.notify_customer_birthdays();
  if v_count <> 0 then raise exception 'Second run on the same day sent % duplicate notifications', v_count; end if;

  -- 29 Feb birthdays are celebrated on 28 Feb in non-leap years, not twice in leap years.
  delete from public.staff_notifications where kind = 'customer_birthday';
  perform private.notify_customer_birthdays(date '2027-02-28');
  if not exists (select 1 from public.staff_notifications where kind = 'customer_birthday' and entity_id = 'cust_bday_leap') then
    raise exception '29 Feb birthday not notified on 28 Feb of a non-leap year';
  end if;
  delete from public.staff_notifications where kind = 'customer_birthday';
  perform private.notify_customer_birthdays(date '2028-02-28');
  if exists (select 1 from public.staff_notifications where kind = 'customer_birthday' and entity_id = 'cust_bday_leap') then
    raise exception '29 Feb birthday notified on 28 Feb of a leap year';
  end if;

  if not private.notification_kind_allowed_for_role('admin', 'customer_birthday')
     or private.notification_kind_allowed_for_role('florist', 'customer_birthday') then
    raise exception 'customer_birthday must be readable by Admin only';
  end if;
  if not exists (select 1 from cron.job where jobname = 'notify-customer-birthdays' and schedule = '0 1 * * *') then
    raise exception 'Birthday cron job (08:00 WIB) is not scheduled';
  end if;
end
$smoke$;

rollback;
