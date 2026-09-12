-- Unify Finance reconciliation codes with the transaction ledger and add a
-- private evidence bucket for manual Money In / Money Out entries.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-transaction-proofs',
  'finance-transaction-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists finance_transaction_proofs_insert on storage.objects;
drop policy if exists finance_transaction_proofs_select on storage.objects;
drop policy if exists finance_transaction_proofs_delete on storage.objects;

create policy finance_transaction_proofs_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'finance-transaction-proofs'
  and private.current_staff_role() = 'finance'
  and private.has_action_permission('finance.create_ledger_entry')
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy finance_transaction_proofs_select on storage.objects
for select to authenticated
using (
  bucket_id = 'finance-transaction-proofs'
  and private.current_staff_role() in ('finance','owner')
);

create policy finance_transaction_proofs_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'finance-transaction-proofs'
  and private.current_staff_role() = 'finance'
  and private.has_action_permission('finance.edit_ledger_entry')
  and split_part(name, '/', 1) = (select auth.uid())::text
);

-- Order -> Finance projection. Keep payment-provider references separate from
-- Finance's own Transaction Code. Transfer proof remains in the existing
-- private order-payment-proofs bucket and is referenced by object path only.
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
  v_transaction_code text;
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
  v_transaction_code := coalesce(nullif(trim(coalesce(v_order.finance_reference_code,'')),''),'-');

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
        'transactionCode',case when v_event.type='payment_received' then v_transaction_code else null end,
        'proofPath',case when v_event.type='payment_received' then nullif(trim(coalesce(v_order.payment_proof_url,'')),'') else null end,
        'proofFileName',case when v_event.type='payment_received' and nullif(trim(coalesce(v_order.payment_proof_url,'')),'') is not null then 'Bukti transfer' else null end,
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
          || case when v_event.type='payment_received' then jsonb_build_object('transactionCode',v_transaction_code) else '{}'::jsonb end
          || case
               when v_event.type='payment_received' and nullif(trim(coalesce(v_order.payment_proof_url,'')),'') is not null
                 then jsonb_build_object('proofPath',v_order.payment_proof_url,'proofFileName','Bukti transfer')
               else '{}'::jsonb
             end
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

-- Backfill existing payment rows so previously reconciled orders receive their
-- Finance Transaction Code and proof metadata without duplicating ledger rows.
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
