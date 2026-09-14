-- Finance workflow v1
-- Locked workflow:
-- - Admin-confirmed order payments are posted immediately; Finance reconciliation is review-only.
-- - Refund completion selects the account that actually pays the refund.
-- - Payroll payment selects the paying account and may post a separate transfer-fee expense.
-- - Account transfers may post a separate transfer-fee expense.
-- - Source-owned automatic ledger entries cannot be edited from the generic Finance editor.

-- ---------------------------------------------------------------------------
-- Order reconciliation is independent of fulfillment completion. Payment was
-- already posted when Admin confirmed it; Finance only reviews evidence here.
-- ---------------------------------------------------------------------------
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
  if v_order.payment_status <> 'paid'
     or coalesce(v_order.paid_amount_idr,0) <> v_order.total_idr then
    raise exception 'FULL_PAYMENT_CONFIRMATION_REQUIRED' using errcode='22023';
  end if;
  if v_order.status in ('cancelled','failed') then
    raise exception 'VOIDED_ORDER_CANNOT_BE_RECONCILED' using errcode='22023';
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
      'Finance reconciled the Admin-confirmed order payment.',
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
      'Finance returned the payment evidence for correction; the received cash remains posted.',
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

-- ---------------------------------------------------------------------------
-- Refund completion owns the actual cash movement. A pending refund has no
-- balance effect; Finance chooses the paying account at completion time.
-- ---------------------------------------------------------------------------
create or replace function public.complete_order_refund_with_account(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_event public.order_payment_events%rowtype;
  v_account_id text := trim(coalesce(p_finance_account_id,''));
  v_amount bigint;
  v_now timestamptz := clock_timestamp();
  v_event_id text;
  v_idempotency_key text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if private.current_staff_role() not in ('finance','owner')
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

  update public.orders
  set payment_status='refunded',
      paid_amount_idr=0,
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
    'paidAmountIdr',v_order.paid_amount_idr,
    'refundCompletedAt',v_order.refund_completed_at,
    'financeAccountId',v_account_id,
    'ledgerTransactionId',v_event.ledger_transaction_id
  );
