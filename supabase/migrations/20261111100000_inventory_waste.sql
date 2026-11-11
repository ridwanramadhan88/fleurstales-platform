-- M5b: waste records per branch with a value in rupiah and a period report.
-- Waste lowers stock through a movement; the value uses the item's average cost
-- at the moment it was recorded, so later price changes do not rewrite history.
begin;

create table public.inventory_waste (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  branch_id text not null references public.branches(id),
  quantity numeric(12, 2) not null check (quantity > 0),
  reason text not null check (reason in ('wilted', 'damaged', 'wrong_cut', 'arrangement_leftover', 'other')),
  note text check (note is null or char_length(note) <= 300),
  value_idr bigint not null check (value_idr >= 0),
  recorded_by uuid not null,
  recorded_by_name text not null,
  created_at timestamptz not null default now()
);
create index inventory_waste_created_idx on public.inventory_waste (created_at desc);
create index inventory_waste_branch_idx on public.inventory_waste (branch_id, created_at desc);

alter table public.inventory_waste enable row level security;
revoke all on table public.inventory_waste from anon, authenticated;

create or replace function public.record_inventory_waste(p_item_id uuid, p_quantity numeric, p_reason text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_name text;
  v_item public.inventory_items%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_value bigint;
  v_new_qty numeric(12, 2);
  v_id uuid;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager')
     or not private.has_action_permission('inventory.manage') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_reason not in ('wilted', 'damaged', 'wrong_cut', 'arrangement_leftover', 'other') then
    raise exception 'Unknown waste reason.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive.' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'A note is required when the reason is Other.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'The note is too long.' using errcode = '22023';
  end if;

  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_quantity > v_item.quantity then
    raise exception 'Waste is more than the stock on hand.' using errcode = '22023';
  end if;

  v_name := private.inventory_actor_name(v_role);
  v_new_qty := v_item.quantity - p_quantity;
  v_value := round(p_quantity * coalesce(v_item.avg_unit_cost_idr, 0));

  insert into public.inventory_waste (item_id, branch_id, quantity, reason, note, value_idr, recorded_by, recorded_by_name)
  values (v_item.id, v_item.branch_id, p_quantity, p_reason, v_note, v_value, (select auth.uid()), v_name)
  returning id into v_id;

  update public.inventory_items set quantity = v_new_qty, updated_at = now() where id = v_item.id;

  insert into public.inventory_movements (item_id, branch_id, kind, quantity_delta, quantity_after, reason, actor_id, actor_name)
  values (v_item.id, v_item.branch_id, 'waste', -p_quantity, v_new_qty, p_reason, (select auth.uid()), v_name);

  perform private.write_business_activity(
    'stock', v_item.id::text, v_item.branch_id, 'inventory_waste_recorded',
    format('Waste: %s %s %s (%s).', p_quantity, v_item.unit, v_item.name, p_reason),
    jsonb_build_object('wasteId', v_id, 'valueIdr', v_value)
  );

  return jsonb_build_object('id', v_id, 'valueIdr', v_value, 'quantityAfter', v_new_qty);
end;
$function$;
revoke all on function public.record_inventory_waste(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_inventory_waste(uuid, numeric, text, text) to authenticated;

create or replace function public.get_inventory_waste_report(p_from date, p_to date, p_branch_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_from timestamptz;
  v_to timestamptz;
  v_rows jsonb;
  v_total bigint;
  v_by_reason jsonb;
  v_by_branch jsonb;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager', 'finance') then
    raise exception 'INVENTORY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'The date range must be at most 366 days.' using errcode = '22023';
  end if;
  v_from := p_from::timestamp at time zone 'Asia/Jakarta';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';

  select coalesce(sum(w.value_idr), 0) into v_total
  from public.inventory_waste w
  where w.created_at >= v_from and w.created_at < v_to and (p_branch_id is null or w.branch_id = p_branch_id);

  select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n, 'valueIdr', r.v) order by r.v desc), '[]'::jsonb) into v_by_reason
  from (select w.reason, count(*) n, sum(w.value_idr) v from public.inventory_waste w
        where w.created_at >= v_from and w.created_at < v_to and (p_branch_id is null or w.branch_id = p_branch_id)
        group by w.reason) r;

  select coalesce(jsonb_agg(jsonb_build_object('branchId', b.branch_id, 'branchName', br.name, 'count', b.n, 'valueIdr', b.v) order by b.v desc), '[]'::jsonb) into v_by_branch
  from (select w.branch_id, count(*) n, sum(w.value_idr) v from public.inventory_waste w
        where w.created_at >= v_from and w.created_at < v_to and (p_branch_id is null or w.branch_id = p_branch_id)
        group by w.branch_id) b
  left join public.branches br on br.id = b.branch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'itemName', q.name, 'unit', q.unit, 'branchId', q.branch_id, 'branchName', q.branch_name,
    'quantity', q.quantity, 'reason', q.reason, 'note', q.note, 'valueIdr', q.value_idr,
    'recordedByName', q.recorded_by_name, 'createdAt', q.created_at
  ) order by q.created_at desc), '[]'::jsonb) into v_rows
  from (
    select w.*, i.name, i.unit, br.name as branch_name
    from public.inventory_waste w
    join public.inventory_items i on i.id = w.item_id
    left join public.branches br on br.id = w.branch_id
    where w.created_at >= v_from and w.created_at < v_to and (p_branch_id is null or w.branch_id = p_branch_id)
    order by w.created_at desc
    limit 500
  ) q;

  return jsonb_build_object('from', p_from, 'to', p_to, 'totalValueIdr', v_total, 'byReason', v_by_reason, 'byBranch', v_by_branch, 'rows', v_rows);
end;
$function$;
revoke all on function public.get_inventory_waste_report(date, date, text) from public, anon;
grant execute on function public.get_inventory_waste_report(date, date, text) to authenticated;

commit;
