# Finance — Business Rules

See `entities.md` first for the Order status / Finance verification status /
Finance transaction status state machines referenced below.

**Legend for "Implementation status" on each action:**
- 🟢 **Enforced in code** — a pure domain function encodes the rule, backed by tests.
- 🟡 **Frontend-only** — the rule is real today, but only enforced by what the UI shows/hides; no request-level guard exists (there is no backend yet).
- 🔴 **Not implemented** — described for completeness / target design; no code path exists yet.

---

## Action: Finance verifies order

**Implementation status:** 🟢 rule logic and permission enforcement

**Allowed roles:**
- `finance`
- `owner` (explicit, narrow override — see `entities.md` → Roles & Permissions)

**Required state:**
- Order status is `delivered` or `picked_up` (i.e. `isOrderFinished(order)` is true)
- `order.financeVerified` is `false`
- Order is not `cancelled` or `failed` (voided — carries no revenue to verify)
- Payment data is internally consistent — `paidAmountIdr`, if present, is
  within `[0, totalIdr]` (see `hasValidPaymentInfoForVerification`).
  `paymentStatus` itself (unpaid / partial / paid / refund_pending /
  refunded) is **not** gated here — a finished order can legitimately still
  be unpaid/partial (the separate advance-gate in
  `orderPaymentGateDomain.shouldGateOrderAdvanceForPayment` is what's
  supposed to stop that in the normal UI flow, and isn't always exercised,
  e.g. a direct `updateOrderStatus` call) or mid-refund
  (refund state is handled by the dedicated refund workflow). This check only
  catches broken *data* — a `paidAmountIdr` that could not be correct — not
  payment progress.
- Actor's role passes `canVerifyOrder(role)`

**Required permission:**
`canVerifyOrder(role)` → `role in ['finance', 'owner']`
(`orderWorkflowDomain.ts`)

**Validation — single authoritative gate:**
All order-Finance decision writers call
`canMakeOrderFinanceDecision({ order, role, decision, note })` (`orderWorkflowDomain.ts`) before making
any change. This is the one function every caller — direct verify, bulk
verify, and the Finance review sheet — goes through; none of them mutate
`financeVerified` without it. It returns a structured decision:

```ts
{ allowed: true }
// or
{ allowed: false, code: 'ORDER_NOT_FINISHED', reason: '...' }
```

with `code` one of `ORDER_NOT_FOUND`, `ORDER_CANCELLED`, `ORDER_VOIDED`,
`ALREADY_VERIFIED`, `ORDER_NOT_FINISHED`, `INVALID_PAYMENT_INFO`, or
`NOT_PERMITTED`. If `allowed` is false for any reason, `verifyOrderFinance`
is a no-op: the order is returned unchanged and no `order.updated` event is
emitted. This closes gap-log §8 — the mutating action itself now re-checks
`isOrderFinished` (and more), rather than depending only on
`isPendingFinanceVerification` filtering the queue UI or on a disabled/
hidden button. Queue filtering and UI affordances remain in place as
conveniences for the common path, but are not relied upon as the only
guard — a caller invoking `verifyOrderFinance` directly against an
in-progress, cancelled, voided, already-verified, data-invalid, or
insufficiently-permitted order will not succeed.

**State changes** (`applyFinanceVerification`), applied only when
`canVerifyOrderFinance` returns `allowed: true`:
- `financeVerified = true`
- `financeVerifiedBy = actor` (display name string, not a real user ID — see `gap-log.md` §5)
- `financeVerifiedAt = new Date().toISOString()` (client clock, not a server timestamp — no server exists yet)
- `financeVerificationStatus` cleared to `undefined`
- `financeVerificationNote` cleared to `undefined`
- Order becomes **financially locked** is already true from the moment it finished (see `entities.md` edit-lock) — verification does not change the lock, it's already in effect.

**Finance effect:**
- `financeVerified` records the order-level decision.
- `verifyOrderTransactions` verifies matching pending automatic payment rows
  and dates/groups them by the actual order completion timestamp.
- The Revenue Dashboard reads verified cash transactions, not a second
  order-total confidence calculation.

**Inventory effect:** None. Finance verification does not affect Stock.

**Audit:** `finalizeOrderMutation` appends a structured order audit record
(actor, revisions, action and outcome), then `emitOrderUpdated` notifies the
in-app event bus. Production still needs server-issued identity/timestamps; see
`gap-log.md` §7.

