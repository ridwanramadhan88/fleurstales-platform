-- Finance reconciliation is the first Finance gate after fulfillment. Only a
-- delivered/picked-up order can move its pending payment into Transaction List.

begin;

create or replace function public.decide_order_finance_reconciliation(
  p_order_id text,
  p_expected_revision integer,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_event public.order_payment_events%rowtype;
  v_employee_id text := private.current_staff_employee_id();
  v_actor_name text;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if private.current_staff_role() <> 'finance'
     or not private.has_action_permission('finance.verify_order') then
    raise exception 'FINANCE_RECONCILIATION_NOT_PERMITTED' using errcode='42501';
  end if;
  if v_decision not in ('verify','reject') then
    raise exception 'FINANCE_DECISION_INVALID' using errcode='22023';
  end if;
  if v_decision='reject' and v_note is null then
    raise exception 'FINANCE_REJECTION_NOTE_REQUIRED' using errcode='22023';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.status not in ('delivered','picked_up') then
    raise exception 'FINANCE_RECONCILIATION_REQUIRES_FINISHED_ORDER' using errcode='22023';
  end if;
  if v_order.payment_status <> 'paid'
     or coalesce(v_order.paid_amount_idr,0) <> v_order.total_idr then
    raise exception 'FULL_PAYMENT_CONFIRMATION_REQUIRED' using errcode='22023';
  end if;
  if v_order.finance_verified and v_decision='verify' then
    raise exception 'ORDER_ALREADY_FINANCE_VERIFIED' using errcode='22023';
  end if;

  select * into v_event
  from public.order_payment_events
  where order_id=v_order.id and type='payment_received'
  order by occurred_at desc, id desc
  limit 1
  for update;
  if not found then
    raise exception 'PAYMENT_EVENT_REQUIRED' using errcode='22023';
  end if;
  if v_event.finance_account_id is null then
    raise exception 'RECEIVING_ACCOUNT_REQUIRED' using errcode='22023';
  end if;
  if v_order.payment_method='transfer' and nullif(trim(coalesce(v_order.payment_proof_url,'')),'') is null then
    raise exception 'PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' using errcode='22023';
  end if;

  select display_name into v_actor_name
  from public.staff_access_profiles
  where employee_id=v_employee_id and is_active=true
  limit 1;
  v_actor_name := coalesce(nullif(trim(v_actor_name),''),'Finance');

  if v_decision='verify' then
    update public.orders
    set finance_verified=true,
        finance_verified_by=v_actor_name,
        finance_verified_at=v_now,
        finance_verification_status=null,
        finance_verification_note=null,
        finance_verification_actor=v_actor_name,
        finance_verification_at=v_now,
        edit_unlocked=false,
        revision=revision+1,
        updated_at=v_now
    where id=v_order.id
    returning * into v_order;

    perform private.sync_order_finance_transactions(v_order.id);
    perform private.write_business_activity(
      'order',v_order.id,v_order.branch_id,'finance_payment_reconciled',
      'Finance reconciled the finished order payment.',
      jsonb_build_object(
        'orderNumber',v_order.order_number,
        'amountIdr',v_order.total_idr,
        'financeAccountId',v_event.finance_account_id,
        'financeActor',v_actor_name,
        'transactionCode',coalesce(nullif(trim(coalesce(v_order.finance_reference_code,'')),''),'-')
      )
    );
  else
    update public.orders
    set finance_verified=false,
        finance_verified_by=null,
        finance_verified_at=null,
        finance_verification_status='rejected',
        finance_verification_note=v_note,
        finance_verification_actor=v_actor_name,
        finance_verification_at=v_now,
        edit_unlocked=true,
        revision=revision+1,
        updated_at=v_now
    where id=v_order.id
    returning * into v_order;

    perform private.sync_order_finance_transactions(v_order.id);
    perform private.write_business_activity(
      'order',v_order.id,v_order.branch_id,'finance_payment_rejected',
      'Finance returned the finished order payment for correction.',
      jsonb_build_object(
        'orderNumber',v_order.order_number,
        'note',v_note,
        'financeActor',v_actor_name
      )
    );
  end if;

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'financeVerified',v_order.finance_verified,
    'financeVerificationStatus',v_order.finance_verification_status,
    'financeVerifiedBy',v_order.finance_verified_by,
    'financeVerifiedAt',v_order.finance_verified_at,
    'updatedAt',v_order.updated_at
  );
end;
$$;

revoke execute on function public.decide_order_finance_reconciliation(text,integer,text,text) from public, anon;
grant execute on function public.decide_order_finance_reconciliation(text,integer,text,text) to authenticated, service_role;

commit;
