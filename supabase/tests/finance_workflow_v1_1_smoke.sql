-- Finance workflow v1.1 read-only compatibility checks.

do $$
begin
  if exists (
    select 1
    from public.order_payment_events e
    where e.type = 'payment_received'
      and e.method = 'cash'
      and e.finance_account_id is distinct from 'cash:main'
  ) then
    raise exception 'Historical cash receipts are not assigned to cash:main';
  end if;

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
    raise exception 'Source-owned payment/refund event still has a missing Finance projection';
  end if;
end $$;
