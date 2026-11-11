-- M4: the Manager changes operational settings only; governance stays Owner-only. Rolls back.
begin;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'ops-manager@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'ops-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated', 'ops-florist@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email, branch_id) values
  ('a4000000-0000-4000-8000-0000000000a2', 'emp-ops-manager', 'Ops Manajer', 'manager', true, 'ops-manager', 'ops-manager@fleurstales.test', null),
  ('a4000000-0000-4000-8000-0000000000a3', 'emp-ops-admin', 'Ops Admin', 'admin', true, 'ops-admin', 'ops-admin@fleurstales.test', 'Kedamaian'),
  ('a4000000-0000-4000-8000-0000000000a4', 'emp-ops-florist', 'Ops Florist', 'florist', true, 'ops-florist', 'ops-florist@fleurstales.test', 'Kedamaian');

insert into public.branches(id, name, code, address, is_active, is_default, sort_order, delivery_fee_idr, opening_hours)
values ('ops-branch', 'Ops Branch', 'OPS', 'Jl. Tetap 1', true, false, 95, 10000,
  (select jsonb_object_agg(d, jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'))
   from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) d));

-- Capture what the Manager must NOT be able to change (read as the owner of the
-- test transaction, before dropping to the authenticated role).
select set_config('ops.before_governance', (
  select md5(staff_roles::text || attendance::text || payroll::text || scheduling_revisions::text || payroll_revisions::text)
  from private.internal_settings_state where id = 'primary'), true);
select set_config('ops.before_revision', (select revision::text from private.internal_settings_state where id = 'primary'), true);
select set_config('ops.before_default_schedule', (select (scheduling -> 'defaultWeeklySchedule')::text from private.internal_settings_state where id = 'primary'), true);
select set_config('ops.before_store_revision', (select coalesce(max(revision), 0)::text from public.store_sync_state), true);

do $caps$
begin
  if not private.has_action_permission_for_role('manager', 'operations.edit_settings') then
    raise exception 'Manager must hold operations.edit_settings';
  end if;
  if private.has_action_permission_for_role('admin', 'operations.edit_settings')
     or private.has_action_permission_for_role('florist', 'operations.edit_settings')
     or private.has_action_permission_for_role('hr', 'operations.edit_settings')
     or private.has_action_permission_for_role('finance', 'operations.edit_settings') then
    raise exception 'Only owner and manager may hold operations.edit_settings';
  end if;
end
$caps$;

-- ---------------------------------------------------------------- manager
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $manager$
declare
  v_hours jsonb := (select jsonb_object_agg(d, jsonb_build_object('isOpen', d <> 'sunday', 'opensAt', '08:00', 'closesAt', '17:00', 'fulfillmentStartsAt', '09:00', 'fulfillmentEndsAt', '16:00'))
                    from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) d);
  v_tariff jsonb := '{"enabled":true,"motor":{"baseIdr":12000,"includedKm":3,"perKmIdr":2500},"car":{"baseIdr":30000,"includedKm":3,"perKmIdr":5000},"maxKm":20,"motorMaxItems":2}';
  v_result jsonb;
  v_branch public.branches%rowtype;
  v_config jsonb;
  v_revision bigint;
