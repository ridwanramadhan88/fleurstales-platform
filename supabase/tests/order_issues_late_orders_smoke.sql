-- M6: order issues and the late-orders overview. Rolls back.
begin;

do $static$
begin
  if has_table_privilege('authenticated', 'public.order_issues', 'SELECT')
     or has_table_privilege('authenticated', 'public.order_issues', 'INSERT')
     or has_table_privilege('anon', 'public.order_issues', 'SELECT') then
    raise exception 'order_issues must only be reachable through its functions';
  end if;
  if has_function_privilege('anon', 'public.report_order_issue(text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.resolve_order_issue(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_operations_overview(date,date)', 'EXECUTE') then
    raise exception 'Order issue functions must not be anonymous';
  end if;
  if not private.has_action_permission_for_role('manager', 'operations.manage_issues')
     or not private.has_action_permission_for_role('owner', 'operations.manage_issues')
     or private.has_action_permission_for_role('admin', 'operations.manage_issues')
     or private.has_action_permission_for_role('florist', 'operations.manage_issues') then
    raise exception 'operations.manage_issues must belong to owner and manager only';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'oi-manager@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'oi-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'oi-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-0000000000b4', 'authenticated', 'authenticated', 'oi-hr@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email, branch_id) values
  ('a6000000-0000-4000-8000-0000000000b1', 'emp-oi-manager', 'OI Manajer', 'manager', true, 'oi-manager', 'oi-manager@fleurstales.test', null),
  ('a6000000-0000-4000-8000-0000000000b2', 'emp-oi-admin', 'OI Admin', 'admin', true, 'oi-admin', 'oi-admin@fleurstales.test', 'Kedamaian'),
  ('a6000000-0000-4000-8000-0000000000b3', 'emp-oi-florist', 'OI Florist', 'florist', true, 'oi-florist', 'oi-florist@fleurstales.test', 'Kedamaian'),
  ('a6000000-0000-4000-8000-0000000000b4', 'emp-oi-hr', 'OI HR', 'hr', true, 'oi-hr', 'oi-hr@fleurstales.test', null);

-- Three orders on one day: late pickup (handed over 90 min after the slot),
-- on-time delivery, and a still-open order whose slot already passed.
set local session_replication_role = replica;
insert into public.orders(id, order_number, revision, customer_name_snapshot, source, fulfillment, status, branch_id,
  total_idr, items_subtotal_idr, discount_idr, delivery_fee_idr, payment_status, paid_amount_idr, payment_method,
  florist_schedule_override, finance_verified, edit_unlocked, created_at, updated_at, public_tracking_id, delivery_address,
  schedule_date, schedule_time, actual_picked_up_at, completed_at, delivery_shipped_at, florist_display_name, delivery_courier_name)
values
  ('oi-late-pickup', 'OI-1', 1, 'Rahasia Satu', 'whatsapp', 'pickup', 'picked_up', 'Kedamaian',
   100000, 100000, 0, 0, 'paid', 100000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), null,
   (now() at time zone 'Asia/Jakarta')::date - 1, '10:00', (((now() at time zone 'Asia/Jakarta')::date - 1) + time '11:30') at time zone 'Asia/Jakarta', null, null, 'Sari', null),
  ('oi-on-time', 'OI-2', 1, 'Rahasia Dua', 'whatsapp', 'delivery', 'delivered', 'Kedamaian',
   200000, 175000, 0, 25000, 'paid', 200000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), 'Jl. Rahasia 2',
   (now() at time zone 'Asia/Jakarta')::date - 1, '14:00', null, (((now() at time zone 'Asia/Jakarta')::date - 1) + time '13:40') at time zone 'Asia/Jakarta', null, 'Sari', 'Budi'),
  ('oi-open-late', 'OI-3', 1, 'Rahasia Tiga', 'whatsapp', 'pickup', 'confirmed', 'Kedamaian',
   150000, 150000, 0, 0, 'paid', 150000, 'transfer', false, false, false, now(), now(), gen_random_uuid(), null,
   (now() at time zone 'Asia/Jakarta')::date - 1, '16:00', null, null, null, null, null);
set local session_replication_role = origin;

create temporary table oi_ctx(key text primary key, value text) on commit drop;
grant all on oi_ctx to authenticated;

-- ---------------------------------------------------------------- florist
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
do $florist$
declare
  v_result jsonb;
