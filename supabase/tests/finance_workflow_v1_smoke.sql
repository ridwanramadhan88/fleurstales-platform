-- Finance workflow v1 read-only contract checks.

do $$
declare
  v_sync_source text;
  v_reconcile_source text;
  v_manual_source text;
  v_refund_source text;
  v_payroll_source text;
  v_transfer_source text;
begin
  select pg_get_functiondef('private.sync_order_finance_transactions(text)'::regprocedure)
  into v_sync_source;

  if position('''status'',''verified''' in v_sync_source)=0
     or position('''reconciliationStatus''' in v_sync_source)=0
     or position('else ''pending''' in v_sync_source)>0 then
    raise exception 'Admin-confirmed order payments are not posted independently from Finance reconciliation';
  end if;

  select pg_get_functiondef('public.decide_order_finance_reconciliation(text,integer,text,text)'::regprocedure)
  into v_reconcile_source;
  if position('Finance returned the payment evidence for correction; the received cash remains posted.' in v_reconcile_source)=0
     or position('FULL_PAYMENT_CONFIRMATION_REQUIRED' in v_reconcile_source)=0 then
    raise exception 'Finance reconciliation lost review-only payment semantics';
  end if;

  if to_regprocedure('public.save_manual_finance_transaction(bigint,jsonb,bigint,text,text)') is null then
    raise exception 'Atomic manual Finance transaction RPC is missing';
  end if;
  if not has_function_privilege('authenticated','public.save_manual_finance_transaction(bigint,jsonb,bigint,text,text)','EXECUTE')
     or has_function_privilege('anon','public.save_manual_finance_transaction(bigint,jsonb,bigint,text,text)','EXECUTE') then
    raise exception 'Atomic manual Finance transaction RPC grants are incorrect';
  end if;

  select pg_get_functiondef('public.save_manual_finance_transaction(bigint,jsonb,bigint,text,text)'::regprocedure)
  into v_manual_source;
  if position('FINANCE_TRANSACTION_PROOF_REQUIRED' in v_manual_source)=0
     or position('TRANSFER_FEE_ONLY_FOR_NEW_MONEY_OUT' in v_manual_source)=0
     or position('AUTOMATIC_FINANCE_ENTRY_IMMUTABLE' in v_manual_source)=0
     or position('Bank / Transfer Fee' in v_manual_source)=0 then
    raise exception 'Manual Finance commit lost proof, fee, or immutability enforcement';
  end if;

  select pg_get_functiondef('public.complete_order_refund_with_account(text,integer,text)'::regprocedure)
  into v_refund_source;
  if position('FINANCE_ACCOUNT_INVALID' in v_refund_source)=0
     or position('REFUND_MUST_BE_PENDING' in v_refund_source)=0 then
    raise exception 'Refund completion no longer requires a valid paying account and pending state';
  end if;

  select pg_get_functiondef('public.record_payroll_payment_with_account(bigint,text,date,text,text,text,bigint,text)'::regprocedure)
  into v_payroll_source;
  if position('FINANCE_ACCOUNT_INVALID' in v_payroll_source)=0
     or position('Bank / Transfer Fee' in v_payroll_source)=0
     or position('TRANSFER_FEE_REQUIRES_NON_CASH_PAYMENT' in v_payroll_source)=0 then
    raise exception 'Payroll final payment lost paying-account or separate-fee enforcement';
  end if;

  select pg_get_functiondef('public.create_finance_cashflow_entry(bigint,text,text,bigint,text,text,timestamptz,text,bigint)'::regprocedure)
  into v_transfer_source;
  if position('TRANSFER_DESTINATION_INVALID' in v_transfer_source)=0
     or position('Bank / Transfer Fee' in v_transfer_source)=0
     or position('''transferDirection'',''out''' in v_transfer_source)=0
     or position('''transferDirection'',''in''' in v_transfer_source)=0 then
    raise exception 'Account transfer lost paired-principal or separate-fee behavior';
  end if;

  if has_function_privilege('authenticated','public.edit_finance_transaction(bigint,text,jsonb,text)','EXECUTE') then
    raise exception 'Authenticated users can still bypass manual-only Finance edit protection';
  end if;
end $$;
