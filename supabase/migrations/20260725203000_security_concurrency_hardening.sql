-- Fleurstales V3 production hardening
-- - Split operational persistence into permission-scoped domains.
-- - Make operational writes optimistic-concurrency safe and server-audited.
-- - Align CRM and Orders RLS with the Business OS authorization model.
-- - Remove direct staff writes to authoritative Orders tables.
-- - Replace hard-coded first-owner bootstrap with admin-controlled app_metadata.
-- - Repair Size Guide role casing introduced by the earlier hardening migration.

begin;

-- ---------------------------------------------------------------------------
-- Staff identity helpers used by row-level order authorization.
-- ---------------------------------------------------------------------------
create or replace function private.current_staff_employee_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sap.employee_id
  from public.staff_access_profiles sap
  where sap.user_id = (select auth.uid())
    and sap.is_active = true
  limit 1
$$;

create or replace function private.current_staff_branch_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sap.branch_id
  from public.staff_access_profiles sap
  where sap.user_id = (select auth.uid())
    and sap.is_active = true
  limit 1
$$;

create or replace function private.can_read_order_row(
  p_branch_id text,
  p_florist_employee_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
  v_branch_id text := private.current_staff_branch_id();
  v_employee_id text := private.current_staff_employee_id();
begin
  if v_role in ('owner', 'finance') then
    return true;
  end if;

  if v_role = 'admin' then
    return v_branch_id is not null and v_branch_id = p_branch_id;
  end if;

  if v_role = 'florist' then
    return v_branch_id is not null
      and v_branch_id = p_branch_id
      and v_employee_id is not null
      and v_employee_id = p_florist_employee_id;
  end if;

  return false;
end;
$$;

revoke execute on function private.current_staff_employee_id() from public, anon, authenticated;
revoke execute on function private.current_staff_branch_id() from public, anon, authenticated;
revoke execute on function private.can_read_order_row(text, text) from public, anon;
grant execute on function private.can_read_order_row(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- CRM: Finance is read-only, matching the OS permission matrix.
-- ---------------------------------------------------------------------------
drop policy if exists customers_crm_read on public.customers;
create policy customers_crm_read on public.customers
for select to authenticated
using (private.has_staff_role(array['owner','admin','finance']));

drop policy if exists customer_addresses_crm_read on public.customer_addresses;
create policy customer_addresses_crm_read on public.customer_addresses
for select to authenticated
using (private.has_staff_role(array['owner','admin','finance']));

-- ---------------------------------------------------------------------------
-- Orders: row scope is authoritative in Postgres.
-- Owner/Finance: cross-branch read.
-- Admin: own staff_access_profiles branch only.
-- Florist: own branch + explicitly assigned employee only.
-- HR: no Orders rows.
-- ---------------------------------------------------------------------------
drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders
for select to authenticated
using (private.can_read_order_row(branch_id, florist_assigned_employee_id));

drop policy if exists order_items_staff_read on public.order_items;
create policy order_items_staff_read on public.order_items
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  )
);

drop policy if exists order_activities_staff_read on public.order_activities;
create policy order_activities_staff_read on public.order_activities
for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  )
);

drop policy if exists order_payments_staff_read on public.order_payment_events;
create policy order_payments_staff_read on public.order_payment_events
for select to authenticated
using (
  private.has_staff_role(array['owner','admin','finance'])
  and exists (
    select 1
    from public.orders o
    where o.id = order_id
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  )
);

-- Direct Data API writes bypass the application workflow, so remove them.
drop policy if exists orders_editor_insert on public.orders;
drop policy if exists orders_editor_update on public.orders;
drop policy if exists orders_editor_delete on public.orders;
drop policy if exists order_items_editor_insert on public.order_items;
drop policy if exists order_items_editor_update on public.order_items;
drop policy if exists order_items_editor_delete on public.order_items;
drop policy if exists order_payments_editor_insert on public.order_payment_events;
drop policy if exists order_payments_editor_update on public.order_payment_events;
drop policy if exists order_payments_editor_delete on public.order_payment_events;
drop policy if exists order_activities_editor_insert on public.order_activities;
drop policy if exists order_activities_editor_update on public.order_activities;
drop policy if exists order_activities_editor_delete on public.order_activities;

revoke insert, update, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items from authenticated;
revoke insert, update, delete on public.order_payment_events from authenticated;
revoke insert, update, delete on public.order_activities from authenticated;

-- ---------------------------------------------------------------------------
-- Immutable server audit trail. No client role receives direct table access.
-- ---------------------------------------------------------------------------
create table if not exists private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_employee_id text,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  outcome text not null default 'succeeded' check (outcome in ('succeeded','denied','conflict')),
  previous_revision bigint,
  next_revision bigint,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

revoke all on table private.audit_events from public, anon, authenticated;

create or replace function private.write_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_outcome text,
  p_previous_revision bigint default null,
  p_next_revision bigint default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
