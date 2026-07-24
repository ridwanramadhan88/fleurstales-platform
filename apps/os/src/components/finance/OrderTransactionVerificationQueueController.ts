import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useOrdersStore } from '../../store/ordersStore'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { useUserStore } from '../../store/userStore'
import {
  isMarkedForFinanceReview,
  isOrderFinished,
  isPendingFinanceVerification,
  isRejectedByFinance,
} from '../../domain/orderBusinessRules'
import { getLocalDateString, nowInJakarta } from '../orders/orderTableFormatters'
import type {
  OrderTransactionVerificationQueueProps,
} from './OrderTransactionVerificationQueue'
import type { FinanceOrderStatusFilter } from './FinanceOrderFilterBar'
import type { FinanceDateScopeId } from './FinanceDateScopeTabs'
import { toast } from '../../hooks/use-toast'

const isWithinCompletionRange = (
  order: OrderTableRow,
  range?: DateRange,
): boolean => {
  if (!range || (!range.from && !range.to)) return true
  if (!order.completedAt) return false

  const completedAt = new Date(order.completedAt)

  if (range.from) {
    const from = new Date(range.from)
    from.setHours(0, 0, 0, 0)
    if (completedAt < from) return false
  }

  if (range.to) {
    const to = new Date(range.to)
    to.setHours(23, 59, 59, 999)
    if (completedAt > to) return false
  }

  return true
}

const startOfWeekMonday = (date: Date): Date => {
  const result = new Date(date)
  const day = result.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diffToMonday)
  result.setHours(0, 0, 0, 0)
  return result
}

