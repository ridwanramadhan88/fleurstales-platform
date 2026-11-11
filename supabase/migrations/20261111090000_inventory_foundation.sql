-- M5a: server-side inventory foundation for the Manager.
--
-- * inventory_items: stock lines per branch. Independent of the product
--   catalog and recipes. Quantity only changes through movements.
-- * inventory_suppliers
-- * inventory_purchases: the Manager records a purchase directly (stock arrives
--   at once); it waits for Finance, who confirm or reject it. The Finance
--   expense row itself is created by the OS client on confirmation, because
--   Finance ledger rows still live in the operational snapshot.
-- * inventory_movements: append-only quantity history.
-- All tables: RLS on, no direct table privileges. Everything goes through RPCs.
begin;

insert into private.action_capability_registry (capability, parent_section, requires_edit, allowed_roles)
values
  ('inventory.manage', 'dashboard', false, array['owner', 'manager']),
  ('inventory.confirm_purchase', 'dashboard', false, array['owner', 'finance'])
on conflict (capability) do update
set parent_section = excluded.parent_section,
    requires_edit = excluded.requires_edit,
    allowed_roles = excluded.allowed_roles;

insert into private.role_action_permissions (role, capability, enabled)
select r.role, c.capability,
       case c.capability
         when 'inventory.manage' then r.role in ('owner', 'manager')
         else r.role in ('owner', 'finance')
       end
from (select distinct role from private.role_action_permissions) r
cross join (values ('inventory.manage'), ('inventory.confirm_purchase')) c(capability)
on conflict (role, capability) do update
set enabled = excluded.enabled, updated_at = now();

create table public.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text check (phone is null or char_length(phone) <= 30),
  note text check (note is null or char_length(note) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index inventory_suppliers_name_idx on public.inventory_suppliers (lower(btrim(name)));

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  category text not null check (category in ('flowers', 'greens', 'packaging', 'supplies', 'other')),
  unit text not null check (char_length(btrim(unit)) between 1 and 20),
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  low_stock_threshold numeric(12, 2) not null default 0 check (low_stock_threshold >= 0),
  last_unit_cost_idr bigint check (last_unit_cost_idr is null or last_unit_cost_idr >= 0),
  avg_unit_cost_idr bigint check (avg_unit_cost_idr is null or avg_unit_cost_idr >= 0),
  is_perishable boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index inventory_items_branch_name_idx on public.inventory_items (branch_id, lower(btrim(name)));

create table public.inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  branch_id text not null references public.branches(id),
  supplier_id uuid references public.inventory_suppliers(id),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_cost_idr bigint not null check (unit_cost_idr >= 0),
  total_idr bigint not null check (total_idr >= 0),
  funding_account_id text not null,
  purchased_on date not null,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending_finance' check (status in ('pending_finance', 'confirmed', 'rejected')),
  recorded_by uuid not null,
  recorded_by_name text not null,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  constraint inventory_purchases_decision_consistent check (
    (status = 'pending_finance' and decided_at is null and decided_by is null)
    or (status <> 'pending_finance' and decided_at is not null and decided_by is not null)
  )
);
create index inventory_purchases_status_idx on public.inventory_purchases (status, created_at desc);
create index inventory_purchases_item_idx on public.inventory_purchases (item_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  branch_id text not null references public.branches(id),
  kind text not null check (kind in ('purchase', 'purchase_reversal', 'usage', 'waste', 'adjustment', 'transfer_in', 'transfer_out')),
  quantity_delta numeric(12, 2) not null,
  quantity_after numeric(12, 2) not null,
  reason text check (reason is null or char_length(reason) <= 300),
  purchase_id uuid references public.inventory_purchases(id),
  actor_id uuid not null,
  actor_name text not null,
  created_at timestamptz not null default now()
);
create index inventory_movements_item_idx on public.inventory_movements (item_id, created_at desc);

alter table public.inventory_suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_movements enable row level security;
revoke all on table public.inventory_suppliers, public.inventory_items, public.inventory_purchases, public.inventory_movements from anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function private.inventory_actor_name(p_role text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(trim(display_name), '') from public.staff_access_profiles
      where user_id = (select auth.uid()) and is_active = true limit 1),
    initcap(p_role))
