/**
 * @file OrderTransactionVerificationQueue.tsx
 * @description Finance's verification queue for customer order transactions,
 * shown inside the Finance tab. Sibling to
 * InternalTransactionVerificationQueue, which covers company/internal
 * transactions (rent, inventory purchases, payroll, utilities, etc.)
 * instead. This one covers verifying individual customer orders, and
 * reviewing edit/cancellation requests Admin has submitted on orders that
 * are locked (finished — delivered/picked_up — whether or not Finance has
 * verified them yet).
 *
 * Rules encoded here (see domain/orderBusinessRules.ts for the source of
 * truth on permissions):
 * - An order locks from direct Admin/Owner edits the moment it finishes
 *   its fulfillment pipeline — not only once Finance verifies it. Finance
 *   verifying it afterward doesn't change the lock, it confirms revenue.
 * - Finance/Owner verify orders one by one (or in bulk — see below).
 * - Finance/Owner can request correction with a required reason. The order remains
 *   unverified and never counts as confirmed revenue until corrected and verified.
 * - Admin can submit an edit/cancellation request on any locked order,
 *   with a required reason — reviewed here by Finance/Owner.
 * - Approving a cancellation request voids the order directly. Approving an
 *   edit request applies no changes itself — it unlocks the order so
 *   Admin/Owner can make the actual edit through the normal edit form
 *   afterward, which is what keeps this list accurate (the edit lands via
 *   the same store methods this queue reads from, so it shows up here
 *   immediately once saved). Rejecting a request leaves the order untouched.
 *
 * The "Order list (finished)" section below supports:
 * - A completion-date scope (This week / Today / Custom), scoped to
 *   `order.completedAt` (when the order actually finished its fulfillment
 *   pipeline) — visually matches Orders' own OrdersSubTabs, but is its own
 *   component (FinanceDateScopeTabs) with a wider default: "This week"
 *   (Mon–Sun), since Finance usually triages a batch of recently-finished
 *   orders rather than just today's. Custom pairs with a date-range picker,
 *   same as Orders.
 * - A status filter chip row (All / Pending / Verified / Rejected /
 *   Review), same FilterChip treatment as the Orders tab's
 *   All/New/Processing/etc chips — Pending carries a count badge and is the
 *   default (matches the original queue behavior).
 * - Bulk verify: hidden behind a "Select" toggle next to the status chips.
 *   Turning it on reveals a checkbox per still-pending row plus a
 *   "select all" control and a bulk "Verify N selected" action; turning it
 *   off (or tapping "Cancel") clears any in-progress selection. Bulk
 *   selection only ever targets pending rows — verified/rejected rows have
 *   no checkbox, since there's no direct-verify action left to take on them.
 */

import type { FC } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { OrderFinanceReviewSheetContainer } from './OrderFinanceReviewSheetContainer'
import { ChangeRequestList } from './ChangeRequestList'
import {
  FinanceOrderFilterBar,
} from './FinanceOrderFilterBar'
import { BulkVerifyBar } from './BulkVerifyBar'
import { OrderVerificationQueueRow } from './OrderVerificationQueueRow'
import type { OrderTransactionVerificationQueueViewModel } from './OrderTransactionVerificationQueueController'
import { InfoDisclosure } from '../ui/info-disclosure'

export interface OrderTransactionVerificationQueueProps {
  /** Orders already scoped to the active branch. */
  orders: OrderTableRow[]
  /** Whether the current user can verify orders directly (Finance/Owner). */
  canVerify: boolean
  /** Whether the current user can approve/reject change requests (Finance/Owner). */
  canResolveRequest: boolean
  /** Display name of the current user, used as the verifying/approving actor. */
  actorName: string
  /** Role of the current user — passed through to the authoritative
   * `canVerifyOrderFinance` gate so verification is enforced by the domain
   * layer, not only by the `canVerify` boolean gating what's rendered. */
  userRole: UserRole
  /** Shared Home search query; rendered in TopBar on mobile and filters on desktop. */
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  /** Hide the repeated page heading when FinanceWorkspaceTabs already provides it. */
  showHeading?: boolean
}

/**
 * @description Finance's queue for verifying orders one by one, plus a
 * separate queue for reviewing Admin's edit/cancellation requests on
 * locked (finished) orders.
 */
export const OrderTransactionVerificationQueue: FC<
  OrderTransactionVerificationQueueViewModel
