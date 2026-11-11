-- M4: operational settings the Manager may change.
--
-- Everything under "settings.*" stays permanently Owner-only (see
-- private.has_action_permission_for_role), so the Manager gets a capability of
-- its own and narrow RPCs that touch ONLY these fields:
--   * per-branch pickup/delivery hours, opening hours, flat delivery fee and
--     distance tariff        -> public.save_branch_operations
--   * minimum staff coverage and the VIP customer segment rule
--                            -> public.save_operations_settings
-- Store profile, payment methods/QRIS, roles, permissions, payroll and
-- attendance rules, and branch address/coordinates remain Owner-only: the
-- full-snapshot RPCs are untouched.
begin;

insert into private.action_capability_registry (capability, parent_section, requires_edit, allowed_roles)
values ('operations.edit_settings', 'dashboard', false, array['owner', 'manager'])
on conflict (capability) do update
set parent_section = excluded.parent_section,
    requires_edit = excluded.requires_edit,
    allowed_roles = excluded.allowed_roles;

insert into private.role_action_permissions (role, capability, enabled)
select r.role, 'operations.edit_settings', r.role in ('owner', 'manager')
from (select distinct role from private.role_action_permissions) r
on conflict (role, capability) do update
set enabled = excluded.enabled, updated_at = now();

