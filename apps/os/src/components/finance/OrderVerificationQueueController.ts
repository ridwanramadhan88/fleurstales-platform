import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useOrdersStore } from '../../store/ordersStore'
import { useFinanceStore } from '../../store/financeStore'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { useUserStore } from '../../store/userStore'
import { isOrderFinished } from '../../domain/orderBusinessRules'
import { getLocalDateString, nowInJakarta, toJakarta } from '../orders/orderTableFormatters'
import type { OrderVerificationQueueProps } from './OrderVerificationQueue'
import type { FinanceOrderStatusFilter } from './FinanceOrderFilterBar'
import type { FinanceDateScopeId } from './FinanceDateScopeTabs'
import { toast } from '../../hooks/use-toast'

export type OrderReconciliationStatus = 'in_progress' | 'complete'

export interface FinanceQueueRow {
  order: OrderTableRow
  status: OrderReconciliationStatus
  paymentAmountIdr: number
  paymentMethod: FinanceTransaction['method']
  accountId?: string
  paymentConfirmedAt: string
  transactionId: string
  transactionStatus: FinanceTransaction['status']
}

export interface FinanceQueueStatusCounts {
  inProgress: number
  complete: number
}

export interface OrderVerificationQueueViewModel {
  canResolveRequest: boolean
  actorName: string
  userRole: UserRole
  searchQuery: string
  onSearchQueryChange?: (value: string) => void
  showHeading: boolean
  reviewingOrder: OrderTableRow | null
  dateScope: FinanceDateScopeId
  dateRange: DateRange | undefined
  statusFilter: FinanceOrderStatusFilter
  statusCounts: FinanceQueueStatusCounts
  dateScopedCount: number
  filteredCount: number
  ordersWithRequests: OrderTableRow[]
  queueRows: FinanceQueueRow[]
  onDateScopeChange: (scope: FinanceDateScopeId) => void
  onDateRangeChange: (range?: DateRange) => void
  onStatusFilterChange: (filter: FinanceOrderStatusFilter) => void
  onSelectOrder: (order: OrderTableRow | null) => void
  onApproveChangeRequest: (orderNumber: string, actorName: string, note: string) => void
  onRejectChangeRequest: (orderNumber: string, actorName: string, note?: string) => void
}

const startOfWeekMonday = (date: Date): Date => {
  const result = new Date(date)
  const day = result.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diffToMonday)
  result.setHours(0, 0, 0, 0)
  return result
}

const transactionMoment = (transaction: FinanceTransaction): Date =>
  toJakarta(new Date(transaction.transactionDate ?? transaction.createdAt))

const isWithinPaymentRange = (transaction: FinanceTransaction, range?: DateRange): boolean => {
  if (!range || (!range.from && !range.to)) return true
  const paidAt = transactionMoment(transaction)
  if (range.from) {
    const from = new Date(range.from)
    from.setHours(0, 0, 0, 0)
    if (paidAt < from) return false
  }
  if (range.to) {
    const to = new Date(range.to)
    to.setHours(23, 59, 59, 999)
    if (paidAt > to) return false
  }
  return true
}

