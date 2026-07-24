# Refunds and Voids — Shipped Behavior

## Current implementation

Refunds are production workflows, not target-only design. Finance and Owner can review refunds in `FinanceRefundQueue.tsx`; Orders can initiate and complete refunds through `useOrderDetailsRefund.ts`. Store commands are implemented in `ordersStore.ts`, protected by authorization and revision checks.

## Refund lifecycle

1. An eligible paid order receives a refund request.
2. The original order and payment history remain immutable.
3. Finance or Owner reviews the request.
4. Completing a refund records an auditable payment event.
5. `postPaymentEventToLedger` posts the verified refund to the general ledger through `financeStore.recordOrderRefund`.
6. Cash-basis revenue is reduced on the verified refund transaction date.

## Authorization

- Admin may request permitted order corrections but cannot complete a Finance refund.
- Finance and Owner may approve or reject refund decisions when action permissions allow it.
- Rejection, reversal, cancellation, and force-unlock require a reason.

## Integrity rules

- Never delete the original order or original payment.
- Refunds are represented as linked reversing events.
- Commands validate the expected revision to prevent stale-device writes.
- Repeated completion is idempotent/no-op.

## Tests

See `FinanceRefundQueue.test.tsx`, Orders finance action tests, ledger tests, and the gap-log pairing suite.
