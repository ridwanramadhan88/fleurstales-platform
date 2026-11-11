-- M6: order issues ("kendala") and a late-orders view for the Manager.
--
-- * public.order_issues: staff report a problem on an order; the Manager (or
--   Owner) closes it with a note.
-- * public.get_operations_overview: late orders computed on read from the
--   order's own timestamps (scheduled slot vs when it was actually handed
--   over), plus open and recently resolved issues. Nothing is stored for
--   lateness, so history stays correct if a timestamp is ever corrected.
-- No customer name, phone or address leaves the server in the overview.
begin;

insert into private.action_capability_registry (capability, parent_section, requires_edit, allowed_roles)
values ('operations.manage_issues', 'dashboard', false, array['owner', 'manager'])
on conflict (capability) do update
set parent_section = excluded.parent_section,
    requires_edit = excluded.requires_edit,
    allowed_roles = excluded.allowed_roles;

insert into private.role_action_permissions (role, capability, enabled)
select r.role, 'operations.manage_issues', r.role in ('owner', 'manager')
from (select distinct role from private.role_action_permissions) r
on conflict (role, capability) do update
set enabled = excluded.enabled, updated_at = now();

create table public.order_issues (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  branch_id text references public.branches(id),
  kind text not null check (kind in ('late_production', 'late_courier', 'stock_out', 'complaint', 'wrong_product', 'other')),
  note text not null check (char_length(note) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  reported_by uuid not null,
  reported_by_name text not null,
  reported_by_role text not null,
  created_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_by_name text,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  constraint order_issues_resolution_consistent check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status = 'resolved' and resolved_at is not null and resolved_by is not null)
  )
);

create index order_issues_status_created_idx on public.order_issues (status, created_at desc);
create index order_issues_order_idx on public.order_issues (order_id);

alter table public.order_issues enable row level security;
revoke all on table public.order_issues from anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.report_order_issue(p_order_id text, p_kind text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_profile public.staff_access_profiles%rowtype;
  v_order public.orders%rowtype;
  v_note text := trim(coalesce(p_note, ''));
  v_id uuid;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'admin', 'florist', 'manager') then
    raise exception 'ORDER_ISSUE_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_kind not in ('late_production', 'late_courier', 'stock_out', 'complaint', 'wrong_product', 'other') then
    raise exception 'Unknown issue kind.' using errcode = '22023';
  end if;
  if char_length(v_note) not between 3 and 500 then
    raise exception 'The note must be between 3 and 500 characters.' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_profile from public.staff_access_profiles
  where user_id = (select auth.uid()) and is_active = true limit 1;

  insert into public.order_issues (order_id, branch_id, kind, note, reported_by, reported_by_name, reported_by_role)
  values (
    v_order.id, v_order.branch_id, p_kind, v_note, (select auth.uid()),
    coalesce(nullif(trim(v_profile.display_name), ''), initcap(v_role)), v_role
  ) returning id into v_id;

  perform private.write_business_activity(
    'order', v_order.id, v_order.branch_id, 'order_issue_reported',
    format('Issue reported on order %s: %s.', v_order.order_number, p_kind),
    jsonb_build_object('issueId', v_id, 'kind', p_kind)
  );

  return jsonb_build_object('id', v_id);
end;
$function$;

