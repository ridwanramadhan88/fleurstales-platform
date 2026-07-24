# Business-rule gap log

> Rebuilt 2026-07-17 from the surviving numbered references, pairing tests,
> source code, and current workflow tests. The original Markdown file is not
> present in any retained `V2_7_x` artifact, so exact historical prose could
> not be recovered. The section numbers are preserved so existing references
> remain valid.

This is the decision and contradiction register for the business-rule docs.
It records both unresolved risks and gaps that have since been fixed or
superseded. A resolved entry stays here so its test and documentation history
remain discoverable.

## Status legend

- **Open** — the product or backend still needs a decision or implementation.
- **Partially resolved** — the prototype enforces the rule, but a production
  trust boundary, migration, or policy decision remains.
- **Resolved** — current code has one explicit behavior and regression coverage.
- **Superseded** — the old problem disappeared because the owning feature or
  architecture was intentionally removed.

## Coverage map

The executable companion is `gap-log.pairing.test.ts`. It covers the entries
where a stable domain/store behavior can be asserted. Product-only decisions
remain documentation-only.

| Gap | Pairing coverage | Current status |
|---|---|---|
| §1 | Order transition denials | Resolved |
| §2 | Refund workflow tests outside pairing suite | Resolved |
| §3 | Finance transaction lifecycle tests | Resolved |
| §4 | Shared cancellation transition | Resolved / superseded for Stock |
| §5–§7 | Documentation and authorization/audit suites | Open / partial |
| §8 | Finance-verification eligibility | Resolved |
| §9 | Finance resubmission tests | Resolved |
| §10 | Duplicate change-request denial | Resolved |
| §11 | Documentation-only product policy | Open |
| §12 | Unified correction workflow tests | Resolved |
| §13 | Payment-event ledger posting and verification | Resolved |
| §14–§18 | Authorization and scope suites | Partial / resolved |
| §19 | Characterization test of missing store validation | Open |
| §20 | Structured assignment tests | Resolved |
| §21–§23 | Payment-domain/settings tests | Resolved / partial |
| §24 | No longer applicable after recipe automation removal | Superseded |
| §25 | Stock update normalization | Resolved |
| §26–§28 | Stock-transfer tests | Resolved |

---

## §1 — Order-status transitions had multiple unguarded writers

**Status: Resolved.**

All production status changes now go through
`transitionOrderStatus`/`updateOrderStatus`. The command enforces fulfillment
sequence, terminal-state immutability, cancellation rules, finished-order
locking, exact Undo, permissions, and optimistic revisions.

**Evidence:** `orderStatusTransitionDomain.ts`,
`ordersStore.statusTransitions.test.ts`, and the §1 pairing tests.

## §2 — Refund states existed without a dedicated refund workflow

**Status: Resolved.**

Refund initiation, completion, and cancellation are explicit guarded Orders
commands. Completion appends an immutable payment event, posts a linked refund
transaction, and reduces verified cash revenue on the refund completion date.
Generic payment editing is no longer the refund workflow.

**Evidence:** `ordersStore.ts` refund commands, `FinanceRefundQueue.tsx`,
`FinanceRefundQueue.test.tsx`, and `refunds-and-voids.md`.

## §3 — Finance transaction status and automatic-posting policy was undefined

**Status: Resolved.**

Manual transactions start `pending`. Automatic order payments start `pending`
and become `verified` when Finance verifies the completed order. Completed
refunds and recorded payroll payments use their explicit workflow status.
Only pending general-ledger rows can be verified or rejected.

**Evidence:** `financeStore.ts`, `financeTransactionStatusDomain.ts`, and
Finance transaction tests.

## §4 — Cancellation paths and Stock reversal could diverge

**Status: Resolved for Orders; Stock portion superseded.**

Direct cancellation and approved cancellation requests use the same guarded
order-status command. Catalog Materials Recipes and automatic Order→Stock
reservation/deduction were later removed, so cancellation no longer has an
automatic Stock reversal responsibility.

**Evidence:** `orderStatusTransitionDomain.ts`, change-request tests,
`inventory.md`, and §4 pairing tests.

## §5 — Actor identity is still client-trusted

**Status: Open for production.**

