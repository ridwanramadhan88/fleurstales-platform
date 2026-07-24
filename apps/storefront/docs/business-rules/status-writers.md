# Status Writer Map

**Mapped against this build on 2026-07-10.** This is the production write-path
inventory for every persisted business-state field whose name or semantics are
"status". It exists so a backend implementation does not infer mutation rules
from React controls, and so domain guards can be attached to every actual
writer rather than only the most visible one.

## Scope and terminology

Included:

- `OrderTableRow.status`
- `OrderTableRow.paymentStatus`
- the order Finance-decision tuple (`financeVerified` plus
  `financeVerificationStatus`)
- `FinanceTransaction.status`
- `StockTransfer.status`
- `CatalogVariant.status`
- `Florist.status`
- `AttendanceRecord.status`

Not counted as business writers:

- form drafts, filters, sort values, display badges, and test factories;
- derived classifications such as `StockItemStatus` (`active | low | expired |
  in_transit`), because no `status` field is stored on `StockItem`;
- boolean lifecycle flags such as `CatalogProduct.isActive` and
  `editUnlocked`; and
- Zustand hydration itself. Hydration can replace stored records from
  `apiStorage`, but it is a transport boundary, not a domain mutation. A real
  backend must validate data before it reaches that boundary.

Writer classes used below:

- **Initializer** — assigns the first state when a record is created.
- **Runtime writer** — store action that persists a state transition.
- **Domain transformer** — pure function used by a runtime writer to build the
  next record.
- **Caller** — UI/controller path that requests the transition; never the
  authoritative writer by itself.

---

## 1. Order lifecycle status — `OrderTableRow.status`

### Authoritative production writers

| Writer | Class | What it writes | Guard today | Side effects |
|---|---|---|---|---|
| `createOrder` — `src/store/ordersStore.ts` | Initializer | `confirmed` for `walk_in`; `pending_verification` for `admin_created`, via `deriveInitialStatus` | No store-layer validation of the rest of the order payload | Persists order, emits `order.created`, evaluates alerts; inventory deduction is event-driven |
| `transitionOrderStatus` — `src/domain/orderStatusTransitionDomain.ts` | **Authoritative domain command** | Builds the only legal next `OrderTableRow.status`, manages `completedAt`, and clears an approved cancellation request | Enforces order existence, owner-configurable Orders permission, locked-order role rules, fulfillment-specific next-step order, same-state rejection, terminal immutability, cancellation/failure exception rules, approval requirements, and exact Undo matching | Pure — persistence and events remain the responsibility of the runtime entry point |
| `updateOrderStatus` — `src/store/ordersStore.ts` | Runtime entry point | Persists only the order returned by `transitionOrderStatus` | Derives the live Orders permission matrix, passes actor name/role/source, and refuses every denied command | Emits `order.status_changed` and `order.updated`; emits delivered event; evaluates alerts; void/reactivation inventory effects are event-driven |
| `approveChangeRequest` cancellation branch — `src/store/ordersStoreChangeRequestActions.ts` | Runtime entry point | Persists only `transitionOrderStatus(... source: 'change_request_approval')`; no direct `status` assignment remains | Requires Finance/Owner resolver role, a pending cancellation request, and a finished order; the command clears the request atomically with the status change | Emits the same `order.status_changed` contract and update/alert events as direct cancellation |

`applyApprovedEditChangeRequest` remains in `orderWorkflowDomain.ts`, but it is **not** a status writer. It only clears an approved edit request and opens the one-time `editUnlocked` window.

### Complete caller map

Every runtime lifecycle mutation now converges on `transitionOrderStatus`:

- Orders table quick advance → `OrdersTableViewController.runAdvance` →
  `advanceOrderStatus` → `updateOrderStatus` → `transitionOrderStatus`.
- Quick-advance Undo → toast action in `advanceOrderStatus` →
  `updateOrderStatus({ source: 'undo', undoOf, completedAtOverride })` → the
  same command. Undo succeeds only while the current status still matches the
  exact original transition.
- Order Details “next status” → `useOrderDetailsActions` →
  `advanceOrderStatus` → the same store/domain path.
