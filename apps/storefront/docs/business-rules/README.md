# Business Rules — Source of Truth

One written source of truth for every critical Fleurstales workflow, so the
backend team never needs to infer rules from React components or button
placement. Written directly from the current codebase — every claim below
cites the actual file/function it came from, not a memory of how the app is
"supposed to" work.

## Read in this order

1. **`entities.md`** — shared vocabulary. Order status, payment status,
   Finance verification status, Finance transaction status, Stock
   status/transfer, and roles — each as a state machine, each sourced
   directly from the TypeScript types. Read this first; everything else
   references these names.
2. **`status-writers.md`** — complete production write-path map for every
   persisted status field: initializers, store writers, domain transformers,
   UI callers, side effects, and missing transition guards. Read this before
   designing backend mutation endpoints.
3. **`finance.md`** — Finance verification, rejection, review-marking, and
   the Admin/Owner change-request flow (edit/cancel on locked orders).
   Written first because it has the most existing, well-tested code to
   reconcile against.
4. **`refunds-and-voids.md`** — shipped cancel/void and refund workflows,
   including linked reversing payment events and Finance ledger posting.
5. **`permissions.md`** — Section Access, Detailed Feature Access, the
   protected Settings self-lock rule, runtime Owner editing, and enforced
   Orders row-level scope for Admin and Florist. It also explains why
   `adminHandledEmployeeId` is attribution-only.
6. **`orders.md`** — the order lifecycle beyond Finance (creation, status
   advancement, florist assignment, payment/fulfillment updates), and the
   structured employee attribution used by row-level authorization.
7. **`payments.md`** — payment method selection, payment-event history,
   `paymentStatus`/`paidAmountIdr` reconciliation, automatic Finance ledger
   posting, and storefront payment settings. There is no external payment
   gateway; staff still reconcile real-world payments manually.
8. **`inventory.md`** — independent Stock item CRUD, quantity adjustments,
   branch transfers, and low-stock/expiry alerting. Catalog recipes and
   automatic Order→Stock movements have been removed. Read it together with
   `status-writers.md` and resolved `gap-log.md` §28.
9. **`gap-log.md`** — every contradiction and undecided behavior found while
   writing the above. **Read this even if you skip the others** — it's the
   actual deliverable of this exercise as much as the rule tables are.

**The business-rules documentation set is maintained as a paired written and
executable source of truth.** `gap-log.md` is present, numbered references are
validated by `business-rules.integrity.test.ts`, and current open production
boundaries are listed at the end of the gap log.

## Status legend (used throughout)

- 🟢 **Enforced in code** — a pure domain function encodes the rule, ideally backed by a test.
- 🟡 **Frontend-only** — real today, but enforced only by UI, not by the store action or an API.
- 🔴 **Not implemented** — target design; no code path exists yet.

## How to keep this from going stale

These docs describe behavior as of the commit they were written against.
They will drift the moment someone changes `orderWorkflowDomain.ts` or
`financeDomain.ts` without updating the doc. Two things make that safer:

1. Every action table cites the exact function name that implements it —
   grep for the function name across both the doc and the code before
   trusting either.
2. Existing tests (e.g. `ordersStoreFinanceActions.test.ts`) are referenced
   directly rather than restated — those tests are the executable spec and
   this Markdown is the human-readable index.
3. `business-rules.integrity.test.ts` fails when a referenced Markdown file is
   missing, a `gap-log.md` section reference has no matching section, or the
   pairing suite names a gap that is absent from the log.
