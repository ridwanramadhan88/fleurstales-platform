begin;

insert into private.action_capability_registry (
  capability, parent_section, requires_edit, allowed_roles
)
select
  'finance.view_order_verification',
  parent_section,
  requires_edit,
  allowed_roles
from private.action_capability_registry
where capability = 'finance.view_collect_orders'
on conflict (capability) do update
set parent_section = excluded.parent_section,
    requires_edit = excluded.requires_edit,
    allowed_roles = excluded.allowed_roles;

insert into private.role_action_permissions (role, capability, enabled, updated_at)
select role, 'finance.view_order_verification', enabled, now()
from private.role_action_permissions
where capability = 'finance.view_collect_orders'
on conflict (role, capability) do update
set enabled = excluded.enabled,
    updated_at = excluded.updated_at;

delete from private.role_action_permissions
where capability = 'finance.view_collect_orders';

delete from private.action_capability_registry
where capability = 'finance.view_collect_orders';

insert into private.action_capability_registry (
  capability, parent_section, requires_edit, allowed_roles
)
select
  'finance.edit_ledger_entry',
  parent_section,
  true,
  allowed_roles
from private.action_capability_registry
where capability = 'finance.verify_ledger_entry'
on conflict (capability) do update
set parent_section = excluded.parent_section,
    requires_edit = true,
    allowed_roles = excluded.allowed_roles;

insert into private.role_action_permissions (role, capability, enabled, updated_at)
select role, 'finance.edit_ledger_entry', enabled, now()
from private.role_action_permissions
where capability = 'finance.verify_ledger_entry'
on conflict (role, capability) do update
set enabled = excluded.enabled,
    updated_at = excluded.updated_at;

delete from private.role_action_permissions
where capability = 'finance.verify_ledger_entry';

delete from private.action_capability_registry
where capability = 'finance.verify_ledger_entry';

update private.authorization_state
set revision = revision + 1,
    updated_at = now()
where id = 'primary';

-- Existing manual transactions no longer wait for a second verification.
update private.operational_domain_state
set snapshot = jsonb_set(
      coalesce(snapshot, '{}'::jsonb),
      '{transactions}',
      coalesce((
        select jsonb_agg(
          case
            when coalesce(item->>'source', 'manual') = 'manual'
              and coalesce(item->>'entryMode', 'manual') = 'manual'
              and coalesce((item->>'isSystemGenerated')::boolean, false) = false
            then jsonb_set(item, '{status}', '"verified"'::jsonb, true)
            else item
          end
        )
        from jsonb_array_elements(
          coalesce(snapshot->'transactions', '[]'::jsonb)
        ) item
      ), '[]'::jsonb),
      true
    ),
    revision = revision + 1,
    updated_at = now()
where domain = 'finance';

create or replace function public.save_finance_operational_state_v36_internal(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_previous jsonb;
  v_next jsonb := coalesce(p_snapshot, '{}'::jsonb);
begin
  select coalesce(snapshot, '{}'::jsonb)
  into v_previous
  from private.operational_domain_state
  where domain = 'finance';

  if jsonb_typeof(v_next) <> 'object' then
    raise exception 'FINANCE_SNAPSHOT_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_next) as keys(key)
    where key not in ('transactions', 'customCategories', 'categoryOverrides')
  ) then
    raise exception 'FINANCE_UNKNOWN_STATE_KEY' using errcode = '22023';
  end if;

  if v_next->'customCategories' is distinct from v_previous->'customCategories'
    or v_next->'categoryOverrides' is distinct from v_previous->'categoryOverrides'
  then
    if not private.has_section_access('finance', 'edit') then
      raise exception 'FINANCE_CATEGORY_EDIT_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
  end if;

  -- Automatic entries may only be created by Orders, Refunds, or Payroll.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_next->'transactions', '[]'::jsonb)) n
    where (
      coalesce((n->>'isSystemGenerated')::boolean, false) = true
      or coalesce(n->>'source', '') in ('order_payment', 'order_refund', 'payroll')
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_previous->'transactions', '[]'::jsonb)) o
      where o->>'id' = n->>'id'
    )
  ) then
    raise exception 'SERVER_OWNED_FINANCE_ENTRY' using errcode = '42501';
  end if;

  -- Existing automatic entries are immutable in the generic Finance snapshot.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_previous->'transactions', '[]'::jsonb)) o
    where (
      coalesce((o->>'isSystemGenerated')::boolean, false) = true
      or coalesce(o->>'source', '') in ('order_payment', 'order_refund', 'payroll')
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_next->'transactions', '[]'::jsonb)) n
      where n->>'id' = o->>'id'
        and n = o
    )
  ) then
    raise exception 'SERVER_OWNED_FINANCE_ENTRY' using errcode = '42501';
  end if;

  -- Ledger rows are never deleted. Manual corrections use an audited edit.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_previous->'transactions', '[]'::jsonb)) o
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(v_next->'transactions', '[]'::jsonb)) n
      where n->>'id' = o->>'id'
    )
  ) then
    raise exception 'FINANCE_ENTRY_DELETE_NOT_ALLOWED' using errcode = '42501';
  end if;

  -- New manual rows use the explicit create capability.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_next->'transactions', '[]'::jsonb)) n
    where coalesce(n->>'source', 'manual') = 'manual'
      and coalesce(n->>'entryMode', 'manual') = 'manual'
      and coalesce((n->>'isSystemGenerated')::boolean, false) = false
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(v_previous->'transactions', '[]'::jsonb)) o
        where o->>'id' = n->>'id'
      )
  ) and not private.has_action_permission('finance.create_ledger_entry') then
    raise exception 'FINANCE_LEDGER_CREATE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  -- Existing manual rows may be corrected only through the audited edit capability.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_next->'transactions', '[]'::jsonb)) n
    join jsonb_array_elements(coalesce(v_previous->'transactions', '[]'::jsonb)) o
      on o->>'id' = n->>'id'
    where coalesce(o->>'source', 'manual') = 'manual'
      and coalesce(o->>'entryMode', 'manual') = 'manual'
      and coalesce((o->>'isSystemGenerated')::boolean, false) = false
      and n is distinct from o
  ) and not private.has_action_permission('finance.edit_ledger_entry') then
    raise exception 'FINANCE_LEDGER_EDIT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  -- Manual entries are final when created or edited; no second confirmation.
  v_next := jsonb_set(
    v_next,
    '{transactions}',
    coalesce((
      select jsonb_agg(
        case
          when coalesce(item->>'source', 'manual') = 'manual'
            and coalesce(item->>'entryMode', 'manual') = 'manual'
            and coalesce((item->>'isSystemGenerated')::boolean, false) = false
          then jsonb_set(item, '{status}', '"verified"'::jsonb, true)
          else item
        end
      )
      from jsonb_array_elements(coalesce(v_next->'transactions', '[]'::jsonb)) item
    ), '[]'::jsonb),
    true
  );

  return private.persist_validated_operational_snapshot(
    'finance',
    p_expected_revision,
    v_next
  );
end;
$function$;

commit;