- Direct cancellation from Order Details → `advanceOrderStatus(nextStatus:
  'cancelled')` → the same store/domain path.
- Order Details edit/save status dropdown → `useOrderDetailsEditing` →
  `updateOrderStatus({ source: 'edit' })` → the same command. Invalid skips or
  reversals abort the save and surface the command reason.
- Finished-order cancellation request approval → Finance queue or Order
  Details change-request controller → `approveChangeRequest` →
  `transitionOrderStatus({ source: 'change_request_approval' })`.

### Enforced transition model

Happy-path status changes are next-step only:

- Delivery: `pending_verification → confirmed → processing → ready → delivering → delivered`
- Pickup: `pending_verification → confirmed → processing → ready → picked_up`

`cancelled` is an explicit exception path. `failed` is allowed only before the
order is finished. `cancelled` and `failed` are terminal outside an exact Undo.
Admin/Owner/Florist require live `orders: edit` access for active orders.
Finished orders are locked: Finance may directly cancel them; Owner/Admin must
use the reviewed cancellation-request path. Owner and Finance may resolve a
pending cancellation request through the named permission exception.

The event contract remains mandatory: every successful runtime status change
emits `order.status_changed(previousStatus, nextStatus)`. Inventory listens to
that event to restock on active→void and re-deduct on exact void→active Undo.
A backend replacement must make status commit plus audit/outbox event atomic.

---

## 2. Order payment status — `OrderTableRow.paymentStatus`

| Writer | Class | What it writes | Guard today | Main callers |
|---|---|---|---|---|
| `createOrder` — `ordersStore.ts` | Initializer | Derives `unpaid`, `partial`, or `paid` from deposit and total via `derivePaymentStatus` | No full order validation at store layer | Admin intake, storefront checkout, legacy draft helper |
| `updatePayment` — `ordersStore.ts` | Normal payment writer | Accepts only `unpaid`, `partial`, or `paid`; reconciles/clamps `paidAmountIdr` via `reconcilePaidAmountIdr` | Refund states are excluded at the type and UI boundary | Order Details save; payment-gate “mark paid and continue” from table/details |
| `initiateRefund` — `ordersStore.ts` | Refund writer | `paid → refund_pending`; records full refund amount, reason, actor, and timestamp | Finance/Owner only; meaningful reason; valid fully-paid amount | Dedicated store command; no production UI yet |
| `completeRefund` — `ordersStore.ts` | Refund writer | `refund_pending → refunded`; records completion actor/time and clears `paidAmountIdr` | Finance/Owner only; complete initiation evidence required | Dedicated store command; no production UI yet |

Normal payment changes use `updatePayment`; refund states can only be written by `initiateRefund` and `completeRefund`.
The UI currently calls it only for ordinary payment editing and marking an
order paid. Therefore refund states are **technically writable by the generic
store action**, but there is no dedicated initiate/complete-refund command, no
refund UI, no evidence model, and no ledger synchronization. Treating them as
“seed-only” was too strong; treating them as a completed workflow would also
be wrong.

The payment-gate code constructs temporary `{ ...order, paymentStatus:
'paid' }` objects to continue UI flow after the store call. Those are caller-
side projections, not additional persisted writers.

---

## 3. Order Finance-decision state

This state is represented by two coordinated fields rather than one enum:

- `financeVerified: boolean | undefined`
- `financeVerificationStatus: 'rejected' | 'review' | undefined`

| Runtime writer | Domain transformer | Result | Guard today |
|---|---|---|---|
| `verifyOrderFinance` — `ordersStoreFinanceActions.ts` | `applyFinanceVerification` | `financeVerified: true`; clears rejected/review state and notes | Uses authoritative `canMakeOrderFinanceDecision({ decision: 'verify' })` — finished, non-void, unverified, valid payment amount, permitted role |
| `rejectOrderFinance` | `applyFinanceRejection` | `financeVerificationStatus: 'rejected'` with actor/note/time | Uses the same `canMakeOrderFinanceDecision` gate; requires Finance/Owner, finished valid non-void order, unverified state, and a non-empty rejection note |
| `markOrderForFinanceReview` | `applyFinanceReviewMark` | `financeVerificationStatus: 'review'` with actor/note/time | Uses the same `canMakeOrderFinanceDecision` gate; requires Finance/Owner, finished valid non-void order, unverified state, and a non-empty review note |
| `finalizeUnlockedEdit` | `applyUnlockedEditFinalization` | On a previously verified order, resets `financeVerified` and clears verify/review metadata | Requires `editUnlocked`; no role check in writer |

