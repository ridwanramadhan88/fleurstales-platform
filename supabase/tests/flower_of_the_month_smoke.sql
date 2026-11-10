-- M3: Flower of the Month — editors choose, the public storefront reads.
begin;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'fm-manager@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'fm-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email, branch_id) values
  ('a3000000-0000-4000-8000-0000000000a2', 'emp-fm-manager', 'FM Manajer', 'manager', true, 'fm-manager', 'fm-manager@fleurstales.test', null),
  ('a3000000-0000-4000-8000-0000000000a3', 'emp-fm-florist', 'FM Florist', 'florist', true, 'fm-florist', 'fm-florist@fleurstales.test', 'Kedamaian');

insert into public.products (id, product_code, material, name, is_active) values
  ('fm-prod-a', 'FM-A', 'fresh', 'FM Mawar', true),
  ('fm-prod-b', 'FM-B', 'fresh', 'FM Lily', true),
  ('fm-prod-off', 'FM-OFF', 'fresh', 'FM Nonaktif', false);

select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $manager$
declare
  v_month text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM');
  v_saved jsonb;
  v_list jsonb;
begin
  v_saved := public.save_catalog_monthly_highlight(v_month, array['fm-prod-b', 'fm-prod-b'], '  Pilihan bulan ini  ');
  if v_saved->'productIds' <> '["fm-prod-b"]'::jsonb or v_saved->>'note' <> 'Pilihan bulan ini' then
    raise exception 'Saved highlight is wrong: %', v_saved;
  end if;
  v_list := public.get_catalog_monthly_highlights();
  if jsonb_array_length(v_list) <> 2 or v_list->0->>'month' <> v_month or v_list->1->'productIds' <> '[]'::jsonb then
    raise exception 'Editor list is wrong: %', v_list;
  end if;
  begin
    perform public.save_catalog_monthly_highlight(v_month, array['fm-prod-a', 'fm-prod-b'], null);
    raise exception 'More than one Flower of the Month was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_catalog_monthly_highlight(v_month, array['fm-prod-off'], null);
    raise exception 'Inactive product was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_catalog_monthly_highlight(to_char((now() at time zone 'Asia/Jakarta') - interval '1 month', 'YYYY-MM'), array['fm-prod-a'], null);
    raise exception 'Past month was accepted';
  exception when invalid_parameter_value then null;
  end;
end
$manager$;
reset role;

-- A product switched off later simply drops out of the public list.
update public.products set is_active = false where id = 'fm-prod-b';

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $public$
declare
  v_public jsonb := public.get_flower_of_the_month();
begin
  if v_public->'productIds' <> '[]'::jsonb or v_public->>'note' <> 'Pilihan bulan ini' then
    raise exception 'Public highlight is wrong: %', v_public;
  end if;
  begin
    perform public.save_catalog_monthly_highlight(v_public->>'month', array['fm-prod-a'], null);
    raise exception 'Anonymous visitor saved a highlight';
  exception when insufficient_privilege then null;
  end;
end
$public$;
reset role;

select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $florist$
begin
  begin
    perform public.save_catalog_monthly_highlight(to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM'), array['fm-prod-a'], null);
    raise exception 'Florist saved a highlight';
  exception when insufficient_privilege then null;
  end;
end
$florist$;
reset role;

-- Clearing the picks removes the month.
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $clear$
begin
  perform public.save_catalog_monthly_highlight(to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM'), '{}'::text[], null);
  if public.get_flower_of_the_month() is not null then raise exception 'Cleared month is still published'; end if;
end
$clear$;
reset role;

rollback;