-- ---------------------------------------------------------------------------
-- Branch operations: hours, delivery fee, distance tariff.
-- ---------------------------------------------------------------------------
create or replace function public.save_branch_operations(
  p_branch_id text,
  p_opening_hours jsonb,
  p_delivery_fee_idr bigint,
  p_delivery_tariff jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_branch public.branches%rowtype;
  v_day text;
  v_hours jsonb;
  v_field text;
  v_next bigint;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager') then
    raise exception 'OPERATIONS_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not private.has_action_permission('operations.edit_settings') then
    raise exception 'OPERATIONS_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_branch from public.branches where id = p_branch_id for update;
  if not found then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_delivery_fee_idr is null or p_delivery_fee_idr < 0 or p_delivery_fee_idr > 100000000 then
    raise exception 'Delivery fee is out of range.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_opening_hours) <> 'object' then
    raise exception 'Opening hours must be a JSON object.' using errcode = '22023';
  end if;
  for v_day in select jsonb_object_keys(p_opening_hours) loop
    if v_day not in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') then
      raise exception 'Unknown weekday %.', v_day using errcode = '22023';
    end if;
    v_hours := p_opening_hours -> v_day;
    if jsonb_typeof(v_hours) <> 'object' or jsonb_typeof(v_hours -> 'isOpen') <> 'boolean' then
      raise exception 'Opening hours for % are invalid.', v_day using errcode = '22023';
    end if;
    foreach v_field in array array['opensAt', 'closesAt', 'fulfillmentStartsAt', 'fulfillmentEndsAt'] loop
      if v_hours ? v_field and (jsonb_typeof(v_hours -> v_field) <> 'string'
         or (v_hours ->> v_field) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
        raise exception 'Opening hours for % have an invalid time.', v_day using errcode = '22023';
      end if;
    end loop;
  end loop;

  update public.branches
  set opening_hours = p_opening_hours,
      delivery_fee_idr = p_delivery_fee_idr,
      updated_at = now()
  where id = p_branch_id;

  if p_delivery_tariff is not null and jsonb_typeof(p_delivery_tariff) = 'object' then
    if coalesce((p_delivery_tariff #>> '{motor,baseIdr}')::bigint, 0) < 0
       or coalesce((p_delivery_tariff #>> '{motor,perKmIdr}')::bigint, 0) < 0
       or coalesce((p_delivery_tariff #>> '{car,baseIdr}')::bigint, 0) < 0
       or coalesce((p_delivery_tariff #>> '{car,perKmIdr}')::bigint, 0) < 0
       or coalesce((p_delivery_tariff #>> '{motor,includedKm}')::numeric, 3) < 0
       or coalesce((p_delivery_tariff #>> '{car,includedKm}')::numeric, 3) < 0
       or coalesce((p_delivery_tariff ->> 'maxKm')::numeric, 25) <= 0 then
      raise exception 'Delivery tariff values are out of range.' using errcode = '22023';
    end if;
    update public.branches set
      delivery_tariff_enabled = coalesce((p_delivery_tariff ->> 'enabled')::boolean, false),
      motor_base_idr = coalesce((p_delivery_tariff #>> '{motor,baseIdr}')::bigint, 0),
      motor_included_km = coalesce((p_delivery_tariff #>> '{motor,includedKm}')::numeric, 3),
      motor_per_km_idr = coalesce((p_delivery_tariff #>> '{motor,perKmIdr}')::bigint, 0),
      car_base_idr = coalesce((p_delivery_tariff #>> '{car,baseIdr}')::bigint, 0),
      car_included_km = coalesce((p_delivery_tariff #>> '{car,includedKm}')::numeric, 3),
      car_per_km_idr = coalesce((p_delivery_tariff #>> '{car,perKmIdr}')::bigint, 0),
      max_delivery_km = coalesce((p_delivery_tariff ->> 'maxKm')::numeric, 25),
      motor_max_items = nullif(p_delivery_tariff ->> 'motorMaxItems', '')::integer,
      updated_at = now()
    where id = p_branch_id;
  end if;

  -- Bump the shared Store revision so an Owner session holding an older
  -- snapshot is told to reload instead of silently overwriting these values.
  insert into public.store_sync_state (id, revision) values ('primary', 0)
  on conflict (id) do nothing;
  update public.store_sync_state
  set revision = revision + 1, updated_at = now(), updated_by = (select auth.uid())
  where id = 'primary'
  returning revision into v_next;

  perform private.write_business_activity(
    'system', p_branch_id, p_branch_id, 'branch_operations_updated',
    format('%s updated operational settings for branch %s.', initcap(v_role), v_branch.name),
    jsonb_build_object('activityScope', 'branch_operations', 'storeRevision', v_next)
  );

  return jsonb_build_object('revision', v_next, 'branchId', p_branch_id);
end;
$function$;

revoke all on function public.save_branch_operations(text, jsonb, bigint, jsonb) from public, anon;
grant execute on function public.save_branch_operations(text, jsonb, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Minimum staff coverage and the VIP segment rule inside internal settings.
-- ---------------------------------------------------------------------------
create or replace function public.save_operations_settings(
  p_expected_revision bigint,
  p_minimum_coverage jsonb,
  p_customer_segments jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_state private.internal_settings_state%rowtype;
  v_next bigint;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager') then
    raise exception 'OPERATIONS_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not private.has_action_permission('operations.edit_settings') then
    raise exception 'OPERATIONS_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_minimum_coverage is not null then
    if jsonb_typeof(p_minimum_coverage) <> 'object'
       or jsonb_typeof(p_minimum_coverage -> 'admin') <> 'number'
       or jsonb_typeof(p_minimum_coverage -> 'florist') <> 'number'
       or (p_minimum_coverage ->> 'admin')::numeric not between 0 and 50
       or (p_minimum_coverage ->> 'florist')::numeric not between 0 and 50
       or (p_minimum_coverage ->> 'admin')::numeric <> trunc((p_minimum_coverage ->> 'admin')::numeric)
       or (p_minimum_coverage ->> 'florist')::numeric <> trunc((p_minimum_coverage ->> 'florist')::numeric) then
      raise exception 'Minimum coverage must be whole numbers from 0 to 50.' using errcode = '22023';
    end if;
  end if;

  if p_customer_segments is not null then
    if jsonb_typeof(p_customer_segments) <> 'object'
       or (p_customer_segments ->> 'mode') not in ('spend', 'orders', 'both', 'either')
       or jsonb_typeof(p_customer_segments -> 'minLifetimeSpend') <> 'number'
       or jsonb_typeof(p_customer_segments -> 'minOrderCount') <> 'number'
       or (p_customer_segments ->> 'minLifetimeSpend')::numeric < 0
       or (p_customer_segments ->> 'minOrderCount')::numeric < 0 then
      raise exception 'Customer segment rule is invalid.' using errcode = '22023';
    end if;
  end if;

  select * into v_state from private.internal_settings_state where id = 'primary' for update;
  if not found then
    raise exception 'INTERNAL_SETTINGS_NOT_INITIALIZED' using errcode = '55000';
  end if;
  if v_state.revision <> coalesce(p_expected_revision, 0) then
    -- PT409 (HTTP 409) rather than 40001: PostgREST retries 40001 server-side.
    raise exception 'REVISION_CONFLICT:internal_settings:expected=%:actual=%', p_expected_revision, v_state.revision
      using errcode = 'PT409';
  end if;

  v_next := v_state.revision + 1;
  update private.internal_settings_state
  set revision = v_next,
      scheduling = case when p_minimum_coverage is null then scheduling
                        else jsonb_set(scheduling, '{minimumCoverage}', p_minimum_coverage, true) end,
      customer_segments = coalesce(p_customer_segments, customer_segments),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = 'primary';

  perform private.write_business_activity(
    'authorization', 'primary', null, 'settings_updated',
    format('%s updated staff coverage / customer segment settings.', initcap(v_role)),
    jsonb_build_object('activityScope', 'internal_settings', 'revision', v_next, 'by', 'operations_settings')
  );

  return public.get_internal_settings_config();
end;
$function$;

revoke all on function public.save_operations_settings(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_operations_settings(bigint, jsonb, jsonb) to authenticated;

do $verify$
begin
  if not private.has_action_permission_for_role('manager', 'operations.edit_settings')
     or not private.has_action_permission_for_role('owner', 'operations.edit_settings')
     or private.has_action_permission_for_role('admin', 'operations.edit_settings')
     or private.has_action_permission_for_role('florist', 'operations.edit_settings') then
    raise exception 'operations.edit_settings was not stored as intended';
  end if;
end
$verify$;

commit;