const isWithinPaymentScope = (
  transaction: FinanceTransaction,
  scope: FinanceDateScopeId,
  dateRange?: DateRange,
): boolean => {
  if (scope === 'all') return true
  if (scope === 'custom') return isWithinPaymentRange(transaction, dateRange)

  const paidAt = transactionMoment(transaction)
  const paidDate = getLocalDateString(paidAt)
  const now = nowInJakarta()
  if (scope === 'today') return paidDate === getLocalDateString(now)

  const weekStart = startOfWeekMonday(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return paidAt >= weekStart && paidAt <= weekEnd
}

const orderSearchText = (row: FinanceQueueRow): string =>
  [
    row.order.orderNumber,
    row.order.customerName,
    row.order.productName,
    row.order.branch,
    row.accountId,
    row.paymentMethod,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

const paymentRowsForOrders = (
  orders: OrderTableRow[],
  transactions: FinanceTransaction[],
): FinanceQueueRow[] => {
  const orderPayments = transactions.filter(
    (transaction) =>
      transaction.source === 'order_payment' &&
      Boolean(transaction.orderNumber) &&
      transaction.status !== 'rejected',
  )

  return orders.flatMap((order) => {
    const matching = orderPayments
      .filter((transaction) => transaction.orderNumber === order.orderNumber)
      .sort(
        (a, b) =>
          Date.parse(a.transactionDate ?? a.createdAt) -
          Date.parse(b.transactionDate ?? b.createdAt),
      )
    if (matching.length === 0) return []

    const latest = matching[matching.length - 1]
    const terminal = isOrderFinished(order) || order.status === 'cancelled' || order.status === 'failed'
    const recordedAmount = matching.reduce((sum, transaction) => sum + transaction.amount, 0)

    return [{
      order,
      status: terminal ? 'complete' : 'in_progress',
      paymentAmountIdr: Math.max(order.paidAmountIdr ?? 0, recordedAmount),
      paymentMethod: latest.method,
      accountId: latest.accountId,
      paymentConfirmedAt: latest.transactionDate ?? latest.createdAt,
      transactionId: latest.id,
      transactionStatus: latest.status,
    }]
  })
}

export const useOrderVerificationQueueController = ({
  orders,
  canResolveRequest,
  actorName,
  userRole,
  searchQuery = '',
  onSearchQueryChange,
  showHeading = true,
}: OrderVerificationQueueProps): OrderVerificationQueueViewModel => {
  const transactions = useFinanceStore((state) => state.transactions)
  const approveChangeRequest = useOrdersStore((state) => state.approveChangeRequest)
  const rejectChangeRequest = useOrdersStore((state) => state.rejectChangeRequest)
  const employeeId = useUserStore((state) => state.employeeId)
  const branchId = useUserStore((state) => state.branchId)
  const actor = { employeeId, name: actorName, role: userRole, branchId }

  const [reviewingOrder, setReviewingOrder] = useState<OrderTableRow | null>(null)
  const [statusFilter, setStatusFilter] = useState<FinanceOrderStatusFilter>('all')
  const [dateScope, setDateScope] = useState<FinanceDateScopeId>('all')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  const postedRows = useMemo(
    () => paymentRowsForOrders(orders, transactions),
    [orders, transactions],
  )

  const dateScopedRows = useMemo(
    () => postedRows.filter((row) => {
      const transaction = transactions.find((item) => item.id === row.transactionId)
      return transaction ? isWithinPaymentScope(transaction, dateScope, dateRange) : false
    }),
    [postedRows, transactions, dateScope, dateRange],
  )

  const searchScopedRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return dateScopedRows
    return dateScopedRows.filter((row) => orderSearchText(row).includes(query))
  }, [dateScopedRows, searchQuery])

  const statusCounts = useMemo(() => ({
    inProgress: searchScopedRows.filter((row) => row.status === 'in_progress').length,
    complete: searchScopedRows.filter((row) => row.status === 'complete').length,
  }), [searchScopedRows])

  const queueRows = useMemo(
    () => searchScopedRows
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .sort(
        (a, b) =>
          Date.parse(b.paymentConfirmedAt) - Date.parse(a.paymentConfirmedAt) ||
          a.order.orderNumber.localeCompare(b.order.orderNumber),
      ),
    [searchScopedRows, statusFilter],
  )

  const ordersWithRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return orders.filter((order) => {
      if (!order.pendingChangeRequest) return false
      if (!query) return true
      return `${order.orderNumber} ${order.customerName} ${order.productName ?? ''} ${order.branch}`
        .toLowerCase()
        .includes(query)
    })
  }, [orders, searchQuery])

  return {
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
    dateScopedCount: searchScopedRows.length,
    filteredCount: queueRows.length,
    ordersWithRequests,
    queueRows,
    onDateScopeChange: setDateScope,
    onDateRangeChange: setDateRange,
    onStatusFilterChange: setStatusFilter,
    onSelectOrder: setReviewingOrder,
    onApproveChangeRequest: (orderNumber, _requestActor, note) => {
      const order = orders.find((item) => item.orderNumber === orderNumber)
      if (!order) return
      const result = approveChangeRequest({ orderNumber, expectedRevision: order.revision ?? 1, actor, note })
      if (!result.allowed) {
        toast({ title: 'Request was not approved', description: result.reason, variant: 'destructive' })
      }
    },
    onRejectChangeRequest: (orderNumber, _requestActor, note) => {
      const order = orders.find((item) => item.orderNumber === orderNumber)
      if (!order) return
      const result = rejectChangeRequest({ orderNumber, expectedRevision: order.revision ?? 1, actor, note })
      if (!result.allowed) {
        toast({ title: 'Request was not rejected', description: result.reason, variant: 'destructive' })
      }
    },
  }
}
