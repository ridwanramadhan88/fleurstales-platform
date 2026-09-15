import type { FC } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { useFinanceStore } from '../../store/financeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getFinanceCategoryLabel } from '../../domain/financeTransactionCategoryDomain'
import { OrderFinanceReviewSheetContainer } from './OrderFinanceReviewSheetContainer'
import { FinanceTransactionDetailSheet } from './FinanceTransactionDetailSheet'
import { ChangeRequestList } from './ChangeRequestList'
import { FinanceOrderFilterBar, type FinanceOrderStatusFilter } from './FinanceOrderFilterBar'
import { OrderVerificationQueueRow } from './OrderVerificationQueueRow'
import type { OrderVerificationQueueViewModel } from './OrderVerificationQueueController'
import { InfoHint } from '../ui/info-hint'
import { FinanceModuleHeader } from './FinanceModuleHeader'

export interface OrderVerificationQueueProps {
  /** Orders already scoped to the active branch. */
  orders: OrderTableRow[]
  /** Whether Finance may make the final payment reconciliation decision. */
  canVerify: boolean
  /** Whether the current Finance user can resolve locked-order change requests. */
  canResolveRequest: boolean
  actorName: string
  userRole: UserRole
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  showHeading?: boolean
  /** Optional deep-link focus used by the Finance Overview. */
  initialStatusFilter?: FinanceOrderStatusFilter
}

export const OrderVerificationQueue: FC<OrderVerificationQueueViewModel> = ({
  canVerify,
  canResolveRequest,
  actorName,
  userRole,
  searchQuery,
  onSearchQueryChange,
  showHeading,
  reviewingOrder,
  ledgerTransaction,
  ledgerLinkedOrder,
  dateScope,
  dateRange,
  monthFilter,
  monthOptions,
  statusFilter,
  statusCounts,
  dateScopedCount,
  filteredCount,
  totalPostedCount,
  ordersWithRequests,
  queueRows,
  onDateScopeChange,
  onDateRangeChange,
  onMonthFilterChange,
  onStatusFilterChange,
  onSelectOrder,
  onSelectLedgerTransaction,
  onApproveChangeRequest,
  onRejectChangeRequest,
}) => {
  const bankAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)

  const ledgerAccountLabel = ledgerTransaction
    ? ledgerTransaction.accountId === 'cash:main'
      ? 'Cash'
      : ledgerTransaction.accountId === 'legacy:unassigned' || !ledgerTransaction.accountId
        ? 'Legacy / unassigned'
        : bankAccounts.find((account) => account.id === ledgerTransaction.accountId)?.bankName ?? ledgerTransaction.accountId
    : '—'
  const ledgerCategoryLabel = ledgerTransaction
    ? getFinanceCategoryLabel(ledgerTransaction.category, customCategories, categoryOverrides)
    : '—'

  return (
    <section aria-label="Order reconciliation" className="space-y-6">
      {showHeading && (
        <FinanceModuleHeader
          title="Order Reconciliation"
          hint={
            <InfoHint label="About order reconciliation">
              Admin-confirmed payments are already posted to their receiving account. Reconciliation reviews the payment and evidence only; it never posts the money a second time.
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
        <FinanceOrderFilterBar
          dateScope={dateScope}
          onDateScopeChange={onDateScopeChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          monthFilter={monthFilter}
          monthOptions={monthOptions}
          onMonthFilterChange={onMonthFilterChange}
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
              <p className="text-sm font-semibold leading-5 text-foreground">
                {totalPostedCount === 0 ? 'No payments to reconcile yet' : 'No reconciliation items match these filters'}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {totalPostedCount === 0
                  ? 'Orders appear here after Admin confirms full payment. The money is already posted at that point.'
                  : 'Try another month, payment-date range, reconciliation status, or search term.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {queueRows.map((row) => (
              <OrderVerificationQueueRow
                key={row.transactionId}
                row={row}
                onOpenOrder={() => onSelectOrder(row.order)}
                onOpenLedger={() => onSelectLedgerTransaction(row.transactionId)}
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

      <FinanceTransactionDetailSheet
        transaction={ledgerTransaction}
        accountLabel={ledgerAccountLabel}
        categoryLabel={ledgerCategoryLabel}
        editable={false}
        onClose={() => onSelectLedgerTransaction(null)}
        onOpenOrder={ledgerLinkedOrder ? () => {
          onSelectLedgerTransaction(null)
          onSelectOrder(ledgerLinkedOrder)
        } : undefined}
      />
    </section>
  )
}

export default OrderVerificationQueue
