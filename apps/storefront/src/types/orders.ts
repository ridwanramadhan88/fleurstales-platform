/**
 * @file orders.ts
 * @description Shared order-related types used across Orders UI components and stores.
 */

/**
 * @description Branch identifier. Branches are now owner-managed data (see
 * `src/types/settings.ts` — `BranchSettings`) rather than a fixed type-level
 * union, so this is just a stable string id (e.g. 'Kedamaian') that happens
 * to match a `BranchSettings.id` in the settings store. Kept as its own
 * named type (rather than inlining `string`) so branch-typed fields stay
 * self-documenting.
 */
export type BranchId = string

/**
 * @description The value driven by the global branch switcher (top bar +
 * sidebar). Extends BranchId with 'All', meaning "don't filter by branch —
 * show data across every branch". Anywhere data is actually scoped to one
 * real branch (e.g. creating a new order), narrow this back to BranchId.
 */
export type BranchFilter = BranchId | 'All'

/**
 * @description Selectable values for the global branch switcher (top bar,
 * sidebar, BranchSelect page). This used to be a hardcoded constant; the
 * live list of active branches now comes from the settings store via
 * `getBranchFilterOptions` in `src/domain/settings/settingsSelectors.ts`.
 * Kept only as a build-time fallback for contexts with no settings store
 * access (e.g. isolated unit tests).
 */
export const BRANCH_FILTER_OPTIONS: BranchFilter[] = ['All', 'Kedamaian', 'Pahoman']

/**
 * @description Source of the order (intake channel).
 */
export type OrderSource = 'whatsapp' | 'walk_in' | 'customer_app'

/**
 * @description Fulfillment type for the order.
 */
export type OrderFulfillment = 'delivery' | 'pickup'

/**
 * @description Core order status values used in the table and details views.
 */
export type OrderStatus =
  | 'pending_verification'
  | 'confirmed'
  | 'processing'
  | 'ready'
  | 'delivering'
  | 'delivered'
  | 'picked_up'
  | 'cancelled'
  | 'failed'

/**
 * @description Payment status for the order.
 */
export type PaymentStatus =
  | 'unpaid'
  | 'partial'
  | 'paid'
  | 'refund_pending'
  | 'refunded'

export type PaymentMethod = 'cash' | 'transfer'

export type OrderPaymentEventType =
  | 'payment_received'
  | 'payment_reversed'
  | 'payment_status_adjusted'
  | 'refund_initiated'
  | 'refund_completed'
  | 'refund_cancelled'

export interface OrderCustomerSnapshot {
  /** Stable CRM customer id at the time the order was created. */
  customerId?: string
  name: string
  whatsappNumber?: string
  /** @deprecated Legacy persisted alias. Migrated to whatsappNumber. */
  phone?: string
  email?: string
}

/** Missing CRM values captured during Storefront checkout for later staff review. */
export interface OrderCustomerProfileSuggestions {
  birthday?: string
  email?: string
  preferredBranchId?: BranchId
}

/** Immutable payment timeline entry. The order keeps the current aggregate
 * fields for fast rendering, while this history preserves how that state was reached. */
export interface OrderPaymentEvent {
  id: string
  type: OrderPaymentEventType
  amountIdr: number
  previousPaidAmountIdr: number
  resultingPaidAmountIdr: number
  resultingStatus: PaymentStatus
  method?: PaymentMethod
  reference?: string
  proofId?: string
  note?: string
  actorId?: string
  actorName: string
  occurredAt: string
  /** Shared with Finance ledger posting so retries cannot create duplicates. */
  idempotencyKey: string
  ledgerTransactionId?: string
}

/**
 * @description A single line item on an order: a Catalog-linked product (or
 * a custom/legacy item with no catalog link) with a quantity and per-unit
 * price. Introduced as the real per-line-item model — see
 * `docs/business-rules/order-line-items-scoping.md`. `productId`/
 * `productName`/`variantId` on `OrderTableRow` are derived from this array
 * during the transition period (single-line orders only); once every read
 * site is migrated to `items`, those derived fields can be dropped.
 */
export interface OrderLineItem {
  /** Stable per-line id — used for React keys and future line-level edits. */
  id: string
  /** Catalog product this line references. Absent for custom/legacy items. */
  productId?: string
  /** Optional Catalog variant id (size/color) within productId. */
  variantId?: string
  /** Display name — required for custom items with no productId, optional
   * (ignored in favor of the Catalog name) when productId is set. */
  productName?: string
  /** Quantity of this line item. */
  quantity: number
  /** Immutable Catalog snapshots captured when the order was placed. */
  productCodeSnapshot?: string
  productNameSnapshot?: string
  variantSkuSnapshot?: string
  variantSizeSnapshot?: string
  /** Per-unit price in IDR at the time the order was placed. */
  unitPriceIdr: number
}

/**
 * @description Shared shape of an order row used in tables, cards, and the details panel.
 */
