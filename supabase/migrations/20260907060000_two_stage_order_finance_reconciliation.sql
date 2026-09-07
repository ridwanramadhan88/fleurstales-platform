-- Restore the intended two-stage order payment workflow:
-- 1. Admin confirms full payment + evidence before production.
-- 2. Finance performs the final reconciliation.
-- 3. Only Finance-reconciled order payments are verified ledger entries and
--    therefore included in account balances / revenue.

begin;

-- Finance owns the final order-payment reconciliation capability.
update private.action_capability_registry
set allowed_roles = array['finance']::text[],
    requires_edit = true
where capability = 'finance.verify_order';

insert into private.role_action_permissions(role, capability, enabled, updated_at)
values ('finance', 'finance.verify_order', true, now())
on conflict(role, capability) do update
set enabled = true,
    updated_at = now();

update private.role_action_permissions
set enabled = false,
    updated_at = now()
where capability = 'finance.verify_order'
  and role <> 'finance';

update private.authorization_state
set revision = revision + 1,
    updated_at = now()
where id = 'primary';

-- Order -> Finance projection. Admin confirmation records an order payment as
-- pending. Finance reconciliation is the only event that promotes it to
-- verified. Refunds retain their existing final/verified behavior.
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
  v_status text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return; end if;

  select * into v_state from private.operational_domain_state where domain='finance' for update;
  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_at)
    values('finance',1,'{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb,now())
    returning * into v_state;
  end if;

  v_transactions := coalesce(v_state.snapshot->'transactions','[]'::jsonb);
  v_original_transactions := v_transactions;

  for v_event in
    select * from public.order_payment_events
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

    v_status := case
      when v_event.type='refund_completed' then 'verified'
      when v_order.finance_verified then 'verified'
      else 'pending'
    end;

    if v_event.ledger_transaction_id is null then
      v_tx_id := 'txn_'||replace(gen_random_uuid()::text,'-','');
      v_tx := jsonb_strip_nulls(jsonb_build_object(
        'id',v_tx_id,
        'type',case when v_event.type='refund_completed' then 'expense' else 'income' end,
        'category',case when v_event.type='refund_completed' then 'order_refund' else case when v_order.source='walk_in' then 'walk_in_sale' else 'order_payment' end end,
        'branch',v_order.branch_id,
        'scope','branch',
        'accountId',coalesce(v_account_id,'legacy:unassigned'),
        'amount',v_event.amount_idr,
        'method',coalesce(v_event.method,'other'),
        'status',v_status,
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
      if not exists(select 1 from jsonb_array_elements(v_transactions) x where x->>'idempotencyKey'=v_event.idempotency_key) then
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
          x
          || jsonb_build_object(
            'status',v_status,
            'transactionDate',v_event.occurred_at,
            'groupKey',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
            'groupLabel',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
            'updatedAt',now()
          )
          || case when v_account_id is not null then jsonb_build_object('accountId',v_account_id) else '{}'::jsonb end
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
      jsonb_build_object('orderNumber',v_order.order_number)
    );
  end if;
end;
$$;
revoke execute on function private.sync_order_finance_transactions(text) from public, anon, authenticated;

-- Authoritative Finance decision. This is deliberately separate from Admin's
-- payment-confirmation / production-start command.
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
  if v_order.status in ('cancelled','failed') then
    raise exception 'ORDER_NOT_RECONCILABLE' using errcode='22023';
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
      'Finance reconciled the Admin-confirmed order payment.',
      jsonb_build_object(
        'orderNumber',v_order.order_number,
        'amountIdr',v_order.total_idr,
        'financeAccountId',v_event.finance_account_id,
        'financeActor',v_actor_name
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
      'Finance returned the Admin-confirmed payment for correction.',
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

-- Repair rows created while Admin confirmation incorrectly promoted an order
-- payment directly to verified. Genuine historical Finance-verified orders stay
-- verified because the projection derives status from orders.finance_verified.
do $$
declare
  v_order_id text;
begin
  for v_order_id in
    select id from public.orders where payment_status='paid'
  loop
    perform private.sync_order_finance_transactions(v_order_id);
  end loop;
end $$;

commit;
