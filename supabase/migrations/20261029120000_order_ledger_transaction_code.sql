-- Order payment ledger rows lost their Finance reconciliation code (2026-10-29).
--
-- 20260914170000_finance_posted_payments_and_manual_commit rewrote
-- private.sync_order_finance_transactions and dropped the 'transactionCode'
-- and 'proofPath' fields that 20260913023000 had added. Since then the code
-- Finance enters while reconciling is stored on public.orders but never
-- reaches the ledger row, so the reconciliation list and Transactions show "—".
--
-- 1. Restore both fields on order-payment projections (payment_received only;
--    '-' when no code is set, matching the manual ledger convention).
-- 2. Saving a code on its own re-syncs the projection immediately.
--
-- Functions are patched in place from their live definitions; the migration
-- fails unless every expected fragment is found the expected number of times.

begin;

do $migration$
declare
  v_patch record;
  v_oid oid;
  v_def text;
  v_count integer;
begin
  for v_patch in
    select * from (values
      (1, 'private', 'sync_order_finance_transactions', 2,
$old$        'reference',v_event.reference,
$old$,
$new$        'reference',v_event.reference,
        'transactionCode',case when v_event.type='payment_received'
          then coalesce(nullif(trim(coalesce(v_order.finance_reference_code,'')),''),'-') end,
        'proofPath',case when v_event.type='payment_received'
          then nullif(trim(coalesce(v_order.payment_proof_url,'')),'') end,
        'proofFileName',case when v_event.type='payment_received'
          and nullif(trim(coalesce(v_order.payment_proof_url,'')),'') is not null then 'Bukti transfer' end,
$new$),
      (2, 'public', 'save_order_finance_reference', 1,
$old$  returning * into v_order;

  return jsonb_build_object(
$old$,
$new$  returning * into v_order;

  -- Keep the ledger projection's transaction code in step with the order.
  perform private.sync_order_finance_transactions(v_order.id);

  return jsonb_build_object(
$new$)
    ) as patch(step, schema_name, function_name, expected, old_text, new_text)
    order by step
  loop
    select p.oid into strict v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = v_patch.schema_name and p.proname = v_patch.function_name;

    v_def := pg_get_functiondef(v_oid);
    v_count := (length(v_def) - length(replace(v_def, v_patch.old_text, ''))) / length(v_patch.old_text);
    if v_count <> v_patch.expected then
      raise exception 'Patch % on %.%: expected % match(es), found %',
        v_patch.step, v_patch.schema_name, v_patch.function_name, v_patch.expected, v_count;
    end if;
    execute replace(v_def, v_patch.old_text, v_patch.new_text);
  end loop;
end;
$migration$;

-- Backfill: re-project every order that already has a ledger row.
do $backfill$
declare
  v_order_id text;
begin
  for v_order_id in
    select distinct e.order_id
    from public.order_payment_events e
    where e.type = 'payment_received' and e.ledger_transaction_id is not null
  loop
    perform private.sync_order_finance_transactions(v_order_id);
  end loop;
end;
$backfill$;

commit;
