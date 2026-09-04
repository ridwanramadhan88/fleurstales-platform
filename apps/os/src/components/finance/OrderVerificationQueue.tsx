import type { FC } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { OrderFinanceReviewSheetContainer } from './OrderFinanceReviewSheetContainer'
import { ChangeRequestList } from './ChangeRequestList'
import { FinanceOrderFilterBar } from './FinanceOrderFilterBar'
import { OrderVerificationQueueRow } from './OrderVerificationQueueRow'
import type { OrderVerificationQueueViewModel } from './OrderVerificationQueueController'
import { InfoDisclosure } from '../ui/info-disclosure'

export interface OrderVerificationQueueProps {
  /** Orders already scoped to the active branch. */
  orders: OrderTableRow[]
  /** @deprecated Payment reconciliation is read-only. Kept while callers migrate. */
  canVerify: boolean
  /** Whether the current Finance user can resolve locked-order change requests. */
  canResolveRequest: boolean
  actorName: string
  userRole: UserRole
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  showHeading?: boolean
}

export const OrderVerificationQueue: FC<OrderVerificationQueueViewModel> = ({
  canResolveRequest,
  actorName,
  userRole,
  searchQuery,
  onSearchQueryChange,
  showHeading,
  reviewingOrder,
  dateScope,
  dateRange,
  statusFilter,
  statusCounts,
  dateScopedCount,
  filteredCount,
  ordersWithRequests,
  queueRows,
  onDateScopeChange,
  onDateRangeChange,
  onStatusFilterChange,
  onSelectOrder,
  onApproveChangeRequest,
  onRejectChangeRequest,
}) => (
  <section aria-label="Order reconciliation" className="space-y-6">
    {showHeading && (
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
          Order Reconciliation
        </h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Paid orders appear here automatically when payment is confirmed before Processing.
        </p>
      </header>
    )}

    {ordersWithRequests.length > 0 && (
      <ChangeRequestList
        orders={ordersWithRequests}
        canResolveRequest={canResolveRequest}
        actorName={actorName}
        onSelectOrder={onSelectOrder}
        onApprove={onApproveChangeRequest}
        onReject={onRejectChangeRequest}
      />
    )}

    <div className="space-y-3">
      <div className="flex justify-end">
        <InfoDisclosure title="How reconciliation works" className="hidden sm:block">
          <p className="max-w-md">
            Payment is posted once, when Admin confirms full payment during Process Order. This list is read-only: In Progress means production is still active, while Complete means the order workflow has ended.
          </p>
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
      />

      {queueRows.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center shadow-ios-sm">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ClipboardCheck className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-5 text-foreground">No paid orders in this view</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Orders appear after Admin confirms full payment and starts Processing. Try another date range or status filter.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {queueRows.map((row) => (
            <OrderVerificationQueueRow key={row.transactionId} row={row} />
          ))}
        </div>
      )}
    </div>

    {reviewingOrder && (
      <OrderFinanceReviewSheetContainer
        order={reviewingOrder}
        onClose={() => onSelectOrder(null)}
        canVerify={false}
        actorName={actorName}
        userRole={userRole}
      />
    )}
  </section>
)

export default OrderVerificationQueue