begin
  v_result := public.report_order_issue('oi-late-pickup', 'late_production', '  Bunga datang terlambat  ');
  if v_result ->> 'id' is null or jsonb_array_length(jsonb_path_query_array(v_result, '$.*')) <> 1 then
    raise exception 'Reporting must return only the issue id: %', v_result;
  end if;
  insert into oi_ctx values ('issue', v_result ->> 'id');

  begin
    perform public.report_order_issue('oi-late-pickup', 'nonsense', 'Catatan valid');
    raise exception 'Unknown kind accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.report_order_issue('oi-late-pickup', 'other', 'ab');
    raise exception 'Too-short note accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.report_order_issue('no-such-order', 'other', 'Catatan valid');
    raise exception 'Unknown order accepted';
  exception when no_data_found then null;
  end;
  -- A florist reports, but cannot read or close issues.
  begin
    perform public.get_operations_overview(current_date - 7, current_date);
    raise exception 'Florist read the overview';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.resolve_order_issue((select value::uuid from oi_ctx where key = 'issue'), 'x');
    raise exception 'Florist closed an issue';
  exception when insufficient_privilege then null;
  end;
end
$florist$;

reset role;
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;
do $hr$
begin
  begin
    perform public.report_order_issue('oi-late-pickup', 'other', 'Catatan valid');
    raise exception 'HR reported an order issue';
  exception when insufficient_privilege then null;
  end;
end
$hr$;

reset role;
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $admin$
declare
  v_issue uuid := (select value::uuid from oi_ctx where key = 'issue');
begin
  perform public.report_order_issue('oi-open-late', 'stock_out', 'Mawar merah habis');
  begin
    perform public.get_operations_overview(current_date - 7, current_date);
    raise exception 'Admin read the overview';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.resolve_order_issue(v_issue, null);
    raise exception 'Admin closed an issue';
  exception when insufficient_privilege then null;
  end;
end
$admin$;

-- ---------------------------------------------------------------- manager
reset role;
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $manager$
declare
  v_issue uuid := (select value::uuid from oi_ctx where key = 'issue');
  v_overview jsonb;
  v_late jsonb;
  v_row jsonb;
  v_result jsonb;
begin
  v_overview := public.get_operations_overview(current_date - 7, current_date);
  v_late := v_overview -> 'lateOrders';

  select r into v_row from jsonb_array_elements(v_late) r where r ->> 'orderId' = 'oi-late-pickup';
  if v_row is null or (v_row ->> 'minutesLate')::int <> 90 or (v_row ->> 'ongoing')::boolean
     or v_row ->> 'floristName' <> 'Sari' or (v_row ->> 'openIssues')::int <> 1 then
    raise exception 'Late pickup is wrong: %', v_row;
  end if;
  if exists (select 1 from jsonb_array_elements(v_late) r where r ->> 'orderId' = 'oi-on-time') then
    raise exception 'An on-time delivery was reported late';
  end if;
  select r into v_row from jsonb_array_elements(v_late) r where r ->> 'orderId' = 'oi-open-late';
  if v_row is null or not (v_row ->> 'ongoing')::boolean or (v_row ->> 'minutesLate')::int < 60 then
    raise exception 'The still-open late order is wrong: %', v_row;
  end if;
  if v_overview::text like '%Rahasia%' then
    raise exception 'Customer details leaked into the overview';
  end if;
  if jsonb_array_length(v_overview -> 'issues') <> 2
     or v_overview -> 'issues' -> 0 ->> 'status' <> 'open' then
    raise exception 'Issues are wrong: %', v_overview -> 'issues';
  end if;

  begin
    perform public.get_operations_overview(current_date - 100, current_date);
    raise exception 'A 100-day range was accepted';
  exception when invalid_parameter_value then null;
  end;

  v_result := public.resolve_order_issue(v_issue, 'Bunga pengganti dikirim');
  if v_result ->> 'status' <> 'resolved' then raise exception 'Resolve failed: %', v_result; end if;
  v_result := public.resolve_order_issue(v_issue, 'Lagi');
  if not coalesce((v_result ->> 'alreadyResolved')::boolean, false) then
    raise exception 'Resolving twice must be a no-op: %', v_result;
  end if;

  v_overview := public.get_operations_overview(current_date - 7, current_date);
  select r into v_row from jsonb_array_elements(v_overview -> 'issues') r where (r ->> 'id')::uuid = v_issue;
  if v_row ->> 'status' <> 'resolved' or v_row ->> 'resolutionNote' <> 'Bunga pengganti dikirim'
     or v_row ->> 'resolvedByName' <> 'OI Manajer' or v_row ->> 'note' <> 'Bunga datang terlambat' then
    raise exception 'Resolved issue is wrong: %', v_row;
  end if;
end
$manager$;

reset role;
do $audit$
begin
  if (select count(*) from public.business_activities where kind in ('order_issue_reported', 'order_issue_resolved')) <> 3 then
    raise exception 'Issue activity was not logged';
  end if;
end
$audit$;

rollback;