begin
  v_result := public.save_branch_operations('ops-branch', v_hours, 15000, v_tariff);
  if (v_result ->> 'revision')::bigint <= current_setting('ops.before_store_revision')::bigint then
    raise exception 'Store revision was not bumped: %', v_result;
  end if;

  select * into v_branch from public.branches where id = 'ops-branch';
  if v_branch.delivery_fee_idr <> 15000
     or v_branch.opening_hours -> 'monday' ->> 'fulfillmentStartsAt' <> '09:00'
     or v_branch.opening_hours -> 'sunday' ->> 'isOpen' <> 'false'
     or not v_branch.delivery_tariff_enabled
     or v_branch.motor_base_idr <> 12000 or v_branch.car_per_km_idr <> 5000
     or v_branch.max_delivery_km <> 20 or v_branch.motor_max_items <> 2 then
    raise exception 'Branch operations were not stored: %', to_jsonb(v_branch);
  end if;
  if v_branch.name <> 'Ops Branch' or v_branch.address <> 'Jl. Tetap 1' or v_branch.code <> 'OPS' or not v_branch.is_active then
    raise exception 'Branch identity fields must stay untouched: %', to_jsonb(v_branch);
  end if;

  begin
    perform public.save_branch_operations('ops-branch', jsonb_set(v_hours, '{monday,opensAt}', '"25:99"'), 15000, null);
    raise exception 'Invalid time was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_branch_operations('ops-branch', v_hours, -1, null);
    raise exception 'Negative delivery fee was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_branch_operations('ops-branch', v_hours || '{"funday":{"isOpen":true}}', 15000, null);
    raise exception 'Unknown weekday was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_branch_operations('no-such-branch', v_hours, 15000, null);
    raise exception 'Unknown branch was accepted';
  exception when no_data_found then null;
  end;

  -- Settings: coverage + VIP rule through the narrow RPC.
  v_config := public.get_internal_settings_config();
  v_revision := (v_config ->> 'revision')::bigint;
  v_config := public.save_operations_settings(v_revision, '{"admin":2,"florist":4}',
    '{"mode":"both","minLifetimeSpend":2500000,"minOrderCount":7}');
  if v_config -> 'scheduling' -> 'minimumCoverage' <> '{"admin":2,"florist":4}'::jsonb
     or v_config -> 'customerSegments' ->> 'mode' <> 'both'
     or (v_config ->> 'revision')::bigint <> v_revision + 1 then
    raise exception 'Operations settings were not stored: %', v_config;
  end if;
  if (v_config -> 'scheduling' -> 'defaultWeeklySchedule')::text <> current_setting('ops.before_default_schedule') then
    raise exception 'Default weekly schedule must stay untouched';
  end if;

  begin
    perform public.save_operations_settings(v_revision, '{"admin":1,"florist":1}', null);
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_operations_settings(v_revision + 1, '{"admin":-1,"florist":1}', null);
    raise exception 'Negative coverage was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_operations_settings(v_revision + 1, null, '{"mode":"nonsense","minLifetimeSpend":1,"minOrderCount":1}');
    raise exception 'Invalid segment mode was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Governance RPCs stay closed to the Manager.
  begin
    perform public.save_internal_settings_config(v_revision + 1, '{}', '{}', '{}', '{}', '{}', '[]', '[]');
    raise exception 'Manager saved the full internal settings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.replace_public_store_snapshot(0, '{}', '[]', '[]', 'x');
    raise exception 'Manager replaced the store snapshot';
  exception when insufficient_privilege then null;
  end;
end
$manager$;

-- ------------------------------------------------------- other staff roles
reset role;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $admin$
begin
  begin
    perform public.save_branch_operations('ops-branch', '{}', 1, null);
    raise exception 'Admin changed branch operations';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_operations_settings(1, '{"admin":1,"florist":1}', null);
    raise exception 'Admin changed operations settings';
  exception when insufficient_privilege then null;
  end;
end
$admin$;

reset role;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
set local role authenticated;
do $florist$
begin
  begin
    perform public.save_branch_operations('ops-branch', '{}', 1, null);
    raise exception 'Florist changed branch operations';
  exception when insufficient_privilege then null;
  end;
end
$florist$;

-- ------------------------------------------- governance data is unchanged
reset role;
do $governance$
begin
  if (select md5(staff_roles::text || attendance::text || payroll::text || scheduling_revisions::text || payroll_revisions::text)
      from private.internal_settings_state where id = 'primary') <> current_setting('ops.before_governance') then
    raise exception 'Staff roles, attendance, payroll or revision history changed';
  end if;
end
$governance$;

rollback;
