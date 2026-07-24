# Payments — Business Rules

This document describes the current order-payment and Finance-ledger workflow.
There is no external payment gateway; staff record and reconcile real-world
cash/transfer events inside Fleurstales.

## Payment methods

Orders support cash and bank transfer. The shared payment gate forbids cash for
delivery orders; pickup may use cash or transfer. The same rule is consumed by
New Order and storefront validation (`orderPaymentGateDomain.ts`).

Selecting transfer does **not** imply that money has arrived. Payment status and
paid amount describe what staff have actually recorded.

## Payment status and amount

`updatePayment` is the authoritative order payment command. It validates actor,
row scope, and optimistic revision before changing anything.

`reconcilePaidAmountIdr` keeps status and amount consistent:

- `unpaid` → `paidAmountIdr = 0`
- `paid` → `paidAmountIdr = totalIdr`
- `partial` → preserve or clamp a valid partial amount
- explicit amounts are clamped to `[0, totalIdr]`

Refund states are not generic payment edits. They are owned by the dedicated
refund commands documented in `refunds-and-voids.md`.

## Payment events

Every real payment change creates an immutable `OrderPaymentEvent` containing:

- resulting payment status and amount
- event amount/direction
- method and optional reference/proof
- actor and occurrence time
- idempotency key
- linked Finance transaction ID after successful posting

The order update is committed only after the related Finance posting succeeds.

## Order payments and the Finance ledger

Order payments **are connected** to the Finance ledger.

1. `createOrder` posts an initial payment event when the order starts with a
   positive paid amount.
2. `updatePayment` builds the next payment event.
3. `postPaymentEventToLedger` idempotently calls
   `financeStore.recordOrderPayment` for received money, or
   `financeStore.recordOrderRefund` for reversing/refund events.
4. Automatic order-payment transactions start `pending`.
5. When Finance verifies the completed order, `verifyOrderTransactions`
   verifies its matching pending automatic transactions and sets their
   accounting/grouping date to the actual `delivered` or `picked_up`
   completion timestamp.

Finance verification therefore does not create a second payment transaction.
It approves the already-posted automatic transaction after confirming the
finished order. This separation preserves both timestamps:

- payment-event time: when staff recorded the money movement
- completion time: the business date used for confirmed order revenue grouping
- Finance verification time: audit metadata for the decision

Idempotency keys prevent duplicate automatic transactions when a command is
retried.

## Refunds

Refunds use explicit initiation/completion/cancellation commands. Completing a
refund posts a verified `order_refund` expense using the actual completion date
and reduces cash-basis revenue. The original payment and original order remain
in history.

See `refunds-and-voids.md`.

## General Finance transactions

Manual transactions start `pending` and require Finance verification.
Automatic payroll entries are recorded against their payroll payment date and
cycle. The Revenue Dashboard uses verified cash transactions, not raw order
totals.

## Storefront payment settings

Owner-managed bank accounts and payment instructions live in Owner Settings and
are persisted through the local operational-state backend. The storefront reads
the same settings at checkout.

## Known boundaries

- No external gateway, bank webhook, virtual-account generator, or automated
  proof validation exists.
- The browser/local backend remains a prototype trust boundary; production must
  authenticate actors and issue authoritative timestamps.
- Complete order input validation still needs to move to the production API;
  see `gap-log.md` §19.

## Tests

See:

- `orderPaymentDomain.test.ts`
- `ordersStore.paymentEvents.test.ts`
- `financeStore.orderLedger.test.ts`
- `InternalTransactionLedger.integration.test.tsx`
- `ordersStoreFinanceActions.test.ts`
- `gap-log.pairing.test.ts` §13 and §22