Caller surfaces:

- Finance verification queue (single and bulk verify), Finance review sheet,
  and Order Details Finance section call `verifyOrderFinance`.
- Finance queue and review sheet call reject/review writers.
- Order Details edit-save calls `finalizeUnlockedEdit` after consuming an
  approved edit unlock.

Only verification currently has a complete domain gate. Rejection and review
must receive equivalent eligibility/permission gates before becoming backend
endpoints.

---

## 4. General-ledger status — `FinanceTransaction.status`

| Writer | Class | What it writes | Guard today | Caller |
|---|---|---|---|---|
| `addTransaction` — `src/store/financeStore.ts` | Initializer | Always `pending` | No role/domain validation in store | Any future transaction-entry UI; no automatic Order→ledger sync |
| `verifyTransaction` / `rejectTransaction` — `financeStore.ts` | Guarded runtime writers | `pending → verified` or `pending → rejected`; stamp actor and `updatedAt` | `canMakeFinanceTransactionDecision` requires an existing pending row and Finance role; terminal rows and stale retries are no-ops | `InternalTransactionVerificationQueueController` calls the explicit command matching the decision |

The workflow is reachable from the internal transaction verification queue.
The store and UI now share the same pending-only state machine: terminal
transactions cannot be reopened or switched, stale retries are no-ops, and
Owner's order-level Finance override does not grant general-ledger mutation.

---

## 5. Stock-transfer status — `StockTransfer.status`

| Writer | Class | What it writes | Guard today | Quantity effect |
|---|---|---|---|---|
| `requestTransfer` — `src/store/stockStoreTransferActions.ts` | Initializer | `requested` | Source exists, requested quantity > 0, available quantity > 0 | Deducts clamped quantity from source immediately |
| `updateTransferStatus` — same file | Guarded runtime writer | Only the target accepted by `canTransitionStockTransferStatus` | Transfer and source item exist; legal `from → to` transition required; same-state, skipped-stage, reversal, and terminal writes are no-ops | `in_transit → received` adds to destination exactly once; cancellation from `requested`/`in_transit` restores source exactly once; `in_transit` moves nothing |

The store and UI now enforce the same state machine:

`requested → in_transit → received`, with cancellation from `requested` or
`in_transit`. `received` and `cancelled` are terminal.

The writer resolves the current transfer inside the same atomic state update
that applies its one-time quantity effect. A repeated or stale command cannot
replay receipt/restoration, and terminal reversals cannot duplicate stock.
The pure guard lives in `src/domain/stockTransferDomain.ts`; exhaustive matrix
and store-effect coverage live in `stockTransferDomain.test.ts` and
`stockStoreTransferActions.test.ts`.

`StockItemStatus` is derived by `getStockStatusGroup` from quantities, expiry,
and active transfers. It has no persisted writer.

---

## 6. Catalog variant status — `CatalogVariant.status`

| Writer | Class | What it writes | Guard today |
|---|---|---|---|
| `addProduct` → `buildProduct` — `catalogStoreProductActions.ts` | Initializer | Preserves each submitted variant's `active | inactive` value | Form-level validation only |
| `updateProduct` — same file | Detail writer | Updates variant details while preserving the persisted status of existing variants | Existing status changes are stripped from broad product patches |
| `setCatalogVariantStatus` — same file | Runtime status writer | Changes one existing variant between `active | inactive` | Owner/Admin role, product existence, variant existence, and same-state guard |
| `importCsv` — `catalogStoreCsvActions.ts` | Initializer | New products and newly added variants start `active` | Existing variant status is left unchanged during price-only CSV updates |

The UI variant selector edits a form draft; persistence happens only through
`addProduct` or `updateProduct`.

`CatalogProduct.isActive` is a separate boolean lifecycle controlled by
`setProductActive` / `setProductsActive`; it is intentionally outside this
status-field map.