export interface OrderTableRow {
  /** Stable machine identifier. New records always have one; legacy records are migrated. */
  id?: string
  /** Optimistic concurrency revision. Starts at 1 and increments after every mutation. */
  revision?: number
  /** Immutable ISO creation timestamp. Legacy orders may omit it. */
  createdAt?: string
  /** ISO timestamp of the last successful mutation. */
  updatedAt?: string
  /** Storefront retry/double-submit key. Present only for customer-created checkout orders. */
  storefrontIdempotencyKey?: string
  /** Human-readable order number. Display-only; the stable id is the true identity. */
  orderNumber: string
  /** Stable CRM customer id. Legacy orders may not have one yet. */
  customerId?: string
  /** Immutable contact snapshot captured when the order was created. */
  customerSnapshot?: OrderCustomerSnapshot
  /** Display customer name retained for list rendering and legacy data. */
  customerName: string
  /** Full set of line items on this order. Source of truth going forward —
   * see `docs/business-rules/order-line-items-scoping.md`. Optional during
   * the migration; every order created going forward populates it, but
   * older persisted/seeded orders may not have it yet. */
  items?: OrderLineItem[]
  /** Product / item name for this order (e.g. bouquet type). Used only as a
   * fallback label for custom/legacy items with no catalog link — when
   * `productId` is set, always resolve display name/price/category from
   * Catalog via `resolveOrderProductDisplay` instead of reading this field.
   * Derived from `items[0]` for single-line orders once `items` is set —
   * see `deriveLegacyProductFields`. */
  productName?: string
  /** Catalog product this order line references. Single source of truth for
   * name, SKU, category, price, and image — see resolveOrderProductDisplay.
   * Derived from `items[0]` for single-line orders once `items` is set. */
  productId?: string
  /** Optional Catalog variant id (size/color) within productId. Derived
   * from `items[0]` for single-line orders once `items` is set. */
  variantId?: string
  /** Intake source channel. */
  source: OrderSource
  /** Fulfillment type for this order. */
  fulfillment: OrderFulfillment
  /** Current lifecycle status. */
  status: OrderStatus
  /** Estimated relative florist effort used for workload visibility. */
  /** Optional florist display name assigned to the order. */
  florist?: string
  /** Stable employee id for the assigned florist. Required for contribution points. */
  floristAssignedEmployeeId?: string
  floristAssignedAt?: string
  floristAssignedForDate?: string
  floristAssignedForTime?: string
  floristAssignedByEmployeeId?: string
  floristAssignedByName?: string
  /** True when Admin/Owner deliberately selected a florist outside the recommended shift. */
  floristScheduleOverride?: boolean
  floristScheduleOverrideReason?: string
  floristScheduledBranchId?: string
  floristAssignedBranchId?: string
  floristScheduledShiftStart?: string
  floristScheduledShiftEnd?: string
  adminHandledByName?: string
  processingStartedAt?: string
  /** Stable employee id for the Admin who handled/created the internal order. */
  adminHandledEmployeeId?: string
  /** Order total in IDR (numeric). */
  totalIdr: number
  /** Sum of all item lines before discount and delivery fee. */
  itemsSubtotalIdr?: number
  /** Voucher/promo discount applied to the order. */
  discountIdr?: number
  /** Delivery fee charged to the customer. */
  deliveryFeeIdr?: number
  /** Logical branch this order belongs to. */
  branch: BranchId
  /** Payment status of the order. */
  paymentStatus: PaymentStatus
  /** Payment channel selected at intake. Optional for legacy seeded orders. */
  paymentMethod?: PaymentMethod
  /** Amount already received in IDR, used to calculate a partial-payment balance. */
  paidAmountIdr?: number
  /** Append-only payment history. Aggregate payment fields above are derived operational state. */
  paymentHistory?: OrderPaymentEvent[]
  /** Full-refund amount recorded by the dedicated refund workflow. */
  refundAmountIdr?: number
  /** Required reason supplied when the refund was initiated. */
  refundReason?: string
  refundInitiatedBy?: string
  refundInitiatedAt?: string
  refundCompletedBy?: string
  refundCompletedAt?: string
  refundCancelledBy?: string
  refundCancelledAt?: string
  refundCancellationReason?: string
  /** Human-friendly creation timestamp label. */
  createdAtLabel: string
  /** Optional scheduled delivery/pickup slot label (e.g. "Today · 16:15"). */
  scheduleLabel?: string
  /** Optional scheduled delivery/pickup date string in YYYY-MM-DD format for filtering. */
  scheduleDate?: string
  /** Optional scheduled delivery/pickup time in HH:mm format. */
  scheduleTime?: string
  /** Immutable requested pickup date snapshot for pickup orders. Older orders fall back to scheduleDate. */
  requestedPickupDate?: string
  /** Immutable requested pickup time snapshot for pickup orders. Older orders fall back to scheduleTime. */
  requestedPickupTime?: string
  /** Actual timestamp recorded only when a pickup order enters picked_up. */
  actualPickedUpAt?: string
  /** Optional shared order note for special requests and order instructions. */
  orderNote?: string
  /** @deprecated Legacy persisted alias. Migrated to orderNote on hydration. */
  internalNote?: string
  /** Optional message written on the greeting card. */
  greetingMessage?: string
  /** @deprecated Legacy persisted alias. Migrated to greetingMessage. */
  giftMessage?: string
  /** Optional signature/name printed beneath the greeting-card message. */
  greetingCardName?: string
  /** Optional delivery address (delivery orders only). */
  deliveryAddress?: string
  /** Optional courier delivery instructions (delivery orders only). */
  deliveryInstructions?: string
  /** Optional promo code applied to this order (from customer's CRM record or manual entry). */
  promoCode?: string
  /** Storefront-only CRM suggestions that must not block checkout or overwrite existing data. */
  customerProfileSuggestions?: OrderCustomerProfileSuggestions
  /** ISO timestamp recorded the moment the order was advanced into a
   * finished state (ready / delivered / picked_up). Used to show the actual
   * completion time on the order list instead of the original scheduled
   * slot, and to tell whether that completion happened after the original
   * scheduled slot (late). */
  completedAt?: string
  /** Finance-only reconciliation identifier, persisted through a dedicated RPC. */
  financeReferenceCode?: string
  /** Customer-facing reason recorded when a pending storefront order is rejected. */
  cancellationReason?: string
  /** Staff display label responsible for the customer-facing cancellation. */
  cancelledBy?: string
  /** ISO timestamp of the customer-facing cancellation. */
  cancelledAt?: string
  /** Whether Finance has verified this order. Once true, the order is
   * locked: only Finance/Owner can edit or void it directly, and revenue
   * only counts this order as "confirmed" (see revenueDomain). Admin can
   * still request an edit/cancellation for review (see pendingChangeRequest). */
  financeVerified?: boolean
  /** Display name of the Finance/Owner user who verified this order. */
  financeVerifiedBy?: string
  /** ISO timestamp of when this order was verified by Finance. */
  financeVerifiedAt?: string
  /** Outcome of Finance's review when it's anything other than a plain
   * verify: 'rejected' means Finance flagged the order as not payable as
   * recorded (financeVerified stays false); 'review' means Finance flagged
   * it for a closer look later without deciding yet (financeVerified stays
   * false). Undefined + financeVerified=false means still awaiting a first
   * decision. Undefined + financeVerified=true means verified normally. */
  financeVerificationStatus?: 'rejected' | 'review'
  /** Optional note Finance left when rejecting or marking this order for
   * review — shown alongside the status in the verification queue. */
  financeVerificationNote?: string
  /** Display name of the Finance/Owner user who last set
   * financeVerificationStatus (rejected / marked for review). */
  financeVerificationActor?: string
  /** ISO timestamp of the last reject / mark-for-review action. */
  financeVerificationAt?: string
  /** Latest correction/resubmission metadata after a Finance rejection. */
  financeResubmittedBy?: string
  financeResubmittedAt?: string
  financeResubmissionNote?: string
  financeSubmissionRevision?: number
  /** An outstanding edit or cancellation request awaiting Finance/Owner
   * review. Applies to any finished order (delivered/picked_up) — the order
   * is locked from direct Admin/Owner edits the moment it finishes its
   * fulfillment pipeline, not just once Finance has verified it. Undefined
   * means there is no pending request. */
  pendingChangeRequest?: OrderChangeRequest
  /** Set when Finance/Owner approves an 'edit' change request: temporarily
   * lifts the finished-order lock so Admin/Owner can go make the actual
   * edit through the normal edit form. Cleared automatically the moment
   * that edit is saved (see OrderDetailsPanel.handleSaveChanges), so the
   * order re-locks immediately after — this window is single-use, not a
   * standing exemption. Undefined/false means the normal lock rule applies. */
  editUnlocked?: boolean
}

/**
 * @description The kind of change an Admin is requesting on an already
 * finance-verified order.
 */
export type OrderChangeRequestType = 'edit' | 'cancel'

/**
 * @description A change request submitted by Admin for Finance/Owner review,
 * required because a finished order can't be edited directly by Admin.
 * 'edit' requests carry no proposed field changes — approving one only
 * unlocks the order for editing (see OrderTableRow.editUnlocked); the
 * actual edit happens afterward, through the normal edit form, so it's
 * always the live values that get saved rather than a diff captured at
 * request time. 'cancel' requests are still applied directly on approval.
 */
export interface OrderChangeRequest {
  /** Unique id for this request. */
  id: string
  /** Whether this is a request to edit, or a cancellation/void request. */
  type: OrderChangeRequestType
  /** Reason given by Admin for the request — required, shown to Finance/Owner. */
  reason: string
  /** Display name of the Admin who submitted the request. */
  requestedBy: string
  /** ISO timestamp the request was submitted. */
  requestedAt: string
}
