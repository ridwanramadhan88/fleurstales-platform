-- Finance: edit every ledger transaction (also after order reconciliation) and
-- void transactions (Owner decision 2026-11-07).
--
-- * Order payment / refund ledger rows are projections of public.order_payment_events
--   (private.sync_order_finance_transactions rewrites them on every sync), so editing
--   or voiding them changes the source event and the order, then re-syncs:
--     - edit payment amount  -> orders.paid_amount_idr follows (payment status recomputed;
--       order price/total is unchanged, the gap shows as under/over payment)
--     - void payment         -> the order is cancelled; any other payment still held is
--       queued for refund; a redeemed review reward is released
--     - edit / void refund   -> orders.refund_amount_idr follows; a voided refund puts the
--       order back into the refund queue
-- * Transfers are edited / voided as a pair (same transferId).
-- * Other rows (manual, payroll, transfer fees, balance utilities) change in the ledger.
-- * Voided rows stay in the ledger for the audit trail (status 'void') and can no
--   longer change; balances and reports only count status 'verified'.
-- * Closed periods stay frozen: reopen the month first.

begin;

alter table public.order_payment_events
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text,
  add column if not exists void_reason text;

-- 1. The order projection carries the void flag instead of forcing 'verified'.
do $patch$
declare
  v_def text;
  v_old constant text := $o$'status','verified',$o$;
  v_new constant text := $n$'status',case when v_event.voided_at is not null then 'void' else 'verified' end,
            'voidedAt',v_event.voided_at,
            'voidedBy',v_event.voided_by,
            'voidReason',v_event.void_reason,$n$;
