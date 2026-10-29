-- Refund and paid-cancellation authority (investigation 2026-10-22).
--
-- 1. Finance (and Owner) can start or withdraw a refund on any order. Before,
--    the operational-edit gate rejected every payment change by Finance on an
--    order that was not yet picked up/delivered (FINANCE_GENERAL_ORDERS_READ_ONLY),
--    so a refund on an active order could not be started by anyone in the app.
--    Only a pure refund change qualifies: paid <-> refund_pending, same method
--    and paid amount, and only refund_initiated / refund_cancelled events.
-- 2. Cancelling a paid order must start its refund in the same save
--    (PAID_ORDER_CANCELLATION_REQUIRES_REFUND). Admin may start the refund only
--    as part of that cancellation. A cancelled order's pending refund cannot be
--    withdrawn back to Paid (CANCELLED_ORDER_REFUND_REQUIRED).
-- 3. Completing a refund (money leaves an account) is Finance-only.
-- Both order-save layers are patched: v34_internal (action permissions) and
-- v31_internal (role/state rules).
--
-- Functions are patched in place from their live definitions; the migration
-- fails if any expected fragment is not found exactly once.

begin;

do $migration$
declare
  v_patch record;
  v_oid oid;
  v_def text;
begin
  for v_patch in
    select * from (values
      (1, 'save_order_operational_state_v31_internal',
$old$  if (v_details_changed or v_assignment_changed or v_status_changed or v_payment_changed) then
$old$,
$new$  -- Pure refund changes (paid <-> refund_pending with refund_initiated /
  -- refund_cancelled events only) belong to Finance and Owner on any order and
  -- therefore skip the operational-edit gate below.
  if (v_details_changed or v_assignment_changed or v_status_changed
      or (v_payment_changed and not (
        v_profile.role in ('owner','finance')
        and v_next.payment_method is not distinct from v_order.payment_method
        and v_next.paid_amount_idr is not distinct from v_order.paid_amount_idr
        and (
          (v_order.payment_status = 'paid' and v_next.payment_status = 'refund_pending')
          or (v_order.payment_status = 'refund_pending' and v_next.payment_status = 'paid')
        )
        and v_new_payment_events <> '[]'::jsonb
        and not exists (
          select 1 from jsonb_array_elements(v_new_payment_events) as refund_event(value)
          where refund_event.value->>'type' not in ('refund_initiated','refund_cancelled')
        )
      ))) then
$new$),
      (2, 'save_order_operational_state_v31_internal',
$old$  if v_refund_changed then
    if v_profile.role not in ('owner','finance') then
      raise exception 'REFUND_NOT_PERMITTED' using errcode = '42501';
$old$,
$new$  if v_refund_changed then
    if v_profile.role not in ('owner','finance') and not (
      -- Admin may queue the refund only while cancelling a paid order.
      v_profile.role = 'admin'
      and v_next.status = 'cancelled' and v_order.status is distinct from 'cancelled'
      and v_order.payment_status = 'paid' and v_next.payment_status = 'refund_pending'
      and v_next.refund_completed_at is null
    ) then
      raise exception 'REFUND_NOT_PERMITTED' using errcode = '42501';
$new$),
      (3, 'save_order_operational_state_v31_internal',
$old$      if v_event_type in ('refund_initiated','refund_cancelled','refund_completed')
        and v_profile.role not in ('owner','finance')
      then
$old$,
$new$      if v_event_type in ('refund_initiated','refund_cancelled','refund_completed')
        and v_profile.role not in ('owner','finance')
        and not (
          v_event_type = 'refund_initiated' and v_profile.role = 'admin'
          and v_next.status = 'cancelled' and v_order.status is distinct from 'cancelled'
          and v_order.payment_status = 'paid' and v_next.payment_status = 'refund_pending'
        )
      then
$new$),
      (4, 'save_order_operational_state_v31_internal',
$old$  -- Outstanding balances cannot advance to courier handoff / pickup.
$old$,
$new$  -- A paid order is only cancelled together with starting its refund, and a
  -- cancelled order's pending refund cannot be withdrawn back to Paid.
  if v_next.status = 'cancelled' and v_order.status is distinct from 'cancelled'
    and v_order.payment_status = 'paid' and coalesce(v_order.paid_amount_idr, 0) > 0
    and v_next.payment_status is distinct from 'refund_pending'
  then
    raise exception 'PAID_ORDER_CANCELLATION_REQUIRES_REFUND' using errcode = '22023';
  end if;
  if v_order.status = 'cancelled' and v_order.payment_status = 'refund_pending'
    and v_next.payment_status = 'paid'
  then
    raise exception 'CANCELLED_ORDER_REFUND_REQUIRED' using errcode = '22023';
  end if;

  -- Outstanding balances cannot advance to courier handoff / pickup.
$new$),
      (5, 'complete_order_refund_with_account',
$old$  if private.current_staff_role() not in ('finance','owner')
$old$,
$new$  if private.current_staff_role() is distinct from 'finance'
$new$),
      (6, 'save_order_operational_state_v34_internal',
$old$  if v_refund_changed then
    if not private.has_action_permission('finance.approve_refund') then
      raise exception 'ORDER_REFUND_PERMISSION_REQUIRED' using errcode='42501';
$old$,
$new$  if v_refund_changed then
    if not private.has_action_permission('finance.approve_refund')
      -- Owner may start refunds; Admin may queue one only while cancelling a
      -- paid order. Completion stays Finance-only (v31 and the completion RPC).
      and v_profile.role is distinct from 'owner'
      and not (
        v_profile.role = 'admin'
        and v_next_status = 'cancelled' and v_order.status is distinct from 'cancelled'
        and v_order.payment_status = 'paid'
        and coalesce(v_state->>'payment_status', '') = 'refund_pending'
      )
    then
      raise exception 'ORDER_REFUND_PERMISSION_REQUIRED' using errcode='42501';
$new$),
      (7, 'save_order_operational_state_v34_internal',
$old$  if v_new_refund_payment and not private.has_action_permission('finance.approve_refund') then
    raise exception 'ORDER_REFUND_PERMISSION_REQUIRED' using errcode='42501';
$old$,
$new$  if v_new_refund_payment and not private.has_action_permission('finance.approve_refund')
    and v_profile.role is distinct from 'owner'
    and not (
      v_profile.role = 'admin'
      and v_next_status = 'cancelled' and v_order.status is distinct from 'cancelled'
      and v_order.payment_status = 'paid'
      and coalesce(v_state->>'payment_status', '') = 'refund_pending'
    )
  then
    raise exception 'ORDER_REFUND_PERMISSION_REQUIRED' using errcode='42501';
$new$)
    ) as patches(step, function_name, old_text, new_text)
    order by step
  loop
    select p.oid into strict v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_patch.function_name;

    v_def := pg_get_functiondef(v_oid);
    if (length(v_def) - length(replace(v_def, v_patch.old_text, ''))) / length(v_patch.old_text) <> 1 then
      raise exception 'Refund migration step % expected exactly one match in public.%', v_patch.step, v_patch.function_name;
    end if;
    execute replace(v_def, v_patch.old_text, v_patch.new_text);
  end loop;
end
$migration$;

commit;
