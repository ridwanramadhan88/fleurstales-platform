-- Laporan Keuangan read access: Owner and Finance only. Rolls back.
begin;

do $static$
begin
  if has_function_privilege('anon', 'public.get_finance_report_ledger()', 'EXECUTE') then
    raise exception 'anon must not read the finance report ledger';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'report-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'report-finance@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'report-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('f1000000-0000-4000-8000-0000000000a1', 'report-owner', 'Report Owner', 'owner', true, 'report-owner', 'report-owner@fleurstales.test'),
  ('f1000000-0000-4000-8000-0000000000a2', 'report-finance', 'Report Finance', 'finance', true, 'report-finance', 'report-finance@fleurstales.test'),
  ('f1000000-0000-4000-8000-0000000000a3', 'emp-report-admin', 'Report Admin', 'admin', true, 'report-admin', 'report-admin@fleurstales.test');

insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('finance', 1, '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb, now())
on conflict (domain) do nothing;

set local role authenticated;
do $roles$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  v_result := public.get_finance_report_ledger();
  if jsonb_typeof(v_result->'transactions') <> 'array' then raise exception 'owner did not get the ledger: %', v_result; end if;

  perform set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  v_result := public.get_finance_report_ledger();
  if jsonb_typeof(v_result->'customCategories') <> 'array' then raise exception 'finance did not get categories: %', v_result; end if;

  perform set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
  begin
    perform public.get_finance_report_ledger();
    raise exception 'admin read the finance report ledger';
  exception when insufficient_privilege then null;
  end;
end
$roles$;
reset role;

rollback;
