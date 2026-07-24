# Orders — Business Rules

> **Current source of truth:** payment updates reconcile `paidAmountIdr`; Florist row scope uses `floristAssignedEmployeeId`. `adminHandledEmployeeId` is attribution only.


See `entities.md` first for the Order status / Payment status state
machines referenced below. This file covers everything in the order
lifecycle *outside* Finance verification and the change-request flow —
those are documented in `finance.md`. Cancellation mechanics and refunds are
in `refunds-and-voids.md`.

**Legend for "Implementation status" on each action:**
- 🟢 **Enforced in code** — a pure domain function encodes the rule, backed by tests.
- 🟡 **Frontend-only** — the rule is real today, but only enforced by what the UI shows/hides; no request-level guard exists (there is no backend yet).
- 🔴 **Not implemented** — described for completeness / target design; no code path exists yet.

---

## Action: Create a new order

**Implementation status:** 🟢 rule logic / 🟡 permission enforcement

**Function:** `createOrder(input)` (`ordersStore.ts`), with a legacy
`addOrderFromDraft(input)` wrapper that calls it with `totalIdr: 0`.

**Allowed roles:** anyone with `orders: edit` (`canEditSection(role,
'orders', permissions)`) — see `permissions.md`. There is no additional
per-action check beyond the section grade for order creation.

**Required state:** none — this is the entry point into the pipeline.

**Validation** (`validateNewOrderForm`, `useNewOrderValidation.ts` — UI-form
level, not enforced in `createOrder` itself):
- Customer name and phone are required.
- Item: either a catalog product is selected (`orderItemCatalogId`), or a
  custom item name **and** price are both provided.
- A fulfillment type (delivery/pickup) is required; delivery additionally
  requires a delivery address.