begin
  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid())
    and is_active = true
  limit 1;

  insert into private.audit_events (
    actor_user_id,
    actor_employee_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    outcome,
    previous_revision,
    next_revision,
    before_state,
    after_state,
    metadata
  ) values (
    (select auth.uid()),
    v_profile.employee_id,
    coalesce(v_profile.display_name, 'Unknown staff'),
    coalesce(v_profile.role, 'unknown'),
    p_action,
    p_entity_type,
    p_entity_id,
    p_outcome,
    p_previous_revision,
    p_next_revision,
    p_before_state,
    p_after_state,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function private.write_audit_event(text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)
  from public, anon, authenticated;

create or replace function public.list_security_audit_events(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_staff_role(array['owner']) then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(a) order by a.occurred_at desc)
    from (
      select *
      from private.audit_events
      order by occurred_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) a
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_security_audit_events(integer) from public, anon;
grant execute on function public.list_security_audit_events(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Operational persistence: one row per security domain, private table only.
-- ---------------------------------------------------------------------------
create table if not exists private.operational_domain_state (
  domain text primary key check (domain in ('hr','payroll','finance','stock','vouchers','order_drafts')),
  revision bigint not null default 0 check (revision >= 0),
  snapshot jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

revoke all on table private.operational_domain_state from public, anon, authenticated;

create or replace function private.can_read_operational_domain(p_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
begin
  return case p_domain
    when 'hr' then v_role in ('owner','hr')
    when 'payroll' then v_role in ('owner','hr','finance')
    when 'finance' then v_role in ('owner','finance')
    when 'stock' then v_role in ('owner','admin','finance')
    when 'vouchers' then v_role in ('owner','admin','finance')
    when 'order_drafts' then v_role in ('owner','admin')
    else false
  end;
end;
$$;

create or replace function private.can_write_operational_domain(p_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
begin
  return case p_domain
    when 'hr' then v_role in ('owner','hr')
    when 'payroll' then v_role in ('owner','hr','finance')
    when 'finance' then v_role in ('owner','finance')
    when 'stock' then v_role in ('owner','admin')
    when 'vouchers' then v_role in ('owner','admin','finance')
    when 'order_drafts' then v_role in ('owner','admin')
    else false
  end;
end;
$$;

revoke execute on function private.can_read_operational_domain(text) from public, anon, authenticated;
revoke execute on function private.can_write_operational_domain(text) from public, anon, authenticated;

create or replace function public.get_operational_domain_state(p_domain text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.can_read_operational_domain(p_domain) then
    raise exception 'OPERATIONAL_DOMAIN_READ_FORBIDDEN:%', p_domain using errcode = '42501';
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain = p_domain;

  if not found then
    return jsonb_build_object(
      'domain', p_domain,
      'revision', 0,
      'snapshot', null,
      'updatedAt', null
    );
  end if;

  return jsonb_build_object(
    'domain', v_state.domain,
    'revision', v_state.revision,
    'snapshot', v_state.snapshot,
    'updatedAt', v_state.updated_at
  );
end;
$$;

revoke execute on function public.get_operational_domain_state(text) from public, anon;
grant execute on function public.get_operational_domain_state(text) to authenticated;

create or replace function public.save_operational_domain_state(
  p_domain text,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_previous jsonb;
  v_next_revision bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not private.can_write_operational_domain(p_domain) then
    raise exception 'OPERATIONAL_DOMAIN_WRITE_FORBIDDEN:%', p_domain using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_EXPECTED_REVISION' using errcode = '22023';
  end if;

  if p_snapshot is null then
    raise exception 'SNAPSHOT_REQUIRED' using errcode = '22023';
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain = p_domain
  for update;

  if not found then
    if p_expected_revision <> 0 then
      perform private.write_audit_event(
        'operational.' || p_domain || '.save',
        'operational_domain',
        p_domain,
        'conflict',
        0,
        null,
        null,
        p_snapshot,
        jsonb_build_object('expectedRevision', p_expected_revision)
      );
      raise exception 'REVISION_CONFLICT:%:expected=%:actual=0', p_domain, p_expected_revision using errcode = '40001';
    end if;

    begin
      insert into private.operational_domain_state (domain, revision, snapshot, updated_by, updated_at)
      values (p_domain, 1, p_snapshot, (select auth.uid()), now())
      returning * into v_state;
    exception when unique_violation then
      raise exception 'REVISION_CONFLICT:%:concurrent_create', p_domain using errcode = '40001';
    end;

    perform private.write_audit_event(
      'operational.' || p_domain || '.save',
      'operational_domain',
      p_domain,
      'succeeded',
      0,
      1,
      null,
      p_snapshot
    );
  else
    if v_state.revision <> p_expected_revision then
      perform private.write_audit_event(
        'operational.' || p_domain || '.save',
        'operational_domain',
        p_domain,
        'conflict',
        v_state.revision,
        null,
        v_state.snapshot,
        p_snapshot,
        jsonb_build_object('expectedRevision', p_expected_revision)
      );
      raise exception 'REVISION_CONFLICT:%:expected=%:actual=%', p_domain, p_expected_revision, v_state.revision using errcode = '40001';
    end if;

    v_previous := v_state.snapshot;
    v_next_revision := v_state.revision + 1;

    update private.operational_domain_state
    set revision = v_next_revision,
        snapshot = p_snapshot,
        updated_by = (select auth.uid()),
        updated_at = now()
    where domain = p_domain
      and revision = p_expected_revision
    returning * into v_state;

    if not found then
      raise exception 'REVISION_CONFLICT:%:lost_update', p_domain using errcode = '40001';
    end if;

    perform private.write_audit_event(
      'operational.' || p_domain || '.save',
      'operational_domain',
      p_domain,
      'succeeded',
      p_expected_revision,
      v_state.revision,
      v_previous,
      p_snapshot
    );
  end if;

  return jsonb_build_object(
    'domain', v_state.domain,
    'revision', v_state.revision,
    'snapshot', v_state.snapshot,
    'updatedAt', v_state.updated_at
  );
end;
$$;

revoke execute on function public.save_operational_domain_state(text,bigint,jsonb) from public, anon;
grant execute on function public.save_operational_domain_state(text,bigint,jsonb) to authenticated;

-- Migrate usable slices from the legacy all-in-one row, if present.
do $$
declare
  v_legacy public.operational_state%rowtype;
  v_domain text;
  v_value jsonb;
begin
  if to_regclass('public.operational_state') is null then
    return;
  end if;

  select * into v_legacy
  from public.operational_state
  where id = 'primary';

  if not found then
    return;
  end if;

  foreach v_domain in array array['hr','payroll','finance','stock','vouchers','order_drafts'] loop
    v_value := case v_domain
      when 'order_drafts' then v_legacy.snapshot #> '{state,orderDrafts}'
      else v_legacy.snapshot #> array['state', v_domain]
    end;

    if v_domain = 'hr'
      and v_value is not null
      and jsonb_typeof(v_value -> 'employees') = 'array'
    then
      select jsonb_set(
        v_value,
        '{employees}',
        coalesce(jsonb_agg(employee - 'pin'), '[]'::jsonb),
        true
      )
      into v_value
      from jsonb_array_elements(v_value -> 'employees') as employee;
    end if;

    if v_value is not null then
      insert into private.operational_domain_state (domain, revision, snapshot, updated_by, updated_at)
      values (v_domain, greatest(v_legacy.revision, 0), v_value, v_legacy.updated_by, v_legacy.updated_at)
      on conflict (domain) do nothing;
    end if;
  end loop;

  -- Remove legacy PIN material as part of the same migration. The aggregate
  -- row is retained Owner-only for rollout compatibility, but it must not
  -- remain a historical secret store.
  if jsonb_typeof(v_legacy.snapshot #> '{state,hr,employees}') = 'array' then
    update public.operational_state
    set snapshot = jsonb_set(
      v_legacy.snapshot,
      '{state,hr,employees}',
      (
        select coalesce(jsonb_agg(employee - 'pin'), '[]'::jsonb)
        from jsonb_array_elements(v_legacy.snapshot #> '{state,hr,employees}') as employee
      ),
      true
    )
    where id = 'primary';
  end if;
end;
$$;

-- Lock the legacy aggregate row to Owner only for rollout compatibility.
drop policy if exists operational_state_staff_select on public.operational_state;
drop policy if exists operational_state_staff_insert on public.operational_state;
drop policy if exists operational_state_staff_update on public.operational_state;

create policy operational_state_owner_select on public.operational_state
  for select to authenticated
  using (private.has_staff_role(array['owner']));
create policy operational_state_owner_insert on public.operational_state
  for insert to authenticated
  with check (private.has_staff_role(array['owner']));
create policy operational_state_owner_update on public.operational_state
  for update to authenticated
  using (private.has_staff_role(array['owner']))
  with check (private.has_staff_role(array['owner']));

-- ---------------------------------------------------------------------------
-- Revision-safe, server-authoritative operational Order mutation RPC.
-- The browser sends the desired aggregate state, line items, and append-only
-- payment history. The function locks the row, computes the mutation classes,
-- enforces the same role/workflow boundaries as Business OS, then commits the
-- whole change atomically. Direct client writes to the underlying tables stay
-- revoked.
-- ---------------------------------------------------------------------------
drop function if exists public.save_order_operational_state(
  text, integer, integer, text, text, bigint, boolean, text, timestamptz, timestamptz
);

drop function if exists public.save_order_operational_state(
  text, integer, integer, jsonb, jsonb, jsonb
);

create or replace function public.save_order_operational_state(
  p_order_id text,
  p_expected_revision integer,
  p_next_revision integer,
  p_state jsonb,
  p_items jsonb default '[]'::jsonb,
  p_payment_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_next public.orders%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_current_items jsonb;
  v_requested_items jsonb;
  v_current_payment_events jsonb;
  v_requested_payment_events jsonb;
  v_new_payment_events jsonb;
  v_locked boolean;
  v_finished boolean;
  v_details_changed boolean;
  v_assignment_changed boolean;
  v_status_changed boolean;
  v_payment_changed boolean;
  v_refund_changed boolean;
  v_finance_changed boolean;
  v_change_control_changed boolean;
  v_resubmission boolean;
  v_submitted_change_request boolean;
  v_resolved_change_request boolean;
  v_finalizing_unlocked_edit boolean;
  v_item_count integer;
  v_item_subtotal bigint;
  v_current_status_index integer;
  v_next_status_index integer;
  v_pipeline text[];
  v_event jsonb;
  v_event_type text;
  v_last_new_event jsonb;
  v_request_type text;
  v_request_reason text;
  v_actor_name text;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid())
    and is_active = true
  limit 1;

  if not found or v_profile.role not in ('owner','admin','finance') then
    raise exception 'ORDER_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  v_actor_name := coalesce(nullif(trim(v_profile.display_name), ''), v_profile.role);

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_profile.role = 'admin'
    and (v_profile.branch_id is null or v_profile.branch_id <> v_order.branch_id)
  then
    raise exception 'ORDER_OUTSIDE_BRANCH_SCOPE' using errcode = '42501';
  end if;

  if p_expected_revision is null or v_order.revision <> p_expected_revision then
    perform private.write_audit_event(
      'order.operational.save', 'order', p_order_id, 'conflict',
      v_order.revision, p_next_revision,
      jsonb_build_object('status', v_order.status, 'paymentStatus', v_order.payment_status),
      coalesce(p_state, '{}'::jsonb),
      jsonb_build_object('expectedRevision', p_expected_revision)
    );
    raise exception 'REVISION_CONFLICT:order:%:expected=%:actual=%',
      p_order_id, p_expected_revision, v_order.revision
      using errcode = '40001';
  end if;

  -- The orders trigger advances exactly one revision per committed mutation.
  -- A browser that accumulated several local revisions replays the latest
  -- desired state one server revision at a time until it catches up.
  if p_next_revision is null or p_next_revision <> p_expected_revision + 1 then
    raise exception 'INVALID_NEXT_REVISION' using errcode = '22023';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'INVALID_ORDER_STATE' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ORDER_ITEMS' using errcode = '22023';
  end if;
  if p_payment_events is null or jsonb_typeof(p_payment_events) <> 'array' then
    raise exception 'INVALID_PAYMENT_EVENTS' using errcode = '22023';
  end if;

  -- Merge the requested mutable state into the authoritative row. Immutable
  -- identity/scope fields are restored after the merge so a client can never
  -- move an order to another branch or rewrite its identity/idempotency key.
  select * into v_next
  from pg_catalog.jsonb_populate_record(
    null::public.orders,
    to_jsonb(v_order)
      || p_state
      || jsonb_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'storefront_idempotency_key', v_order.storefront_idempotency_key,
        'branch_id', v_order.branch_id,
        'revision', p_next_revision,
        'created_at', v_order.created_at,
        'updated_at', v_now
      )
  );

  if v_next.status not in (
    'pending_verification','confirmed','processing','ready','delivering',
    'delivered','picked_up','cancelled','failed'
  ) then
    raise exception 'INVALID_ORDER_STATUS' using errcode = '22023';
  end if;
  if v_next.payment_status not in ('unpaid','partial','paid','refund_pending','refunded') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;
  if v_next.source not in ('whatsapp','walk_in','customer_app') then
    raise exception 'INVALID_ORDER_SOURCE' using errcode = '22023';
  end if;
  if v_next.fulfillment not in ('delivery','pickup') then
    raise exception 'INVALID_ORDER_FULFILLMENT' using errcode = '22023';
  end if;
  if v_next.payment_method is not null and v_next.payment_method not in ('cash','transfer') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;
  if v_next.fulfillment = 'delivery' and v_next.payment_method = 'cash' then
    raise exception 'DELIVERY_REQUIRES_TRANSFER' using errcode = '22023';
  end if;
  if v_next.total_idr is null or v_next.total_idr < 0
    or v_next.items_subtotal_idr is null or v_next.items_subtotal_idr < 0
    or v_next.discount_idr is null or v_next.discount_idr < 0
    or v_next.delivery_fee_idr is null or v_next.delivery_fee_idr < 0
  then
    raise exception 'INVALID_ORDER_TOTALS' using errcode = '22023';
  end if;
  if v_next.total_idr <> greatest(0, v_next.items_subtotal_idr - v_next.discount_idr + v_next.delivery_fee_idr) then
    raise exception 'ORDER_TOTAL_MISMATCH' using errcode = '22023';
  end if;
  if v_next.paid_amount_idr is null or v_next.paid_amount_idr < 0 or v_next.paid_amount_idr > v_next.total_idr then
    raise exception 'INVALID_PAID_AMOUNT' using errcode = '22023';
  end if;

  -- Canonicalize and validate line items. The item payload must always be a
  -- complete snapshot; this lets details/item edits share the same revision.
  select count(*), coalesce(sum(x.quantity::bigint * x.unit_price_idr), 0)
  into v_item_count, v_item_subtotal
  from jsonb_to_recordset(p_items) as x(
    id text,
    product_id text,
    variant_id text,
    product_code_snapshot text,
    product_name_snapshot text,
    variant_sku_snapshot text,
    variant_size_snapshot text,
    quantity integer,
    unit_price_idr bigint
  );

  if v_item_count < 1 then
    raise exception 'ORDER_ITEMS_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      id text,
      product_id text,
      variant_id text,
      product_code_snapshot text,
      product_name_snapshot text,
      variant_sku_snapshot text,
      variant_size_snapshot text,
      quantity integer,
      unit_price_idr bigint
    )
    where nullif(trim(x.id), '') is null
       or nullif(trim(x.product_name_snapshot), '') is null
       or x.quantity is null or x.quantity <= 0
       or x.unit_price_idr is null or x.unit_price_idr < 0
  ) then
    raise exception 'INVALID_ORDER_ITEM' using errcode = '22023';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_items) as x(id text)
  ) <> (
    select count(distinct x.id)
    from jsonb_to_recordset(p_items) as x(id text)
  ) then
    raise exception 'DUPLICATE_ORDER_ITEM_ID' using errcode = '22023';
  end if;
  if v_item_subtotal <> v_next.items_subtotal_idr then
    raise exception 'ORDER_ITEM_SUBTOTAL_MISMATCH' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.order_items oi
    join jsonb_to_recordset(p_items) as x(id text) on x.id = oi.id
    where oi.order_id <> p_order_id
  ) then
    raise exception 'ORDER_ITEM_ID_OWNED_BY_OTHER_ORDER' using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
  into v_requested_items
  from jsonb_to_recordset(p_items) as x(
    id text,
    product_id text,
    variant_id text,
    product_code_snapshot text,
    product_name_snapshot text,
    variant_sku_snapshot text,
    variant_size_snapshot text,
    quantity integer,
    unit_price_idr bigint
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'product_id', oi.product_id,
    'variant_id', oi.variant_id,
    'product_code_snapshot', oi.product_code_snapshot,
    'product_name_snapshot', oi.product_name_snapshot,
    'variant_sku_snapshot', oi.variant_sku_snapshot,
    'variant_size_snapshot', oi.variant_size_snapshot,
    'quantity', oi.quantity,
    'unit_price_idr', oi.unit_price_idr
  ) order by oi.id), '[]'::jsonb)
  into v_current_items
  from public.order_items oi
  where oi.order_id = p_order_id;

  -- Payment history is append-only. Existing entries must be supplied
  -- unchanged, and new idempotency keys may not belong to another order.
  if (
    select count(*)
    from jsonb_to_recordset(p_payment_events) as x(idempotency_key text)
  ) <> (
    select count(distinct x.idempotency_key)
    from jsonb_to_recordset(p_payment_events) as x(idempotency_key text)
  ) then
    raise exception 'DUPLICATE_PAYMENT_EVENT_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_payment_events) as x(
      id text,
      type text,
      amount_idr bigint,
      previous_paid_amount_idr bigint,
      resulting_paid_amount_idr bigint,
      resulting_status text,
      method text,
      reference text,
      proof_id text,
      note text,
      occurred_at timestamptz,
      idempotency_key text,
      ledger_transaction_id text
    )
    where nullif(trim(x.id), '') is null
       or nullif(trim(x.idempotency_key), '') is null
       or x.type not in (
         'payment_received','payment_reversed','payment_status_adjusted',
         'refund_initiated','refund_completed','refund_cancelled'
       )
       or x.amount_idr is null or x.amount_idr < 0
       or x.previous_paid_amount_idr is null or x.previous_paid_amount_idr < 0
       or x.resulting_paid_amount_idr is null or x.resulting_paid_amount_idr < 0
       or x.resulting_status not in ('unpaid','partial','paid','refund_pending','refunded')
       or (x.method is not null and x.method not in ('cash','transfer'))
       or x.occurred_at is null
  ) then
    raise exception 'INVALID_PAYMENT_EVENT' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.order_payment_events ope
    join jsonb_to_recordset(p_payment_events) as x(idempotency_key text)
      on x.idempotency_key = ope.idempotency_key
    where ope.order_id <> p_order_id
  ) then
    raise exception 'PAYMENT_EVENT_OWNED_BY_OTHER_ORDER' using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ope.id,
    'type', ope.type,
    'amount_idr', ope.amount_idr,
    'previous_paid_amount_idr', ope.previous_paid_amount_idr,
    'resulting_paid_amount_idr', ope.resulting_paid_amount_idr,
    'resulting_status', ope.resulting_status,
    'method', ope.method,
    'reference', ope.reference,
    'proof_id', ope.proof_id,
    'note', ope.note,
    'occurred_at', ope.occurred_at,
    'idempotency_key', ope.idempotency_key,
    'ledger_transaction_id', ope.ledger_transaction_id
  ) order by ope.occurred_at, ope.id), '[]'::jsonb)
  into v_current_payment_events
  from public.order_payment_events ope
  where ope.order_id = p_order_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at, x.id), '[]'::jsonb)
  into v_requested_payment_events
  from jsonb_to_recordset(p_payment_events) as x(
    id text,
    type text,
    amount_idr bigint,
    previous_paid_amount_idr bigint,
    resulting_paid_amount_idr bigint,
    resulting_status text,
    method text,
    reference text,
    proof_id text,
    note text,
    occurred_at timestamptz,
    idempotency_key text,
    ledger_transaction_id text
  );

  -- Prove that no stored ledger event was removed or altered.
  if exists (
    select 1
    from public.order_payment_events ope
    where ope.order_id = p_order_id
      and not exists (
        select 1
        from jsonb_to_recordset(p_payment_events) as x(
          id text,
          type text,
          amount_idr bigint,
          previous_paid_amount_idr bigint,
          resulting_paid_amount_idr bigint,
          resulting_status text,
          method text,
          reference text,
          proof_id text,
          note text,
          occurred_at timestamptz,
          idempotency_key text,
          ledger_transaction_id text
        )
        where x.idempotency_key = ope.idempotency_key
          and x.id = ope.id
          and x.type = ope.type
          and x.amount_idr = ope.amount_idr
          and x.previous_paid_amount_idr = ope.previous_paid_amount_idr
          and x.resulting_paid_amount_idr = ope.resulting_paid_amount_idr
          and x.resulting_status = ope.resulting_status
          and x.method is not distinct from ope.method
          and x.reference is not distinct from ope.reference
          and x.proof_id is not distinct from ope.proof_id
          and x.note is not distinct from ope.note
          and x.occurred_at = ope.occurred_at
          and x.ledger_transaction_id is not distinct from ope.ledger_transaction_id
      )
  ) then
    raise exception 'PAYMENT_HISTORY_IS_APPEND_ONLY' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at, x.id), '[]'::jsonb)
  into v_new_payment_events
  from jsonb_to_recordset(p_payment_events) as x(
    id text,
    type text,
    amount_idr bigint,
    previous_paid_amount_idr bigint,
    resulting_paid_amount_idr bigint,
    resulting_status text,
    method text,
    reference text,
    proof_id text,
    note text,
    occurred_at timestamptz,
    idempotency_key text,
    ledger_transaction_id text
  )
  where not exists (
    select 1
    from public.order_payment_events ope
    where ope.idempotency_key = x.idempotency_key
  );

  v_locked := v_order.status in ('delivered','picked_up') and not v_order.edit_unlocked;
  v_finished := v_order.status in ('delivered','picked_up');

  v_details_changed :=
    v_requested_items is distinct from v_current_items
    or v_next.customer_id is distinct from v_order.customer_id
    or v_next.customer_name_snapshot is distinct from v_order.customer_name_snapshot
    or v_next.customer_whatsapp_snapshot is distinct from v_order.customer_whatsapp_snapshot
    or v_next.customer_email_snapshot is distinct from v_order.customer_email_snapshot
    or v_next.customer_profile_suggestions is distinct from v_order.customer_profile_suggestions
    or v_next.source is distinct from v_order.source
    or v_next.fulfillment is distinct from v_order.fulfillment
    or v_next.total_idr is distinct from v_order.total_idr
    or v_next.items_subtotal_idr is distinct from v_order.items_subtotal_idr
    or v_next.discount_idr is distinct from v_order.discount_idr
    or v_next.delivery_fee_idr is distinct from v_order.delivery_fee_idr
    or v_next.schedule_label is distinct from v_order.schedule_label
    or v_next.schedule_date is distinct from v_order.schedule_date
    or v_next.schedule_time is distinct from v_order.schedule_time
    or v_next.requested_pickup_date is distinct from v_order.requested_pickup_date
    or v_next.requested_pickup_time is distinct from v_order.requested_pickup_time
    or v_next.order_note is distinct from v_order.order_note
    or v_next.greeting_message is distinct from v_order.greeting_message
    or v_next.greeting_card_name is distinct from v_order.greeting_card_name
    or v_next.delivery_address is distinct from v_order.delivery_address
    or v_next.delivery_instructions is distinct from v_order.delivery_instructions
    or v_next.promo_code is distinct from v_order.promo_code;

  v_assignment_changed :=
    v_next.florist_display_name is distinct from v_order.florist_display_name
    or v_next.florist_assigned_employee_id is distinct from v_order.florist_assigned_employee_id
    or v_next.florist_assigned_at is distinct from v_order.florist_assigned_at
    or v_next.florist_assigned_for_date is distinct from v_order.florist_assigned_for_date
    or v_next.florist_assigned_for_time is distinct from v_order.florist_assigned_for_time
    or v_next.florist_assigned_by_employee_id is distinct from v_order.florist_assigned_by_employee_id
    or v_next.florist_assigned_by_name is distinct from v_order.florist_assigned_by_name
    or v_next.florist_schedule_override is distinct from v_order.florist_schedule_override
    or v_next.florist_schedule_override_reason is distinct from v_order.florist_schedule_override_reason
    or v_next.florist_scheduled_branch_id is distinct from v_order.florist_scheduled_branch_id
    or v_next.florist_assigned_branch_id is distinct from v_order.florist_assigned_branch_id
    or v_next.florist_scheduled_shift_start is distinct from v_order.florist_scheduled_shift_start
    or v_next.florist_scheduled_shift_end is distinct from v_order.florist_scheduled_shift_end
    or v_next.processing_started_at is distinct from v_order.processing_started_at
    or v_next.admin_handled_employee_id is distinct from v_order.admin_handled_employee_id
    or v_next.admin_handled_by_name is distinct from v_order.admin_handled_by_name;

  v_status_changed :=
    v_next.status is distinct from v_order.status
    or v_next.completed_at is distinct from v_order.completed_at
    or v_next.actual_picked_up_at is distinct from v_order.actual_picked_up_at;

  v_payment_changed :=
    v_next.payment_status is distinct from v_order.payment_status
    or v_next.payment_method is distinct from v_order.payment_method
    or v_next.paid_amount_idr is distinct from v_order.paid_amount_idr
    or v_new_payment_events <> '[]'::jsonb;

  v_refund_changed :=
    v_next.refund_amount_idr is distinct from v_order.refund_amount_idr
    or v_next.refund_reason is distinct from v_order.refund_reason
    or v_next.refund_initiated_by is distinct from v_order.refund_initiated_by
    or v_next.refund_initiated_at is distinct from v_order.refund_initiated_at
    or v_next.refund_completed_by is distinct from v_order.refund_completed_by
    or v_next.refund_completed_at is distinct from v_order.refund_completed_at
    or v_next.refund_cancelled_by is distinct from v_order.refund_cancelled_by
    or v_next.refund_cancelled_at is distinct from v_order.refund_cancelled_at
    or v_next.refund_cancellation_reason is distinct from v_order.refund_cancellation_reason;

  v_finance_changed :=
    v_next.finance_verified is distinct from v_order.finance_verified
    or v_next.finance_verified_by is distinct from v_order.finance_verified_by
    or v_next.finance_verified_at is distinct from v_order.finance_verified_at
    or v_next.finance_verification_status is distinct from v_order.finance_verification_status
    or v_next.finance_verification_note is distinct from v_order.finance_verification_note
    or v_next.finance_verification_actor is distinct from v_order.finance_verification_actor
    or v_next.finance_verification_at is distinct from v_order.finance_verification_at;

  v_change_control_changed :=
    v_next.pending_change_request is distinct from v_order.pending_change_request
    or v_next.edit_unlocked is distinct from v_order.edit_unlocked
    or v_next.finance_resubmitted_by is distinct from v_order.finance_resubmitted_by
    or v_next.finance_resubmitted_at is distinct from v_order.finance_resubmitted_at
    or v_next.finance_resubmission_note is distinct from v_order.finance_resubmission_note
    or v_next.finance_submission_revision is distinct from v_order.finance_submission_revision;

  v_submitted_change_request := v_order.pending_change_request is null and v_next.pending_change_request is not null;
  v_resolved_change_request := v_order.pending_change_request is not null and v_next.pending_change_request is null;
  v_finalizing_unlocked_edit := v_order.edit_unlocked and not v_next.edit_unlocked;
  v_resubmission :=
    v_order.finance_verification_status = 'rejected'
    and v_next.finance_verification_status is null
    and v_next.finance_resubmitted_at is not null
    and v_next.finance_resubmitted_at is distinct from v_order.finance_resubmitted_at;

  -- Active/unlocked operational edits: Owner/Admin. Locked edits: Finance.
  if (v_details_changed or v_assignment_changed or v_status_changed or v_payment_changed) then
    if v_locked then
      if v_profile.role <> 'finance' then
        -- Submitting/resolving a locked change request may also alter status or
        -- edit_unlocked; those special transitions are checked below.
        if not (v_resolved_change_request and v_next.status = 'cancelled')
          and not (v_resolved_change_request and v_next.edit_unlocked)
        then
          raise exception 'ORDER_LOCKED_FINANCE_REVIEW_REQUIRED' using errcode = '42501';
        end if;
      end if;
    elsif v_profile.role not in ('owner','admin') then
      raise exception 'FINANCE_GENERAL_ORDERS_READ_ONLY' using errcode = '42501';
    end if;
  end if;

  -- Normal status changes follow the fulfillment pipeline. One-step backward
  -- is allowed for the app's exact Undo path; terminal exception states never
  -- become mutable again.
  if v_next.status is distinct from v_order.status then
    if v_order.status in ('cancelled','failed') then
      raise exception 'TERMINAL_ORDER_IMMUTABLE' using errcode = '42501';
    end if;

    if v_locked and v_next.status <> 'cancelled' then
      raise exception 'LOCKED_ORDER_STATUS_REQUIRES_CANCELLATION_FLOW' using errcode = '42501';
    end if;

    if v_resolved_change_request and v_next.status = 'cancelled' then
      if v_profile.role not in ('owner','finance')
        or coalesce(v_order.pending_change_request->>'type', '') <> 'cancel'
        or not v_finished
      then
        raise exception 'INVALID_CANCELLATION_APPROVAL' using errcode = '42501';
      end if;
    elsif v_next.status = 'cancelled' then
      if v_locked and v_profile.role <> 'finance' then
        raise exception 'LOCKED_CANCELLATION_REQUIRES_APPROVAL' using errcode = '42501';
      end if;
    elsif v_next.status = 'failed' then
      if v_finished then
        raise exception 'FINISHED_ORDER_CANNOT_FAIL' using errcode = '22023';
      end if;
    else
      v_pipeline := case v_order.fulfillment
        when 'delivery' then array['pending_verification','confirmed','processing','ready','delivering','delivered']::text[]
        else array['pending_verification','confirmed','processing','ready','picked_up']::text[]
      end;
      v_current_status_index := array_position(v_pipeline, v_order.status);
      v_next_status_index := array_position(v_pipeline, v_next.status);
      if v_current_status_index is null or v_next_status_index is null
        or abs(v_next_status_index - v_current_status_index) <> 1
      then
        raise exception 'ILLEGAL_ORDER_STATUS_TRANSITION' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Outstanding balances cannot advance to courier handoff / pickup.
  if v_next.status in ('delivering','picked_up')
    and v_next.payment_status in ('unpaid','partial')
  then
    raise exception 'OUTSTANDING_PAYMENT_BLOCKS_FULFILLMENT' using errcode = '22023';
  end if;

  -- Change-request lifecycle is explicit and server-authorized.
  if v_submitted_change_request then
    v_request_type := coalesce(v_next.pending_change_request->>'type', '');
    v_request_reason := nullif(trim(coalesce(v_next.pending_change_request->>'reason', '')), '');
    if v_profile.role not in ('owner','admin') or not v_locked then
      raise exception 'CHANGE_REQUEST_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_request_type not in ('edit','cancel') or v_request_reason is null then
      raise exception 'INVALID_CHANGE_REQUEST' using errcode = '22023';
    end if;
  elsif v_order.pending_change_request is not null
    and v_next.pending_change_request is not null
    and v_next.pending_change_request is distinct from v_order.pending_change_request
  then
    raise exception 'PENDING_CHANGE_REQUEST_IMMUTABLE' using errcode = '42501';
  end if;

  if v_resolved_change_request then
    if v_profile.role not in ('owner','finance') then
      raise exception 'CHANGE_REQUEST_RESOLUTION_NOT_PERMITTED' using errcode = '42501';
    end if;
    v_request_type := coalesce(v_order.pending_change_request->>'type', '');
    if v_next.edit_unlocked and v_request_type <> 'edit' then
      raise exception 'EDIT_UNLOCK_REQUIRES_EDIT_REQUEST' using errcode = '22023';
    end if;
    if v_next.status = 'cancelled' and v_request_type <> 'cancel' then
      raise exception 'CANCEL_REQUIRES_CANCELLATION_REQUEST' using errcode = '22023';
    end if;
  end if;

  -- No caller may toggle edit/change-control metadata as an arbitrary JSON
  -- patch. Every allowed shape must correspond to one explicit workflow.
  if not v_order.edit_unlocked and v_next.edit_unlocked then
    if not (
      (v_resolved_change_request and coalesce(v_order.pending_change_request->>'type', '') = 'edit')
      or (v_profile.role in ('owner','finance') and v_next.finance_verification_status = 'rejected')
    ) then
      raise exception 'EDIT_UNLOCK_NOT_PERMITTED' using errcode = '42501';
    end if;
  end if;

  if (
    v_next.finance_resubmitted_by is distinct from v_order.finance_resubmitted_by
    or v_next.finance_resubmitted_at is distinct from v_order.finance_resubmitted_at
    or v_next.finance_resubmission_note is distinct from v_order.finance_resubmission_note
    or v_next.finance_submission_revision is distinct from v_order.finance_submission_revision
  ) and not v_resubmission then
    raise exception 'FINANCE_RESUBMISSION_METADATA_NOT_PERMITTED' using errcode = '42501';
  end if;

  -- An unlocked edit is consumed exactly once by Admin/Owner. It must re-lock
  -- and, if Finance had already verified it, clear the stale verification.
  if v_finalizing_unlocked_edit then
    if v_profile.role not in ('owner','admin') then
      raise exception 'EDIT_FINALIZATION_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_order.finance_verified then
      if v_next.finance_verified
        or v_next.finance_verified_by is not null
        or v_next.finance_verified_at is not null
      then
        raise exception 'EDIT_MUST_RESET_FINANCE_VERIFICATION' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Finance decision fields are Finance/Owner-only except for the exact
  -- Admin/Owner resubmission/reset paths produced by the application domain.
  if v_finance_changed then
    if v_resubmission then
      if v_profile.role not in ('owner','admin') or not v_finished then
        raise exception 'FINANCE_RESUBMIT_NOT_PERMITTED' using errcode = '42501';
      end if;
      if nullif(trim(coalesce(v_next.finance_resubmission_note, '')), '') is null then
        raise exception 'FINANCE_RESUBMISSION_NOTE_REQUIRED' using errcode = '22023';
      end if;
    elsif v_finalizing_unlocked_edit and v_profile.role in ('owner','admin') then
      -- Covered by the one-time edit finalization check above.
      null;
    elsif v_profile.role not in ('owner','finance') then
      raise exception 'FINANCE_FIELDS_REQUIRE_FINANCE_OR_OWNER' using errcode = '42501';
    end if;
  end if;

  if v_next.finance_verified then
    if v_profile.role not in ('owner','finance') then
      raise exception 'FINANCE_VERIFICATION_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_next.status not in ('delivered','picked_up') then
      raise exception 'ORDER_NOT_FINISHED_FOR_VERIFICATION' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(v_next.finance_verified_by, '')), '') is null
      or v_next.finance_verified_at is null
    then
      raise exception 'FINANCE_VERIFICATION_EVIDENCE_REQUIRED' using errcode = '22023';
    end if;
  end if;

  if v_next.finance_verification_status in ('rejected','review') then
    if v_profile.role not in ('owner','finance') or not v_finished then
      raise exception 'FINANCE_DECISION_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_next.finance_verification_status = 'rejected'
      and nullif(trim(coalesce(v_next.finance_verification_note, '')), '') is null
    then
      raise exception 'FINANCE_REJECTION_NOTE_REQUIRED' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(v_next.finance_verification_actor, '')), '') is null
      or v_next.finance_verification_at is null
    then
      raise exception 'FINANCE_DECISION_EVIDENCE_REQUIRED' using errcode = '22023';
    end if;
  end if;

  -- Refund state is Owner/Finance-only; completion itself is Finance-only.
  if v_refund_changed then
    if v_profile.role not in ('owner','finance') then
      raise exception 'REFUND_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_next.refund_completed_at is distinct from v_order.refund_completed_at
      and v_next.refund_completed_at is not null
      and v_profile.role <> 'finance'
    then
      raise exception 'REFUND_COMPLETION_REQUIRES_FINANCE' using errcode = '42501';
    end if;
  end if;

  -- New payment events are authoritative append-only ledger entries. Their
  -- role and aggregate result must agree with the resulting Order state.
  if v_new_payment_events <> '[]'::jsonb then
    for v_event in select value from jsonb_array_elements(v_new_payment_events)
    loop
      v_event_type := v_event->>'type';
      if v_event_type = 'refund_completed' and v_profile.role <> 'finance' then
        raise exception 'REFUND_COMPLETION_REQUIRES_FINANCE' using errcode = '42501';
      end if;
      if v_event_type in ('refund_initiated','refund_cancelled','refund_completed')
        and v_profile.role not in ('owner','finance')
      then
        raise exception 'REFUND_EVENT_NOT_PERMITTED' using errcode = '42501';
      end if;
      if v_event_type in ('payment_received','payment_reversed','payment_status_adjusted') then
        if v_locked and v_profile.role <> 'finance' then
          raise exception 'LOCKED_PAYMENT_REQUIRES_FINANCE' using errcode = '42501';
        elsif not v_locked and v_profile.role not in ('owner','admin') then
          raise exception 'PAYMENT_EVENT_NOT_PERMITTED' using errcode = '42501';
        end if;
      end if;
      v_last_new_event := v_event;
    end loop;

    if (v_last_new_event->>'resulting_paid_amount_idr')::bigint <> v_next.paid_amount_idr
      or v_last_new_event->>'resulting_status' <> v_next.payment_status
    then
      raise exception 'PAYMENT_EVENT_AGGREGATE_MISMATCH' using errcode = '22023';
    end if;
  elsif v_next.payment_status is distinct from v_order.payment_status
    or v_next.paid_amount_idr is distinct from v_order.paid_amount_idr
  then
    raise exception 'PAYMENT_CHANGE_REQUIRES_LEDGER_EVENT' using errcode = '22023';
  end if;

  v_before := to_jsonb(v_order);

  -- Keep item ids order-scoped and write the complete desired snapshot.
  insert into public.order_items (
    id, order_id, product_id, variant_id, product_code_snapshot,
    product_name_snapshot, variant_sku_snapshot, variant_size_snapshot,
    quantity, unit_price_idr
  )
  select
    x.id, p_order_id, x.product_id, x.variant_id, x.product_code_snapshot,
    x.product_name_snapshot, x.variant_sku_snapshot, x.variant_size_snapshot,
    x.quantity, x.unit_price_idr
  from jsonb_to_recordset(p_items) as x(
    id text,
    product_id text,
    variant_id text,
    product_code_snapshot text,
    product_name_snapshot text,
    variant_sku_snapshot text,
    variant_size_snapshot text,
    quantity integer,
    unit_price_idr bigint
  )
  on conflict (id) do update set
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    product_code_snapshot = excluded.product_code_snapshot,
    product_name_snapshot = excluded.product_name_snapshot,
    variant_sku_snapshot = excluded.variant_sku_snapshot,
    variant_size_snapshot = excluded.variant_size_snapshot,
    quantity = excluded.quantity,
    unit_price_idr = excluded.unit_price_idr
  where public.order_items.order_id = p_order_id;

  delete from public.order_items oi
  where oi.order_id = p_order_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_items) as x(id text)
      where x.id = oi.id
    );

  -- New payment entries are written with the authenticated staff identity;
  -- actor identity is never trusted from browser JSON.
  insert into public.order_payment_events (
    id, order_id, type, amount_idr, previous_paid_amount_idr,
    resulting_paid_amount_idr, resulting_status, method, reference, proof_id,
    note, actor_id, actor_name, occurred_at, idempotency_key,
    ledger_transaction_id
  )
  select
    x.id,
    p_order_id,
    x.type,
    x.amount_idr,
    x.previous_paid_amount_idr,
    x.resulting_paid_amount_idr,
    x.resulting_status,
    x.method,
    x.reference,
    x.proof_id,
    x.note,
    v_profile.employee_id,
    v_actor_name,
    x.occurred_at,
    x.idempotency_key,
    x.ledger_transaction_id
  from jsonb_to_recordset(p_payment_events) as x(
    id text,
    type text,
    amount_idr bigint,
    previous_paid_amount_idr bigint,
    resulting_paid_amount_idr bigint,
    resulting_status text,
    method text,
    reference text,
    proof_id text,
    note text,
    occurred_at timestamptz,
    idempotency_key text,
    ledger_transaction_id text
  )
  where not exists (
    select 1 from public.order_payment_events ope
    where ope.idempotency_key = x.idempotency_key
  );

  update public.orders
  set
    customer_id = v_next.customer_id,
    customer_name_snapshot = v_next.customer_name_snapshot,
    customer_whatsapp_snapshot = v_next.customer_whatsapp_snapshot,
    customer_email_snapshot = v_next.customer_email_snapshot,
    customer_profile_suggestions = v_next.customer_profile_suggestions,
    source = v_next.source,
    fulfillment = v_next.fulfillment,
    status = v_next.status,
    total_idr = v_next.total_idr,
    items_subtotal_idr = v_next.items_subtotal_idr,
    discount_idr = v_next.discount_idr,
    delivery_fee_idr = v_next.delivery_fee_idr,
    payment_status = v_next.payment_status,
    payment_method = v_next.payment_method,
    paid_amount_idr = v_next.paid_amount_idr,
    refund_amount_idr = v_next.refund_amount_idr,
    refund_reason = v_next.refund_reason,
    refund_initiated_by = v_next.refund_initiated_by,
    refund_initiated_at = v_next.refund_initiated_at,
    refund_completed_by = v_next.refund_completed_by,
    refund_completed_at = v_next.refund_completed_at,
    refund_cancelled_by = v_next.refund_cancelled_by,
    refund_cancelled_at = v_next.refund_cancelled_at,
    refund_cancellation_reason = v_next.refund_cancellation_reason,
    schedule_label = v_next.schedule_label,
    schedule_date = v_next.schedule_date,
    schedule_time = v_next.schedule_time,
    requested_pickup_date = v_next.requested_pickup_date,
    requested_pickup_time = v_next.requested_pickup_time,
    actual_picked_up_at = v_next.actual_picked_up_at,
    order_note = v_next.order_note,
    greeting_message = v_next.greeting_message,
    greeting_card_name = v_next.greeting_card_name,
    delivery_address = v_next.delivery_address,
    delivery_instructions = v_next.delivery_instructions,
    promo_code = v_next.promo_code,
    florist_display_name = v_next.florist_display_name,
    florist_assigned_employee_id = v_next.florist_assigned_employee_id,
    florist_assigned_at = v_next.florist_assigned_at,
    florist_assigned_for_date = v_next.florist_assigned_for_date,
    florist_assigned_for_time = v_next.florist_assigned_for_time,
    florist_assigned_by_employee_id = v_next.florist_assigned_by_employee_id,
    florist_assigned_by_name = v_next.florist_assigned_by_name,
    florist_schedule_override = v_next.florist_schedule_override,
    florist_schedule_override_reason = v_next.florist_schedule_override_reason,
    florist_scheduled_branch_id = v_next.florist_scheduled_branch_id,
    florist_assigned_branch_id = v_next.florist_assigned_branch_id,
    florist_scheduled_shift_start = v_next.florist_scheduled_shift_start,
    florist_scheduled_shift_end = v_next.florist_scheduled_shift_end,
    processing_started_at = v_next.processing_started_at,
    admin_handled_employee_id = v_next.admin_handled_employee_id,
    admin_handled_by_name = v_next.admin_handled_by_name,
    completed_at = v_next.completed_at,
    finance_verified = v_next.finance_verified,
    finance_verified_by = v_next.finance_verified_by,
    finance_verified_at = v_next.finance_verified_at,
    finance_verification_status = v_next.finance_verification_status,
    finance_verification_note = v_next.finance_verification_note,
    finance_verification_actor = v_next.finance_verification_actor,
    finance_verification_at = v_next.finance_verification_at,
    finance_resubmitted_by = v_next.finance_resubmitted_by,
    finance_resubmitted_at = v_next.finance_resubmitted_at,
    finance_resubmission_note = v_next.finance_resubmission_note,
    finance_submission_revision = v_next.finance_submission_revision,
    pending_change_request = v_next.pending_change_request,
    edit_unlocked = v_next.edit_unlocked,
    revision = p_next_revision
  where id = p_order_id
    and revision = p_expected_revision
  returning * into v_next;

  if not found then
    raise exception 'REVISION_CONFLICT:order:%:lost_update', p_order_id using errcode = '40001';
  end if;

  -- trg_orders_bump_revision is authoritative; assert that the mutation
  -- advanced exactly the revision the caller expected.
  if v_next.revision <> p_next_revision then
    raise exception 'ORDER_REVISION_TRIGGER_MISMATCH' using errcode = '40001';
  end if;

  v_after := to_jsonb(v_next);
  perform private.write_audit_event(
    'order.operational.save',
    'order',
    p_order_id,
    'succeeded',
    p_expected_revision,
    v_next.revision,
    v_before,
    v_after,
    jsonb_build_object(
      'detailsChanged', v_details_changed,
      'assignmentChanged', v_assignment_changed,
      'statusChanged', v_status_changed,
      'paymentChanged', v_payment_changed,
      'refundChanged', v_refund_changed,
      'financeChanged', v_finance_changed,
      'changeControlChanged', v_change_control_changed
    )
  );

  return jsonb_build_object(
    'id', v_next.id,
    'revision', v_next.revision,
    'updatedAt', v_next.updated_at
  );
