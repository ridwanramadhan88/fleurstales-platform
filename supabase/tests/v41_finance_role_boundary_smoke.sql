-- Finance is a hard Finance-role-only authority boundary.
-- This test runs after all migrations and does not mutate persistent data.

do $$
declare
  v_roles text[];
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

  select allowed_roles into v_roles
  from private.action_capability_registry
  where capability='finance.view_ledger';
  if v_roles is distinct from array['finance']::text[] then
    raise exception 'Finance ledger capability eligibility is not Finance-only';
  end if;

  select allowed_roles into v_roles
  from private.action_capability_registry
  where capability='finance.verify_order';
  if coalesce(cardinality(v_roles),0) <> 0 then
    raise exception 'Legacy finance.verify_order capability is still eligible';
  end if;

  if private.has_action_permission_for_role('owner','finance.view_ledger')
     or private.has_action_permission_for_role('owner','finance.approve_refund')
     or private.has_action_permission_for_role('owner','finance.view_payroll') then
    raise exception 'Owner still has a Finance action capability';
  end if;

  if not private.has_action_permission_for_role('finance','finance.view_ledger')
     or not private.has_action_permission_for_role('finance','finance.approve_refund')
     or not private.has_action_permission_for_role('finance','finance.view_payroll') then
    raise exception 'Finance role is missing expected Finance capabilities';
  end if;
end $$;
