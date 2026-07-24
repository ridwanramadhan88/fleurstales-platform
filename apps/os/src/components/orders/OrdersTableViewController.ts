import { useEffect, useState } from 'react'
import { useOrdersStore } from '../../store/ordersStore'
import { useCatalogStore } from '../../store/catalogStore'
import { useCustomerStore } from '../../store/customerStore'
import { useOrderRuntimeStore } from '../../store/orderRuntimeStore'
import { useUserStore } from '../../store/userStore'
import { resolveOrderProductDisplay } from '../../domain/catalogDomain'
import { getCustomerContactForOrder, getCustomerWhatsappNumber } from '../../domain/customerDomain'
import { canDirectlyEditOrder } from '../../domain/orderBusinessRules'
import { authorizeOrderMutation, canViewOrder } from '../../domain/orderBusinessRules'
import { shouldGateOrderAdvanceForPayment } from '../../domain/orderPaymentGateDomain'
import { canEditSection } from '../../config/permissions'
import { useSettingsStore } from '../../store/settingsStore'
import { toast } from '../../hooks/use-toast'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { OrdersSubTabId } from './OrdersSubTabs'
import { STATUS_GROUP_FROM_STATUS, type UiStatusGroup } from './orderTableLabels'
import { doesOrderMatchSearch, filterOrdersByScope } from './orderTableFilters'
import { getEtaTimestamp } from './orderTableSorting'
import { deleteOrderDraft, useOrderDrafts, type SavedOrderDraft } from './orderDraftStore'
import { advanceOrderStatus, getNextStatus } from './orderTableWorkflow'
import { buildReadyForPickupMessage, buildWhatsAppLink } from './orderTableWhatsApp'
import type { OrderStatusFilter, OrdersTableViewProps } from './OrdersTableView'
import type { SortDirection } from './orderTableColumns'
import { getOrderStatusGroup } from '../../domain/orderGroupingDomain'

export interface OrdersActionModalData {
  kind: 'ready' | 'delivering'
  order: OrderTableRow
  customerWhatsappNumber: string | undefined
  readyMessage: string
  whatsAppLink: string
}

export type OrdersListSortKey = 'status' | 'eta' | 'order'

export interface OrdersTableViewModel {
  activeScope: OrdersSubTabId
  searchQuery: string
  onSearchQueryChange?: (value: string) => void
  statusFilter: OrderStatusFilter
  statusGroupFilter: UiStatusGroup | 'all' | 'drafts'
  isDraftMode: boolean
  draftCount: number
  visibleDrafts: SavedOrderDraft[]
  newOrderCount: number
  scopedOrderCount: number
  displayedOrderCount: number
  sortedOrders: OrderTableRow[]
  sortKey: OrdersListSortKey
  sortDirection: SortDirection
  canExportFinishedCsv: boolean
  orderKeys: string[]
  formatter: Intl.NumberFormat
  selectedOrder: OrderTableRow | null
  scopeLabel: string
  emptyStateMessage: string
  hasOrdersEditAccess: boolean
  currentUserRole: ReturnType<typeof useUserStore.getState>['role']
  paymentGate: {
    order: OrderTableRow
    nextStatus: OrderStatus
  } | null
  actionModalData: OrdersActionModalData | null
  processingAssignment: OrderTableRow | null
  addressCopied: boolean
  getProductName: (order: OrderTableRow) => string
  getNextStatusForOrder: (order: OrderTableRow) => OrderStatus | null
  onStatusFilterChange: (filter: OrderStatusFilter) => void
  onStatusGroupFilterChange: (filter: UiStatusGroup | 'all' | 'drafts') => void
  onSortChange: (key: OrdersListSortKey) => void
  onExportFinishedCsv: () => void
  onResumeDraft: (draftId: string) => void
  onDeleteDraft: (draftId: string) => void
  onOpenDetails: (order: OrderTableRow) => void
  onCloseDetails: () => void
  onQuickAdvance: (order: OrderTableRow) => void
  onCancelPaymentGate: () => void
  onMarkPaidAndContinue: () => void
  onCloseActionModal: () => void
  onCancelProcessingAssignment: () => void
  onProcessingAssigned: (order: OrderTableRow) => void
  onCopyAddress: () => void
}