const isWithinCompletionScope = (
  order: OrderTableRow,
  scope: FinanceDateScopeId,
  dateRange?: DateRange,
): boolean => {
  if (scope === 'custom') return isWithinCompletionRange(order, dateRange)
  if (!order.completedAt) return false

  const completedAt = new Date(order.completedAt)
  const completedDateStr = getLocalDateString(completedAt)
  const now = nowInJakarta()
  const todayStr = getLocalDateString(now)

  if (scope === 'today') return completedDateStr === todayStr

  const weekStart = startOfWeekMonday(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return completedAt >= weekStart && completedAt <= weekEnd
}

export interface FinanceQueueRow {
  order: OrderTableRow
  isEnteringNote: boolean
  isMarkedForReview: boolean
  isPending: boolean
  isRejected: boolean
  isVerified: boolean
  isSelected: boolean
}

export interface FinanceQueueStatusCounts {
  pending: number
  verified: number
  rejected: number
  review: number
}

export interface OrderTransactionVerificationQueueViewModel {
  canVerify: boolean
  canResolveRequest: boolean
  actorName: string
  userRole: UserRole
  searchQuery: string
  onSearchQueryChange?: (value: string) => void
  showHeading: boolean
  verificationActionType: 'correction' | null
  verificationActionNote: string
  reviewingOrder: OrderTableRow | null
  dateScope: FinanceDateScopeId
  dateRange: DateRange | undefined
  statusFilter: FinanceOrderStatusFilter
  statusCounts: FinanceQueueStatusCounts
  dateScopedCount: number
  filteredCount: number
  ordersWithRequests: OrderTableRow[]
  queueRows: FinanceQueueRow[]
  selectableCount: number
  selectedCount: number
  allSelectableChosen: boolean
  isBulkSelectMode: boolean
  onDateScopeChange: (scope: FinanceDateScopeId) => void
  onDateRangeChange: (range?: DateRange) => void
  onStatusFilterChange: (filter: FinanceOrderStatusFilter) => void
  onToggleBulkSelectMode: () => void
  onToggleSelectAll: (checked: boolean) => void
  onClearSelection: () => void
  onBulkVerify: () => void
  onSelectOrder: (order: OrderTableRow | null) => void
  onToggleOrderSelected: (orderNumber: string, checked: boolean) => void
  onOpenVerificationAction: (
    orderNumber: string,
    type: 'correction',
  ) => void
  onVerificationActionNoteChange: (note: string) => void
  onCloseVerificationAction: () => void
  onConfirmVerificationAction: (orderNumber: string) => void
  onVerifyOrder: (orderNumber: string) => void
  onApproveChangeRequest: (orderNumber: string, actorName: string, note: string) => void
  onRejectChangeRequest: (
    orderNumber: string,
    actorName: string,
    note?: string,
  ) => void
}

export const useOrderTransactionVerificationQueueController = ({
  orders,
  canVerify,
  canResolveRequest,
  actorName,
  userRole,
  searchQuery = '',
  onSearchQueryChange,
  showHeading = true,
}: OrderTransactionVerificationQueueProps): OrderTransactionVerificationQueueViewModel => {
  const verifyOrderFinance = useOrdersStore((state) => state.verifyOrderFinance)
  const markOrderForFinanceReview = useOrdersStore(
    (state) => state.markOrderForFinanceReview,
  )
  const approveChangeRequest = useOrdersStore((state) => state.approveChangeRequest)
  const rejectChangeRequest = useOrdersStore((state) => state.rejectChangeRequest)
  const employeeId = useUserStore((state) => state.employeeId)
  const branchId = useUserStore((state) => state.branchId)
  const actor = { employeeId, name: actorName, role: userRole, branchId }

  const [verificationActionOrderNumber, setVerificationActionOrderNumber] = useState<
    string | null
  >(null)
  const [verificationActionType, setVerificationActionType] = useState<'correction' | null>(null)
  const [verificationActionNote, setVerificationActionNote] = useState('')
  const [reviewingOrder, setReviewingOrder] = useState<OrderTableRow | null>(null)
  const [statusFilter, setStatusFilter] = useState<FinanceOrderStatusFilter>('pending')
  const [dateScope, setDateScope] = useState<FinanceDateScopeId>('this_week')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState<Set<string>>(
    new Set(),
  )
  const [isBulkSelectMode, setIsBulkSelectMode] = useState(false)

  const closeVerificationAction = () => {
    setVerificationActionOrderNumber(null)
    setVerificationActionType(null)
    setVerificationActionNote('')
  }

  const finishedOrders = useMemo(
    () => orders.filter(isOrderFinished),
    [orders],
  )

  const dateScopedOrders = useMemo(
    () =>
      finishedOrders.filter((order) =>
        isWithinCompletionScope(order, dateScope, dateRange),
      ),
    [finishedOrders, dateScope, dateRange],
  )

  const searchScopedOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return dateScopedOrders
    return dateScopedOrders.filter((order) =>
      `${order.orderNumber} ${order.customerName} ${order.productName ?? ''} ${order.branch}`
        .toLowerCase()
        .includes(query),
    )
  }, [dateScopedOrders, searchQuery])

  const statusCounts = useMemo(() => {
    let pending = 0
    let verified = 0
    let rejected = 0
    let review = 0
    searchScopedOrders.forEach((order) => {
      if (isRejectedByFinance(order)) rejected += 1
      else if (order.financeVerified) verified += 1
      else if (isMarkedForFinanceReview(order)) review += 1
      if (isPendingFinanceVerification(order)) pending += 1
    })
    return { pending, verified, rejected, review }
  }, [searchScopedOrders])

  const filteredFinishedOrders = useMemo(
    () =>
      searchScopedOrders
        .filter((order) => {
          if (statusFilter === 'all') return true
          if (statusFilter === 'pending') return isPendingFinanceVerification(order)
          if (statusFilter === 'verified') return Boolean(order.financeVerified)
          if (statusFilter === 'rejected') return isRejectedByFinance(order)
          return isMarkedForFinanceReview(order)
        })
        .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber)),
    [searchScopedOrders, statusFilter],
  )

  const selectableOrderNumbers = useMemo(
    () =>
      filteredFinishedOrders
        .filter(isPendingFinanceVerification)
        .map((order) => order.orderNumber),
    [filteredFinishedOrders],
  )

  const activeSelection = useMemo(() => {
    const selectableSet = new Set(selectableOrderNumbers)
    const next = new Set<string>()
    selectedOrderNumbers.forEach((orderNumber) => {
      if (selectableSet.has(orderNumber)) next.add(orderNumber)
    })
    return next
  }, [selectedOrderNumbers, selectableOrderNumbers])

  const allSelectableChosen =
    selectableOrderNumbers.length > 0 &&
    selectableOrderNumbers.every((orderNumber) => activeSelection.has(orderNumber))

  const ordersWithRequests = useMemo(
    () => {
      const query = searchQuery.trim().toLowerCase()
      return orders.filter((order) => {
        if (!order.pendingChangeRequest) return false
        if (!query) return true
        return `${order.orderNumber} ${order.customerName} ${order.productName ?? ''} ${order.branch}`
          .toLowerCase()
          .includes(query)
      })
    },
    [orders, searchQuery],
  )

  const queueRows = filteredFinishedOrders.map((order) => ({
    order,
    isEnteringNote: verificationActionOrderNumber === order.orderNumber,
    isMarkedForReview: isMarkedForFinanceReview(order),
    isPending: isPendingFinanceVerification(order),
    isRejected: isRejectedByFinance(order),
    isVerified: Boolean(order.financeVerified),
    isSelected: activeSelection.has(order.orderNumber),
  }))

  const toggleOrderSelected = (orderNumber: string, checked: boolean) => {
    setSelectedOrderNumbers((prev) => {
      const next = new Set(prev)
      if (checked) next.add(orderNumber)
      else next.delete(orderNumber)
      return next
    })
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedOrderNumbers(checked ? new Set(selectableOrderNumbers) : new Set())
  }

  const handleBulkVerify = () => {
    if (!canVerify || activeSelection.size === 0) return
    const failedOrderNumbers = new Set<string>()
    activeSelection.forEach((orderNumber) => {
      const order = orders.find((item) => item.orderNumber === orderNumber)
      if (!order) return
      const result = verifyOrderFinance({
        orderNumber,
        expectedRevision: order.revision ?? 1,
        actor,
      })
      if (!result.allowed) failedOrderNumbers.add(orderNumber)
    })
    setSelectedOrderNumbers(failedOrderNumbers)
    if (failedOrderNumbers.size > 0) {
      toast({
        title: 'Some orders were not verified',
        description: `${failedOrderNumbers.size} order${failedOrderNumbers.size === 1 ? '' : 's'} changed or are no longer permitted. Review the selected rows and try again.`,
        variant: 'destructive',
      })
    }
  }

  return {
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
    dateScopedCount: searchScopedOrders.length,
    filteredCount: filteredFinishedOrders.length,
    ordersWithRequests,
    queueRows,
    selectableCount: selectableOrderNumbers.length,
    selectedCount: activeSelection.size,
    allSelectableChosen,
    isBulkSelectMode,
    onDateScopeChange: setDateScope,
    onDateRangeChange: setDateRange,
    onStatusFilterChange: setStatusFilter,
    onToggleBulkSelectMode: () => {
      setIsBulkSelectMode((prev) => !prev)
      setSelectedOrderNumbers(new Set())
    },
    onToggleSelectAll: toggleSelectAll,
    onClearSelection: () => setSelectedOrderNumbers(new Set()),
    onBulkVerify: handleBulkVerify,
    onSelectOrder: setReviewingOrder,
    onToggleOrderSelected: toggleOrderSelected,
    onOpenVerificationAction: (orderNumber, type) => {
      setVerificationActionOrderNumber(orderNumber)
      setVerificationActionType(type)
    },
    onVerificationActionNoteChange: setVerificationActionNote,
    onCloseVerificationAction: closeVerificationAction,
    onConfirmVerificationAction: (orderNumber) => {
      const order = orders.find((item) => item.orderNumber === orderNumber)
      if (!order) return
      const input = {
        orderNumber,
        expectedRevision: order.revision ?? 1,
        actor,
        note: verificationActionNote.trim() || undefined,
      }
      const result = verificationActionType === 'correction' ? markOrderForFinanceReview(input) : null
      if (result && !result.allowed) {
        toast({ title: 'Order was not updated', description: result.reason, variant: 'destructive' })
        return
      }
      closeVerificationAction()
    },
    onVerifyOrder: (orderNumber) => {
      const order = orders.find((item) => item.orderNumber === orderNumber)
      if (!order) return
      const result = verifyOrderFinance({ orderNumber, expectedRevision: order.revision ?? 1, actor })
      if (!result.allowed) toast({ title: 'Order was not verified', description: result.reason, variant: 'destructive' })
    },
    onApproveChangeRequest: (orderNumber, _requestActor, note) => {
      const order = orders.find((item) => item.orderNumber === orderNumber)
      if (!order) return
      const result = approveChangeRequest({ orderNumber, expectedRevision: order.revision ?? 1, actor, note })
      if (!result.allowed) toast({ title: 'Request was not approved', description: result.reason, variant: 'destructive' })
    },
    onRejectChangeRequest: (orderNumber, _requestActor, note) => {
      const order = orders.find((item) => item.orderNumber === orderNumber)
      if (!order) return
      const result = rejectChangeRequest({ orderNumber, expectedRevision: order.revision ?? 1, actor, note })
      if (!result.allowed) toast({ title: 'Request was not rejected', description: result.reason, variant: 'destructive' })
    },
  }
}
