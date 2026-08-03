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

  return public.save_finance_operational_state_v34_internal(
    p_expected_revision,
    v_next
  );
end;
$function$;

commit;