end;
$$;
revoke execute on function public.complete_order_refund_with_account(text,integer,text) from public, anon;
grant execute on function public.complete_order_refund_with_account(text,integer,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Replace the cash-flow command with a backwards-compatible trailing fee.
-- The fee is a separate expense row; transfer principal remains non-operating.
-- ---------------------------------------------------------------------------
drop function if exists public.create_finance_cashflow_entry(bigint,text,text,bigint,text,text,timestamptz,text);

create function public.create_finance_cashflow_entry(
  p_expected_revision bigint,
  p_kind text,
  p_account_id text,
  p_amount bigint,
  p_direction text default null,
  p_counterparty_account_id text default null,
  p_transaction_date timestamptz default null,
  p_note text default null,
  p_transfer_fee bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_transactions jsonb;
  v_tx jsonb;
  v_tx2 jsonb;
  v_fee_tx jsonb;
  v_id text := 'txn_'||replace(gen_random_uuid()::text,'-','');
  v_transfer_id text := 'transfer_'||replace(gen_random_uuid()::text,'-','');
  v_date timestamptz := coalesce(p_transaction_date,clock_timestamp());
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_kind text := lower(trim(coalesce(p_kind,'')));
  v_direction text := lower(trim(coalesce(p_direction,'')));
  v_fee bigint := coalesce(p_transfer_fee,0);
begin
  if (select auth.uid()) is null or private.current_staff_role()<>'finance' then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
  end if;
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  if p_amount<=0 then raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode='22023'; end if;
  if v_fee < 0 then raise exception 'TRANSFER_FEE_INVALID' using errcode='22023'; end if;
  if v_kind <> 'transfer' and v_fee <> 0 then raise exception 'TRANSFER_FEE_ONLY_FOR_TRANSFER' using errcode='22023'; end if;
  if not private.finance_account_is_valid(p_account_id) then raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023'; end if;

  select * into v_state from private.operational_domain_state where domain='finance' for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision<>p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_state.revision using errcode='40001';
  end if;
  v_transactions:=coalesce(v_state.snapshot->'transactions','[]'::jsonb);

  if v_kind='opening_balance' then
    if v_note is null then raise exception 'OPENING_BALANCE_REASON_REQUIRED' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(v_transactions) x where x->>'source'='opening_balance' and x->>'accountId'=p_account_id) then
      raise exception 'OPENING_BALANCE_ALREADY_EXISTS' using errcode='22023';
    end if;
    v_tx:=jsonb_build_object(
      'id',v_id,'type','income','category','owner_deposit','branch','All','scope','company',
      'accountId',p_account_id,'amount',p_amount,'method',case when p_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Opening balance','description',v_note,'note',v_note,
      'source','opening_balance','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_transactions:=jsonb_build_array(v_tx)||v_transactions;
  elsif v_kind='adjustment' then
    if v_note is null then raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode='22023'; end if;
    if v_direction not in ('income','expense') then raise exception 'ADJUSTMENT_DIRECTION_INVALID' using errcode='22023'; end if;
    v_tx:=jsonb_build_object(
      'id',v_id,'type',v_direction,'category',case when v_direction='income' then 'other_income' else 'other' end,
      'branch','All','scope','company','accountId',p_account_id,'amount',p_amount,
      'method',case when p_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Balance adjustment','description',v_note,'note',v_note,
      'adjustmentReason',v_note,'source','adjustment','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_transactions:=jsonb_build_array(v_tx)||v_transactions;
  elsif v_kind='transfer' then
    if p_counterparty_account_id is null or p_counterparty_account_id=p_account_id then
      raise exception 'TRANSFER_DESTINATION_INVALID' using errcode='22023';
    end if;
    if not private.finance_account_is_valid(p_counterparty_account_id) then
      raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023';
    end if;
    v_tx:=jsonb_build_object(
      'id',v_id,'type','expense','category','other','branch','All','scope','company',
      'accountId',p_account_id,'amount',p_amount,'method',case when p_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Account transfer','description',coalesce(v_note,''),'note',v_note,
      'source','transfer','transferId',v_transfer_id,'transferDirection','out','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_tx2:=jsonb_build_object(
      'id','txn_'||replace(gen_random_uuid()::text,'-',''),'type','income','category','other_income','branch','All','scope','company',
      'accountId',p_counterparty_account_id,'amount',p_amount,'method',case when p_counterparty_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Account transfer','description',coalesce(v_note,''),'note',v_note,
      'source','transfer','transferId',v_transfer_id,'transferDirection','in','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_transactions:=jsonb_build_array(v_tx2,v_tx)||v_transactions;
    if v_fee > 0 then
      v_fee_tx:=jsonb_build_object(
        'id','txn_'||replace(gen_random_uuid()::text,'-',''),'type','expense','category','other','branch','All','scope','company',
        'accountId',p_account_id,'amount',v_fee,'method',case when p_account_id='cash:main' then 'cash' else 'transfer' end,
        'status','verified','name','Bank / Transfer Fee','description','Transfer fee','note',v_note,
        'reference',v_transfer_id,'source','manual','entryMode','automatic','transactionDate',v_date,
        'isSystemGenerated',true,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
      );
      v_transactions:=jsonb_build_array(v_fee_tx)||v_transactions;
    end if;
  else
    raise exception 'FINANCE_CASHFLOW_KIND_INVALID' using errcode='22023';
  end if;

  update private.operational_domain_state
  set revision=revision+1,
      snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
      updated_by=(select auth.uid()),updated_at=now()
  where domain='finance'
  returning * into v_state;

  perform private.write_business_activity(
    'finance',v_id,null,'cashflow_entry_created','Finance cash-flow entry created.',
    jsonb_build_object('kind',v_kind,'accountId',p_account_id,'amount',p_amount,'transferFee',v_fee)
  );
  return jsonb_build_object('domain','finance','revision',v_state.revision,'snapshot',v_state.snapshot,'updatedAt',v_state.updated_at);
end;
$$;
revoke execute on function public.create_finance_cashflow_entry(bigint,text,text,bigint,text,text,timestamptz,text,bigint) from public, anon;
grant execute on function public.create_finance_cashflow_entry(bigint,text,text,bigint,text,text,timestamptz,text,bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic posted-entry correction is manual-only. Automatic order/refund/
-- payroll projections and transfer pairs stay source-owned and immutable.
-- ---------------------------------------------------------------------------
create or replace function public.edit_manual_finance_transaction(
  p_expected_revision bigint,
  p_transaction_id text,
  p_patch jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_tx jsonb;
  v_entry_mode text;
  v_source text;
  v_system_generated boolean;
begin
  if (select auth.uid()) is null or private.current_staff_role()<>'finance' then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain='finance'
  for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision<>p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_state.revision using errcode='40001';
  end if;

  select value into v_tx
  from jsonb_array_elements(coalesce(v_state.snapshot->'transactions','[]'::jsonb))
  where value->>'id'=p_transaction_id
  limit 1;
  if v_tx is null then raise exception 'FINANCE_TRANSACTION_NOT_FOUND' using errcode='P0002'; end if;

  v_system_generated := coalesce((v_tx->>'isSystemGenerated')::boolean,false);
  v_entry_mode := coalesce(nullif(v_tx->>'entryMode',''),case when v_system_generated then 'automatic' else 'manual' end);
  v_source := coalesce(nullif(v_tx->>'source',''),'manual');
  if v_system_generated or v_entry_mode <> 'manual' or v_source <> 'manual' then
    raise exception 'AUTOMATIC_FINANCE_ENTRY_IMMUTABLE' using errcode='22023';
  end if;

  return public.edit_finance_transaction(p_expected_revision,p_transaction_id,p_patch,p_reason);
end;
$$;
revoke execute on function public.edit_manual_finance_transaction(bigint,text,jsonb,text) from public, anon;
grant execute on function public.edit_manual_finance_transaction(bigint,text,jsonb,text) to authenticated, service_role;
revoke execute on function public.edit_finance_transaction(bigint,text,jsonb,text) from authenticated;
grant execute on function public.edit_finance_transaction(bigint,text,jsonb,text) to service_role;

-- ---------------------------------------------------------------------------
-- Payroll final payment owns one atomic payment event plus Finance ledger.
-- Account is mandatory; optional transfer fee becomes its own expense line.
-- ---------------------------------------------------------------------------
create or replace function public.record_payroll_payment_with_account(
  p_expected_revision bigint,
  p_payroll_proposal_id text,
  p_payment_date date,
  p_payment_method text,
  p_payment_reference text,
  p_finance_account_id text,
  p_transfer_fee bigint default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_snapshot jsonb;
  v_proposal jsonb;
  v_employee_ids jsonb;
  v_actor_name text;
  v_method text := trim(coalesce(p_payment_method,''));
  v_reference text := trim(coalesce(p_payment_reference,''));
  v_account_id text := trim(coalesce(p_finance_account_id,''));
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_fee bigint := coalesce(p_transfer_fee,0);
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_finance private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_payroll_tx_count integer;
  v_fee_tx jsonb;
  v_period_id text;
  v_mapped_method text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if private.current_staff_role() not in ('finance','owner')
     or not private.has_action_permission('finance.record_final_payment') then
    raise exception 'PAYROLL_ACTION_FORBIDDEN:finance.record_final_payment' using errcode='42501';
  end if;
  if p_payment_date is null or v_method='' or v_reference='' then
    raise exception 'INVALID_PAYROLL_PAYMENT_DETAILS' using errcode='22023';
  end if;
  if not private.finance_account_is_valid(v_account_id) then
    raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023';
  end if;
  if v_fee < 0 then raise exception 'TRANSFER_FEE_INVALID' using errcode='22023'; end if;

  v_mapped_method := case
    when lower(v_method) like '%cash%' then 'cash'
    when lower(v_method) like '%card%' then 'card'
    when lower(v_method) like '%transfer%' or lower(v_method) like '%bank%' then 'transfer'
    else 'other'
  end;
  if v_mapped_method='cash' and v_account_id<>'cash:main' then
    raise exception 'CASH_PAYMENT_REQUIRES_CASH_ACCOUNT' using errcode='22023';
  end if;
  if v_mapped_method<>'cash' and v_account_id='cash:main' then
    raise exception 'NON_CASH_PAYMENT_REQUIRES_NON_CASH_ACCOUNT' using errcode='22023';
  end if;
  if v_fee>0 and v_mapped_method='cash' then
    raise exception 'TRANSFER_FEE_REQUIRES_NON_CASH_PAYMENT' using errcode='22023';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true
  limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  v_actor_name := coalesce(nullif(trim(v_profile.display_name),''),v_profile.role);

  select * into v_state
  from private.operational_domain_state
  where domain='payroll'
  for update;
  if not found then raise exception 'PAYROLL_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision<>p_expected_revision then
    raise exception 'REVISION_CONFLICT:payroll:expected=%:actual=%',p_expected_revision,v_state.revision using errcode='40001';
  end if;

  select p into v_proposal
  from jsonb_array_elements(coalesce(v_state.snapshot->'payrollProposals','[]'::jsonb)) p
  where p->>'id'=p_payroll_proposal_id
  limit 1;
  if v_proposal is null then raise exception 'PAYROLL_PROPOSAL_NOT_FOUND' using errcode='P0002'; end if;
  if v_proposal->>'status'<>'finance_approved' then
    raise exception 'PAYROLL_MUST_BE_FINANCE_APPROVED' using errcode='22023';
  end if;
  if coalesce((v_proposal->>'totalPayrollIdr')::bigint,0)<=0 then
    raise exception 'INVALID_PAYROLL_PAYMENT_DETAILS' using errcode='22023';
  end if;
  v_period_id := v_proposal->>'payrollPeriodId';
  v_employee_ids := coalesce(v_proposal->'employeePayrollIds','[]'::jsonb);
  v_snapshot := v_state.snapshot;

  v_snapshot := jsonb_set(
    v_snapshot,'{payrollProposals}',
    coalesce((
      select jsonb_agg(
        case when p->>'id'=p_payroll_proposal_id then
          p || jsonb_strip_nulls(jsonb_build_object(
            'status','paid','paidAt',p_payment_date::text,'paidBy',v_actor_name,
            'paymentMethod',v_method,'paymentReference',v_reference,'paymentNote',v_note,
            'financeAccountId',v_account_id,'transferFeeIdr',v_fee
          ))
        else p end
        order by ord
      )
      from jsonb_array_elements(coalesce(v_snapshot->'payrollProposals','[]'::jsonb)) with ordinality as x(p,ord)
    ),'[]'::jsonb),true
  );

  v_snapshot := jsonb_set(
    v_snapshot,'{employeePayrolls}',
    coalesce((
      select jsonb_agg(
        case when exists(select 1 from jsonb_array_elements_text(v_employee_ids) eid where eid=e->>'id') then
          e || jsonb_strip_nulls(jsonb_build_object(
            'status','paid','paidAt',p_payment_date::text,'paidBy',v_actor_name,
            'paymentMethod',v_method,'paymentReference',v_reference,'paymentNote',v_note
          ))
        else e end
        order by ord
      )
      from jsonb_array_elements(coalesce(v_snapshot->'employeePayrolls','[]'::jsonb)) with ordinality as x(e,ord)
    ),'[]'::jsonb),true
  );

  v_snapshot := jsonb_set(
    v_snapshot,'{payrollProposalReviews}',
    coalesce(v_snapshot->'payrollProposalReviews','[]'::jsonb) || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id','proposal-review-'||replace(gen_random_uuid()::text,'-',''),
        'payrollProposalId',p_payroll_proposal_id,
        'payrollPeriodId',v_period_id,
        'decision','paid','note',coalesce(v_note,'Paid via '||v_method||'.'),
        'actorName',v_actor_name,'actorRole',v_profile.role,'createdAt',v_now
      ))
    ),true
  );

  v_result := private.apply_payroll_workflow_state('record_payment',p_expected_revision,v_snapshot);

  select * into v_finance
  from private.operational_domain_state
  where domain='finance'
  for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  v_transactions := coalesce(v_finance.snapshot->'transactions','[]'::jsonb);

  select count(*) into v_payroll_tx_count
  from jsonb_array_elements(v_transactions) t
  where t->>'idempotencyKey'='payroll-expense:'||p_payroll_proposal_id;
  if v_payroll_tx_count<>1 then
    raise exception 'PAYROLL_LEDGER_ENTRY_REQUIRED' using errcode='55000';
  end if;

  select coalesce(jsonb_agg(
    case when t->>'idempotencyKey'='payroll-expense:'||p_payroll_proposal_id then
      t || jsonb_build_object('accountId',v_account_id,'method',v_mapped_method,'updatedAt',v_now)
    else t end
    order by ord
  ),'[]'::jsonb)
  into v_transactions
  from jsonb_array_elements(v_transactions) with ordinality as x(t,ord);

  if v_fee>0 and not exists(
    select 1 from jsonb_array_elements(v_transactions) t
    where t->>'idempotencyKey'='payroll-fee:'||p_payroll_proposal_id
  ) then
    v_fee_tx := jsonb_build_object(
      'id','txn_'||replace(gen_random_uuid()::text,'-',''),
      'type','expense','category','other','branch','All','scope','company',
      'accountId',v_account_id,'amount',v_fee,'method',v_mapped_method,'status','verified',
      'name','Bank / Transfer Fee','description','Payroll transfer fee',
      'payrollProposalId',p_payroll_proposal_id,'payrollPeriodId',v_period_id,
      'reference',v_reference,'source','manual','entryMode','automatic',
      'transactionDate',p_payment_date::text||'T12:00:00+07:00',
      'groupType','payroll_cycle','groupKey',v_period_id,'groupLabel',v_period_id,
      'sourceEventId',p_payroll_proposal_id,'idempotencyKey','payroll-fee:'||p_payroll_proposal_id,
      'isSystemGenerated',true,'note',v_note,'actor',v_actor_name,'createdAt',v_now,'updatedAt',v_now
    );
    v_transactions := jsonb_build_array(v_fee_tx)||v_transactions;
  end if;

  update private.operational_domain_state
  set revision=revision+1,
      snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
      updated_by=(select auth.uid()),updated_at=now()
  where domain='finance';

  perform private.write_business_activity(
    'finance',p_payroll_proposal_id,null,'payroll_payment_posted',
    'Payroll payment posted from the selected Finance account.',
    jsonb_build_object('financeAccountId',v_account_id,'transferFee',v_fee,'paymentReference',v_reference)
  );

  return v_result || jsonb_build_object('financeAccountId',v_account_id,'transferFeeIdr',v_fee);
end;
$$;
revoke execute on function public.record_payroll_payment_with_account(bigint,text,date,text,text,text,bigint,text) from public, anon;
grant execute on function public.record_payroll_payment_with_account(bigint,text,date,text,text,text,bigint,text) to authenticated, service_role;
