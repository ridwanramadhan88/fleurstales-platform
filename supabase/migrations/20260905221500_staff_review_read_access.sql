-- Read-only review/customer/order visibility for Owner, Admin, Finance, and HR.
-- Review tables remain private; staff access goes through one narrow RPC.
-- Admin branch ownership is an order-mutation rule, never a read filter.

begin;

-- HR joins the existing read-only Orders and Customers surfaces. Owner/Admin/
-- Finance already have these sections. Keep HR at view level only.
update private.role_section_permissions
set access_level = 'view', updated_at = now()
where role = 'hr'
  and section in ('orders', 'customers');

insert into private.role_action_permissions(role, capability, enabled, updated_at)
values ('hr', 'orders.read_all', true, now())
on conflict (role, capability) do update
set enabled = excluded.enabled,
    updated_at = excluded.updated_at;

-- Force clients to refresh the authoritative permission snapshot.
update private.authorization_state
set revision = revision + 1,
    updated_at = now()
where id = 'primary';

-- Read visibility and operational branch ownership are deliberately separate.
-- Anyone with orders.read_all reads company-wide (Owner/Admin/Finance/HR).
-- Florist reads remain assigned-employee-only, including intentional cross-branch
-- assignments; branch membership must not hide an explicitly assigned order.
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
  v_employee_id text := private.current_staff_employee_id();
begin
  -- Keep the historical signature because RLS callers pass branch_id. Branch
  -- is intentionally not part of the read-visibility decision anymore.
  if private.has_action_permission('orders.read_all') then
    return true;
  end if;

  if private.has_action_permission('orders.read_assigned') then
    return v_employee_id is not null
      and v_employee_id = p_florist_employee_id;
  end if;

  return false;
end;
$$;
revoke execute on function private.can_read_order_row(text, text) from public, anon;
grant execute on function private.can_read_order_row(text, text) to authenticated;

-- One server-level invariant protects every current and future Order mutation
-- path. This catches generic edits as well as direct RPCs such as Storefront
-- confirm/cancel and atomic Process Order, which otherwise update orders
-- directly. Owner/service/Storefront calls are unaffected.
create or replace function private.enforce_admin_order_mutation_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
  v_order_branch text := case when tg_op = 'DELETE' then old.branch_id else new.branch_id end;
  v_operational_branch text;
begin
  if v_role is distinct from 'admin' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_operational_branch := private.current_staff_branch_id();
  if v_operational_branch is null or v_operational_branch is distinct from v_order_branch then
    raise exception 'ORDER_OUTSIDE_BRANCH_SCOPE' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function private.enforce_admin_order_mutation_branch() from public, anon, authenticated;

drop trigger if exists enforce_admin_order_mutation_branch on public.orders;
create trigger enforce_admin_order_mutation_branch
before insert or update or delete on public.orders
for each row execute function private.enforce_admin_order_mutation_branch();

-- CRM visibility follows the authoritative section permission instead of a
-- hard-coded role list. Mutation authority remains unchanged.
drop policy if exists customers_crm_read on public.customers;
create policy customers_crm_read on public.customers
for select to authenticated
using (private.has_section_access('customers', 'view'));

drop policy if exists customer_addresses_crm_read on public.customer_addresses;
create policy customer_addresses_crm_read on public.customer_addresses
for select to authenticated
using (private.has_section_access('customers', 'view'));

-- Payment-event reads require the configured all-orders capability and then
-- reuse the same company-wide read helper. This intentionally excludes
-- assigned-only Florist access while allowing Owner/Admin/Finance/HR.
drop policy if exists order_payments_staff_read on public.order_payment_events;
create policy order_payments_staff_read on public.order_payment_events
for select to authenticated
using (
  private.has_action_permission('orders.read_all')
  and exists (
    select 1
    from public.orders o
    where o.id = order_id
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  )
);

-- Notifications are a read/awareness surface. Admin can read company-wide
-- notifications permitted by the capability matrix; acting on an Order still
-- hits the branch-scoped mutation boundary above.
create or replace function private.can_read_staff_notification(p_notification public.staff_notifications)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
begin
  if (select auth.uid()) is null or p_notification.recipient_user_id <> (select auth.uid()) then
    return false;
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid()) and is_active = true
  limit 1;

  if not found then return false; end if;
  if not private.notification_kind_allowed_for_role(v_profile.role, p_notification.kind) then return false; end if;
  return true;
end;
$$;
revoke execute on function private.can_read_staff_notification(public.staff_notifications) from public, anon, authenticated;
grant execute on function private.can_read_staff_notification(public.staff_notifications) to authenticated;

create or replace function public.get_staff_reviews(
  p_order_id text default null,
  p_customer_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reviews jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- A review combines CRM identity with order history. Requiring both configured
  -- read capabilities keeps the RPC aligned with the same backend permission
  -- matrix used by the Customers and Orders workspaces.
  if not private.has_section_access('customers', 'view')
    or not private.has_action_permission('orders.read_all') then
    raise exception 'STAFF_REVIEW_READ_NOT_PERMITTED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(review_row order by submitted_at desc, review_id desc), '[]'::jsonb)
  into v_reviews
  from (
    select
      r.id as review_id,
      r.submitted_at,
      jsonb_build_object(
        'id', r.id,
        'orderId', r.order_id,
        'orderNumber', r.order_number,
        'customerId', r.customer_id,
        'customerName', o.customer_name_snapshot,
        'customerWhatsapp', o.customer_whatsapp_snapshot,
        'submittedAt', r.submitted_at,
        'note', r.note,
        'averageScore', coalesce((
          select round(avg(a.score)::numeric, 2)
          from private.order_review_answers a
          where a.review_id = r.id
        ), 0),
        'answers', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'questionId', a.question_id,
              'question', a.question_snapshot,
              'score', a.score
            )
            order by a.question_snapshot, a.question_id
          )
          from private.order_review_answers a
          where a.review_id = r.id
        ), '[]'::jsonb),
        'reward', (
          select jsonb_build_object(
            'id', rw.id,
            'percentOff', rw.percent_off,
            'minOrderIdr', rw.min_order_idr,
            'status', rw.status,
            'issuedAt', rw.issued_at,
            'redeemedAt', rw.redeemed_at,
            'redeemedOrderId', rw.redeemed_order_id
          )
          from private.customer_review_rewards rw
          where rw.source_review_id = r.id
          limit 1
        )
      ) as review_row
    from private.order_reviews r
    join public.orders o on o.id = r.order_id
    where (p_order_id is null or r.order_id = p_order_id)
      and (p_customer_id is null or r.customer_id = p_customer_id)
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  ) s;

  return jsonb_build_object('reviews', v_reviews);
end;
$$;

revoke execute on function public.get_staff_reviews(text, text) from public, anon;
grant execute on function public.get_staff_reviews(text, text) to authenticated, service_role;

commit;