export const useOrdersTableViewController = ({
  activeScope,
  activeBranch,
  dateRange,
  searchQuery = '',
  onSearchQueryChange,
  initialSelectedOrderNumber,
  onInitialSelectedOrderNumberConsumed,
  onOpenDraft,
  initialStatusGroupFilter,
}: OrdersTableViewProps): OrdersTableViewModel => {
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all')
  const [sortKey, setSortKey] = useState<OrdersListSortKey>('eta')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | null>(
    initialSelectedOrderNumber ?? null,
  )

  // Opens the details panel for a deep-linked order (e.g. from clicking a
  // notification) whenever a new value comes in, then tells the caller it
  // has been consumed so it can clear it and avoid re-triggering.
  useEffect(() => {
    if (!initialSelectedOrderNumber) return
    setSelectedOrderNumber(initialSelectedOrderNumber)
    onInitialSelectedOrderNumberConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedOrderNumber])
  const [statusGroupFilter, setStatusGroupFilter] = useState<
    UiStatusGroup | 'all' | 'drafts'
  >(initialStatusGroupFilter ?? 'all')
  useEffect(() => {
    if (initialStatusGroupFilter) setStatusGroupFilter(initialStatusGroupFilter)
  }, [initialStatusGroupFilter])
  const [actionModal, setActionModal] = useState<'ready' | 'delivering' | null>(null)
  const [actionOrder, setActionOrder] = useState<OrderTableRow | null>(null)
  const [addressCopied, setAddressCopied] = useState(false)
  const [processingAssignment, setProcessingAssignment] = useState<OrderTableRow | null>(null)
  const [paymentGate, setPaymentGate] = useState<{
    order: OrderTableRow
    nextStatus: OrderStatus
  } | null>(null)

  const allDrafts = useOrderDrafts()
  const localOrders = useOrdersStore((state) => state.orders)
  const updateOrderStatus = useOrdersStore((state) => state.updateOrderStatus)
  const updatePayment = useOrdersStore((state) => state.updatePayment)
  const addActivity = useOrderRuntimeStore((state) => state.addActivity)
  const currentUserName = useUserStore((state) => state.name)
  const currentUserRole = useUserStore((state) => state.role)
  const currentUserEmployeeId = useUserStore((state) => state.employeeId)
  const currentUserBranchId = useUserStore((state) => state.branchId)
  const catalogProducts = useCatalogStore((state) => state.products)
  const customers = useCustomerStore((state) => state.customers)

  const permissions = useSettingsStore((state) => state.permissions)
  const hasOrdersEditAccess = canEditSection(currentUserRole, 'orders', permissions)

  const actor = {
    employeeId: currentUserEmployeeId,
    name: currentUserName,
    role: currentUserRole,
    branchId: currentUserBranchId,
  }

  const getProductName = (order: OrderTableRow): string =>
    resolveOrderProductDisplay(catalogProducts, order).name

  const runAdvance = (order: OrderTableRow, next: OrderStatus) => {
    if (next === 'processing') {
      setProcessingAssignment(order)
      return
    }
    const advanced = advanceOrderStatus({
      order,
      nextStatus: next,
      updateOrderStatus,
      addActivity,
      actor,
      quick: true,
    })
    if (!advanced) return

    if (next === 'ready' && order.fulfillment === 'pickup') {
      setAddressCopied(false)
      setActionOrder(order)
      setActionModal('ready')
    } else if (next === 'delivering') {
      setAddressCopied(false)
      setActionOrder(order)
      setActionModal('delivering')
    }
  }

  const allOrders: OrderTableRow[] = localOrders.filter((order) =>
    canViewOrder(order, actor, permissions),
  )

  const branchOrders = allOrders.filter(
    (order) => activeBranch === 'All' || order.branch === activeBranch,
  )

  const branchDrafts = allDrafts.filter(
    (draft) => activeBranch === 'All' || draft.branch === activeBranch,
  )
  const draftQuery = searchQuery.trim().toLowerCase()
  const visibleDrafts = branchDrafts.filter((draft) => {
    if (!draftQuery) return true
    const values = draft.values
    const haystack = `${values.customerName} ${values.customerWhatsappNumber} ${values.orderItemCustomName} ${values.orderItemCatalogId}`.toLowerCase()
    return haystack.includes(draftQuery)
  })
  const isDraftMode = statusGroupFilter === 'drafts'

  const scopedOrders = filterOrdersByScope(activeScope, branchOrders, dateRange)
  const newOrderCount = scopedOrders.filter(
    (order) => STATUS_GROUP_FROM_STATUS[order.status] === 'new',
  ).length

  const displayedOrders = scopedOrders.filter((order) => {
    const group = STATUS_GROUP_FROM_STATUS[order.status]
    const matchesGroup =
      statusGroupFilter === 'drafts'
        ? false
        : statusGroupFilter === 'all'
          ? group !== 'finished'
          : group === statusGroupFilter

    const matchesStatus =
      statusFilter === 'all' || order.status === statusFilter

    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return matchesGroup && matchesStatus
    }

    return (
      matchesGroup &&
      matchesStatus &&
      doesOrderMatchSearch({
        order,
        query,
        productName: getProductName(order),
        customerContact: getCustomerContactForOrder(customers, order),
      })
    )
  })

  const statusRank: Record<OrderStatus, number> = {
    pending_verification: 0, confirmed: 1, processing: 2, ready: 3,
    delivering: 4, delivered: 5, picked_up: 5, cancelled: 6, failed: 7,
  }
  const sortedOrders = [...displayedOrders].sort((a, b) => {
    const comparison = sortKey === 'status'
      ? statusRank[a.status] - statusRank[b.status]
      : sortKey === 'eta'
        ? getEtaTimestamp(a) - getEtaTimestamp(b)
        : a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true })
    return sortDirection === 'asc' ? comparison : -comparison
  })
  const selectedOrder = selectedOrderNumber
    ? (allOrders.find((order) => order.orderNumber === selectedOrderNumber) ?? null)
    : null

  const scopeLabel =
    isDraftMode
      ? 'Saved drafts'
      : activeScope === 'today'
      ? "Today's orders"
      : activeScope === 'future'
        ? 'Future orders'
        : 'Custom date orders'

  const emptyStateMessage = isDraftMode
    ? (searchQuery.trim() ? `No drafts match "${searchQuery.trim()}".` : 'No saved order drafts yet.')
    : searchQuery.trim()
    ? `No orders match "${searchQuery.trim()}".`
    : scopedOrders.length === 0
      ? `No orders for ${scopeLabel.toLowerCase()} yet.`
      : 'No orders match this filter yet.'

  const getNextStatusForOrder = (order: OrderTableRow): OrderStatus | null =>
    hasOrdersEditAccess &&
    canDirectlyEditOrder(order, currentUserRole) &&
    authorizeOrderMutation({ order, actor, permissions, kind: 'status' }).allowed
      ? getNextStatus(order)
      : null

  const actionModalData =
    actionModal && actionOrder
      ? {
          kind: actionModal,
          order: actionOrder,
          customerWhatsappNumber: getCustomerWhatsappNumber(getCustomerContactForOrder(customers, actionOrder)) || undefined,
          readyMessage: buildReadyForPickupMessage(
            actionOrder.customerName,
            getProductName(actionOrder),
            actionOrder.branch,
          ),
          whatsAppLink: buildWhatsAppLink(
            getCustomerWhatsappNumber(getCustomerContactForOrder(customers, actionOrder)) || undefined,
            buildReadyForPickupMessage(
              actionOrder.customerName,
              getProductName(actionOrder),
              actionOrder.branch,
            ),
          ),
        }
      : null

  const exportableFinishedOrders = sortedOrders.filter((order) => getOrderStatusGroup(order) === 'completed')
  const canExportFinishedCsv = statusGroupFilter === 'finished' && exportableFinishedOrders.length > 0
  const exportFinishedCsv = () => {
    if (!canExportFinishedCsv) return
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const headers = [
      'Order ID','Order number','Created','Expected date','Expected time','Finished at','Branch',
      'Customer ID','Customer name','Customer phone','Customer email','Fulfillment','Delivery address',
      'Products','Quantities','Unit prices IDR','Items subtotal IDR','Discount IDR','Voucher','Delivery fee IDR',
      'Final total IDR','Payment method','Payment status','Paid amount IDR','Payment reference','Finance verified',
      'Finance verified by','Finance verified at','Admin handler','Assigned florist','Florist employee ID',
      'Fulfillment status','Refund amount IDR','Refund status','Void/cancel status','Order note','Updated at',
    ]
    const rows = exportableFinishedOrders.map((order) => {
      const items = order.items?.length ? order.items : [{ id: 'legacy', productId: order.productId, productName: getProductName(order), quantity: 1, unitPriceIdr: order.itemsSubtotalIdr ?? order.totalIdr }]
      const paymentReference = order.paymentHistory?.map((event) => event.reference).filter(Boolean).join(' | ')
      return [
        order.id, order.orderNumber, order.createdAtLabel, order.scheduleDate, order.scheduleTime,
        order.completedAt, order.branch, order.customerId, order.customerName,
        order.customerSnapshot?.whatsappNumber ?? order.customerSnapshot?.phone,
        order.customerSnapshot?.email, order.fulfillment, order.deliveryAddress,
        items.map((item) => item.productName ?? item.productId ?? 'Custom item').join(' | '),
        items.map((item) => item.quantity).join(' | '), items.map((item) => item.unitPriceIdr).join(' | '),
        order.itemsSubtotalIdr, order.discountIdr, order.promoCode, order.deliveryFeeIdr, order.totalIdr,
        order.paymentMethod, order.paymentStatus, order.paidAmountIdr, paymentReference,
        order.financeVerified ? 'Yes' : 'No', order.financeVerifiedBy, order.financeVerifiedAt,
        order.adminHandledByName, order.florist, order.floristAssignedEmployeeId, order.status,
        order.refundAmountIdr, order.paymentStatus === 'refunded' ? 'Refunded' : order.paymentStatus === 'refund_pending' ? 'Refund pending' : '',
        order.status === 'cancelled' || order.status === 'failed' ? order.status : '', order.orderNote, order.updatedAt,
      ].map(escape).join(',')
    })
    const blob = new Blob([[headers.map(escape).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const dateLabel = activeScope === 'custom' && dateRange?.from
      ? `${dateRange.from.toISOString().slice(0,10)}-${(dateRange.to ?? dateRange.from).toISOString().slice(0,10)}`
      : activeScope
    anchor.href = url
    anchor.download = `fleurstales-finished-orders-${dateLabel}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return {
    activeScope,
    searchQuery,
    onSearchQueryChange,
    statusFilter,
    statusGroupFilter,
    isDraftMode,
    draftCount: branchDrafts.length,
    visibleDrafts,
    newOrderCount,
    scopedOrderCount: isDraftMode ? branchDrafts.length : scopedOrders.length,
    displayedOrderCount: isDraftMode ? visibleDrafts.length : displayedOrders.length,
    sortedOrders,
    sortKey,
    sortDirection,
    canExportFinishedCsv,
    orderKeys: sortedOrders.map((order) => order.orderNumber),
    formatter: new Intl.NumberFormat('id-ID'),
    selectedOrder,
    scopeLabel,
    emptyStateMessage,
    hasOrdersEditAccess,
    currentUserRole,
    paymentGate,
    actionModalData,
    processingAssignment,
    addressCopied,
    getProductName,
    getNextStatusForOrder,
    onStatusFilterChange: setStatusFilter,
    onStatusGroupFilterChange: setStatusGroupFilter,
    onSortChange: (key) => {
      if (key === sortKey) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
      else { setSortKey(key); setSortDirection('asc') }
    },
    onExportFinishedCsv: exportFinishedCsv,
    onResumeDraft: (draftId) => onOpenDraft?.(draftId),
    onDeleteDraft: deleteOrderDraft,
    onOpenDetails: (order) => setSelectedOrderNumber(order.orderNumber),
    onCloseDetails: () => setSelectedOrderNumber(null),
    onQuickAdvance: (order) => {
      if (!hasOrdersEditAccess) return
      if (!canDirectlyEditOrder(order, currentUserRole)) return
      const next = getNextStatus(order)
      if (!next) return
      if (shouldGateOrderAdvanceForPayment(order, next)) {
        setPaymentGate({ order, nextStatus: next })
        return
      }
      runAdvance(order, next)
    },
    onCancelPaymentGate: () => setPaymentGate(null),
    onMarkPaidAndContinue: () => {
      if (!paymentGate) return
      const { order, nextStatus } = paymentGate
      const payment = updatePayment({
        orderNumber: order.orderNumber,
        expectedRevision: order.revision ?? 1,
        paymentStatus: 'paid',
        paidAmountIdr: order.totalIdr,
        actor,
      })
      if (!payment.allowed) {
        toast({ title: 'Payment was not updated', description: payment.reason, variant: 'destructive' })
        return
      }
      setPaymentGate(null)
      runAdvance(payment.order, nextStatus)
    },
    onCancelProcessingAssignment: () => setProcessingAssignment(null),
    onProcessingAssigned: (assignedOrder) => {
      addActivity(assignedOrder.orderNumber, { kind: 'status', description: `Assigned to ${assignedOrder.florist} and moved to Processing`, actor: actor.name })
      setProcessingAssignment(null)
    },
    onCloseActionModal: () => {
      setActionModal(null)
      setActionOrder(null)
    },
    onCopyAddress: () => {
      if (!actionOrder?.deliveryAddress) return
      navigator.clipboard
        .writeText(actionOrder.deliveryAddress)
        .then(() => setAddressCopied(true))
        .catch(() => {
          toast({ title: 'Could not copy address' })
        })
    },
  }
}