revoke all on function public.report_order_issue(text, text, text) from public, anon;
grant execute on function public.report_order_issue(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.resolve_order_issue(p_issue_id uuid, p_resolution_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_profile public.staff_access_profiles%rowtype;
  v_issue public.order_issues%rowtype;
  v_note text := nullif(trim(coalesce(p_resolution_note, '')), '');
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager')
     or not private.has_action_permission('operations.manage_issues') then
    raise exception 'ORDER_ISSUE_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'The resolution note is too long.' using errcode = '22023';
  end if;

  select * into v_issue from public.order_issues where id = p_issue_id for update;
  if not found then
    raise exception 'ISSUE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_issue.status = 'resolved' then
    return jsonb_build_object('id', v_issue.id, 'status', 'resolved', 'alreadyResolved', true);
  end if;

  select * into v_profile from public.staff_access_profiles
  where user_id = (select auth.uid()) and is_active = true limit 1;

  update public.order_issues
  set status = 'resolved',
      resolved_by = (select auth.uid()),
      resolved_by_name = coalesce(nullif(trim(v_profile.display_name), ''), initcap(v_role)),
      resolved_at = now(),
      resolution_note = v_note
  where id = p_issue_id;

  perform private.write_business_activity(
    'order', v_issue.order_id, v_issue.branch_id, 'order_issue_resolved',
    format('Issue (%s) resolved.', v_issue.kind),
    jsonb_build_object('issueId', v_issue.id, 'kind', v_issue.kind)
  );

  return jsonb_build_object('id', v_issue.id, 'status', 'resolved');
end;
$function$;

revoke all on function public.resolve_order_issue(uuid, text) from public, anon;
grant execute on function public.resolve_order_issue(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.get_operations_overview(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_late jsonb;
  v_issues jsonb;
begin
  if (select auth.uid()) is null or v_role not in ('owner', 'manager')
     or not private.has_action_permission('operations.manage_issues') then
    raise exception 'ORDER_ISSUE_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'The date range must be at most 62 days.' using errcode = '22023';
  end if;

  with base as (
    select o.id, o.order_number, o.branch_id, o.fulfillment, o.status,
           o.florist_display_name, o.delivery_courier_name,
           ((o.schedule_date + o.schedule_time) at time zone 'Asia/Jakarta') as due_at,
           case when o.fulfillment = 'pickup'
                then coalesce(o.actual_picked_up_at, o.completed_at, case when o.status = 'picked_up' then o.terminal_at end)
                else coalesce(o.completed_at, o.delivery_shipped_at, case when o.status = 'delivered' then o.terminal_at end)
           end as handed_at
    from public.orders o
    where o.schedule_date between p_from and p_to
      and o.schedule_time is not null
      and o.status not in ('cancelled', 'failed', 'pending_verification')
  ), measured as (
    select b.*,
           (b.handed_at is null and b.status not in ('delivered', 'picked_up')) as ongoing,
           floor(extract(epoch from (coalesce(b.handed_at, now()) - b.due_at)) / 60)::int as minutes_late
    from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'orderId', m.id,
           'orderNumber', m.order_number,
           'branchId', m.branch_id,
           'branchName', br.name,
           'fulfillment', m.fulfillment,
           'status', m.status,
           'dueAt', m.due_at,
           'handedAt', m.handed_at,
           'minutesLate', m.minutes_late,
           'ongoing', m.ongoing,
           'floristName', m.florist_display_name,
           'courierName', m.delivery_courier_name,
           'openIssues', (select count(*) from public.order_issues i where i.order_id = m.id and i.status = 'open')
         ) order by m.due_at desc), '[]'::jsonb)
  into v_late
  from (
    select * from measured
    where minutes_late > 0 and (ongoing or handed_at is not null)
    order by due_at desc
    limit 200
  ) m
  left join public.branches br on br.id = m.branch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'orderId', i.order_id,
           'orderNumber', o.order_number,
           'branchId', i.branch_id,
           'branchName', br.name,
           'kind', i.kind,
           'note', i.note,
           'status', i.status,
           'reportedByName', i.reported_by_name,
           'reportedByRole', i.reported_by_role,
           'createdAt', i.created_at,
           'resolvedByName', i.resolved_by_name,
           'resolvedAt', i.resolved_at,
           'resolutionNote', i.resolution_note
         ) order by (i.status = 'open') desc, i.created_at desc), '[]'::jsonb)
  into v_issues
  from (
    select * from public.order_issues
    where status = 'open' or created_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
    order by (status = 'open') desc, created_at desc
    limit 200
  ) i
  join public.orders o on o.id = i.order_id
  left join public.branches br on br.id = i.branch_id;

  return jsonb_build_object('from', p_from, 'to', p_to, 'lateOrders', v_late, 'issues', v_issues);
end;
$function$;

revoke all on function public.get_operations_overview(date, date) from public, anon;
grant execute on function public.get_operations_overview(date, date) to authenticated;

do $verify$
begin
  if not private.has_action_permission_for_role('manager', 'operations.manage_issues')
     or not private.has_action_permission_for_role('owner', 'operations.manage_issues')
     or private.has_action_permission_for_role('admin', 'operations.manage_issues')
     or private.has_action_permission_for_role('florist', 'operations.manage_issues') then
    raise exception 'operations.manage_issues was not stored as intended';
  end if;
end
$verify$;

commit;