- An order source/type is required.
- A payment method is required, **and delivery orders must be paid by bank
  transfer — cash is rejected for delivery** (test: "rejects cash payment
  for delivery orders", `useNewOrderValidation.test.ts`). Pickup orders may
  use either method.
- If `paymentStatus === 'partial'`, a deposit amount is required.
- **Gap:** none of this is re-validated inside `createOrder` itself — it's
  purely a form-layer check. A direct call to `createOrder` (or a future
  API) with an empty customer name or a cash-paid delivery order would
  succeed. See `gap-log.md` §19.

**State changes** (`createOrder`):
- Generates `orderNumber` from a per-branch running sequence
  (`BRANCH_CODE_MAP[branch]-{year}-{seq padded to 4}`, e.g. `KDM-2026-0142`).
- `status = deriveInitialStatus(orderType)`: `'walk_in'` → `confirmed`
  directly (skips the pending-verification step — a walk-in customer is
  already standing at the counter, nothing to verify); `'admin_created'`
  (i.e. WhatsApp/phone/customer-app intake keyed in by staff) →
  `pending_verification`.
- `paymentStatus = derivePaymentStatus(depositAmount, totalIdr)`: `unpaid`
  if no deposit, `partial` if `0 < deposit < total`, `paid` if
  `deposit >= total` (also handles the `totalIdr <= 0` draft case).
- `paidAmountIdr` is set to the full total if `paid`, otherwise the
  (clamped non-negative) deposit amount.
- `florist` is always `undefined` at creation — assignment happens later,
  during status advancement (see below).
- All Finance-verification fields (`financeVerified`,
  `financeVerificationStatus`, etc.), `pendingChangeRequest`, and
  `editUnlocked` start unset — an order is never created pre-locked or
  pre-verified.

**Inventory effect:** None. Catalog products no longer define Materials Recipes, so Orders never reserve or consume Stock automatically.

**Audit event:** `emitOrderCreated(newOrder)`,
`evaluateOrderPriorityAndEmitAlerts(newOrder)` (may additionally emit a
priority/urgency alert if the new order is already due-soon/late at
creation — e.g. a same-day order created close to its scheduled slot).

**Does not:**
- Assign a florist.
- Post a Finance row when no money was recorded. A positive initial payment
  does create a linked automatic order-payment transaction; see `payments.md`.
- Validate anything beyond what's listed above.

**Failure conditions:** Store-level validation and linked Finance posting may reject creation; callers receive the current command result.

---

## Action: Advance order status (quick-advance / "Next status")

**Implementation status:** 🟡 rule logic (pipeline is UI-derived, not a
domain guard) / 🟡 permission enforcement

**Functions:** `getNextStatus(order)` (`orderTableWorkflow.tsx`) computes
what "next" means; `advanceOrderStatus(...)` performs the change (calls
`ordersStore.updateOrderStatus` under the hood) and logs an activity event
with an "Undo" toast.

**Allowed roles:** anyone with `orders: edit` for the order's branch
(`canEdit` passed down from `canEditSection(role, 'orders', permissions)`)
— there is no separate per-status-transition role check.

**The pipeline itself**, per fulfillment type
(`getOrderStatusOptionsForFulfillment`, `orderStatusLabels.ts`):
- **Delivery:** `pending_verification → confirmed → processing → ready →
  delivering → delivered`
- **Pickup:** `pending_verification → confirmed → processing → ready →
  picked_up`

`cancelled` and `failed` are appended as exception states, not part of this
happy-path sequence — `isWorkflowHappyPathStatus` filters them out before
`getNextStatus` computes "current index + 1", so cancelling/failing an
order is a distinct action (see `refunds-and-voids.md`), not something
`getNextStatus` will ever return.

**Required state:**
- `getNextStatus` returns `null` (blocking the "Next status" control) if the
  order's current status is not found in its fulfillment's pipeline, or if
  it's already at the last step — this is a UI-render check only, not a
  guard inside `updateOrderStatus` itself.
- **Payment gate:** if the order has an outstanding balance (`unpaid` or
  `partial`) and the target status is `delivering` or `picked_up`
  (`shouldGateOrderAdvanceForPayment`, `orderPaymentGateDomain.ts`), the
  advance is intercepted and a payment-gate dialog shows instead of
  advancing directly — staff must mark the order paid (or acknowledge and
  proceed, depending on the dialog's own flow) before the status changes.
  This only fires for these two target statuses; nothing gates entry into
  `processing` or `ready` on an unpaid order.

**Florist assignment happens atomically with advancing to `processing`:**
advancing a Confirmed order opens `AssignFloristDialog`. The dialog resolves the
order's fulfillment date/time and displays only active Florist employees whose
effective HR shift covers that time at the order branch. Confirming calls the
single `assignFloristAndStartProcessing` store command. The command recalculates
the assignment moment and revalidates the selected employee against the live HR
schedule before writing anything, so UI state cannot bypass schedule rules.
Direct `confirmed → processing` status writes are rejected unless a stable
`floristAssignedEmployeeId` already exists.


**State changes** (`updateOrderStatus` → `transitionOrderStatus`):
- The store no longer assigns `status` directly. It derives the active role's
  owner-configurable Orders permission and submits the order, target status,
  actor, source, timestamp, and optional Undo descriptor to
  `orderStatusTransitionDomain.transitionOrderStatus`.
- Delivery next-step path: `pending_verification → confirmed → processing →
  ready → delivering → delivered`.
- Pickup next-step path: `pending_verification → confirmed → processing →
  ready → picked_up`.
- Skipped stages, same-state writes, and fulfillment-incompatible statuses are
  rejected.
- `cancelled` is an explicit exception path. `failed` is allowed only before
  fulfillment is finished. Both are terminal except when an Undo descriptor
  exactly reverses the still-current transition and proves the original
  forward transition was valid for the same actor/permission context.
- Finished orders are locked. Finance has the narrow direct-edit override;
  Owner/Admin must submit a cancellation request. Finance/Owner approval calls
  the same command with `source: 'change_request_approval'`, which validates
  the pending cancel request and clears it in the same returned record.
- `completedAt` is stamped only when entering the real terminal fulfillment
  states `delivered` or `picked_up`. `ready` is not completion. Exact Undo may pass
  `completedAtOverride` to restore the previous value.

**Inventory effect:** None. Catalog products no longer define Materials Recipes, so Orders never reserve or consume Stock automatically.

**Audit event:** `emitOrderStatusChanged` and `emitOrderUpdated` record the
previous/next status and actor; priority alerts are re-evaluated.

**Does not:** Post money merely because fulfillment status changed. Finance
transactions are created by payment events (`createOrder`/`updatePayment`) and
verified later by Finance; see `payments.md` and resolved `gap-log.md` §13.

**Failure conditions:** No-op if `orderNumber` doesn't match.

---

## Action: Change fulfillment type

**Implementation status:** 🟢 rule logic / 🟡 permission enforcement

**Function:** `setOrderFulfillment(orderNumber, fulfillment)`
(`ordersStore.ts`) — a dedicated single-writer action rather than a generic
patch, for the same reason `updateOrderStatus`/`updatePayment` are: so
exactly one code path owns the field.

**State changes:** `order.fulfillment = fulfillment`; no-op if it's already
that value (`order.fulfillment === fulfillment` check inside the `.map`).

**Does not:** Re-validate the delivery/cash payment-method rule from order
creation (`useNewOrderValidation.ts`'s "delivery orders must be paid by
bank transfer" check). Switching an already-`cash`-paid pickup order to
`delivery` through the edit form is representable with no re-check. See
`gap-log.md` §19.

**Audit event:** `emitOrderUpdated(order, 'Fulfillment type updated')`.

---

## Cross-references

- Order status / payment status state machines: `entities.md`
- Finance verification, rejection, review, and the change-request flow that
  governs edits/cancellation on *locked* (finished) orders: `finance.md`
- Cancel/void mechanics: `refunds-and-voids.md`
- Full role → section access matrix and the "Row-level scoping (decided
  direction)" section this file's `adminHandledEmployeeId`/`floristAssignedEmployeeId` decision fulfills:
  `permissions.md`
- Validation and attribution decisions: `gap-log.md` §19 and §20