**Does not:**
- Automatically mark the order delivered (it's already finished by this point — verification only happens on finished orders)
- Affect Inventory; Orders and Stock are independent modules
- Change the order's `status` field at all

**Failure conditions** (all handled by `canVerifyOrderFinance`, all no-ops — order unchanged, no error surfaced, no event emitted):
- Order not found → `ORDER_NOT_FOUND`
- Order cancelled → `ORDER_CANCELLED`
- Order voided (`failed`) → `ORDER_VOIDED`
- Order already verified → `ALREADY_VERIFIED` (idempotent by explicit check now, not by accident — calling twice with a different `actor` does not overwrite the original verifier). Covered by test: `ordersStoreFinanceActions.test.ts` → `verifyOrderFinance` → "is a no-op ... if the order is already verified".
- Order not yet finished (still `processing`, etc.) → `ORDER_NOT_FINISHED`. **Resolved 2026-07-10** — see gap-log §8: the store action now re-checks `isOrderFinished` itself via `canVerifyOrderFinance`, rather than relying only on `isPendingFinanceVerification` filtering the queue UI.
- Payment data invalid (`paidAmountIdr` negative or greater than `totalIdr`) → `INVALID_PAYMENT_INFO`
- Role not permitted → `NOT_PERMITTED`

---

## Action: Finance rejects order

**Implementation status:** 🟢 rule logic / 🟡 permission enforcement

**Allowed roles:** `finance`, `owner` through the shared decision guard

**Required state:**
- `order.financeVerified` is `false` (cannot reject an already-verified order)

**Required permission:** `canResolveChangeRequest(role)` — same role set as verify (`FINANCE_LOCK_OVERRIDE_ROLES`)

**Validation:** Order must exist and a meaningful correction reason is required.

**State changes** (`applyFinanceRejection`):
- `financeVerificationStatus = 'rejected'`
- `financeVerificationNote = note` (required and trimmed)
- `financeVerificationActor = actor`
- `financeVerificationAt = new Date().toISOString()`
- `financeVerified` remains `false` (unchanged)

**Finance effect:** The order leaves the active verification queue until Admin
or Owner corrects and resubmits it. Its automatic payment transaction remains
pending and therefore does not count as verified cash revenue. See resolved
`gap-log.md` §9.

**Inventory effect:** None. Finance verification does not affect Stock.

**Audit event:** `emitOrderUpdated(order, 'Rejected by Finance · {actor}: {note}')`

**Does not:**
- Change, cancel, or void the order. Admin/Owner may correct and resubmit the
  completed order through `resubmitOrderFinance`.

**Failure conditions:**
- Order already verified → no-op (test: "does not reject an order that is already verified")
- Order not found → no-op

---

## Action: Admin/Owner resubmits a Finance-rejected order

**Implementation status:** 🟢 guarded runtime workflow

A completed rejected order can return to the verification queue only through
`resubmitOrderFinance`. Admin or Owner must provide a correction note. The
command checks current revision and role, clears the previous Finance decision
metadata, stamps resubmission actor/time/note/source revision, and keeps the
order finished and locked while Finance reviews it again.

See `canResubmitOrderFinance`, `applyFinanceResubmission`, and
`ordersStoreFinanceResubmission.test.ts`.

---

## Action: Finance marks order for review

**Implementation status:** 🟢 rule logic / 🟡 permission enforcement

**Allowed roles:** `finance`, `owner`

**Required state:** `order.financeVerified` is `false`

**Required permission:** `canResolveChangeRequest(role)`

**Validation:** Order must exist and a non-empty correction note is required.

**State changes** (`applyFinanceReviewMark`):
- `financeVerificationStatus = 'review'`
- the same shared eligibility checks apply
- review note is non-empty
- `financeVerificationNote`, `financeVerificationActor`, `financeVerificationAt` set

**Finance effect:** The automatic order-payment transaction remains pending.
A review-marked order remains in the active verification queue because review
is a soft attention state, not a terminal decision.

**Inventory effect:** None. Finance verification does not affect Stock.

**Audit event:** `emitOrderUpdated(order, 'Marked for review by Finance · {actor}: {note}')`

**Does not:** Change status, verify, or reject.

**Failure conditions:** Same pattern as above — already-verified order → no-op; order not found → no-op.

---

## Action: Admin/Owner submits a change request (edit or cancel) on a locked order

**Implementation status:** 🟢 rule logic / 🟡 permission enforcement

**Allowed roles:** `admin`, `owner` (`canSubmitChangeRequest`)

**Required state:**
- Order is locked (`isOrderLocked(order)` — finished and not currently edit-unlocked)
- Order has no existing `pendingChangeRequest`; the command rejects a second
  request and preserves the first (resolved `gap-log.md` §10).

**Required permission:** `canSubmitChangeRequest(role)`

**Validation:**
- `reason` is required (type-level: `OrderChangeRequest.reason: string`, but nothing prevents an empty string today at the domain layer — validation, if any, is UI-form-level only)
- `type` is `'edit' | 'cancel'`

**State changes** (`applySubmittedChangeRequest`):
- `order.pendingChangeRequest = { id, type, reason, requestedBy, requestedAt }`
- Order status, payment status, `financeVerified` — all unchanged at submission time

**Finance effect:** None yet — effect only happens on resolution (see below).

**Inventory effect:** None. Finance verification does not affect Stock.

**Audit:** the store command records the successful/denied mutation with actor
and revision metadata; the UI event stream remains secondary.

**Does not:** Apply any change yet. This step only queues the request.

**Failure conditions:** Order not locked → the change-request UI path shouldn't be reachable (locked-only flow), but no domain-level guard rejects a request submitted against an unlocked order.

---

## Action: Finance/Owner approves a change request

**Implementation status:** 🟢 guarded frontend-domain rule

**Allowed roles:** `finance`, `owner` (`canResolveChangeRequest`)

**Required state:** `order.pendingChangeRequest` exists and is still `pending`

**Required permission:** `canResolveChangeRequest(role)`

**Validation:** `approveChangeRequest` validates the resolver role and the
current request before mutating anything. Cancel approvals additionally run
through the same authoritative `transitionOrderStatus({ source:
'change_request_approval' })` command as every other order-status write. That
command requires a pending cancel request, a finished order, a resolvable role,
and a legal transition into `cancelled`.

**State changes** — branches by request type:

*If `type === 'cancel'`:*
- `transitionOrderStatus` changes the order to `cancelled`
- `pendingChangeRequest` is cleared by that same domain result
- the shared status/update/audit event path is emitted exactly once

*If `type === 'edit'`:*
- `applyApprovedEditChangeRequest` sets `order.editUnlocked = true`
- `pendingChangeRequest` is cleared
- **No other field changes** — the actual edit happens afterward through the normal edit form

**Finance effect:**
- Cancel path: the order becomes `cancelled`. Existing cash transactions remain
  immutable history; money is reversed only through the explicit refund/payment
  correction workflow.
- Edit path: no cash movement yet — see `finalizeUnlockedEdit` below.

**Inventory effect:** None. Finance verification does not affect Stock.

**Audit event:** Cancel approval emits the shared `order.status_changed` and `order.updated` events; edit approval emits `order.updated`. The request resolver and request note remain attached to the request data used for the decision.

**Does not (edit path specifically):** Apply any field-level change itself. It only lifts the lock.

**Failure conditions:** Missing/non-pending request, unauthorized resolver, non-finished cancel target, or denied status transition → returns `false` and performs no order, event, or inventory mutation.

---

## Action: Finance/Owner rejects a change request

**Implementation status:** 🟢 rule logic / 🟡 permission enforcement

**Allowed roles:** `finance`, `owner`

**Required state:** `order.pendingChangeRequest` exists

**State changes** (`applyRejectedChangeRequest`):
- `pendingChangeRequest` cleared
- No other fields touched — order stays locked, in its current state

**Finance / Inventory effect:** None.

**Does not:** Change order status, financeVerified, or editUnlocked.

---

## Action: Admin/Owner finalizes an edit on an edit-unlocked order

**Implementation status:** 🟢 rule logic / 🟡 permission enforcement

**Required state:** `order.editUnlocked === true`

**State changes** (`applyUnlockedEditFinalization`):
- `editUnlocked = false` (re-locks the order)
- **If** the order was previously `financeVerified`, additionally:
  - `financeVerified = false`
  - `financeVerifiedBy`, `financeVerifiedAt` cleared
  - `financeVerificationStatus`, `financeVerificationNote` cleared

**Finance effect:** If the order was previously verified, its order-level
Finance decision is reset and it returns to Payment Verification. Existing
ledger rows are not rewritten by the edit unlock itself; any real money change
must be recorded through `updatePayment`, which appends a payment or reversal
event.

**Audit event:** `emitOrderUpdated(order, 'Revised after edit approval — sent back for Finance re-verification')` — only emitted if the order was previously verified (see `wasVerified` guard in `ordersStoreFinanceActions.ts`).

**Does not:** Re-run Finance verification automatically — the order re-enters the queue for a fresh human decision.

**Failure conditions:** Order not currently edit-unlocked → no-op (test: "is a no-op for an order that is not currently edit-unlocked").

---

## Action: General ledger transaction verification (income/expense)

**Implementation status:** 🟢 guarded runtime workflow

**Functions:** `verifyTransaction({ transactionId, actor })` and
`rejectTransaction({ transactionId, actor })` (`financeStore.ts`). New
transactions are initialized as `pending` by `addTransaction`; the internal
verification queue calls the explicit command matching the user's decision.

**Shared domain gate:** `canMakeFinanceTransactionDecision` requires an
existing transaction, Finance role, and current status `pending`. Owner's
order-verification override intentionally does not apply to general-ledger
mutations.

**State changes:** only `pending → verified` and `pending → rejected` are
accepted. The matching transaction receives the deciding actor and a fresh
`updatedAt`. `verified` and `rejected` are immutable terminal states; repeated,
stale, missing-id, and unauthorized commands are no-ops.

**Finance effect:** `getFinanceSummary` counts only verified transactions.

---

## Cross-references

- Order status / Finance verification status / Finance transaction status state machines: `entities.md`
- Void/cancel and refund mechanics in more detail: `refunds-and-voids.md`
- Full role → section access matrix: `permissions.md`
- All gaps referenced above (🟡/🔴 items, contradictions, and things this
  doc had to flag rather than confidently describe): `gap-log.md`