$$;
revoke execute on function private.inventory_actor_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.save_inventory_supplier(p_id uuid, p_name text, p_phone text, p_note text, p_is_active boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_id uuid;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager')
     or not private.has_action_permission('inventory.manage') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.inventory_suppliers (name, phone, note, is_active)
    values (btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.inventory_suppliers
    set name = btrim(p_name), phone = nullif(btrim(coalesce(p_phone, '')), ''),
        note = nullif(btrim(coalesce(p_note, '')), ''), is_active = coalesce(p_is_active, is_active)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'SUPPLIER_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', v_id);
exception when unique_violation then
  raise exception 'A supplier with this name already exists.' using errcode = '23505';
end;
$function$;
revoke all on function public.save_inventory_supplier(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.save_inventory_supplier(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Quantity is not editable here; it only moves through purchases/movements.
create or replace function public.save_inventory_item(
  p_id uuid, p_branch_id text, p_name text, p_category text, p_unit text,
  p_low_stock_threshold numeric, p_is_perishable boolean, p_is_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_id uuid;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager')
     or not private.has_action_permission('inventory.manage') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_id is null then
    if not exists (select 1 from public.branches where id = p_branch_id) then
      raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into public.inventory_items (branch_id, name, category, unit, low_stock_threshold, is_perishable, is_archived)
    values (p_branch_id, btrim(p_name), p_category, btrim(p_unit), coalesce(p_low_stock_threshold, 0), coalesce(p_is_perishable, false), coalesce(p_is_archived, false))
    returning id into v_id;
  else
    update public.inventory_items
    set name = btrim(p_name), category = p_category, unit = btrim(p_unit),
        low_stock_threshold = coalesce(p_low_stock_threshold, low_stock_threshold),
        is_perishable = coalesce(p_is_perishable, is_perishable),
        is_archived = coalesce(p_is_archived, is_archived),
        updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', v_id);
exception when unique_violation then
  raise exception 'An item with this name already exists in this branch.' using errcode = '23505';
end;
$function$;
revoke all on function public.save_inventory_item(uuid, text, text, text, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.save_inventory_item(uuid, text, text, text, text, numeric, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.record_inventory_purchase(
  p_item_id uuid, p_supplier_id uuid, p_quantity numeric, p_unit_cost_idr bigint,
  p_funding_account_id text, p_purchased_on date, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_name text;
  v_item public.inventory_items%rowtype;
  v_id uuid;
  v_new_qty numeric(12, 2);
  v_avg bigint;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager')
     or not private.has_action_permission('inventory.manage') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_unit_cost_idr is null or p_unit_cost_idr < 0 then
    raise exception 'Quantity must be positive and the price cannot be negative.' using errcode = '22023';
  end if;
  if p_purchased_on is null or p_purchased_on > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'The purchase date cannot be in the future.' using errcode = '22023';
  end if;
  if p_funding_account_id is null or not private.finance_account_is_valid(p_funding_account_id) then
    raise exception 'Choose a valid funding account.' using errcode = '22023';
  end if;
  if p_supplier_id is not null and not exists (select 1 from public.inventory_suppliers where id = p_supplier_id and is_active) then
    raise exception 'SUPPLIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found or v_item.is_archived then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_name := private.inventory_actor_name(v_role);
  v_new_qty := v_item.quantity + p_quantity;
  v_avg := round(((v_item.quantity * coalesce(v_item.avg_unit_cost_idr, p_unit_cost_idr)) + (p_quantity * p_unit_cost_idr)) / v_new_qty);

  insert into public.inventory_purchases (item_id, branch_id, supplier_id, quantity, unit_cost_idr, total_idr, funding_account_id,
                                          purchased_on, note, recorded_by, recorded_by_name)
  values (v_item.id, v_item.branch_id, p_supplier_id, p_quantity, p_unit_cost_idr, round(p_quantity * p_unit_cost_idr), p_funding_account_id,
          p_purchased_on, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()), v_name)
  returning id into v_id;

  update public.inventory_items
  set quantity = v_new_qty, last_unit_cost_idr = p_unit_cost_idr, avg_unit_cost_idr = v_avg, updated_at = now()
  where id = v_item.id;

  insert into public.inventory_movements (item_id, branch_id, kind, quantity_delta, quantity_after, reason, purchase_id, actor_id, actor_name)
  values (v_item.id, v_item.branch_id, 'purchase', p_quantity, v_new_qty, 'Purchase', v_id, (select auth.uid()), v_name);

  perform private.write_business_activity(
    'stock', v_item.id::text, v_item.branch_id, 'inventory_purchase_recorded',
    format('Purchase of %s %s %s recorded (awaiting Finance).', p_quantity, v_item.unit, v_item.name),
    jsonb_build_object('purchaseId', v_id, 'totalIdr', round(p_quantity * p_unit_cost_idr))
  );

  return jsonb_build_object('id', v_id, 'status', 'pending_finance', 'totalIdr', round(p_quantity * p_unit_cost_idr));
end;
$function$;
revoke all on function public.record_inventory_purchase(uuid, uuid, numeric, bigint, text, date, text) from public, anon;
grant execute on function public.record_inventory_purchase(uuid, uuid, numeric, bigint, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Finance decision. Confirming returns the fields the client needs to write the
-- ledger expense. Rejecting takes the purchased quantity back out of stock
-- (never below zero).
create or replace function public.decide_inventory_purchase(p_purchase_id uuid, p_decision text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_purchase public.inventory_purchases%rowtype;
  v_item public.inventory_items%rowtype;
  v_name text;
  v_new_qty numeric(12, 2);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'finance')
     or not private.has_action_permission('inventory.confirm_purchase') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_note is null then
    raise exception 'A reason is required to reject a purchase.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'The note is too long.' using errcode = '22023';
  end if;

  select * into v_purchase from public.inventory_purchases where id = p_purchase_id for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_purchase.status <> 'pending_finance' then
    return jsonb_build_object('id', v_purchase.id, 'status', v_purchase.status, 'alreadyDecided', true);
  end if;

  v_name := private.inventory_actor_name(v_role);
  update public.inventory_purchases
  set status = p_decision, decided_by = (select auth.uid()), decided_by_name = v_name, decided_at = now(), decision_note = v_note
  where id = v_purchase.id;

  select * into v_item from public.inventory_items where id = v_purchase.item_id for update;
  if p_decision = 'rejected' then
    v_new_qty := greatest(0, v_item.quantity - v_purchase.quantity);
    update public.inventory_items set quantity = v_new_qty, updated_at = now() where id = v_item.id;
    insert into public.inventory_movements (item_id, branch_id, kind, quantity_delta, quantity_after, reason, purchase_id, actor_id, actor_name)
    values (v_item.id, v_item.branch_id, 'purchase_reversal', v_new_qty - v_item.quantity, v_new_qty, coalesce(v_note, 'Purchase rejected'), v_purchase.id, (select auth.uid()), v_name);
  end if;

  perform private.write_business_activity(
    'stock', v_item.id::text, v_item.branch_id, 'inventory_purchase_' || p_decision,
    format('Purchase of %s was %s by Finance.', v_item.name, p_decision),
    jsonb_build_object('purchaseId', v_purchase.id, 'totalIdr', v_purchase.total_idr)
  );

  return jsonb_build_object(
    'id', v_purchase.id, 'status', p_decision, 'totalIdr', v_purchase.total_idr,
    'branchId', v_purchase.branch_id, 'fundingAccountId', v_purchase.funding_account_id,
    'purchasedOn', v_purchase.purchased_on, 'itemName', v_item.name);
end;
$function$;
revoke all on function public.decide_inventory_purchase(uuid, text, text) from public, anon;
grant execute on function public.decide_inventory_purchase(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.get_inventory_overview(p_branch_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_items jsonb;
  v_suppliers jsonb;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager', 'finance', 'admin') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'branchId', i.branch_id, 'name', i.name, 'category', i.category, 'unit', i.unit,
    'quantity', i.quantity, 'lowStockThreshold', i.low_stock_threshold,
    'lastUnitCostIdr', i.last_unit_cost_idr, 'avgUnitCostIdr', i.avg_unit_cost_idr,
    'isPerishable', i.is_perishable, 'isArchived', i.is_archived
  ) order by i.is_archived, i.name), '[]'::jsonb)
  into v_items
  from public.inventory_items i
  where p_branch_id is null or i.branch_id = p_branch_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'note', s.note, 'isActive', s.is_active) order by s.name), '[]'::jsonb)
  into v_suppliers
  from public.inventory_suppliers s;

  return jsonb_build_object('items', v_items, 'suppliers', v_suppliers);
end;
$function$;
revoke all on function public.get_inventory_overview(text) from public, anon;
grant execute on function public.get_inventory_overview(text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.get_inventory_purchases(p_status text default null, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_rows jsonb;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager', 'finance') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending_finance', 'confirmed', 'rejected') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(row_to_json_obj order by created_at desc), '[]'::jsonb) into v_rows
  from (
    select p.created_at, jsonb_build_object(
      'id', p.id, 'itemId', p.item_id, 'itemName', i.name, 'unit', i.unit, 'branchId', p.branch_id,
      'supplierId', p.supplier_id, 'supplierName', s.name,
      'quantity', p.quantity, 'unitCostIdr', p.unit_cost_idr, 'totalIdr', p.total_idr,
      'fundingAccountId', p.funding_account_id, 'purchasedOn', p.purchased_on, 'note', p.note,
      'status', p.status, 'recordedByName', p.recorded_by_name, 'createdAt', p.created_at,
      'decidedByName', p.decided_by_name, 'decidedAt', p.decided_at, 'decisionNote', p.decision_note
    ) as row_to_json_obj
    from public.inventory_purchases p
    join public.inventory_items i on i.id = p.item_id
    left join public.inventory_suppliers s on s.id = p.supplier_id
    where p_status is null or p.status = p_status
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  ) q;

  return v_rows;
end;
$function$;
revoke all on function public.get_inventory_purchases(text, integer) from public, anon;
grant execute on function public.get_inventory_purchases(text, integer) to authenticated;

do $verify$
begin
  if not private.has_action_permission_for_role('manager', 'inventory.manage')
     or private.has_action_permission_for_role('finance', 'inventory.manage')
     or private.has_action_permission_for_role('admin', 'inventory.manage')
     or not private.has_action_permission_for_role('finance', 'inventory.confirm_purchase')
     or private.has_action_permission_for_role('manager', 'inventory.confirm_purchase') then
    raise exception 'inventory capabilities were not stored as intended';
  end if;
end
$verify$;

commit;
