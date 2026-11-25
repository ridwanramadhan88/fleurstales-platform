-- store-assets (26 Nov 2026): the Owner can see (and so really delete)
-- objects in the public store-assets bucket; Admin and anon cannot list it.
-- (Deletes go through the Storage API, which only removes rows the caller
-- can select; the OS e2e covers the real delete.)
-- Rolls back.
begin;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'assets-owner@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'assets-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('d0000000-0000-4000-8000-0000000000e1', 'assets-owner', 'Assets Owner', 'owner', true, 'assets-owner', 'assets-owner@fleurstales.test'),
  ('d0000000-0000-4000-8000-0000000000e2', 'emp-assets-admin', 'Assets Admin', 'admin', true, 'assets-admin', 'assets-admin@fleurstales.test');

insert into storage.buckets(id, name, public) values ('store-assets', 'store-assets', true) on conflict (id) do nothing;
insert into storage.objects(bucket_id, name, owner) values ('store-assets', 'qris/smoke-legacy.png', null);

create temporary table assets_result(step text, value bigint) on commit drop;
grant all on assets_result to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
insert into assets_result select 'admin_sees', count(*) from storage.objects where bucket_id = 'store-assets' and name = 'qris/smoke-legacy.png';
reset role;

set local role anon;
insert into assets_result select 'anon_sees', count(*) from storage.objects where bucket_id = 'store-assets' and name = 'qris/smoke-legacy.png';
reset role;

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
insert into assets_result select 'owner_sees', count(*) from storage.objects where bucket_id = 'store-assets' and name = 'qris/smoke-legacy.png';
reset role;

do $check$
declare
  v_admin bigint := (select value from assets_result where step = 'admin_sees');
  v_anon bigint := (select value from assets_result where step = 'anon_sees');
  v_owner bigint := (select value from assets_result where step = 'owner_sees');
begin
  if v_admin <> 0 or v_anon <> 0 then
    raise exception 'store-assets objects must only be listable by the Owner (admin %, anon %)', v_admin, v_anon;
  end if;
  if v_owner <> 1 then
    raise exception 'Owner must see store-assets objects (saw %)', v_owner;
  end if;
end
$check$;

rollback;
