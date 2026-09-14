-- Finance workflow v1.1 production compatibility repair.
--
-- Production predates the source-owned Finance projection and contains some
-- order_payment_events whose ledger_transaction_id points at a Finance snapshot
-- row that no longer exists. Finance v1's normal sync only creates a new row
-- when ledger_transaction_id is NULL, so normalize those stale links first.
--
-- Historical cash receipts are safe to assign to the canonical Cash account.
-- Historical transfer receipts remain unassigned unless their real bank account
-- was already captured; v1.1 must not guess a bank account for old money.

begin;

-- Cash has one canonical Finance account, so historical cash receipts can be
-- repaired without making a business assumption.
update public.order_payment_events
set finance_account_id = 'cash:main'
where type = 'payment_received'
  and method = 'cash'
  and finance_account_id is null;

-- A non-null ledger id is only authoritative if the row still exists in the
-- Finance snapshot. Null stale ids so the existing v1 sync can recreate and
-- relink the projection from the payment event source of truth.
update public.order_payment_events e
set ledger_transaction_id = null
where e.type in ('payment_received', 'refund_completed')
  and e.ledger_transaction_id is not null
  and not exists (
    select 1
    from private.operational_domain_state s
    cross join lateral jsonb_array_elements(
      coalesce(s.snapshot -> 'transactions', '[]'::jsonb)
    ) as tx
    where s.domain = 'finance'
      and (
        tx ->> 'id' = e.ledger_transaction_id
        or tx ->> 'sourceEventId' = e.id
      )
  );

-- Rebuild/refresh every source-owned order payment/refund projection. Unknown
-- historical transfer accounts intentionally become Legacy / unassigned through
-- the v1 sync rather than being guessed as a specific bank account.
do $$
declare
  v_order_id text;
begin
  for v_order_id in
    select distinct e.order_id
    from public.order_payment_events e
    where e.type in ('payment_received', 'refund_completed')
  loop
    perform private.sync_order_finance_transactions(v_order_id);
  end loop;
end $$;

-- Fail the migration instead of silently shipping a partially repaired ledger.
do $$
begin
  if exists (
    select 1
    from public.order_payment_events e
    where e.type in ('payment_received', 'refund_completed')
      and e.amount_idr > 0
      and (
        e.ledger_transaction_id is null
        or not exists (
          select 1
          from private.operational_domain_state s
          cross join lateral jsonb_array_elements(
            coalesce(s.snapshot -> 'transactions', '[]'::jsonb)
          ) as tx
          where s.domain = 'finance'
            and (
              tx ->> 'id' = e.ledger_transaction_id
              or tx ->> 'sourceEventId' = e.id
            )
        )
      )
  ) then
    raise exception 'FINANCE_V1_1_LEDGER_REPAIR_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.order_payment_events e
    where e.type = 'payment_received'
      and e.method = 'cash'
      and e.finance_account_id is distinct from 'cash:main'
  ) then
    raise exception 'FINANCE_V1_1_CASH_ACCOUNT_REPAIR_INCOMPLETE';
  end if;
end $$;

commit;