---

## 7. HR statuses

### `Florist.status`

| Writer | Class | What it writes | Guard today |
|---|---|---|---|
| `addEmployee` — `src/store/hrStore.ts` | Initializer | Always `active` | None beyond caller payload shape |
| `activateEmployee` / `deactivateEmployee` — same file | Runtime status writers | Explicit `inactive ↔ active` commands | Owner/HR role, employee existence, same-state guard, and last-active-owner protection |

The generic `updateEmployee` status writer has been removed; explicit commands are ready for the future employee editor.

### `AttendanceRecord.status`

| Writer | Class | What it writes | Guard today |
|---|---|---|---|
| `recordAttendance` — `hrStore.ts` | Initializer + overwrite writer | `present | late | absent | leave`; one record per employee/date | Owner/HR role, employee existence, active status, valid date/status, and actor validation |

The HR controller is the production caller. Re-recording the same
employee/date overwrites the existing status while preserving the record id.

---

## 8. Demo-seed assignments (initial state, not mutation commands)

These files contain literal status values used to populate a fresh demo store.
They are not runtime transition APIs, but they are listed so a grep of status
assignments has no unexplained production source:

| Seed source | Status fields assigned |
|---|---|
| `INITIAL_ORDERS` — `src/store/ordersStoreSeedData.ts` | Order lifecycle and payment states, including demo `refund_pending` rows; Finance-decision fields are absent/undefined in the seed fixtures |
| `INITIAL_TRANSACTIONS` — `src/store/financeStore.ts` | General-ledger `pending` and `verified` examples |
| `SEED_PRODUCTS` — `src/store/catalogStoreSeedData.ts` | Catalog variants start `active` |
| `INITIAL_EMPLOYEES` — `src/store/hrStore.ts` | Demo employees start `active`; attendance starts empty |
| `INITIAL_ITEMS` / stock store initialization — `src/store/stockStore.ts` | Stock items have no persisted status field; transfers and events start empty |

A backend migration should import these only as fixtures or test data. It
should not copy literal seed assignments into a mutation endpoint or treat a
demo refund row as proof that the refund workflow is implemented.

---

## 9. Backend endpoint mapping

Do not expose generic record patch endpoints for these fields. Port the named
commands instead:

| Backend command | Must own |
|---|---|
| `createOrder` | initial order + payment states, validation, creation audit/outbox |
| `transitionOrderStatus` | legal from→to transition, role/scope, completion timestamp, status event |
| `approveOrderCancellationRequest` | pending-request validation, same transition guard as direct cancellation, status event |
| `updateOrderPayment` | payment/amount invariant, role, evidence, refund relationship |
| `verify/reject/markReviewOrderFinance` | one shared Finance-decision eligibility and permission gate |
| `finalizeUnlockedOrderEdit` | consume unlock and invalidate prior Finance approval atomically |
| `verify/rejectFinanceTransaction` | pending-only transition and Finance permission |
| `transitionStockTransfer` | legal path plus exactly-once source/destination quantity movement |
| `create/updateCatalogProduct` | variant status validation |
| `activateEmployee` / `deactivateEmployee` | explicit employee lifecycle policy |
| `recordAttendance` | employee/date/branch/actor validation |

For Orders, persistence hydration or websocket payloads must never be allowed
to bypass these commands. Server state is authoritative; clients should
receive validated records, not submit whole trusted collections.

---

## 10. Remaining open gaps exposed by this map

1. Production must derive actor identity, role, and branch from an authenticated
   server session (`gap-log.md` §5).
2. Complete New Order input validation still needs a store/API boundary rather
   than relying on form validation (`gap-log.md` §19).
3. Cancellation and refund are intentionally separate commands, but the business
   policy for paid cancellations remains a product decision (`gap-log.md` §11).
4. Client-side authorization and audit behavior must be reproduced at the
   production API/database boundary (`gap-log.md` §7 and §14).

Order transitions, dedicated refunds, ledger status transitions, row-level
Orders scope, payment-event posting, and Stock-transfer terminal guards are all
implemented and covered by the referenced pairing tests.
