-- Locked Finance workflow: explicit paying accounts, separate transfer-fee rows,
-- and source-owned automatic ledger protection.
--
-- The existing Admin payment-confirmation path intentionally stays unchanged:
-- confirm_order_payment_for_processing already posts a verified Money In row to
-- the selected account before Finance reconciliation.

begin;

-- ---------------------------------------------------------------------------
-- Shared helper for optional transfer fees. Fees are real operating expenses,
-- so they are NOT tagged as `transfer` (transfer principal is excluded from
-- operating cash flow). They remain automatic/source-owned and therefore
-- cannot be edited as free-standing ledger rows.
-- ---------------------------------------------------------------------------
create or replace function private.append_finance_transfer_fee(
  p_idempotency_key text,
  p_account_id text,
  p_amount bigint,
  p_transaction_date timestamptz,
  p_name text,
  p_description text,
  p_branch_id text default null,
  p_scope text default 'company',
  p_source_event_id text default null,
  p_reference text default null,
  p_actor text default null,
  p_group_type text default 'source_batch',
  p_group_key text default null,
  p_group_label text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_existing jsonb;
  v_tx jsonb;
  v_tx_id text := 'txn_'||replace(gen_random_uuid()::text,'-','');
  v_scope text := case when p_scope='branch' then 'branch' else 'company' end;
  v_branch text := case when p_scope='branch' then coalesce(nullif(trim(p_branch_id),''),'All') else 'All' end;
begin
  if p_amount is null or p_amount <= 0 then return null; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'TRANSFER_FEE_IDEMPOTENCY_REQUIRED' using errcode='22023';
  end if;
  if not private.finance_account_is_valid(p_account_id) then
    raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023';
  end if;
  if p_account_id='cash:main' then
    raise exception 'TRANSFER_FEE_REQUIRES_NON_CASH_ACCOUNT' using errcode='22023';
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain='finance'
  for update;

  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
    values(
      'finance',1,
      '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb,
      (select auth.uid()),now()
    )
    returning * into v_state;
  end if;

  v_transactions := coalesce(v_state.snapshot->'transactions','[]'::jsonb);
  select value into v_existing
  from jsonb_array_elements(v_transactions)
  where value->>'idempotencyKey'=p_idempotency_key
  limit 1;

  if v_existing is not null then
    if coalesce((v_existing->>'amount')::bigint,0) <> p_amount
       or coalesce(v_existing->>'accountId','') <> p_account_id
       or coalesce(v_existing->>'source','') <> 'transfer_fee'
    then
      raise exception 'TRANSFER_FEE_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return v_existing->>'id';
  end if;

  v_tx := jsonb_strip_nulls(jsonb_build_object(
    'id',v_tx_id,
    'type','expense',
    'category','other',
    'branch',v_branch,
    'scope',v_scope,
    'accountId',p_account_id,
    'amount',p_amount,
    'method','transfer',
    'status','verified',
    'name',coalesce(nullif(trim(p_name),''),'Transfer fee'),
    'description',coalesce(p_description,''),
    'reference',nullif(trim(coalesce(p_reference,'')),''),
    'source','transfer_fee',
    'entryMode','automatic',
    'transactionDate',coalesce(p_transaction_date,clock_timestamp()),
    'groupType',coalesce(nullif(trim(p_group_type),''),'source_batch'),
    'groupKey',nullif(trim(coalesce(p_group_key,'')),''),
    'groupLabel',nullif(trim(coalesce(p_group_label,'')),''),
    'sourceEventId',nullif(trim(coalesce(p_source_event_id,'')),''),
    'idempotencyKey',p_idempotency_key,
    'isSystemGenerated',true,
    'actor',coalesce(nullif(trim(p_actor),''),'Finance'),
    'createdAt',clock_timestamp(),
    'updatedAt',clock_timestamp()
  ));

  v_transactions := jsonb_build_array(v_tx)||v_transactions;
  update private.operational_domain_state
  set revision=revision+1,
      snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
      updated_by=(select auth.uid()),
      updated_at=now()
  where domain='finance';

  perform private.write_business_activity(
    'finance',v_tx_id,p_branch_id,'transfer_fee_posted','Transfer fee posted to Finance.',
    jsonb_build_object('accountId',p_account_id,'amount',p_amount,'sourceEventId',p_source_event_id)
  );
  return v_tx_id;
end;
$$;
revoke execute on function private.append_finance_transfer_fee(text,text,bigint,timestamptz,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Refund completion owns the selected paying account. Money moves only when
-- the refund is completed; initiation/cancellation remain non-cash events.
-- ---------------------------------------------------------------------------
create or replace function public.complete_order_refund_with_account(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text,
  p_transfer_fee_amount bigint default 0
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
  v_account_id text := trim(coalesce(p_finance_account_id,''));
  v_amount bigint;
  v_now timestamptz := clock_timestamp();
  v_fee_tx_id text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if private.current_staff_role() not in ('owner','finance')
     or not private.has_action_permission('finance.approve_refund') then
    raise exception 'REFUND_COMPLETION_NOT_PERMITTED' using errcode='42501';
  end if;
  if p_transfer_fee_amount is null or p_transfer_fee_amount < 0 then
    raise exception 'TRANSFER_FEE_INVALID' using errcode='22023';
  end if;
  if not private.finance_account_is_valid(v_account_id) then
    raise exception 'REFUND_PAYING_ACCOUNT_REQUIRED' using errcode='22023';
  end if;
  if p_transfer_fee_amount > 0 and v_account_id='cash:main' then
    raise exception 'TRANSFER_FEE_REQUIRES_NON_CASH_ACCOUNT' using errcode='22023';
  end if;

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
  if v_amount <= 0 or nullif(trim(coalesce(v_order.refund_reason,'')),'') is null
     or v_order.refund_initiated_at is null then
    raise exception 'REFUND_EVIDENCE_INCOMPLETE' using errcode='22023';
  end if;

  select display_name into v_actor_name
  from public.staff_access_profiles
  where employee_id=v_employee_id and is_active=true
  limit 1;
  v_actor_name := coalesce(nullif(trim(v_actor_name),''),private.current_staff_role(),'Finance');

  insert into public.order_payment_events(
    id,order_id,type,amount_idr,previous_paid_amount_idr,resulting_paid_amount_idr,
    resulting_status,method,note,actor_id,actor_name,occurred_at,idempotency_key,
    finance_account_id
  ) values (
    'pay_'||replace(gen_random_uuid()::text,'-',''),
    v_order.id,'refund_completed',v_amount,coalesce(v_order.paid_amount_idr,0),0,
    'refunded',case when v_account_id='cash:main' then 'cash' else 'transfer' end,
    v_order.refund_reason,v_employee_id,v_actor_name,v_now,
    'refund-complete:'||v_order.id,v_account_id
  )
  on conflict (idempotency_key) do update
    set finance_account_id=excluded.finance_account_id,
        method=excluded.method,
        actor_id=excluded.actor_id,
        actor_name=excluded.actor_name,
        occurred_at=excluded.occurred_at,
        note=excluded.note
  returning * into v_event;

  update public.orders
  set payment_status='refunded',
      paid_amount_idr=0,
      refund_completed_by=v_actor_name,
      refund_completed_at=v_now,
      revision=revision+1,
      updated_at=v_now
  where id=v_order.id
  returning * into v_order;

  perform private.sync_order_finance_transactions(v_order.id);

  if p_transfer_fee_amount > 0 then
    v_fee_tx_id := private.append_finance_transfer_fee(
      'refund-fee:'||v_order.id,
      v_account_id,
      p_transfer_fee_amount,
      v_now,
      'Refund transfer fee',
      'Transfer fee for refund · '||v_order.order_number,
      v_order.branch_id,
      'branch',
      v_event.id,
      null,
      v_actor_name,
      'refund_day',
      to_char(timezone('Asia/Jakarta',v_now),'YYYY-MM-DD'),
      to_char(timezone('Asia/Jakarta',v_now),'YYYY-MM-DD')
    );
  end if;

  perform private.sync_order_contribution_points(v_order.id);
  perform private.write_business_activity(
    'order',v_order.id,v_order.branch_id,'refund_completed',
    'Refund completed from the selected Finance account.',
    jsonb_build_object(
      'orderNumber',v_order.order_number,
      'amountIdr',v_amount,
      'financeAccountId',v_account_id,
      'transferFeeIdr',p_transfer_fee_amount,
      'feeTransactionId',v_fee_tx_id,
      'financeActor',v_actor_name
    )
  );

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'paymentStatus',v_order.payment_status,
    'paidAmountIdr',v_order.paid_amount_idr,
    'refundAmountIdr',v_amount,
    'refundCompletedAt',v_order.refund_completed_at,
    'financeAccountId',v_account_id,
    'transferFeeIdr',p_transfer_fee_amount,
    'ledgerTransactionId',v_event.ledger_transaction_id,
    'feeTransactionId',v_fee_tx_id
  );
end;
$$;
revoke execute on function public.complete_order_refund_with_account(text,integer,text,bigint) from public, anon;
grant execute on function public.complete_order_refund_with_account(text,integer,text,bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Payroll payment wrapper. The existing payroll authority still validates and
-- persists the payroll transition; this wrapper binds its generated expense to
-- the selected paying account and adds an optional separate transfer-fee row.
-- ---------------------------------------------------------------------------
create or replace function public.payroll_record_payment_with_account(
  p_expected_revision bigint,
  p_snapshot jsonb,
  p_payroll_proposal_id text,
  p_finance_account_id text,
  p_transfer_fee_amount bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb := '{}'::jsonb;
  v_proposal jsonb;
  v_result jsonb;
  v_finance private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_account_id text := trim(coalesce(p_finance_account_id,''));
  v_method text;
  v_payment_date text;
  v_reference text;
  v_actor text;
  v_fee_tx_id text;
  v_idempotency_key text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if private.current_staff_role() not in ('owner','finance')
     or not private.has_action_permission('finance.record_final_payment') then
    raise exception 'PAYROLL_PAYMENT_NOT_PERMITTED' using errcode='42501';
  end if;
  if not private.finance_account_is_valid(v_account_id) then
    raise exception 'PAYROLL_PAYING_ACCOUNT_REQUIRED' using errcode='22023';
  end if;
  if p_transfer_fee_amount is null or p_transfer_fee_amount < 0 then
    raise exception 'TRANSFER_FEE_INVALID' using errcode='22023';
  end if;
  if p_transfer_fee_amount > 0 and v_account_id='cash:main' then
    raise exception 'TRANSFER_FEE_REQUIRES_NON_CASH_ACCOUNT' using errcode='22023';
  end if;

  select snapshot into v_previous
  from private.operational_domain_state
  where domain='payroll';
  v_previous := coalesce(v_previous,'{}'::jsonb);

  select p into v_proposal
  from jsonb_array_elements(coalesce(p_snapshot->'payrollProposals','[]'::jsonb)) p
  where p->>'id'=p_payroll_proposal_id
    and p->>'status'='paid'
    and not exists(
      select 1
      from jsonb_array_elements(coalesce(v_previous->'payrollProposals','[]'::jsonb)) old
      where old->>'id'=p->>'id' and old->>'status'='paid'
    )
  limit 1;
  if v_proposal is null then
    raise exception 'NEWLY_PAID_PAYROLL_PROPOSAL_REQUIRED' using errcode='22023';
  end if;

  v_method := lower(trim(coalesce(v_proposal->>'paymentMethod','')));
  if v_account_id='cash:main' and v_method not like '%cash%' then
    raise exception 'PAYROLL_CASH_ACCOUNT_METHOD_MISMATCH' using errcode='22023';
  end if;
  if v_account_id<>'cash:main' and v_method like '%cash%' then
    raise exception 'PAYROLL_BANK_ACCOUNT_METHOD_MISMATCH' using errcode='22023';
  end if;

  v_payment_date := v_proposal->>'paidAt';
  v_reference := nullif(trim(coalesce(v_proposal->>'paymentReference','')),'');
  v_actor := coalesce(nullif(trim(v_proposal->>'paidBy'),''),'Finance');
  v_idempotency_key := 'payroll-expense:'||p_payroll_proposal_id;

  v_result := public.payroll_record_payment(p_expected_revision,p_snapshot);

  select * into v_finance
  from private.operational_domain_state
  where domain='finance'
  for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;

  v_transactions := coalesce(v_finance.snapshot->'transactions','[]'::jsonb);
  if not exists(select 1 from jsonb_array_elements(v_transactions) x where x->>'idempotencyKey'=v_idempotency_key) then
    raise exception 'PAYROLL_LEDGER_ENTRY_REQUIRED' using errcode='55000';
  end if;

  select coalesce(jsonb_agg(
    case when x->>'idempotencyKey'=v_idempotency_key then
      x || jsonb_build_object(
        'accountId',v_account_id,
        'method',case when v_account_id='cash:main' then 'cash' else coalesce(x->>'method','transfer') end,
        'status','verified',
        'updatedAt',clock_timestamp()
      )
    else x end
  ),'[]'::jsonb)
  into v_transactions
  from jsonb_array_elements(v_transactions) x;

  update private.operational_domain_state
  set revision=revision+1,
      snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
      updated_by=(select auth.uid()),
      updated_at=now()
  where domain='finance';

  if p_transfer_fee_amount > 0 then
    v_fee_tx_id := private.append_finance_transfer_fee(
      'payroll-fee:'||p_payroll_proposal_id,
      v_account_id,
      p_transfer_fee_amount,
      (v_payment_date||'T12:00:00+07:00')::timestamptz,
      'Payroll transfer fee',
      'Transfer fee for payroll · '||p_payroll_proposal_id,
      null,
      'company',
      p_payroll_proposal_id,
      v_reference,
      v_actor,
      'payroll_cycle',
      v_proposal->>'payrollPeriodId',
      v_proposal->>'payrollPeriodId'
    );
  end if;

  perform private.write_business_activity(
    'payroll',p_payroll_proposal_id,null,'payment_account_recorded',
    'Payroll payment account recorded in Finance.',
    jsonb_build_object(
      'financeAccountId',v_account_id,
      'transferFeeIdr',p_transfer_fee_amount,
      'feeTransactionId',v_fee_tx_id
    )
  );

  return v_result || jsonb_build_object(
    'financeAccountId',v_account_id,
    'transferFeeIdr',p_transfer_fee_amount,
    'feeTransactionId',v_fee_tx_id
  );
end;
$$;
revoke execute on function public.payroll_record_payment_with_account(bigint,jsonb,text,text,bigint) from public, anon;
grant execute on function public.payroll_record_payment_with_account(bigint,jsonb,text,text,bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Account transfer v2: principal remains two linked internal-transfer rows;
-- the optional bank/provider fee is a separate operating expense.
-- ---------------------------------------------------------------------------
create or replace function public.create_finance_cashflow_entry_v2(
  p_expected_revision bigint,
  p_kind text,
  p_account_id text,
  p_amount bigint,
  p_direction text default null,
  p_counterparty_account_id text default null,
  p_transaction_date timestamptz default null,
  p_note text default null,
  p_transfer_fee_amount bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_state private.operational_domain_state%rowtype;
  v_transfer_id text;
  v_fee_tx_id text;
  v_date timestamptz := coalesce(p_transaction_date,clock_timestamp());
  v_kind text := lower(trim(coalesce(p_kind,'')));
  v_actor text;
begin
  if p_transfer_fee_amount is null or p_transfer_fee_amount < 0 then
    raise exception 'TRANSFER_FEE_INVALID' using errcode='22023';
  end if;
  if p_transfer_fee_amount > 0 and v_kind <> 'transfer' then
    raise exception 'TRANSFER_FEE_ONLY_FOR_TRANSFER' using errcode='22023';
  end if;
  if p_transfer_fee_amount > 0 and p_account_id='cash:main' then
    raise exception 'TRANSFER_FEE_REQUIRES_NON_CASH_ACCOUNT' using errcode='22023';
  end if;

  select display_name into v_actor
  from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true
  limit 1;
  v_actor := coalesce(nullif(trim(v_actor),''),'Finance');

  v_result := public.create_finance_cashflow_entry(
    p_expected_revision,
    p_kind,
    p_account_id,
    p_amount,
    p_direction,
    p_counterparty_account_id,
    v_date,
    p_note
  );

  if p_transfer_fee_amount > 0 then
    select x->>'transferId' into v_transfer_id
    from jsonb_array_elements(coalesce(v_result->'snapshot'->'transactions','[]'::jsonb)) x
    where x->>'source'='transfer'
      and x->>'transferDirection'='out'
      and x->>'accountId'=p_account_id
      and coalesce((x->>'amount')::bigint,0)=p_amount
    order by x->>'createdAt' desc
    limit 1;
    if v_transfer_id is null then
      raise exception 'TRANSFER_LEDGER_PAIR_REQUIRED' using errcode='55000';
    end if;

    v_fee_tx_id := private.append_finance_transfer_fee(
      'transfer-fee:'||v_transfer_id,
      p_account_id,
      p_transfer_fee_amount,
      v_date,
      'Account transfer fee',
      coalesce(nullif(trim(coalesce(p_note,'')),''),'Account transfer')||' · transfer fee',
      null,
      'company',
      v_transfer_id,
      null,
      v_actor,
      'source_batch',
      v_transfer_id,
      'Account transfer'
    );
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain='finance';

  return jsonb_build_object(
    'domain','finance',
    'revision',v_state.revision,
    'snapshot',v_state.snapshot,
    'updatedAt',v_state.updated_at,
    'transferFeeIdr',p_transfer_fee_amount,
    'feeTransactionId',v_fee_tx_id
  );
end;
$$;
revoke execute on function public.create_finance_cashflow_entry_v2(bigint,text,text,bigint,text,text,timestamptz,text,bigint) from public, anon;
grant execute on function public.create_finance_cashflow_entry_v2(bigint,text,text,bigint,text,text,timestamptz,text,bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic posted-ledger editing is for manual rows only. Order/refund/payroll
-- and generated fee rows are corrected through their source workflow.
-- ---------------------------------------------------------------------------
create or replace function public.edit_finance_transaction(
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
  v_profile public.staff_access_profiles%rowtype;
  v_transactions jsonb;
  v_tx jsonb;
  v_next jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_account text;
  v_amount bigint;
begin
  if (select auth.uid()) is null or private.current_staff_role()<>'finance' then raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  if length(v_reason)<3 then raise exception 'EDIT_REASON_REQUIRED' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_patch,'{}'::jsonb))<>'object' then raise exception 'INVALID_PATCH' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k(key) where key not in ('accountId','amount','transactionDate','category','method','name','description','note','reference')) then
    raise exception 'FINANCE_PATCH_FIELD_NOT_ALLOWED' using errcode='22023';
  end if;

  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  select * into v_state from private.operational_domain_state where domain='finance' for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision<>p_expected_revision then raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_state.revision using errcode='40001'; end if;
  v_transactions:=coalesce(v_state.snapshot->'transactions','[]'::jsonb);
  select value into v_tx from jsonb_array_elements(v_transactions) where value->>'id'=p_transaction_id limit 1;
  if v_tx is null then raise exception 'FINANCE_TRANSACTION_NOT_FOUND' using errcode='P0002'; end if;

  if coalesce((v_tx->>'isSystemGenerated')::boolean,false)
     or coalesce(v_tx->>'entryMode','manual')='automatic'
     or v_tx->>'source' in ('order_payment','order_refund','payroll','transfer_fee')
  then
    raise exception 'AUTOMATIC_FINANCE_TRANSACTION_SOURCE_OWNED' using errcode='42501';
  end if;
  if v_tx->>'source'='transfer' then raise exception 'EDIT_TRANSFER_AS_PAIR_REQUIRED' using errcode='22023'; end if;

  v_account:=coalesce(nullif(p_patch->>'accountId',''),v_tx->>'accountId');
  if v_account is not null and v_account<>'legacy:unassigned' and not private.finance_account_is_valid(v_account) then raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023'; end if;
  v_amount:=coalesce((p_patch->>'amount')::bigint,(v_tx->>'amount')::bigint);
  if v_amount<=0 then raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode='22023'; end if;

  v_next:=v_tx || jsonb_strip_nulls(jsonb_build_object(
    'accountId',v_account,
    'amount',v_amount,
    'transactionDate',coalesce(nullif(p_patch->>'transactionDate',''),v_tx->>'transactionDate'),
    'category',coalesce(nullif(p_patch->>'category',''),v_tx->>'category'),
    'method',coalesce(nullif(p_patch->>'method',''),v_tx->>'method'),
    'name',coalesce(p_patch->>'name',v_tx->>'name'),
    'description',coalesce(p_patch->>'description',v_tx->>'description'),
    'note',coalesce(p_patch->>'note',v_tx->>'note'),
    'reference',coalesce(p_patch->>'reference',v_tx->>'reference'),
    'updatedAt',clock_timestamp(),
    'updatedBy',v_profile.display_name,
    'revision',coalesce((v_tx->>'revision')::integer,1)+1,
    'editHistory',coalesce(v_tx->'editHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'revision',coalesce((v_tx->>'revision')::integer,1)+1,
      'editedAt',clock_timestamp(),
      'editedBy',v_profile.display_name,
      'reason',v_reason,
      'previous',v_tx - 'editHistory'
    ))
  ));

  select coalesce(jsonb_agg(case when x->>'id'=p_transaction_id then v_next else x end),'[]'::jsonb)
  into v_transactions from jsonb_array_elements(v_transactions) x;

  update private.operational_domain_state
  set revision=revision+1,
      snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
      updated_by=(select auth.uid()),
      updated_at=now()
  where domain='finance'
  returning * into v_state;

  perform private.write_business_activity(
    'finance',p_transaction_id,null,'finance_transaction_edited','Finance transaction edited.',
    jsonb_build_object('reason',v_reason)
  );
  return jsonb_build_object('domain','finance','revision',v_state.revision,'snapshot',v_state.snapshot,'updatedAt',v_state.updated_at);
end;
$$;
revoke execute on function public.edit_finance_transaction(bigint,text,jsonb,text) from public, anon;
grant execute on function public.edit_finance_transaction(bigint,text,jsonb,text) to authenticated, service_role;

commit;
