-- Fleurstales V3.2 configurable authorization matrix smoke test.
-- This runs as the migration/test owner and rolls back all temporary changes.
-- Later authorization migrations intentionally extend some read-only role
-- surfaces; mutation authority remains capability-gated.
begin;

do $$
declare
  v_revision bigint;
begin
  -- Locked defaults expected by the current real-use operating model.
  if private.section_access_for_role('owner','orders') <> 'edit' then
    raise exception 'Owner Orders default must be edit';
  end if;
  if private.section_access_for_role('admin','orders') <> 'edit' then
    raise exception 'Admin Orders default must be edit';
  end if;
  if private.section_access_for_role('finance','customers') not in ('view','edit') then
    raise exception 'Finance must be able to read CRM by default';
  end if;
  if private.section_access_for_role('owner','finance') <> 'none' then
    raise exception 'Owner must not receive Finance workspace access';
  end if;
  if private.section_access_for_role('admin','finance') <> 'none' then
    raise exception 'Admin must not receive Finance workspace access';
  end if;
  if private.section_access_for_role('finance','finance') <> 'edit' then
    raise exception 'Finance role must own the Finance workspace';
  end if;

  -- Current staff-read policy intentionally gives HR company-wide read-only
  -- Orders + Customers visibility. This supersedes the original V3.2 default
  -- while preserving the mutation boundary below.
  if private.section_access_for_role('hr','orders') <> 'view' then
    raise exception 'HR Orders access must be read-only';
  end if;
  if private.section_access_for_role('hr','customers') <> 'view' then
    raise exception 'HR Customers access must be read-only';
  end if;
  if private.section_access_for_role('florist','orders') <> 'none' then
    raise exception 'Florist must not receive the full Orders workspace by default';
  end if;

  if not private.has_action_permission_for_role('owner','orders.read_all') then
    raise exception 'Owner orders.read_all missing';
  end if;
  if not private.has_action_permission_for_role('admin','orders.edit') then
    raise exception 'Admin orders.edit missing';
  end if;
  if not private.has_action_permission_for_role('hr','orders.read_all') then
    raise exception 'HR company-wide Orders read capability missing';
  end if;
  if private.has_action_permission_for_role('hr','orders.edit')
     or private.has_action_permission_for_role('hr','orders.assign')
     or private.has_action_permission_for_role('hr','orders.advance_status') then
    raise exception 'HR received Order mutation authority';
  end if;
  if private.has_action_permission_for_role('finance','finance.verify_order') then
    raise exception 'Legacy Finance order verification must remain retired';
  end if;
  if private.has_action_permission_for_role('owner','finance.view_ledger')
     or private.has_action_permission_for_role('owner','finance.create_ledger_entry')
     or private.has_action_permission_for_role('owner','finance.edit_ledger_entry') then
    raise exception 'Owner received Finance ledger authority';
  end if;
  if not private.has_action_permission_for_role('finance','finance.view_ledger')
     or not private.has_action_permission_for_role('finance','finance.create_ledger_entry')
     or not private.has_action_permission_for_role('finance','finance.edit_ledger_entry') then
    raise exception 'Finance ledger authority is incomplete';
  end if;
  if private.has_action_permission_for_role('hr','finance.verify_order') then
    raise exception 'HR can verify Finance orders';
  end if;
  if not private.has_action_permission_for_role('florist','orders.read_assigned') then
    raise exception 'Florist assigned-work capability missing';
  end if;
  if private.has_action_permission_for_role('florist','orders.read_all') then
    raise exception 'Florist can read all Orders';
  end if;

  -- Parent section access is authoritative: disabling a section also disables
  -- its configured action even if the action row itself remains enabled.
  update private.role_section_permissions
  set access_level='none'
  where role='admin' and section='orders';
  if private.has_action_permission_for_role('admin','orders.edit') then
    raise exception 'Action permission bypasses disabled parent section';
  end if;

  -- Restore for the rest of this transaction, then prove action toggles are live.
  update private.role_section_permissions
  set access_level='edit'
  where role='admin' and section='orders';
  update private.role_action_permissions
  set enabled=false
  where role='admin' and capability='orders.assign';
  if private.has_action_permission_for_role('admin','orders.assign') then
    raise exception 'Disabled action permission still authorizes Admin assignment';
  end if;

  -- Owner recovery/governance access is immutable even if backing rows are damaged.
  update private.role_section_permissions
  set access_level='none'
  where role='owner' and section in ('settings','scheduling');
  if private.section_access_for_role('owner','settings') <> 'edit'
    or private.section_access_for_role('owner','scheduling') <> 'edit' then
    raise exception 'Owner recovery authority can be locked out';
  end if;
  if not private.has_action_permission_for_role('owner','settings.edit_permissions') then
    raise exception 'Owner Settings governance capability can be disabled';
  end if;

  -- Feature settings are server state, not a client-only toggle.
  update private.feature_settings set enabled=true where feature_key='inventory';
  if not private.feature_enabled('inventory') then
    raise exception 'Inventory feature toggle helper did not reflect server setting';
  end if;

  select revision into v_revision from private.authorization_state where id='primary';
  if v_revision is null or v_revision < 1 then
    raise exception 'Authorization revision state invalid';
  end if;
end;
$$;

rollback;