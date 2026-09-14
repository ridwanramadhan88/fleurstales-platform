-- Finish Finance workflow v1 semantics.
--
-- 1. Admin-confirmed customer payments are posted cash immediately. Finance
--    reconciliation is review metadata only and never posts/unposts cash.
-- 2. Source-owned order/refund projections are refreshed from their payment
--    event on every sync so ledger edits cannot drift from the authority row.
-- 3. Manual Money In/Out can be committed atomically with an optional separate
--    bank/transfer-fee row instead of relying on optimistic background sync.

begin;

-- ---------------------------------------------------------------------------
-- Order -> Finance projection.
-- A payment_received event means the cash already moved. `status=verified` is
-- therefore used as the existing ledger's "posted" state; reconciliation lives
-- independently on public.orders.finance_* fields.
-- ---------------------------------------------------------------------------
create or replace function private.sync_order_finance_transactions(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_state private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_original_transactions jsonb;
  v_event public.order_payment_events%rowtype;
  v_tx jsonb;
  v_tx_id text;
  v_account_id text;
  v_reconciliation_status text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return; end if;

  select * into v_state
  from private.operational_domain_state
  where domain='finance'
  for update;

  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_at)
    values('finance',1,'{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb,now())
    returning * into v_state;
  end if;

  v_transactions := coalesce(v_state.snapshot->'transactions','[]'::jsonb);
  v_original_transactions := v_transactions;

  v_reconciliation_status := case
    when v_order.finance_verified then 'reconciled'
    when v_order.finance_verification_status='rejected' then 'needs_correction'
    else 'unreviewed'
  end;

  for v_event in
    select *
    from public.order_payment_events
    where order_id=p_order_id
    order by occurred_at, id
  loop
    if v_event.type not in ('payment_received','refund_completed') or v_event.amount_idr <= 0 then
      continue;
    end if;

    v_account_id := v_event.finance_account_id;
    if v_event.type='refund_completed' and v_account_id is null then
      select e.finance_account_id into v_account_id
      from public.order_payment_events e
      where e.order_id=p_order_id
        and e.type='payment_received'
        and e.finance_account_id is not null
      order by e.occurred_at desc, e.id desc
      limit 1;
    end if;

    if v_event.ledger_transaction_id is null then
      v_tx_id := 'txn_'||replace(gen_random_uuid()::text,'-','');
      v_tx := jsonb_strip_nulls(jsonb_build_object(
        'id',v_tx_id,
        'type',case when v_event.type='refund_completed' then 'expense' else 'income' end,
        'category',case
          when v_event.type='refund_completed' then 'order_refund'
          when v_order.source='walk_in' then 'walk_in_sale'
          else 'order_payment'
        end,
        'branch',v_order.branch_id,
        'scope','branch',
        'accountId',coalesce(v_account_id,'legacy:unassigned'),
        'amount',v_event.amount_idr,
        'method',coalesce(v_event.method,'other'),
        'status','verified',
        'reconciliationStatus',case when v_event.type='payment_received' then v_reconciliation_status else null end,
        'name',case when v_event.type='refund_completed' then 'Order refund' else 'Order payment' end,
        'description',coalesce(v_event.note,''),
        'orderNumber',v_order.order_number,
        'reference',v_event.reference,
        'source',case when v_event.type='refund_completed' then 'order_refund' else 'order_payment' end,
        'entryMode','automatic',
        'transactionDate',v_event.occurred_at,
        'groupType',case when v_event.type='refund_completed' then 'refund_day' else 'order_day' end,
        'groupKey',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
        'groupLabel',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
        'sourceEventId',v_event.id,
        'idempotencyKey',v_event.idempotency_key,
        'isSystemGenerated',true,
        'actor',coalesce(v_event.actor_name,'System'),
        'createdAt',v_event.occurred_at,
        'updatedAt',now()
      ));

      if not exists(
        select 1
        from jsonb_array_elements(v_transactions) x
        where x->>'idempotencyKey'=v_event.idempotency_key
      ) then
        v_transactions := jsonb_build_array(v_tx)||v_transactions;
      else
        select x->>'id' into v_tx_id
        from jsonb_array_elements(v_transactions) x
        where x->>'idempotencyKey'=v_event.idempotency_key
        limit 1;
      end if;

      update public.order_payment_events
      set ledger_transaction_id=v_tx_id,
          finance_account_id=coalesce(finance_account_id,v_account_id)
      where id=v_event.id;
    else
      select coalesce(jsonb_agg(
        case when x->>'sourceEventId'=v_event.id then
          x || jsonb_strip_nulls(jsonb_build_object(
            'type',case when v_event.type='refund_completed' then 'expense' else 'income' end,
            'category',case
              when v_event.type='refund_completed' then 'order_refund'
              when v_order.source='walk_in' then 'walk_in_sale'
              else 'order_payment'
            end,
            'branch',v_order.branch_id,
            'scope','branch',
            'accountId',coalesce(v_account_id,'legacy:unassigned'),
            'amount',v_event.amount_idr,
            'method',coalesce(v_event.method,'other'),
            'status','verified',
            'reconciliationStatus',case when v_event.type='payment_received' then v_reconciliation_status else null end,
            'name',case when v_event.type='refund_completed' then 'Order refund' else 'Order payment' end,
            'description',coalesce(v_event.note,''),
            'orderNumber',v_order.order_number,
            'reference',v_event.reference,
            'source',case when v_event.type='refund_completed' then 'order_refund' else 'order_payment' end,
            'entryMode','automatic',
            'transactionDate',v_event.occurred_at,
            'groupType',case when v_event.type='refund_completed' then 'refund_day' else 'order_day' end,
            'groupKey',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
            'groupLabel',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
            'sourceEventId',v_event.id,
            'idempotencyKey',v_event.idempotency_key,
            'isSystemGenerated',true,
            'actor',coalesce(v_event.actor_name,'System'),
            'updatedAt',now()
          ))
        else x end
      ),'[]'::jsonb)
      into v_transactions
      from jsonb_array_elements(v_transactions) x;
    end if;
  end loop;

  if v_transactions is distinct from v_original_transactions then
    update private.operational_domain_state
    set revision=revision+1,
        snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
        updated_by=(select auth.uid()),
        updated_at=now()
    where domain='finance';

    perform private.write_business_activity(
      'finance',p_order_id,v_order.branch_id,'order_ledger_synced',
      'Order payment/refund synchronized to Finance.',
      jsonb_build_object(
        'orderNumber',v_order.order_number,
        'paymentPostedImmediately',true,
        'reconciliationStatus',v_reconciliation_status
      )
    );
  end if;
end;
$$;
revoke execute on function private.sync_order_finance_transactions(text) from public, anon, authenticated;

-- Existing Admin-confirmed receipts created by the older two-stage projection
-- are backfilled to the posted state. This does not create new payment events.
do $$
declare
  v_order_id text;
begin
  for v_order_id in
    select distinct e.order_id
    from public.order_payment_events e
    where e.type in ('payment_received','refund_completed')
  loop
    perform private.sync_order_finance_transactions(v_order_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Explicit manual Finance commit.
-- The UI supplies one normalized payload; the server owns IDs, posted status,
-- actor, edit history, fee-row construction, revision locking, and final write.
-- ---------------------------------------------------------------------------
create or replace function public.save_manual_finance_transaction(
  p_expected_revision bigint,
  p_payload jsonb,
  p_transfer_fee bigint default 0,
  p_transaction_id text default null,
  p_edit_reason text default null
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
  v_current jsonb;
  v_next jsonb;
  v_fee_tx jsonb;
  v_id text;
  v_now timestamptz := clock_timestamp();
  v_type text := lower(trim(coalesce(p_payload->>'type','')));
  v_category text := trim(coalesce(p_payload->>'category',''));
  v_scope text := lower(trim(coalesce(p_payload->>'scope','company')));
  v_branch text := trim(coalesce(p_payload->>'branch',''));
  v_account_id text := trim(coalesce(p_payload->>'accountId',''));
  v_amount bigint;
  v_method text := lower(trim(coalesce(p_payload->>'method','')));
  v_name text := trim(coalesce(p_payload->>'name',''));
  v_note text := nullif(trim(coalesce(p_payload->>'note','')),'');
  v_manual_reason text := nullif(trim(coalesce(p_payload->>'manualEntryReason','')),'');
  v_transaction_date text := trim(coalesce(p_payload->>'transactionDate',''));
  v_transaction_code text := upper(trim(coalesce(p_payload->>'transactionCode','')));
  v_proof_path text := nullif(trim(coalesce(p_payload->>'proofPath','')),'');
  v_proof_file_name text := nullif(trim(coalesce(p_payload->>'proofFileName','')),'');
  v_fee bigint := coalesce(p_transfer_fee,0);
  v_edit_reason text := nullif(trim(coalesce(p_edit_reason,'')),'');
  v_actor_name text;
  v_revision integer;
  v_previous jsonb;
begin
  if (select auth.uid()) is null or private.current_staff_role()<>'finance' then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
  end if;

  if p_transaction_id is null then
    if not private.has_action_permission('finance.create_ledger_entry') then
      raise exception 'FINANCE_CREATE_ENTRY_NOT_PERMITTED' using errcode='42501';
    end if;
  else
    if not private.has_action_permission('finance.edit_ledger_entry') then
      raise exception 'FINANCE_EDIT_ENTRY_NOT_PERMITTED' using errcode='42501';
    end if;
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true
  limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  v_actor_name := coalesce(nullif(trim(v_profile.display_name),''),v_profile.role);

  begin
    v_amount := (p_payload->>'amount')::bigint;
  exception when others then
    raise exception 'FINANCE_AMOUNT_INVALID' using errcode='22023';
  end;

  if v_type not in ('income','expense') then raise exception 'FINANCE_DIRECTION_INVALID' using errcode='22023'; end if;
  if v_category='' then raise exception 'FINANCE_CATEGORY_REQUIRED' using errcode='22023'; end if;
  if v_scope not in ('company','branch') then raise exception 'FINANCE_SCOPE_INVALID' using errcode='22023'; end if;
  if v_scope='branch' and (v_branch='' or v_branch='All') then raise exception 'FINANCE_BRANCH_REQUIRED' using errcode='22023'; end if;
  if v_scope='company' then v_branch := 'All'; end if;
  if not private.finance_account_is_valid(v_account_id) then raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023'; end if;
  if v_amount<=0 then raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode='22023'; end if;
  if v_method not in ('cash','transfer','card','other') then raise exception 'FINANCE_PAYMENT_METHOD_INVALID' using errcode='22023'; end if;
  if v_method='cash' and v_account_id<>'cash:main' then raise exception 'CASH_PAYMENT_REQUIRES_CASH_ACCOUNT' using errcode='22023'; end if;
  if v_method<>'cash' and v_account_id='cash:main' then raise exception 'NON_CASH_PAYMENT_REQUIRES_NON_CASH_ACCOUNT' using errcode='22023'; end if;
  if v_name='' then raise exception 'FINANCE_TRANSACTION_NAME_REQUIRED' using errcode='22023'; end if;
  if v_transaction_date='' then raise exception 'FINANCE_TRANSACTION_DATE_REQUIRED' using errcode='22023'; end if;
  if v_proof_path is null then raise exception 'FINANCE_TRANSACTION_PROOF_REQUIRED' using errcode='22023'; end if;
  if v_fee<0 then raise exception 'TRANSFER_FEE_INVALID' using errcode='22023'; end if;
  if v_fee>0 and (p_transaction_id is not null or v_type<>'expense') then raise exception 'TRANSFER_FEE_ONLY_FOR_NEW_MONEY_OUT' using errcode='22023'; end if;
  if v_fee>0 and v_method='cash' then raise exception 'TRANSFER_FEE_REQUIRES_NON_CASH_PAYMENT' using errcode='22023'; end if;
  if v_transaction_code='' then v_transaction_code := '-'; end if;

  select * into v_state
  from private.operational_domain_state
  where domain='finance'
  for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision<>p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_state.revision using errcode='40001';
  end if;

  v_transactions := coalesce(v_state.snapshot->'transactions','[]'::jsonb);

  if p_transaction_id is null then
    v_id := 'txn_'||replace(gen_random_uuid()::text,'-','');
    v_next := jsonb_strip_nulls(jsonb_build_object(
      'id',v_id,
      'type',v_type,
      'category',v_category,
      'branch',v_branch,
      'scope',v_scope,
      'accountId',v_account_id,
      'amount',v_amount,
      'method',v_method,
      'status','verified',
      'name',v_name,
      'description',coalesce(v_note,''),
      'note',v_note,
      'manualEntryReason',v_manual_reason,
      'transactionCode',v_transaction_code,
      'proofPath',v_proof_path,
      'proofFileName',v_proof_file_name,
      'source','manual',
      'entryMode','manual',
      'transactionDate',v_transaction_date,
      'isSystemGenerated',false,
      'actor',v_actor_name,
      'createdAt',v_now,
      'updatedAt',v_now,
      'revision',1
    ));
    v_transactions := jsonb_build_array(v_next)||v_transactions;

    if v_fee>0 then
      v_fee_tx := jsonb_build_object(
        'id','txn_'||replace(gen_random_uuid()::text,'-',''),
        'type','expense',
        'category','other',
        'branch',v_branch,
        'scope',v_scope,
        'accountId',v_account_id,
        'amount',v_fee,
        'method',v_method,
        'status','verified',
        'name','Bank / Transfer Fee',
        'description','Transfer fee for '||v_name,
        'reference',v_id,
        'transactionCode',case when v_transaction_code='-' then '-' else v_transaction_code||'-FEE' end,
        'source','manual',
        'entryMode','automatic',
        'transactionDate',v_transaction_date,
        'isSystemGenerated',true,
        'note',v_note,
        'actor',v_actor_name,
        'createdAt',v_now,
        'updatedAt',v_now,
        'revision',1
      );
      v_transactions := jsonb_build_array(v_fee_tx)||v_transactions;
    end if;
  else
    select value into v_current
    from jsonb_array_elements(v_transactions)
    where value->>'id'=p_transaction_id
    limit 1;
    if v_current is null then raise exception 'FINANCE_TRANSACTION_NOT_FOUND' using errcode='P0002'; end if;
    if coalesce((v_current->>'isSystemGenerated')::boolean,false)
       or coalesce(nullif(v_current->>'entryMode',''),'manual')<>'manual'
       or coalesce(nullif(v_current->>'source',''),'manual')<>'manual' then
      raise exception 'AUTOMATIC_FINANCE_ENTRY_IMMUTABLE' using errcode='22023';
    end if;

    v_revision := coalesce((v_current->>'revision')::integer,1)+1;
    v_previous := jsonb_build_object(
      'type',v_current->>'type',
      'category',v_current->>'category',
      'branch',v_current->>'branch',
      'scope',v_current->>'scope',
      'accountId',v_current->>'accountId',
      'amount',v_current->>'amount',
      'method',v_current->>'method',
      'name',v_current->>'name',
      'description',v_current->>'description',
      'transactionDate',v_current->>'transactionDate',
      'transactionCode',v_current->>'transactionCode',
      'proofPath',v_current->>'proofPath'
    );

    v_next := v_current || jsonb_strip_nulls(jsonb_build_object(
      'type',v_type,
      'category',v_category,
      'branch',v_branch,
      'scope',v_scope,
      'accountId',v_account_id,
      'amount',v_amount,
      'method',v_method,
      'status','verified',
      'name',v_name,
      'description',coalesce(v_note,''),
      'note',v_note,
      'manualEntryReason',v_manual_reason,
      'transactionCode',v_transaction_code,
      'proofPath',v_proof_path,
      'proofFileName',v_proof_file_name,
      'transactionDate',v_transaction_date,
      'updatedBy',v_actor_name,
      'updatedAt',v_now,
      'revision',v_revision,
      'editHistory',coalesce(v_current->'editHistory','[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'revision',v_revision,
        'editedAt',v_now,
        'editedBy',v_actor_name,
        'reason',v_edit_reason,
        'previous',v_previous
      )))
    ));

    select coalesce(jsonb_agg(case when x->>'id'=p_transaction_id then v_next else x end),'[]'::jsonb)
    into v_transactions
    from jsonb_array_elements(v_transactions) x;
    v_id := p_transaction_id;
  end if;

  update private.operational_domain_state
  set revision=revision+1,
      snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
      updated_by=(select auth.uid()),
      updated_at=now()
  where domain='finance'
  returning * into v_state;

  perform private.write_business_activity(
    'finance',v_id,case when v_branch='All' then null else v_branch end,
    case when p_transaction_id is null then 'manual_transaction_created' else 'manual_transaction_updated' end,
    case when p_transaction_id is null then 'Manual Finance transaction committed.' else 'Manual Finance transaction corrected.' end,
    jsonb_build_object(
      'transactionId',v_id,
      'type',v_type,
      'category',v_category,
      'accountId',v_account_id,
      'amount',v_amount,
      'transferFee',v_fee,
      'editReason',v_edit_reason
    )
  );

  return jsonb_build_object(
    'domain','finance',
    'revision',v_state.revision,
    'snapshot',v_state.snapshot,
    'updatedAt',v_state.updated_at,
    'transactionId',v_id
  );
end;
$$;
revoke execute on function public.save_manual_finance_transaction(bigint,jsonb,bigint,text,text) from public, anon;
grant execute on function public.save_manual_finance_transaction(bigint,jsonb,bigint,text,text) to authenticated, service_role;

commit;