end;
$$;

revoke execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  from public, anon;
grant execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Repair the accidental mixed-case Size Guide role literals.
-- ---------------------------------------------------------------------------
drop policy if exists size_guide_templates_editor_insert on public.size_guide_templates;
drop policy if exists size_guide_templates_editor_update on public.size_guide_templates;
drop policy if exists size_guide_templates_editor_delete on public.size_guide_templates;
create policy size_guide_templates_editor_insert on public.size_guide_templates
  for insert to authenticated
  with check (private.has_staff_role(array['owner','admin']));
create policy size_guide_templates_editor_update on public.size_guide_templates
  for update to authenticated
  using (private.has_staff_role(array['owner','admin']))
  with check (private.has_staff_role(array['owner','admin']));
create policy size_guide_templates_editor_delete on public.size_guide_templates
  for delete to authenticated
  using (private.has_staff_role(array['owner','admin']));

drop policy if exists size_guide_targets_editor_insert on public.size_guide_targets;
drop policy if exists size_guide_targets_editor_update on public.size_guide_targets;
drop policy if exists size_guide_targets_editor_delete on public.size_guide_targets;
create policy size_guide_targets_editor_insert on public.size_guide_targets
  for insert to authenticated
  with check (private.has_staff_role(array['owner','admin']));