The prototype carries employee IDs and role claims through commands, but the
browser can still select/mock the active user. Production endpoints must derive
actor identity, role, and branch claims from an authenticated server session.
Display names must never be accepted as authorization evidence.

**Related:** `permissions.md`, `orderAuthorizationDomain.ts`, backend auth
module.

## §6 — Owner Finance overrides needed an explicit boundary

**Status: Resolved in the prototype.**

Owner access is expressed through explicit action capabilities and section
access rather than hidden one-off UI exceptions. Order Finance decisions permit
Finance and Owner; general-ledger verification remains Finance-only where the
capability says so.

**Evidence:** `actionPermissions.ts`, `authorization.ts`, Finance domain tests.

## §7 — Important mutations lacked a durable audit trail

**Status: Partially resolved.**

Orders commands now append structured audit records with actor, outcome,
revision, reason, and metadata. The local backend includes an audit repository.
Production still needs server-issued timestamps and immutable server-side actor
claims; client event-bus messages are not sufficient by themselves.

**Evidence:** `auditLogStore.ts`, `orderCommandSupport.ts`, backend audit module.

## §8 — Finance verification eligibility was enforced only by queue UI

**Status: Resolved.**

`verifyOrderFinance` re-checks order existence, completion, void/cancel state,
payment consistency, permission, and revision at the mutation boundary.

**Evidence:** `canMakeOrderFinanceDecision`,
`ordersStoreFinanceActions.test.ts`, and §8 references in `finance.md`.

## §9 — Finance-rejected orders had no route back to review

**Status: Resolved.**

Admin or Owner can resubmit a completed Finance-rejected order with a required
correction note. Resubmission clears the old decision metadata, records the
revision/audit context, and returns the order to the Finance queue.

**Evidence:** `canResubmitOrderFinance`, `applyFinanceResubmission`, and
`ordersStoreFinanceResubmission.test.ts`.

## §10 — A second change request could overwrite an existing request

**Status: Resolved.**

A new request is denied while another request is pending. The original request
remains unchanged.

**Evidence:** change-request domain/store tests and §10 pairing test.

## §11 — Cancellation/void and refund are separate business decisions

**Status: Open product policy, explicit current behavior.**

Cancelling or failing an order does not silently refund money. Refunds are
separate Finance/Owner commands with their own reason, amount, audit data, and
ledger event. The business must keep deciding case-by-case whether a cancelled
paid order requires a refund; the system must not infer it without policy.

## §12 — Finance exposed overlapping Reject and Review actions

**Status: Resolved.**

New Finance decisions use one correction/request path with a required reason.
Historical rejected/review records remain readable for compatibility.

**Evidence:** Payment Verification controller/UI tests and Finance workflow docs.

## §13 — Order payments and the Finance ledger were disconnected

**Status: Resolved.**

Order payment changes create immutable payment events and idempotently post
linked `order_payment` transactions. The transaction's initial accounting date
is the payment-event date. When Finance verifies a completed order, matching
pending automatic transactions become verified and are regrouped to the real
`delivered`/`picked_up` completion date. Refund completion posts a linked
`order_refund` transaction. Finance verification does not create a second
payment row; it verifies the already-posted row.

**Evidence:** `postPaymentEventToLedger`, `recordOrderPayment`,
`verifyOrderTransactions`, `financeStore.orderLedger.test.ts`, and the §13
pairing test.

## §14 — Section permissions were only a rendering convention

**Status: Partially resolved.**

Sensitive store commands now repeat action and row-level authorization, so a
new button cannot bypass policy merely by calling a store action. Production
still needs the same checks in authenticated API/database boundaries.

## §15 — Orders lacked enforced row-level visibility and mutation scope

**Status: Resolved in the prototype.**

Owner/Finance have intentional cross-branch visibility, Admin is branch-scoped,
and Florist is assignment-scoped. Sensitive commands call
`authorizeOrderMutation`; list queries use `canViewOrder`.

**Evidence:** `orderAuthorizationDomain.ts` and authorization regression tests.

## §16 — Runtime permission/settings persistence and session invalidation

**Status: Partially resolved.**

The local API/SQLite prototype persists operational state, including settings.
A production backend still needs versioned permission storage and a decision on
what happens to already-active sessions when Owner changes access.

