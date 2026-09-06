-- Payment verification is a company-wide Admin workflow, while production and
-- other operational Order mutations remain owned by the active branch.
--
-- The existing mutation trigger intentionally protects branch ownership for
-- normal Admin writes. Add one narrow exception for payment-only updates made
-- while an Admin has the authoritative orders.advance_status capability.

begin;

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
  v_payment_only_update boolean := false;
begin
  if v_role is distinct from 'admin' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Payment confirmation is intentionally company-wide for Admin. Keep this
  -- exception field-tight so it cannot be used to change branch, fulfillment,
  -- customer/order details, florist assignment, or lifecycle status.
  if tg_op = 'UPDATE' then
    v_payment_only_update :=
      old.status = 'confirmed'
      and new.status = 'confirmed'
      and private.has_action_permission('orders.advance_status')
      and old.branch_id is not distinct from new.branch_id
      and old.payment_method is not distinct from new.payment_method
      and old.payment_status in ('unpaid','paid')
      and new.payment_status in (old.payment_status,'paid')
      and new.paid_amount_idr in (old.paid_amount_idr,new.total_idr)
      and (
        to_jsonb(new)
          - array['payment_proof_url','payment_status','paid_amount_idr','revision','updated_at']::text[]
      ) = (
        to_jsonb(old)
          - array['payment_proof_url','payment_status','paid_amount_idr','revision','updated_at']::text[]
      );

    if v_payment_only_update then
      return new;
    end if;
  end if;

  -- Every other Admin mutation remains branch-scoped exactly as before.
  v_operational_branch := private.current_staff_branch_id();
  if v_operational_branch is null or v_operational_branch is distinct from v_order_branch then
    raise exception 'ORDER_OUTSIDE_BRANCH_SCOPE' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function private.enforce_admin_order_mutation_branch() from public, anon, authenticated;

commit;