create policy size_guide_targets_editor_update on public.size_guide_targets
  for update to authenticated
  using (private.has_staff_role(array['owner','admin']))
  with check (private.has_staff_role(array['owner','admin']));
create policy size_guide_targets_editor_delete on public.size_guide_targets
  for delete to authenticated
  using (private.has_staff_role(array['owner','admin']));

-- ---------------------------------------------------------------------------
-- First-owner provisioning: no personal identity is embedded in migrations.
-- A trusted admin/service sets auth.users.raw_app_meta_data.fleurstales_role
-- to "owner" for the intended first account. app_metadata is not user-editable.
-- ---------------------------------------------------------------------------
drop trigger if exists bootstrap_fleurstales_owner_profile on auth.users;
drop function if exists private.bootstrap_fleurstales_owner_profile();

create or replace function private.bootstrap_fleurstales_owner_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.raw_app_meta_data ->> 'fleurstales_role', '')) = 'owner'
    and not exists (
      select 1
      from public.staff_access_profiles
      where role = 'owner'
        and is_active = true
    )
  then
    insert into public.staff_access_profiles (
      user_id,
      employee_id,
      display_name,
      role,
      branch_id,
      is_active
    ) values (
      new.id,
      null,
      coalesce(nullif(new.raw_app_meta_data ->> 'fleurstales_display_name', ''), 'Fleurstales Owner'),
      'owner',
      null,
      true
    )
    on conflict (user_id) do update
      set role = 'owner',
          display_name = excluded.display_name,
          is_active = true,
          updated_at = now();
  end if;

  return new;
end;
$$;

revoke execute on function private.bootstrap_fleurstales_owner_from_app_metadata() from public, anon, authenticated;

create trigger bootstrap_fleurstales_owner_from_app_metadata
after insert or update of raw_app_meta_data on auth.users
for each row
execute function private.bootstrap_fleurstales_owner_from_app_metadata();

-- Backfill an already-created account that was provisioned with app_metadata.
insert into public.staff_access_profiles (
  user_id,
  employee_id,
  display_name,
  role,
  branch_id,
  is_active
)
select
  u.id,
  null,
  coalesce(nullif(u.raw_app_meta_data ->> 'fleurstales_display_name', ''), 'Fleurstales Owner'),
  'owner',
  null,
  true
from auth.users u
where lower(coalesce(u.raw_app_meta_data ->> 'fleurstales_role', '')) = 'owner'
  and not exists (
    select 1
    from public.staff_access_profiles sap
    where sap.role = 'owner'
      and sap.is_active = true
  )
order by u.created_at asc
limit 1
on conflict (user_id) do nothing;

commit;