## §17 — Owner-editable permissions can create destructive configurations

**Status: Partially resolved.**

The Settings section is pinned so Owner cannot remove their own Settings access
or grant it to another role. Other unusual matrices remain intentionally
configurable. Production should add recovery/admin policy rather than silently
invent more restrictions.

## §18 — Assignment and handler fields needed explicit authorization meaning

**Status: Resolved.**

`floristAssignedEmployeeId` controls Florist row scope.
`adminHandledEmployeeId` is attribution for reporting/points, not a second
visibility rule. Unassigned orders are not visible to Florist.

**Evidence:** `orders.md`, `orderAuthorizationDomain.ts`, contribution-point tests.

## §19 — Order creation/edit validation is not fully enforced in the store

**Status: Open.**

The UI validates required customer/item/fulfillment fields and the delivery
payment-method rule, but a direct `createOrder` call can still bypass parts of
that form validation. Production API commands must validate the complete input
schema at the mutation boundary. Fulfillment changes also need cross-field
revalidation.

**Evidence:** §19 characterization test.

## §20 — Order assignment used unstable display-only attribution

**Status: Resolved.**

Orders now store stable employee IDs for assigned Florist and handling Admin,
plus display snapshots and assignment timestamps. Assignment and transition to
Processing occur atomically after live HR schedule validation.

## §21 — The cash/delivery rule was duplicated across forms

**Status: Resolved.**

All relevant validation imports one shared payment-gate rule. The UI and form
validator cannot silently diverge on whether cash is allowed for delivery.

**Evidence:** `orderPaymentGateDomain.ts` and §21 pairing test.

## §22 — Payment status and paid amount could contradict each other

**Status: Resolved.**

`reconcilePaidAmountIdr` owns payment amount normalization: unpaid becomes zero,
paid becomes total, partial preserves/clamps a valid partial amount, and explicit
amounts are bounded to the order total. Storefront transfer selection does not
mean cash was received; customer orders start according to their actual entered
payment amount and are reconciled by staff.

**Evidence:** payment-domain tests and §22 pairing tests.

## §23 — Storefront payment settings reset on reload

**Status: Resolved for the local prototype; production migration remains.**

Payment methods/bank accounts are part of Owner settings and are persisted
through the local operational-state backend. Production must migrate the same
schema and protect edits with authenticated Owner capabilities.

## §24 — Multi-item/quantity orders could not drive correct Stock deductions

**Status: Superseded.**

The order line-item model was implemented, but Catalog Materials Recipes and
automatic Order→Stock deduction were later removed deliberately. Inventory is
now independent and all quantity movement is explicit inside the Inventory
module. No hidden order-driven deduction remains to miscount multi-item orders.

## §25 — Stock edits could retain invalid cross-field values

**Status: Resolved.**

Editing a Stock item re-applies normalization: incompatible subcategories and
expiry dates are cleared when their controlling fields change.

**Evidence:** `stockDomain.ts` and §25 pairing tests.

## §26 — Stock transfers recorded status without moving quantity

**Status: Resolved.**

Requesting a transfer removes quantity from the source; receiving credits the
destination; cancelling restores the source exactly once.

**Evidence:** Stock transfer tests and §26 pairing tests.

## §27 — Received/cancelled transfer outcomes were not operationally reachable

**Status: Resolved.**

The Inventory workflow exposes requested, in-transit, received, and cancelled
paths with explicit actions and audit events. Permission enforcement remains
subject to the production trust-boundary note in §14.

## §28 — Terminal Stock transfers could be reversed by later writes

**Status: Resolved.**

`received` and `cancelled` are immutable terminal states. A later conflicting
write is a no-op and cannot move quantity or add an audit event.

**Evidence:** `canTransitionStockTransferStatus` and §28 pairing tests.

---

## Current open work

The gaps still requiring a production decision or boundary are:

1. **§5** server-derived authenticated identity.
2. **§7** fully server-authoritative immutable audit records/timestamps.
3. **§11** explicit business policy linking paid cancellations to refunds.
4. **§14** API/database authorization enforcement.
5. **§16–§17** production permission persistence, session invalidation, and
   recovery policy.
6. **§19** complete store/API order input validation.

Every other numbered entry is resolved or intentionally superseded and remains
here as historical context.