> = ({
  canVerify,
  canResolveRequest,
  actorName,
  userRole,
  searchQuery,
  onSearchQueryChange,
  showHeading,
  verificationActionType,
  verificationActionNote,
  reviewingOrder,
  dateScope,
  dateRange,
  statusFilter,
  statusCounts,
  dateScopedCount,
  filteredCount,
  ordersWithRequests,
  queueRows,
  selectableCount,
  selectedCount,
  allSelectableChosen,
  isBulkSelectMode,
  onDateScopeChange,
  onDateRangeChange,
  onStatusFilterChange,
  onToggleBulkSelectMode,
  onToggleSelectAll,
  onClearSelection,
  onBulkVerify,
  onSelectOrder,
  onToggleOrderSelected,
  onOpenVerificationAction,
  onVerificationActionNoteChange,
  onCloseVerificationAction,
  onConfirmVerificationAction,
  onVerifyOrder,
  onApproveChangeRequest,
  onRejectChangeRequest,
}) => {
  const emptyTitle = statusFilter === 'pending'
    ? canVerify ? 'Nothing to verify' : 'No completed orders in this view'
    : 'No matching orders'
  const emptyDescription = statusFilter === 'pending'
    ? canVerify
      ? 'Orders needing verification will appear here.'
      : 'Completed orders will appear here for read-only review. Finance or Owner handles verification.'
    : 'Try another date range, search, or status filter.'

  return (
    <section aria-label="Order verification" className="space-y-6">
      {showHeading && <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
          Payment Verification
        </h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Review completed orders and exceptions that need attention.
        </p>
      </header>}
      {/* Change requests needing review — surfaced first since these are
          time-sensitive (Admin is blocked until Finance/Owner acts). */}
      {ordersWithRequests.length > 0 && <ChangeRequestList
        orders={ordersWithRequests}
        canResolveRequest={canResolveRequest}
        actorName={actorName}
        onSelectOrder={onSelectOrder}
        onApprove={onApproveChangeRequest}
        onReject={onRejectChangeRequest}
      />}

      {/* Order list (finished): only orders whose fulfillment pipeline has
          been fully advanced by Admin/Owner (delivered / picked up) are
          eligible here. This is distinct from the finance transaction list
          further down — that's the income/expense ledger, this is
          per-order verification. Scoped by completion date (This week /
          Today / Future / Custom, mirroring Orders' own date tabs but
          keyed on `completedAt`) and filtered by verification status;
          supports bulk-verify on pending rows. */}
      <div className="space-y-3">
        <div className="flex justify-end">
          <InfoDisclosure title="How this queue works" className="hidden sm:block">
            <p className="max-w-md">Orders appear after delivery or pickup is complete. Finished orders stay locked from direct edits; Finance or Owner can verify or request a correction.</p>
          </InfoDisclosure>
        </div>

        <FinanceOrderFilterBar
          dateScope={dateScope}
          onDateScopeChange={onDateScopeChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          dateScopedCount={dateScopedCount}
          filteredCount={filteredCount}
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          statusCounts={statusCounts}
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          canVerify={canVerify}
          hasSelectableOrders={selectableCount > 0}
          isBulkSelectMode={isBulkSelectMode}
          onToggleBulkSelectMode={onToggleBulkSelectMode}
        />

        {/* Bulk-verify bar: only ever targets pending rows, and only shown
            while bulk-select mode is on. */}
        {canVerify && isBulkSelectMode && selectableCount > 0 && (
          <BulkVerifyBar
            selectableCount={selectableCount}
            selectedCount={selectedCount}
            allSelected={allSelectableChosen}
            onToggleSelectAll={onToggleSelectAll}
            onClearSelection={onClearSelection}
            onBulkVerify={onBulkVerify}
          />
        )}

        {queueRows.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center shadow-ios-sm">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ClipboardCheck className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-5 text-foreground">
                {emptyTitle}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {emptyDescription}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {queueRows.map((row) => (
              <OrderVerificationQueueRow
                key={row.order.orderNumber}
                row={row}
                canVerify={canVerify}
                isBulkSelectMode={isBulkSelectMode}
                verificationActionType={verificationActionType}
                verificationActionNote={verificationActionNote}
                onSelectOrder={onSelectOrder}
                onToggleOrderSelected={onToggleOrderSelected}
                onOpenVerificationAction={onOpenVerificationAction}
                onVerificationActionNoteChange={onVerificationActionNoteChange}
                onCloseVerificationAction={onCloseVerificationAction}
                onConfirmVerificationAction={onConfirmVerificationAction}
                onVerifyOrder={onVerifyOrder}
              />
            ))}
          </div>
        )}
      </div>

      {reviewingOrder && (
        <OrderFinanceReviewSheetContainer
          order={reviewingOrder}
          onClose={() => onSelectOrder(null)}
          canVerify={canVerify}
          actorName={actorName}
          userRole={userRole}
        />
      )}
    </section>
  )
}

export default OrderTransactionVerificationQueue
