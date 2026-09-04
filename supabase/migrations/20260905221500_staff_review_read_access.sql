-- Read-only review/customer/order visibility for Owner, Admin, Finance, and HR.
-- Review tables remain private; staff access goes through one narrow RPC.

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

-- The legacy row-scope helper hard-coded HR out of Orders. HR is now a
-- company-wide read-only observer like Finance. Admin keeps branch scoping and
-- Florist remains assigned-order-only.
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
  if v_role in ('owner', 'finance', 'hr') then
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
revoke execute on function private.can_read_order_row(text, text) from public, anon;
grant execute on function private.can_read_order_row(text, text) to authenticated;

-- CRM remains read-only for Finance/HR and editable only through the existing
-- mutation boundaries. These policies only widen SELECT visibility.
drop policy if exists customers_crm_read on public.customers;
create policy customers_crm_read on public.customers
for select to authenticated
using (private.has_staff_role(array['owner','admin','finance','hr']));

drop policy if exists customer_addresses_crm_read on public.customer_addresses;
create policy customer_addresses_crm_read on public.customer_addresses
for select to authenticated
using (private.has_staff_role(array['owner','admin','finance','hr']));

-- Order rows/items/activities already delegate to can_read_order_row. Payment
-- events had an additional hard-coded role gate, so include HR there as well.
drop policy if exists order_payments_staff_read on public.order_payment_events;
create policy order_payments_staff_read on public.order_payment_events
for select to authenticated
using (
  private.has_staff_role(array['owner','admin','finance','hr'])
  and exists (
    select 1
    from public.orders o
    where o.id = order_id
      and private.can_read_order_row(o.branch_id, o.florist_assigned_employee_id)
  )
);

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
  v_role text := private.current_staff_role();
  v_reviews jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_role not in ('owner', 'admin', 'finance', 'hr') then
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
  ) s;

  return jsonb_build_object('reviews', v_reviews);
end;
$$;

revoke execute on function public.get_staff_reviews(text, text) from public, anon;
grant execute on function public.get_staff_reviews(text, text) to authenticated, service_role;

commit;
