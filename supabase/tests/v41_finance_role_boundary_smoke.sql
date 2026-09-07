-- Finance is a hard Finance-role-only authority boundary.
-- This test runs after all migrations and does not mutate persistent data.

do $$
declare
  v_roles text[];
  v_bad_capability text;
begin
  if private.section_role_eligible('owner','finance') then
    raise exception 'Owner is still eligible for Finance section';
  end if;
  if private.section_role_eligible('admin','finance') then
    raise exception 'Admin is still eligible for Finance section';
  end if;
  if not private.section_role_eligible('finance','finance') then
    raise exception 'Finance role lost Finance section eligibility';
  end if;

  if private.section_access_for_role('owner','finance') <> 'none'
     or private.section_access_for_role('admin','finance') <> 'none'
     or private.section_access_for_role('finance','finance') <> 'edit' then
    raise exception 'Finance section access matrix is not Finance-only';
  end if;

  select capability into v_bad_capability
  from private.action_capability_registry
  where capability like 'finance.%'
    and allowed_roles is distinct from array['finance']::text[]
  order by capability
  limit 1;
  if v_bad_capability is not null then
    raise exception 'Finance capability % is not Finance-only', v_bad_capability;
  end if;

  select allowed_roles into v_roles
  from private.action_capability_registry
  where capability='finance.verify_order';
  if v_roles is distinct from array['finance']::text[] then
    raise exception 'Finance final reconciliation capability eligibility mismatch: %', v_roles;
  end if;

  if exists (
    select 1 from private.role_action_permissions
    where role <> 'finance'
      and capability like 'finance.%'
      and enabled
  ) then
    raise exception 'A non-Finance role still has a persisted Finance action grant';
  end if;

  if private.has_action_permission_for_role('owner','finance.view_ledger')
     or private.has_action_permission_for_role('owner','finance.approve_refund')
     or private.has_action_permission_for_role('owner','finance.view_payroll')
     or private.has_action_permission_for_role('owner','finance.verify_order') then
    raise exception 'Owner still has a Finance action capability';
  end if;

  if not private.has_action_permission_for_role('finance','finance.view_ledger')
     or not private.has_action_permission_for_role('finance','finance.approve_refund')
     or not private.has_action_permission_for_role('finance','finance.view_payroll')
     or not private.has_action_permission_for_role('finance','finance.verify_order') then
    raise exception 'Finance role is missing expected Finance capabilities';
  end if;
end $$;
