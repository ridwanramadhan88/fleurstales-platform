-- M1: Manager role ("manager" / "Manajer") = operations manager / florist manager.
-- One manager covers every branch. Fixed access (not editable in the permission
-- matrix, same as courier):
--   - everything a florist has, and stays assignable as the producing florist
--   - Orders: read every order, read-only (no create/edit/assign/advance)
--   - Catalog: add & edit products
--   - Customers: view, plus customer reviews and the review survey/reward settings
--   - Stock: edit (only once Owner switches the inventory module on)
-- Live functions are patched in place from their current definitions so nothing
-- else in them can drift; the migration fails loudly if the expected text is not
-- found exactly once.

begin;

-- ---------------------------------------------------------------------------
-- Role plumbing
-- ---------------------------------------------------------------------------
alter table public.staff_access_profiles drop constraint if exists staff_access_profiles_role_check;
alter table public.staff_access_profiles add constraint staff_access_profiles_role_check
  check (role in ('owner','admin','finance','hr','florist','courier','manager'));
alter table private.role_section_permissions drop constraint if exists role_section_permissions_role_check;
alter table private.role_section_permissions add constraint role_section_permissions_role_check
  check (role in ('owner','admin','finance','hr','florist','courier','manager'));
alter table private.role_action_permissions drop constraint if exists role_action_permissions_role_check;
alter table private.role_action_permissions add constraint role_action_permissions_role_check
  check (role in ('owner','admin','finance','hr','florist','courier','manager'));

insert into private.role_section_permissions(role, section, access_level) values
  ('manager','dashboard','view'),('manager','orders','view'),('manager','stock','edit'),
  ('manager','catalog','edit'),('manager','customers','view'),('manager','revenue','none'),
  ('manager','finance','none'),('manager','hr','none'),('manager','scheduling','none'),
  ('manager','settings','none')
on conflict (role, section) do update set access_level = excluded.access_level, updated_at = now();

update private.action_capability_registry
set allowed_roles = array_append(allowed_roles, 'manager')
where capability in ('orders.read_all','orders.read_assigned')
  and not ('manager' = any(allowed_roles));

insert into private.role_action_permissions(role, capability, enabled)
select 'manager', capability, capability in ('orders.read_all','orders.read_assigned')
from private.action_capability_registry
on conflict (role, capability) do update set enabled = excluded.enabled, updated_at = now();

-- Make the role available in Settings > Staff roles and let HR manage the
-- manager like any other employee (attendance, schedule, points, payroll).
update private.internal_settings_state
set staff_roles = jsonb_set(staff_roles, '{roles}', (staff_roles->'roles') || '"manager"'::jsonb)
where id = 'primary'
  and jsonb_typeof(staff_roles->'roles') = 'array'
  and not (staff_roles->'roles') ? 'manager';

do $managed$
declare
  v_area text;
