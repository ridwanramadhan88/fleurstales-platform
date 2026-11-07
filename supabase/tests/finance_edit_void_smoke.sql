-- Finance edit-everything + void (2026-11-08). Rolls back.
begin;

do $static$
begin
  if has_function_privilege('anon', 'public.edit_finance_transaction_v2_guarded(bigint,text,jsonb,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.void_finance_transaction_guarded(bigint,text,text)', 'EXECUTE') then
    raise exception 'finance edit/void must not be callable by anon';
  end if;
  if has_function_privilege('authenticated', 'private.finance_void_transaction(bigint,text,text)', 'EXECUTE') then
    raise exception 'private void function must not be callable directly';
  end if;
end
$static$;

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'void-finance@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-0000000000f2', 'authenticated', 'authenticated', 'void-admin@fleurstales.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.staff_access_profiles(user_id, employee_id, display_name, role, is_active, username, email) values
  ('f0000000-0000-4000-8000-0000000000f1', 'void-finance', 'Void Finance', 'finance', true, 'void-finance', 'void-finance@fleurstales.test'),
  ('f0000000-0000-4000-8000-0000000000f2', 'emp-void-admin', 'Void Admin', 'admin', true, 'void-admin', 'void-admin@fleurstales.test');

insert into public.public_payment_accounts(id, type, bank_name, account_number, account_holder, is_active, is_default, display_order, is_customer_visible, branch_ids)
values ('smoke-void-bank', 'bank_transfer', 'Smoke Void Bank', '777000111', 'Smoke Holder', true, false, 60, false, '{}')
on conflict (id) do nothing;

insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('finance', 1, '{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb, now())
on conflict (domain) do nothing;

-- Two paid orders (A: single payment; B: deposit + settlement) plus a manual
-- expense and a transfer pair in the ledger.
set local session_replication_role = replica;
insert into public.orders(id, order_number, revision, customer_name_snapshot, source, fulfillment, status, branch_id,
  total_idr, items_subtotal_idr, discount_idr, delivery_fee_idr, payment_status, paid_amount_idr, payment_method,
  florist_schedule_override, finance_verified, edit_unlocked, created_at, updated_at, public_tracking_id)
values
  ('ord-void-a', 'SMK-VOID-A', 1, 'Void A', 'whatsapp', 'pickup', 'processing', 'Kedamaian',
   300000, 300000, 0, 0, 'paid', 300000, 'transfer', false, true, false, now(), now(), gen_random_uuid()),
  ('ord-void-b', 'SMK-VOID-B', 1, 'Void B', 'whatsapp', 'pickup', 'confirmed', 'Kedamaian',
   500000, 500000, 0, 0, 'paid', 500000, 'transfer', false, false, false, now(), now(), gen_random_uuid());
insert into public.order_payment_events(id, order_id, type, amount_idr, previous_paid_amount_idr, resulting_paid_amount_idr,
  resulting_status, method, reference, actor_name, occurred_at, idempotency_key, finance_account_id)
values
  ('evt-void-a', 'ord-void-a', 'payment_received', 300000, 0, 300000, 'paid', 'transfer', 'BCA/A', 'Smoke', now(), 'smoke-void-a', 'smoke-void-bank'),
  ('evt-void-b1', 'ord-void-b', 'payment_received', 200000, 0, 200000, 'partial', 'transfer', 'BCA/B1', 'Smoke', now(), 'smoke-void-b1', 'smoke-void-bank'),
  ('evt-void-b2', 'ord-void-b', 'payment_received', 300000, 200000, 500000, 'paid', 'cash', 'CASH/B2', 'Smoke', now(), 'smoke-void-b2', 'cash:main');
insert into public.customers(id, name, whatsapp_number, normalized_whatsapp_number, tags, created_source, created_at, updated_at, revision, promo_preferences)
values ('cust-smoke-void', 'Smoke Void', '081200000999', '6281200000999', '{}', 'admin', now(), now(), 1, '{}');
insert into private.order_reviews(id, order_id, order_number, customer_id)
values ('smoke-void-review', 'ord-void-b', 'SMK-VOID-B', 'cust-smoke-void');
insert into private.customer_review_rewards(id, customer_id, source_order_id, source_review_id, percent_off, min_order_idr, status, redeemed_order_id, redeemed_at, issued_at)
values ('smoke-void-reward', 'cust-smoke-void', 'ord-void-b', 'smoke-void-review', 10, 0, 'redeemed', 'ord-void-a', now(), now());
update private.operational_domain_state
set snapshot = jsonb_set(snapshot, '{transactions}', jsonb_build_array(
    jsonb_build_object('id','smoke-manual-exp','type','expense','category','supplies','branch','Kedamaian','scope','branch',
      'accountId','cash:main','amount',40000,'method','cash','status','verified','name','Wrapping','description','',
      'source','manual','entryMode','manual','transactionDate',now()),
    jsonb_build_object('id','smoke-tr-out','type','expense','category','other','branch','All','scope','company',
      'accountId','smoke-void-bank','amount',100000,'method','transfer','status','verified','source','transfer',
      'transferId','smoke-tr','transferDirection','out','entryMode','manual','transactionDate',now()),
    jsonb_build_object('id','smoke-tr-in','type','income','category','other','branch','All','scope','company',
      'accountId','cash:main','amount',100000,'method','cash','status','verified','source','transfer',
      'transferId','smoke-tr','transferDirection','in','entryMode','manual','transactionDate',now())
  ) || coalesce(snapshot->'transactions','[]'::jsonb), true)
where domain = 'finance';
set local session_replication_role = origin;
select private.sync_order_finance_transactions('ord-void-a');
select private.sync_order_finance_transactions('ord-void-b');


-- Test-only readers (the private schema is not readable by authenticated).
create function pg_temp.fin_rev() returns bigint language sql security definer set search_path = '' as
$$ select revision from private.operational_domain_state where domain = 'finance' $$;
create function pg_temp.fin_tx(p_id text) returns jsonb language sql security definer set search_path = '' as
$$ select value from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') where s.domain = 'finance' and value->>'id' = p_id limit 1 $$;
create function pg_temp.fin_txs() returns setof jsonb language sql security definer set search_path = '' as
$$ select value from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') where s.domain = 'finance' $$;
create function pg_temp.reward_status() returns text language sql security definer set search_path = '' as
$$ select status from private.customer_review_rewards where id = 'smoke-void-reward' $$;
create function pg_temp.order_row(p_id text) returns jsonb language sql security definer set search_path = '' as
$$ select to_jsonb(o) from public.orders o where o.id = p_id $$;
create function pg_temp.resync(p_id text) returns void language sql security definer set search_path = '' as
$$ select private.sync_order_finance_transactions(p_id) $$;
grant execute on all functions in schema pg_temp to authenticated;

create temporary table void_ids(name text primary key, tx_id text) on commit drop;
insert into void_ids
select 'a', value->>'id' from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') where s.domain='finance' and value->>'sourceEventId'='evt-void-a'
union all
select 'b1', value->>'id' from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') where s.domain='finance' and value->>'sourceEventId'='evt-void-b1';
grant all on void_ids to authenticated;

-- Admin cannot edit or void.
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
do $admin$
declare v_rev bigint := pg_temp.fin_rev();
begin
  begin
    perform public.void_finance_transaction_guarded(v_rev, 'smoke-manual-exp', 'tidak boleh');
    raise exception 'Admin voided a finance transaction';
  exception when insufficient_privilege then null;
  end;
end
$admin$;
reset role;

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $finance$
declare
  v_rev bigint;
  v_tx jsonb;
  v_order record;
  v_a text := (select tx_id from void_ids where name='a');
  v_b1 text := (select tx_id from void_ids where name='b1');
begin
  if v_a is null or v_b1 is null then raise exception 'order ledger rows were not projected'; end if;

  -- 1. Edit a reconciled order payment: amount, account, reference.
  v_rev := pg_temp.fin_rev();
  perform public.edit_finance_transaction_v2_guarded(v_rev, v_a,
    jsonb_build_object('amount', 250000, 'accountId', 'cash:main', 'method', 'cash', 'reference', 'KAS/A', 'note', 'Salah input'),
    'Nominal salah input');
  v_tx := pg_temp.fin_tx(v_a);
  if (v_tx->>'amount')::bigint <> 250000 or v_tx->>'accountId' <> 'cash:main' or v_tx->>'reference' <> 'KAS/A' then
    raise exception 'ledger row not updated from the edited event: %', v_tx;
  end if;
  if jsonb_array_length(v_tx->'editHistory') <> 1 or v_tx->'editHistory'->0->>'reason' <> 'Nominal salah input' or v_tx->>'note' <> 'Salah input' then
    raise exception 'edit history/note missing: %', v_tx;
  end if;
  select (r->>'paid_amount_idr')::bigint paid_amount_idr, r->>'payment_status' payment_status, (r->>'finance_verified')::boolean finance_verified into v_order from pg_temp.order_row('ord-void-a') r;
  if v_order.paid_amount_idr <> 250000 or v_order.payment_status <> 'partial' or not v_order.finance_verified then
    raise exception 'order paid amount did not follow the edit: %', row_to_json(v_order);
  end if;
  -- The projection is stable: a re-sync keeps the edited values.
  perform pg_temp.resync('ord-void-a');
  v_tx := pg_temp.fin_tx(v_a);
  if (v_tx->>'amount')::bigint <> 250000 then raise exception 'sync reverted the edit'; end if;

  -- 2. Reason is required.
  v_rev := pg_temp.fin_rev();
  begin
    perform public.edit_finance_transaction_v2_guarded(v_rev, v_a, '{"amount":1}'::jsonb, ' ');
    raise exception 'edit without reason accepted';
  exception when others then
    if sqlerrm not like 'FINANCE_REASON_REQUIRED%' then raise; end if;
  end;

  -- 3. Void the single payment: order cancelled, nothing to refund, reward released.
  perform public.void_finance_transaction_guarded(v_rev, v_a, 'Bukti transfer palsu');
  v_tx := pg_temp.fin_tx(v_a);
  if v_tx->>'status' <> 'void' or v_tx->>'voidReason' <> 'Bukti transfer palsu' or v_tx->>'voidedBy' <> 'Void Finance' then
    raise exception 'ledger row not voided: %', v_tx;
  end if;
  select r->>'status' status, r->>'payment_status' payment_status, (r->>'paid_amount_idr')::bigint paid_amount_idr, r->>'cancellation_reason' cancellation_reason into v_order from pg_temp.order_row('ord-void-a') r;
  if v_order.status <> 'cancelled' or v_order.payment_status <> 'unpaid' or v_order.paid_amount_idr <> 0
     or v_order.cancellation_reason not like 'Pembayaran di-void oleh Finance:%' then
    raise exception 'order not cancelled by the void: %', row_to_json(v_order);
  end if;
  if pg_temp.reward_status() is distinct from 'available' then
    raise exception 'review reward was not released';
  end if;
  perform pg_temp.resync('ord-void-a');
  if pg_temp.fin_tx(v_a)->>'status' <> 'void' then
    raise exception 'sync un-voided the payment';
  end if;

  -- 4. A voided row is frozen.
  v_rev := pg_temp.fin_rev();
  begin
    perform public.edit_finance_transaction_v2_guarded(v_rev, v_a, '{"amount":1000}'::jsonb, 'coba edit');
    raise exception 'voided row was edited';
  exception when others then
    if sqlerrm not like 'FINANCE_TRANSACTION_VOID%' then raise; end if;
  end;
  begin
    perform public.void_finance_transaction_guarded(v_rev, v_a, 'void lagi');
    raise exception 'voided row was voided again';
  exception when others then
    if sqlerrm not like 'FINANCE_TRANSACTION_ALREADY_VOID%' then raise; end if;
  end;

  -- 5. Void one of two payments: the money still held goes to the refund queue.
  perform public.void_finance_transaction_guarded(v_rev, v_b1, 'DP ganda');
  select r->>'status' status, r->>'payment_status' payment_status, (r->>'paid_amount_idr')::bigint paid_amount_idr, (r->>'refund_amount_idr')::bigint refund_amount_idr into v_order from pg_temp.order_row('ord-void-b') r;
  if v_order.status <> 'cancelled' or v_order.payment_status <> 'refund_pending' or v_order.paid_amount_idr <> 300000 or v_order.refund_amount_idr <> 300000 then
    raise exception 'partial void did not queue the remaining refund: %', row_to_json(v_order);
  end if;

  -- 6. Transfers are edited and voided as a pair.
  v_rev := pg_temp.fin_rev();
  perform public.edit_finance_transaction_v2_guarded(v_rev, 'smoke-tr-out', '{"amount":150000}'::jsonb, 'nominal transfer');
  if exists (select 1 from pg_temp.fin_txs() x where x->>'transferId'='smoke-tr' and (x->>'amount')::bigint <> 150000) then
    raise exception 'transfer pair not edited together';
  end if;
  v_rev := pg_temp.fin_rev();
  perform public.void_finance_transaction_guarded(v_rev, 'smoke-tr-in', 'transfer batal');
  if exists (select 1 from pg_temp.fin_txs() x where x->>'transferId'='smoke-tr' and x->>'status' <> 'void') then
    raise exception 'transfer pair not voided together';
  end if;

  -- 7. Manual row: edit then void.
  v_rev := pg_temp.fin_rev();
  perform public.edit_finance_transaction_v2_guarded(v_rev, 'smoke-manual-exp', '{"amount":45000}'::jsonb, 'harga naik');
  v_rev := pg_temp.fin_rev();
  perform public.void_finance_transaction_guarded(v_rev, 'smoke-manual-exp', 'dobel input');
  if pg_temp.fin_tx('smoke-manual-exp')->>'status' <> 'void' then
    raise exception 'manual row not voided';
  end if;
end
$finance$;
reset role;

-- 8. Voided rows do not block closing a month, and no other writer can change them.
do $guards$
declare v_blockers jsonb;
begin
  v_blockers := private.finance_period_blockers(date_trunc('month', timezone('Asia/Jakarta', now()))::date);
  if exists (select 1 from private.operational_domain_state s, jsonb_array_elements(s.snapshot->'transactions') x
             where s.domain='finance' and x->>'status' not in ('verified','void')
               and private.finance_transaction_period_month(x) = date_trunc('month', timezone('Asia/Jakarta', now()))::date) = false
     and (v_blockers->>'pendingTransactions')::int <> 0 then
    raise exception 'void rows counted as pending blockers: %', v_blockers;
  end if;
  begin
    update private.operational_domain_state
    set snapshot = jsonb_set(snapshot, '{transactions}', (
      select jsonb_agg(case when x->>'id'='smoke-manual-exp' then x || '{"status":"verified"}'::jsonb else x end)
      from jsonb_array_elements(snapshot->'transactions') x), true)
    where domain='finance';
    raise exception 'EXPECTED_VOID_GUARD';
  exception when others then
    if sqlerrm not like 'FINANCE_TRANSACTION_VOID%' then raise; end if;
  end;
end
$guards$;

-- 9. Closed months stay frozen for edit and void.
insert into public.finance_periods(period_month, status, closed_reason)
values (date_trunc('month', timezone('Asia/Jakarta', now()))::date, 'closed', 'smoke')
on conflict (period_month) do update set status='closed';
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $closed$
declare
  v_rev bigint := pg_temp.fin_rev();
  v_b2 text := (select x->>'id' from pg_temp.fin_txs() x where x->>'sourceEventId'='evt-void-b2');
begin
  begin
    perform public.edit_finance_transaction_v2_guarded(v_rev, v_b2, '{"reference":"X"}'::jsonb, 'periode tutup');
    raise exception 'closed period edit accepted';
  exception when others then
    if sqlerrm not like 'FINANCE_PERIOD_CLOSED%' then raise; end if;
  end;
end
$closed$;
reset role;

rollback;
