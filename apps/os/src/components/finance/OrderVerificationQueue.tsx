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
import { InfoHint } from '../ui/info-hint'
import { FinanceModuleHeader } from './FinanceModuleHeader'

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
      <FinanceModuleHeader
        title="Order Reconciliation"
        hint={
          <InfoHint label="About order reconciliation">
            Paid orders appear here automatically as soon as Admin confirms payment.
          </InfoHint>
        }
      />
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
            Payment is posted once when Admin confirms full payment and records the receiving account. Click any order to inspect payment proof and supporting order evidence. In Progress means the order workflow is still active, while Complete means it has ended.
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
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-card px-6 py-8 text-center shadow-ios-sm ring-1 ring-border/60">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ClipboardCheck className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-5 text-foreground">No paid orders in this view</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Orders appear after Admin confirms full payment. Try another date range or status filter.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {queueRows.map((row) => (
            <OrderVerificationQueueRow
              key={row.transactionId}
              row={row}
              onOpen={() => onSelectOrder(row.order)}
            />
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