begin
  foreach v_area in array array['employees','attendance','scheduling','points','payroll'] loop
    update private.internal_settings_state
    set staff_roles = jsonb_set(staff_roles, array['hrManagedRoles', v_area],
                                (staff_roles #> array['hrManagedRoles', v_area]) || '"manager"'::jsonb)
    where id = 'primary'
      and jsonb_typeof(staff_roles #> array['hrManagedRoles', v_area]) = 'array'
      and not (staff_roles #> array['hrManagedRoles', v_area]) ? 'manager';
  end loop;
end
$managed$;

drop policy if exists branches_authenticated_read on public.branches;
create policy branches_authenticated_read on public.branches
for select to authenticated
using (
  is_active = true
  or private.has_staff_role(array['owner','admin','finance','hr','florist','courier','manager'])
);

-- The catalog editor loads variant flower recipes before saving a product.
drop policy if exists product_variant_flower_recipes_catalog_read on public.product_variant_flower_recipes;
create policy product_variant_flower_recipes_catalog_read on public.product_variant_flower_recipes
for select to authenticated
using (private.current_staff_role() = any (array['owner','admin','manager']));

-- ---------------------------------------------------------------------------
-- In-place function patches
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_patch record;
  v_proc record;
  v_def text;
  v_seen integer;
begin
  for v_patch in
    select * from (values
      -- role plumbing
      ('private','enabled_staff_roles',
        $o$'florist','courier']$o$, $n$'florist','courier','manager']$n$),
      ('private','section_role_eligible',
        $o$when 'courier' then p_section in ('dashboard')$o$,
        $n$when 'courier' then p_section in ('dashboard')
    when 'manager' then p_section in ('dashboard','orders','stock','catalog','customers')$n$),
      ('private','staff_employee_role_label',
        $o$when 'courier' then 'Kurir'$o$,
        $n$when 'courier' then 'Kurir'
    when 'manager' then 'Manajer'$n$),
      ('private','on_authorization_state_changed',
        $o$'hr','florist','courier']$o$, $n$'hr','florist','courier','manager']$n$),
      ('public','can_invite_staff_role',
        $o$('admin','finance','hr','florist','courier')$o$, $n$('admin','finance','hr','florist','courier','manager')$n$),
      ('public','service_create_staff_access_profile',
        $o$('admin','finance','hr','florist','courier')$o$, $n$('admin','finance','hr','florist','courier','manager')$n$),
      ('public','sync_staff_access_profile',
        $o$('owner','admin','finance','hr','florist','courier')$o$, $n$('owner','admin','finance','hr','florist','courier','manager')$n$),
      ('public','update_staff_employee',
        $o$('admin', 'finance', 'hr', 'florist', 'courier')$o$, $n$('admin', 'finance', 'hr', 'florist', 'courier', 'manager')$n$),
      -- the manager works as an employee: roster + selfie attendance
      ('public','get_operational_roster',
        $o$sap.role in ('admin','florist','courier')$o$, $n$sap.role in ('admin','florist','courier','manager')$n$),
      ('public','save_my_attendance_record',
        $o$role in ('admin','florist','courier')$o$, $n$role in ('admin','florist','courier','manager')$n$),
      ('public','save_my_attendance_record_v310_internal',
        $o$role in ('admin','florist','courier')$o$, $n$role in ('admin','florist','courier','manager')$n$),
      -- the manager stays assignable as the producing florist
      ('public','process_order_for_production',
        $o$coalesce(v_florist->>'systemRole','') <> 'florist'$o$,
        $n$coalesce(v_florist->>'systemRole','') not in ('florist','manager')$n$),
      ('public','start_paid_order_production',
        $o$coalesce(v_florist->>'systemRole','') <> 'florist'$o$,
        $n$coalesce(v_florist->>'systemRole','') not in ('florist','manager')$n$),
      ('public','attach_order_finish_photo',
        $o$elsif v_role = 'florist' then$o$, $n$elsif v_role in ('florist','manager') then$n$),
      ('private','can_write_order_finish_photo_object',
        $o$private.current_staff_role() = 'florist'$o$, $n$private.current_staff_role() in ('florist','manager')$n$),
      -- customer feedback settings
      ('public','get_review_configuration',
        $o$not in ('owner','admin')$o$, $n$not in ('owner','admin','manager')$n$),
      ('public','save_review_questions',
        $o$not in ('owner','admin')$o$, $n$not in ('owner','admin','manager')$n$),
      ('public','save_review_reward_settings',
        $o$not in ('owner','admin')$o$, $n$not in ('owner','admin','manager')$n$),
      ('public','save_review_reward_settings_v2_guarded',
        $o$not in ('owner','admin','finance')$o$, $n$not in ('owner','admin','finance','manager')$n$),
      ('public','get_review_configuration_cashflow_internal',
        $o$not in ('owner','admin','finance')$o$, $n$not in ('owner','admin','finance','manager')$n$),
      -- catalog image metadata follows the catalog editors
      ('public','replace_product_images_metadata',
        $o$array['owner','admin']$o$, $n$array['owner','admin','manager']$n$),
      -- the manager hears about work assigned to them, not every order event
      ('private','notification_kind_allowed_for_role',
        $o$  if p_kind in ('order_received','finance_rejected','order_change_resolved') then$o$,
        $n$  if p_role='manager' and p_kind in ('order_received','finance_rejected','order_change_resolved') then return false; end if;
  if p_kind in ('order_received','finance_rejected','order_change_resolved') then$n$)
    ) as t(schema_name, function_name, old_text, new_text)
  loop
    v_seen := 0;
    for v_proc in
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = v_patch.schema_name and p.proname = v_patch.function_name and p.prokind = 'f'
    loop
      v_seen := v_seen + 1;
      v_def := pg_get_functiondef(v_proc.oid);
      if (length(v_def) - length(replace(v_def, v_patch.old_text, ''))) / length(v_patch.old_text) <> 1 then
        raise exception 'Expected exactly one role check to patch in %.%', v_patch.schema_name, v_patch.function_name;
      end if;
      execute replace(v_def, v_patch.old_text, v_patch.new_text);
      v_def := pg_get_functiondef(v_proc.oid);
      if position(v_patch.new_text in v_def) = 0 then
        raise exception 'Manager role patch was not applied in %.%', v_patch.schema_name, v_patch.function_name;
      end if;
    end loop;
    if v_seen = 0 then
      raise exception 'Function %.% not found', v_patch.schema_name, v_patch.function_name;
    end if;
  end loop;
end
$migration$;

commit;