begin
  v_def := pg_get_functiondef('private.sync_order_finance_transactions(text)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 2 then
    raise exception 'sync_order_finance_transactions: expected 2 status anchors';
  end if;
  execute replace(v_def, v_old, v_new);

  v_def := pg_get_functiondef('private.finance_period_blockers(date)'::regprocedure);
  if (length(v_def) - length(replace(v_def, $o$coalesce(tx->>'status','')<>'verified'$o$, ''))) / length($o$coalesce(tx->>'status','')<>'verified'$o$) <> 1 then
    raise exception 'finance_period_blockers: expected 1 pending anchor';
  end if;
  -- Voided rows are settled: they must not block closing a month.
  execute replace(v_def, $o$coalesce(tx->>'status','')<>'verified'$o$, $n$coalesce(tx->>'status','') not in ('verified','void')$n$);
end
$patch$;

-- 2. Voided rows are frozen everywhere (any writer of the finance snapshot).
create or replace function private.guard_void_finance_transactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_tx jsonb;
  v_new_tx jsonb;
begin
  if new.domain <> 'finance' then return new; end if;
  for v_old_tx in
    select value from jsonb_array_elements(coalesce(old.snapshot->'transactions','[]'::jsonb))
    where value->>'status' = 'void'
  loop
    select value into v_new_tx
    from jsonb_array_elements(coalesce(new.snapshot->'transactions','[]'::jsonb))
    where value->>'id' = v_old_tx->>'id'
    limit 1;
    if v_new_tx is null
      or v_new_tx->>'status' is distinct from 'void'
      or v_new_tx->'amount' is distinct from v_old_tx->'amount'
      or v_new_tx->>'accountId' is distinct from v_old_tx->>'accountId'
      or v_new_tx->>'transactionDate' is distinct from v_old_tx->>'transactionDate'
      or v_new_tx->>'type' is distinct from v_old_tx->>'type'
    then
      raise exception 'FINANCE_TRANSACTION_VOID transaction=%', v_old_tx->>'id' using errcode = '55000';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function private.guard_void_finance_transactions() from public, anon, authenticated;

drop trigger if exists guard_void_finance_transactions on private.operational_domain_state;
create trigger guard_void_finance_transactions
before update on private.operational_domain_state
for each row
when (old.domain = 'finance')
execute function private.guard_void_finance_transactions();

-- 3. Shared helpers.
create or replace function private.format_idr(p_value bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Rp' || replace(to_char(coalesce(p_value, 0), 'FM999,999,999,999,990'), ',', '.');
$$;
revoke execute on function private.format_idr(bigint) from public, anon, authenticated;

create or replace function private.order_payment_status_after_change(
  p_total bigint, p_paid bigint, p_current text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_current in ('refund_pending','refunded') then p_current
    when p_paid <= 0 then 'unpaid'
    when p_paid >= p_total then 'paid'
    else 'partial'
  end;
$$;
revoke execute on function private.order_payment_status_after_change(bigint,bigint,text) from public, anon, authenticated;

create or replace function private.finance_require_editor(p_reason text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if (select auth.uid()) is null or private.current_staff_role() is distinct from 'finance' then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'FINANCE_REASON_REQUIRED' using errcode = '22023';
  end if;
  select coalesce(nullif(trim(display_name),''), role) into v_name
  from public.staff_access_profiles
  where user_id = (select auth.uid()) and is_active = true
  limit 1;
  return coalesce(v_name, 'Finance');
end;
$$;
revoke execute on function private.finance_require_editor(text) from public, anon, authenticated;

create or replace function private.finance_tx_edit_record(p_tx jsonb, p_actor text, p_reason text, p_kind text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'revision', coalesce((p_tx->>'revision')::integer, 1) + 1,
    'editedAt', clock_timestamp(),
    'editedBy', p_actor,
    'reason', trim(p_reason),
    'kind', p_kind,
    'previous', p_tx - 'editHistory'
  );
$$;
revoke execute on function private.finance_tx_edit_record(jsonb,text,text,text) from public, anon, authenticated;

-- 4. Edit any transaction.
create or replace function private.finance_edit_transaction_v2(
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
  v_actor text := private.finance_require_editor(p_reason);
  v_reason text := trim(p_reason);
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_state private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_tx jsonb;
  v_source text;
  v_event public.order_payment_events%rowtype;
  v_order public.orders%rowtype;
  v_amount bigint;
  v_delta bigint;
  v_account text;
  v_method text;
  v_date timestamptz;
  v_new_paid bigint;
  v_month date;
begin
  if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb then
    raise exception 'INVALID_PATCH' using errcode = '22023';
  end if;

  select * into v_state from private.operational_domain_state where domain = 'finance' for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode = '55000'; end if;
  if v_state.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_state.revision using errcode = '40001';
  end if;
  v_transactions := coalesce(v_state.snapshot->'transactions', '[]'::jsonb);
  select value into v_tx from jsonb_array_elements(v_transactions) where value->>'id' = p_transaction_id limit 1;
  if v_tx is null then raise exception 'FINANCE_TRANSACTION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_tx->>'status' = 'void' then raise exception 'FINANCE_TRANSACTION_VOID' using errcode = '55000'; end if;
  -- The trigger checks the new month; moving a row out of a Closed month is blocked here.
  v_month := private.finance_transaction_period_month(v_tx);
  if v_month is not null and private.finance_period_is_closed(v_month) then
    raise exception 'FINANCE_PERIOD_CLOSED month=% transaction=%', v_month, p_transaction_id using errcode = '55000';
  end if;
  v_source := coalesce(nullif(v_tx->>'source',''), 'manual');

  if v_source in ('order_payment','order_refund') and nullif(v_tx->>'sourceEventId','') is not null then
    if exists (select 1 from jsonb_object_keys(v_patch) k(key)
               where key not in ('accountId','amount','transactionDate','method','reference','description','note')) then
      raise exception 'FINANCE_PATCH_FIELD_NOT_ALLOWED' using errcode = '22023';
    end if;
    select * into v_event from public.order_payment_events where id = v_tx->>'sourceEventId' for update;
    if not found then raise exception 'FINANCE_SOURCE_EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_event.voided_at is not null then raise exception 'FINANCE_TRANSACTION_VOID' using errcode = '55000'; end if;
    select * into v_order from public.orders where id = v_event.order_id for update;

    v_amount := coalesce((v_patch->>'amount')::bigint, v_event.amount_idr);
    if v_amount <= 0 then raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode = '22023'; end if;
    v_account := coalesce(nullif(v_patch->>'accountId',''), v_event.finance_account_id);
    if v_patch ? 'accountId' and not private.finance_account_is_valid(v_account) then
      raise exception 'FINANCE_ACCOUNT_INVALID' using errcode = '22023';
    end if;
    v_method := coalesce(nullif(v_patch->>'method',''), v_event.method);
    if v_method is not null and v_method not in ('cash','transfer') then
      raise exception 'ORDER_PAYMENT_METHOD_INVALID' using errcode = '22023';
    end if;
    v_date := coalesce(nullif(v_patch->>'transactionDate','')::timestamptz, v_event.occurred_at);
    v_delta := v_amount - v_event.amount_idr;

    update public.order_payment_events
    set amount_idr = v_amount,
        finance_account_id = v_account,
        method = v_method,
        reference = case when v_patch ? 'reference' then nullif(trim(v_patch->>'reference'),'') else reference end,
        note = case when v_patch ? 'description' then nullif(trim(v_patch->>'description'),'') else note end,
        occurred_at = v_date
    where id = v_event.id;

    if v_delta <> 0 then
      if v_event.type = 'payment_received' then
        v_new_paid := greatest(0, v_order.paid_amount_idr + v_delta);
        update public.orders
        set paid_amount_idr = v_new_paid,
            payment_status = private.order_payment_status_after_change(v_order.total_idr, v_new_paid, v_order.payment_status),
            updated_at = clock_timestamp()
        where id = v_order.id;
      else
        update public.orders
        set refund_amount_idr = greatest(0, coalesce(v_order.refund_amount_idr, 0) + v_delta),
            updated_at = clock_timestamp()
        where id = v_order.id;
      end if;
    end if;

    insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
    values ('activity_'||replace(gen_random_uuid()::text,'-',''), v_order.id, 'payment',
      case when v_event.type = 'payment_received' then 'Pembayaran diedit Finance' else 'Refund diedit Finance' end
        || case when v_delta <> 0 then ': ' || private.format_idr(v_event.amount_idr) || ' → ' || private.format_idr(v_amount) else '' end
        || '. Alasan: ' || v_reason,
      v_actor, clock_timestamp(),
      jsonb_build_object('transactionId', p_transaction_id, 'previousAmountIdr', v_event.amount_idr, 'amountIdr', v_amount, 'reason', v_reason));

    -- Keep the ledger's own audit trail; the sync below refreshes the projected fields.
    select coalesce(jsonb_agg(case when x->>'id' = p_transaction_id then
      x || jsonb_strip_nulls(jsonb_build_object(
        'note', case when v_patch ? 'note' then v_patch->>'note' else x->>'note' end,
        'revision', coalesce((x->>'revision')::integer, 1) + 1,
        'updatedBy', v_actor,
        'editHistory', coalesce(x->'editHistory','[]'::jsonb) || jsonb_build_array(private.finance_tx_edit_record(x, v_actor, v_reason, 'edit'))
      ))
      else x end), '[]'::jsonb)
    into v_transactions from jsonb_array_elements(v_transactions) x;
    update private.operational_domain_state
    set revision = revision + 1, snapshot = jsonb_set(snapshot, '{transactions}', v_transactions, true),
        updated_by = (select auth.uid()), updated_at = now()
    where domain = 'finance';
    perform private.sync_order_finance_transactions(v_order.id);

  elsif v_source = 'transfer' and nullif(v_tx->>'transferId','') is not null then
    if exists (select 1 from jsonb_object_keys(v_patch) k(key)
               where key not in ('accountId','amount','transactionDate','reference','description','note')) then
      raise exception 'FINANCE_PATCH_FIELD_NOT_ALLOWED' using errcode = '22023';
    end if;
    v_amount := coalesce((v_patch->>'amount')::bigint, (v_tx->>'amount')::bigint);
    if v_amount <= 0 then raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode = '22023'; end if;
    if v_patch ? 'accountId' then
      if not private.finance_account_is_valid(v_patch->>'accountId') then
        raise exception 'FINANCE_ACCOUNT_INVALID' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(v_transactions) x
                 where x->>'transferId' = v_tx->>'transferId' and x->>'id' <> p_transaction_id
                   and x->>'accountId' = v_patch->>'accountId') then
        raise exception 'TRANSFER_SAME_ACCOUNT' using errcode = '22023';
      end if;
    end if;
    select coalesce(jsonb_agg(case when x->>'transferId' = v_tx->>'transferId' and x->>'source' = 'transfer' then
      x || jsonb_strip_nulls(jsonb_build_object(
        'accountId', case when x->>'id' = p_transaction_id then coalesce(nullif(v_patch->>'accountId',''), x->>'accountId') else x->>'accountId' end,
        'method', case when x->>'id' = p_transaction_id and v_patch ? 'accountId'
                       then case when v_patch->>'accountId' = 'cash:main' then 'cash' else 'transfer' end
                       else x->>'method' end,
        'amount', v_amount,
        'transactionDate', coalesce(nullif(v_patch->>'transactionDate',''), x->>'transactionDate'),
        'reference', case when v_patch ? 'reference' then v_patch->>'reference' else x->>'reference' end,
        'description', case when v_patch ? 'description' then v_patch->>'description' else x->>'description' end,
        'note', case when v_patch ? 'note' then v_patch->>'note' else x->>'note' end,
        'revision', coalesce((x->>'revision')::integer, 1) + 1,
        'updatedAt', clock_timestamp(),
        'updatedBy', v_actor,
        'editHistory', coalesce(x->'editHistory','[]'::jsonb) || jsonb_build_array(private.finance_tx_edit_record(x, v_actor, v_reason, 'edit'))
      ))
      else x end), '[]'::jsonb)
    into v_transactions from jsonb_array_elements(v_transactions) x;
    if exists (select 1 from jsonb_array_elements(v_transactions) x
               where x->>'transferId' = v_tx->>'transferId' and x->>'source' = 'transfer'
                 and private.finance_period_is_closed(private.finance_transaction_period_month(x))
                 and x->>'id' <> p_transaction_id) then
      raise exception 'FINANCE_PERIOD_CLOSED transfer=%', v_tx->>'transferId' using errcode = '55000';
    end if;
    update private.operational_domain_state
    set revision = revision + 1, snapshot = jsonb_set(snapshot, '{transactions}', v_transactions, true),
        updated_by = (select auth.uid()), updated_at = now()
    where domain = 'finance';

  else
    -- Manual, payroll, transfer fees and balance utilities live only in the ledger.
    return public.edit_finance_transaction(p_expected_revision, p_transaction_id, v_patch, v_reason);
  end if;

  perform private.write_business_activity('finance', p_transaction_id, null, 'finance_transaction_edited',
    'Finance transaction edited.', jsonb_build_object('reason', v_reason, 'source', v_source));
  select * into v_state from private.operational_domain_state where domain = 'finance';
  return jsonb_build_object('domain','finance','revision',v_state.revision,'snapshot',v_state.snapshot,'updatedAt',v_state.updated_at);
end;
$$;
revoke execute on function private.finance_edit_transaction_v2(bigint,text,jsonb,text) from public, anon, authenticated;

-- 5. Void a transaction.
create or replace function private.finance_void_transaction(
  p_expected_revision bigint,
  p_transaction_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.finance_require_editor(p_reason);
  v_reason text := trim(p_reason);
  v_state private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_tx jsonb;
  v_source text;
  v_event public.order_payment_events%rowtype;
  v_order public.orders%rowtype;
  v_new_paid bigint;
  v_month date;
  v_void jsonb;
begin
  select * into v_state from private.operational_domain_state where domain = 'finance' for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode = '55000'; end if;
  if v_state.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_state.revision using errcode = '40001';
  end if;
  v_transactions := coalesce(v_state.snapshot->'transactions', '[]'::jsonb);
  select value into v_tx from jsonb_array_elements(v_transactions) where value->>'id' = p_transaction_id limit 1;
  if v_tx is null then raise exception 'FINANCE_TRANSACTION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_tx->>'status' = 'void' then raise exception 'FINANCE_TRANSACTION_ALREADY_VOID' using errcode = '55000'; end if;
  v_month := private.finance_transaction_period_month(v_tx);
  if v_month is not null and private.finance_period_is_closed(v_month) then
    raise exception 'FINANCE_PERIOD_CLOSED month=% transaction=%', v_month, p_transaction_id using errcode = '55000';
  end if;
  v_source := coalesce(nullif(v_tx->>'source',''), 'manual');
  v_void := jsonb_build_object('status','void','voidedAt',clock_timestamp(),'voidedBy',v_actor,'voidReason',v_reason,
    'updatedAt',clock_timestamp(),'updatedBy',v_actor);

  if v_source in ('order_payment','order_refund') and nullif(v_tx->>'sourceEventId','') is not null then
    select * into v_event from public.order_payment_events where id = v_tx->>'sourceEventId' for update;
    if not found then raise exception 'FINANCE_SOURCE_EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_event.voided_at is not null then raise exception 'FINANCE_TRANSACTION_ALREADY_VOID' using errcode = '55000'; end if;
    select * into v_order from public.orders where id = v_event.order_id for update;

    if v_event.type = 'payment_received' then
      if v_order.payment_status in ('refund_pending','refunded') then
        raise exception 'VOID_PAYMENT_REFUND_IN_PROGRESS' using errcode = '55000',
          hint = 'Finish or cancel the refund before voiding this payment.';
      end if;
      v_new_paid := greatest(0, v_order.paid_amount_idr - v_event.amount_idr);
      update public.order_payment_events
      set voided_at = clock_timestamp(), voided_by = v_actor, void_reason = v_reason
      where id = v_event.id;

      -- Owner decision: a voided payment cancels the order. Money still held from
      -- other payments goes to the refund queue (a paid order is never cancelled
      -- without its refund).
      update public.orders
      set status = 'cancelled',
          cancellation_reason = coalesce(case when v_order.status = 'cancelled' then v_order.cancellation_reason end,
                                         'Pembayaran di-void oleh Finance: ' || v_reason),
          cancelled_by = case when v_order.status = 'cancelled' then v_order.cancelled_by else v_actor end,
          cancelled_at = case when v_order.status = 'cancelled' then v_order.cancelled_at else clock_timestamp() end,
          paid_amount_idr = v_new_paid,
          payment_status = case when v_new_paid > 0 then 'refund_pending' else 'unpaid' end,
          refund_amount_idr = case when v_new_paid > 0 then v_new_paid else refund_amount_idr end,
          refund_reason = case when v_new_paid > 0 then 'Pesanan dibatalkan karena pembayaran di-void: ' || v_reason else refund_reason end,
          refund_initiated_at = case when v_new_paid > 0 then clock_timestamp() else refund_initiated_at end,
          refund_initiated_by = case when v_new_paid > 0 then v_actor else refund_initiated_by end,
          updated_at = clock_timestamp()
      where id = v_order.id;

      if v_new_paid > 0 then
        insert into public.order_payment_events(id, order_id, type, amount_idr, previous_paid_amount_idr,
          resulting_paid_amount_idr, resulting_status, method, note, actor_name, occurred_at, idempotency_key)
        values ('payment_evt_'||replace(gen_random_uuid()::text,'-',''), v_order.id, 'refund_initiated', v_new_paid,
          v_new_paid, v_new_paid, 'refund_pending', v_order.payment_method,
          'Refund otomatis: pembayaran lain di-void', v_actor, clock_timestamp(),
          'finance-void-refund:' || v_event.id);
      end if;

      update private.customer_review_rewards
      set status = 'available', redeemed_order_id = null, redeemed_at = null
      where redeemed_order_id = v_order.id and status = 'redeemed';

      insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
      values ('activity_'||replace(gen_random_uuid()::text,'-',''), v_order.id, 'status',
        'Pembayaran ' || private.format_idr(v_event.amount_idr) || ' di-void Finance; pesanan dibatalkan. Alasan: ' || v_reason,
        v_actor, clock_timestamp(),
        jsonb_build_object('transactionId', p_transaction_id, 'amountIdr', v_event.amount_idr, 'reason', v_reason,
          'fromStatus', v_order.status, 'toStatus', 'cancelled', 'remainingPaidIdr', v_new_paid));
      perform private.write_business_activity('order', v_order.id, v_order.branch_id, 'cancelled',
        'Order cancelled because Finance voided its payment.',
        jsonb_build_object('orderNumber', v_order.order_number, 'fromStatus', v_order.status, 'toStatus', 'cancelled', 'reason', v_reason));
    else
      update public.order_payment_events
      set voided_at = clock_timestamp(), voided_by = v_actor, void_reason = v_reason
      where id = v_event.id;
      -- The refund did not happen: the order goes back to the refund queue.
      update public.orders
      set refund_amount_idr = greatest(coalesce(refund_amount_idr, 0), v_event.amount_idr),
          payment_status = 'refund_pending',
          refund_completed_at = null,
          refund_completed_by = null,
          updated_at = clock_timestamp()
      where id = v_order.id;
      insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
      values ('activity_'||replace(gen_random_uuid()::text,'-',''), v_order.id, 'payment',
        'Refund ' || private.format_idr(v_event.amount_idr) || ' di-void Finance; refund perlu diproses ulang. Alasan: ' || v_reason,
        v_actor, clock_timestamp(), jsonb_build_object('transactionId', p_transaction_id, 'reason', v_reason));
    end if;

    select coalesce(jsonb_agg(case when x->>'id' = p_transaction_id then
      x || jsonb_build_object('revision', coalesce((x->>'revision')::integer, 1) + 1,
        'editHistory', coalesce(x->'editHistory','[]'::jsonb) || jsonb_build_array(private.finance_tx_edit_record(x, v_actor, v_reason, 'void'))) || v_void
      else x end), '[]'::jsonb)
    into v_transactions from jsonb_array_elements(v_transactions) x;
    update private.operational_domain_state
    set revision = revision + 1, snapshot = jsonb_set(snapshot, '{transactions}', v_transactions, true),
        updated_by = (select auth.uid()), updated_at = now()
    where domain = 'finance';
    perform private.sync_order_finance_transactions(v_order.id);
  else
    if v_source = 'transfer' and nullif(v_tx->>'transferId','') is not null
      and exists (select 1 from jsonb_array_elements(v_transactions) x
                  where x->>'transferId' = v_tx->>'transferId' and x->>'source' = 'transfer'
                    and private.finance_period_is_closed(private.finance_transaction_period_month(x))) then
      raise exception 'FINANCE_PERIOD_CLOSED transfer=%', v_tx->>'transferId' using errcode = '55000';
    end if;
    select coalesce(jsonb_agg(case
      when x->>'id' = p_transaction_id
        or (v_source = 'transfer' and nullif(v_tx->>'transferId','') is not null
            and x->>'transferId' = v_tx->>'transferId' and x->>'source' = 'transfer')
      then x || jsonb_build_object('revision', coalesce((x->>'revision')::integer, 1) + 1,
        'editHistory', coalesce(x->'editHistory','[]'::jsonb) || jsonb_build_array(private.finance_tx_edit_record(x, v_actor, v_reason, 'void'))) || v_void
      else x end), '[]'::jsonb)
    into v_transactions from jsonb_array_elements(v_transactions) x;
    update private.operational_domain_state
    set revision = revision + 1, snapshot = jsonb_set(snapshot, '{transactions}', v_transactions, true),
        updated_by = (select auth.uid()), updated_at = now()
    where domain = 'finance';
  end if;

  perform private.write_business_activity('finance', p_transaction_id, null, 'finance_transaction_voided',
    'Finance transaction voided.', jsonb_build_object('reason', v_reason, 'source', v_source));
  select * into v_state from private.operational_domain_state where domain = 'finance';
  return jsonb_build_object('domain','finance','revision',v_state.revision,'snapshot',v_state.snapshot,'updatedAt',v_state.updated_at);
end;
$$;
revoke execute on function private.finance_void_transaction(bigint,text,text) from public, anon, authenticated;

-- 6. Client entry points (retry-storm guarded like the other Finance writes).
create or replace function public.edit_finance_transaction_v2_guarded(
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
begin
  return private.finance_edit_transaction_v2(p_expected_revision, p_transaction_id, p_patch, p_reason);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest finance data before trying again.';
end;
$$;
revoke all on function public.edit_finance_transaction_v2_guarded(bigint,text,jsonb,text) from public, anon;
grant execute on function public.edit_finance_transaction_v2_guarded(bigint,text,jsonb,text) to authenticated, service_role;

create or replace function public.void_finance_transaction_guarded(
  p_expected_revision bigint,
  p_transaction_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.finance_void_transaction(p_expected_revision, p_transaction_id, p_reason);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest finance data before trying again.';
end;
$$;
revoke all on function public.void_finance_transaction_guarded(bigint,text,text) from public, anon;
grant execute on function public.void_finance_transaction_guarded(bigint,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
