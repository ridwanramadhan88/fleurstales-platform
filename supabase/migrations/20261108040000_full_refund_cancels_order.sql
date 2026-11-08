-- A full refund cancels an order that is still in progress (Owner decision,
-- 8 Nov 2026). Before, a refunded active order stayed "Diproses" with payment
-- "dikembalikan" and showed up as work for the Admin.
--
-- "Full" = the refunded amount covers everything paid. Delivered or picked-up
-- orders keep their status (an after-sale refund does not undo the delivery).
-- The order's review reward goes back to the customer, as when Finance voids
-- a payment.

create or replace function public.complete_order_refund_with_account(p_order_id text, p_expected_revision integer, p_finance_account_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_event public.order_payment_events%rowtype;
  v_account_id text := trim(coalesce(p_finance_account_id,''));
  v_amount bigint;
  v_now timestamptz := clock_timestamp();
  v_event_id text;
  v_idempotency_key text;
  v_previous_paid bigint;
  v_from_status text;
  v_cancel boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if private.current_staff_role() is distinct from 'finance'
     or not private.has_action_permission('finance.approve_refund') then
    raise exception 'ORDER_REFUND_PERMISSION_REQUIRED' using errcode='42501';
  end if;
  if not private.finance_account_is_valid(v_account_id) then
    raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true
  limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.payment_status <> 'refund_pending' then
    raise exception 'REFUND_MUST_BE_PENDING' using errcode='22023';
  end if;

  v_amount := coalesce(v_order.refund_amount_idr,v_order.paid_amount_idr,0);
  if v_amount <= 0 or nullif(trim(coalesce(v_order.refund_reason,'')),'') is null then
    raise exception 'REFUND_EVIDENCE_INCOMPLETE' using errcode='22023';
  end if;

  -- Owner decision (8 Nov 2026): a full refund cancels an order that is still
  -- in progress. Finished orders (delivered / picked up) keep their status.
  v_previous_paid := coalesce(v_order.paid_amount_idr,0);
  v_from_status := v_order.status;
  v_cancel := v_amount >= v_previous_paid
    and v_order.status in ('pending_verification','confirmed','processing','ready','delivering');

  update public.orders
  set payment_status='refunded',
      paid_amount_idr=0,
      status=case when v_cancel then 'cancelled' else status end,
      cancellation_reason=case when v_cancel
        then coalesce(nullif(trim(coalesce(cancellation_reason,'')),''),'Dibatalkan otomatis: uang dikembalikan penuh. '||v_order.refund_reason)
        else cancellation_reason end,
      cancelled_by=case when v_cancel then coalesce(cancelled_by,coalesce(nullif(trim(v_profile.display_name),''),v_profile.role)) else cancelled_by end,
      cancelled_at=case when v_cancel then coalesce(cancelled_at,v_now) else cancelled_at end,
      refund_completed_by=coalesce(nullif(trim(v_profile.display_name),''),v_profile.role),
      refund_completed_at=v_now,
      revision=revision+1,
      updated_at=v_now
  where id=v_order.id
  returning * into v_order;

  v_event_id := 'pay_'||replace(gen_random_uuid()::text,'-','');
  v_idempotency_key := 'refund-complete:'||v_order.id;
  insert into public.order_payment_events(
    id,order_id,type,amount_idr,previous_paid_amount_idr,resulting_paid_amount_idr,
    resulting_status,method,reference,proof_id,note,actor_id,actor_name,occurred_at,
    idempotency_key,finance_account_id
  ) values (
    v_event_id,v_order.id,'refund_completed',v_amount,v_amount,0,
    'refunded',case when v_account_id='cash:main' then 'cash' else 'transfer' end,
    null,null,v_order.refund_reason,v_profile.employee_id,
    coalesce(nullif(trim(v_profile.display_name),''),v_profile.role),v_now,
    v_idempotency_key,v_account_id
  )
  on conflict (idempotency_key) do update
    set finance_account_id=excluded.finance_account_id,
        method=excluded.method,
        actor_id=excluded.actor_id,
        actor_name=excluded.actor_name,
        occurred_at=excluded.occurred_at,
        note=excluded.note
  returning * into v_event;

  perform private.sync_order_finance_transactions(v_order.id);
  perform private.sync_order_contribution_points(v_order.id);

  if v_cancel then
    update private.customer_review_rewards
    set status='available', redeemed_order_id=null, redeemed_at=null
    where redeemed_order_id=v_order.id and status='redeemed';

    insert into public.order_activities(id,order_id,kind,description,actor,occurred_at,metadata)
    values ('activity_'||replace(gen_random_uuid()::text,'-',''),v_order.id,'status',
      'Uang '||private.format_idr(v_amount)||' dikembalikan penuh; pesanan dibatalkan otomatis.',
      coalesce(nullif(trim(v_profile.display_name),''),v_profile.role),v_now,
      jsonb_build_object('fromStatus',v_from_status,'toStatus','cancelled','refundAmountIdr',v_amount,'reason','FULL_REFUND_CANCELS_ORDER'));
    perform private.write_business_activity(
      'order',v_order.id,v_order.branch_id,'cancelled',
      'Order cancelled automatically because its payment was refunded in full.',
      jsonb_build_object('orderNumber',v_order.order_number,'fromStatus',v_from_status,'toStatus','cancelled','reason','FULL_REFUND_CANCELS_ORDER')
    );
  end if;
  perform private.write_business_activity(
    'order',v_order.id,v_order.branch_id,'refund_completed',
    'Refund completed and posted from the selected Finance account.',
    jsonb_build_object(
      'orderNumber',v_order.order_number,
      'amountIdr',v_amount,
      'financeAccountId',v_account_id,
      'paymentEventId',v_event.id
    )
  );

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'paymentStatus',v_order.payment_status,
    'status',v_order.status,
    'orderCancelled',v_cancel,
    'paidAmountIdr',v_order.paid_amount_idr,
    'refundCompletedAt',v_order.refund_completed_at,
    'financeAccountId',v_account_id,
    'ledgerTransactionId',v_event.ledger_transaction_id
  );
end;
$function$;
