import { useEffect, useState } from 'react'
import type { SaveOrderShipmentResult } from '../../data/shared/contracts'
import { useOrdersStore } from '../../store/ordersStore'
import { useCatalogStore } from '../../store/catalogStore'
import { useCustomerStore } from '../../store/customerStore'
import { useOrderRuntimeStore } from '../../store/orderRuntimeStore'
import { useUserStore } from '../../store/userStore'
import { resolveOrderProductDisplay } from '../../domain/catalogDomain'
import { getCustomerContactForOrder, getCustomerWhatsappNumber } from '../../domain/customerDomain'
import { canDirectlyEditOrder } from '../../domain/orderBusinessRules'
import { authorizeOrderMutation, canViewOrder } from '../../domain/orderBusinessRules'
import { canEditSection } from '../../config/permissions'
import { useSettingsStore } from '../../store/settingsStore'
import { toast } from '../../hooks/use-toast'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { OrdersSubTabId } from './OrdersSubTabs'
import { doesOrderMatchSearch, filterOrdersByScope } from './orderTableFilters'
import { deleteOrderDraft, useOrderDrafts, type SavedOrderDraft } from './orderDraftStore'
import { advanceOrderStatus, getNextStatus } from './orderTableWorkflow'
import {
  buildReadyForDeliveryMessage,
  buildOnTheWayMessage,
  buildReadyForPickupMessage,
  buildReviewRequestMessage,
  buildWhatsAppLink,
} from './orderTableWhatsApp'
import { buildOrderTrackingUrl, getOrderTrackingId } from '../../data/orderCustomerConfirmation'
import { attachOrderFinishPhoto } from '../../data/orderMediaUpload'
import type { OrdersTableViewProps } from './OrdersTableView'
import type { DateRange } from 'react-day-picker'
import type { OrdersExportStatusScope } from '../../domain/ordersExportDomain'
import { getLocalDateString, nowInJakarta } from '../../domain/orderTimingDomain'
import { compareOrderPriority, getOrderPriority, isOrderFinishedOn, type OrderPriority } from '../../domain/orderWorkStageDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import type { OrdersWorkViewCounts } from './OrdersSubTabs'

export interface OrdersActionModalData {
  kind: 'ready' | 'delivering' | 'review'
  order: OrderTableRow
  customerWhatsappNumber: string | undefined
  readyMessage: string
  whatsAppLink: string
}

/** One line in the work list. `divider` marks the first row after the urgent ones. */
export interface OrderWorkRow {
  order: OrderTableRow
  priority: OrderPriority
  divider: boolean
}

export interface OrdersTableViewModel {
  activeScope: OrdersSubTabId
  onScopeChange?: (scope: OrdersSubTabId) => void
  dateRange?: DateRange
  onDateRangeChange?: (range: DateRange | undefined) => void
  searchQuery: string
  onSearchQueryChange?: (value: string) => void
  isDraftMode: boolean
  workCounts: OrdersWorkViewCounts
  rows: OrderWorkRow[]
  sortedOrders: OrderTableRow[]
  /** True while a search runs across every order instead of the active view. */
  isSearching: boolean
  draftCount: number
  visibleDrafts: SavedOrderDraft[]
  scopedOrderCount: number
  displayedOrderCount: number
  /** Orders the viewer may see in the active branch; the export dialog filters them further. */
  exportableOrders: OrderTableRow[]
  exportBranch: string
  exportDefaultRange: { from?: string; to?: string }
  exportDefaultStatus: OrdersExportStatusScope
  orderKeys: string[]
  formatter: Intl.NumberFormat
  selectedOrder: OrderTableRow | null
  scopeLabel: string
  emptyStateMessage: string
  hasOrdersEditAccess: boolean
  currentUserRole: ReturnType<typeof useUserStore.getState>['role']
  paymentGate: { order: OrderTableRow; nextStatus: OrderStatus } | null
  finishPhotoGate: { order: OrderTableRow; nextStatus: OrderStatus } | null
  shipmentGate: OrderTableRow | null
  actionModalData: OrdersActionModalData | null
  processingAssignment: OrderTableRow | null
  addressCopied: boolean
  getProductName: (order: OrderTableRow) => string
  getNextStatusForOrder: (order: OrderTableRow) => OrderStatus | null
  onToggleDrafts: () => void
  onResumeDraft: (draftId: string) => void
  onDeleteDraft: (draftId: string) => void
  onOpenDetails: (order: OrderTableRow) => void
  onCloseDetails: () => void
  onQuickAdvance: (order: OrderTableRow) => void
  onCancelPaymentGate: () => void
  onMarkPaidAndContinue: () => void
  onCancelShipment: () => void
  onShipmentSaved: (result: SaveOrderShipmentResult) => void
  onCancelFinishPhotoDialog: () => void
  onFinishPhotoUploaded: (finishPhotoUrl: string) => Promise<void>
  onCloseActionModal: () => void
  onCancelProcessingAssignment: () => void
  onProcessingAssigned: (order: OrderTableRow) => void
  onCopyAddress: () => void
}

export const useOrdersTableViewController = ({
  activeScope,
  onScopeChange,
  onDateRangeChange,
  activeBranch,
  dateRange,
  searchQuery = '',
  onSearchQueryChange,
  initialSelectedOrderNumber,
  onInitialSelectedOrderNumberConsumed,
  onOpenDraft,
}: OrdersTableViewProps): OrdersTableViewModel => {
  const copy = useBilingualCopy()
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | null>(initialSelectedOrderNumber ?? null)

  useEffect(() => {
    if (!initialSelectedOrderNumber) return
    setSelectedOrderNumber(initialSelectedOrderNumber)
    onInitialSelectedOrderNumberConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedOrderNumber])
  const [isDraftMode, setIsDraftMode] = useState(false)
  useEffect(() => { setIsDraftMode(false) }, [activeScope])
  const [actionModal, setActionModal] = useState<'ready' | 'delivering' | 'review' | null>(null)
  const [actionOrder, setActionOrder] = useState<OrderTableRow | null>(null)
  const [readyTrackingUrl, setReadyTrackingUrl] = useState<string | undefined>(undefined)
  const [addressCopied, setAddressCopied] = useState(false)
  const [processingAssignment, setProcessingAssignment] = useState<OrderTableRow | null>(null)
  const [paymentGate, setPaymentGate] = useState<{ order: OrderTableRow; nextStatus: OrderStatus } | null>(null)
  const [finishPhotoGate, setFinishPhotoGate] = useState<{ order: OrderTableRow; nextStatus: OrderStatus } | null>(null)
  const [shipmentGate, setShipmentGate] = useState<OrderTableRow | null>(null)

  const allDrafts = useOrderDrafts()
  const localOrders = useOrdersStore((state) => state.orders)
  const updateOrderStatus = useOrdersStore((state) => state.updateOrderStatus)
  const addActivity = useOrderRuntimeStore((state) => state.addActivity)
  const currentUserName = useUserStore((state) => state.name)
  const currentUserRole = useUserStore((state) => state.role)
  const currentUserEmployeeId = useUserStore((state) => state.employeeId)
  const currentUserBranchId = useUserStore((state) => state.branchId)
  const catalogProducts = useCatalogStore((state) => state.products)
  const customers = useCustomerStore((state) => state.customers)

  const permissions = useSettingsStore((state) => state.permissions)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const hasOrdersEditAccess = canEditSection(currentUserRole, 'orders', permissions)
  const actor = { employeeId: currentUserEmployeeId, name: currentUserName, role: currentUserRole, branchId: currentUserBranchId }
  const getProductName = (order: OrderTableRow): string => {
    const items = order.items ?? []
    const name = resolveOrderProductDisplay(catalogProducts, items[0] ?? order).name
    return items.length > 1 ? `${name} +${items.length - 1}` : name
  }

  const runAdvance = (order: OrderTableRow, next: OrderStatus) => {
    if (next === 'processing') {
      setProcessingAssignment(order)
      return
    }
    if (next === 'ready' && !order.finishPhotoUrl) {
      setFinishPhotoGate({ order, nextStatus: next })
      return
    }
    if (next === 'delivering' && order.fulfillment === 'delivery' && !order.deliveryProvider && (currentUserRole === 'owner' || currentUserRole === 'admin')) {
      setShipmentGate(order)
      return
    }
    const advanced = advanceOrderStatus({ order, nextStatus: next, updateOrderStatus, addActivity, actor, quick: true })
    if (!advanced) return

    if (next === 'ready') {
      setAddressCopied(false)
      setReadyTrackingUrl(undefined)
      setActionOrder(order)
      setActionModal('ready')
    } else if (next === 'delivering') {
      setAddressCopied(false)
      setActionOrder(order)
      setActionModal('delivering')
    } else if (next === 'delivered' || next === 'picked_up') {
      setReadyTrackingUrl(undefined)
      setActionOrder(order)
      setActionModal('review')
    }
  }

  useEffect(() => {
    if ((actionModal !== 'ready' && actionModal !== 'review' && actionModal !== 'delivering') || !actionOrder?.id) return
    let active = true
    getOrderTrackingId(actionOrder.id)
      .then((trackingId) => {
        const moment = actionModal === 'review' ? 'finished' : actionModal === 'delivering' ? 'delivering' : 'ready'
        if (active) setReadyTrackingUrl(buildOrderTrackingUrl(actionOrder.orderNumber, trackingId, moment))
      })
      .catch(() => { /* best-effort */ })
    return () => { active = false }
  }, [actionModal, actionOrder?.id, actionOrder?.orderNumber])

  const allOrders: OrderTableRow[] = localOrders.filter((order) => canViewOrder(order, actor, permissions, actionPermissions))
  const branchOrders = allOrders.filter((order) => activeBranch === 'All' || order.branch === activeBranch)
  const branchDrafts = allDrafts.filter((draft) => activeBranch === 'All' || draft.branch === activeBranch)
  const draftQuery = searchQuery.trim().toLowerCase()
  const visibleDrafts = branchDrafts.filter((draft) => {
    if (!draftQuery) return true
    const values = draft.values
    const haystack = `${values.customerName} ${values.customerWhatsappNumber} ${values.orderItemCustomName} ${values.orderItemCatalogId}`.toLowerCase()
    return haystack.includes(draftQuery)
  })
  const now = nowInJakarta()
  const query = searchQuery.trim().toLowerCase()
  const isSearching = query.length > 0
  const prioritized = branchOrders.map((order) => ({ order, priority: getOrderPriority(order, now) }))
  const isWaiting = (stage: OrderPriority['stage']) => stage === 'arranging' || stage === 'delivering' || stage === 'refunding'
  const isClosed = (stage: OrderPriority['stage']) => stage === 'done' || stage === 'cancelled'
  const todayKey = getLocalDateString(now)
  const inRange = new Set(filterOrdersByScope('custom', branchOrders, dateRange).map((order) => order.orderNumber))
  const inView = (item: { order: OrderTableRow; priority: OrderPriority }): boolean => {
    if (activeScope === 'action') return item.priority.needsAdmin
    if (activeScope === 'waiting') return isWaiting(item.priority.stage)
    if (activeScope === 'done') return isOrderFinishedOn(item.order, todayKey)
    return inRange.has(item.order.orderNumber)
  }
  const workCounts: OrdersWorkViewCounts = {
    action: prioritized.filter((item) => item.priority.needsAdmin).length,
    waiting: prioritized.filter((item) => isWaiting(item.priority.stage)).length,
    done: prioritized.filter((item) => isOrderFinishedOn(item.order, todayKey)).length,
  }
  const matchesSearch = (order: OrderTableRow) => doesOrderMatchSearch({
    order,
    query,
    productName: getProductName(order),
    customerContact: getCustomerContactForOrder(customers, order),
  })
  // A search looks through every order, whatever view is open.
  const visible = prioritized.filter((item) => (isSearching ? matchesSearch(item.order) : inView(item)))
  const group = (stage: OrderPriority['stage']) => (isClosed(stage) ? 2 : isWaiting(stage) ? 1 : 0)
  const scheduled = (priority: OrderPriority) => priority.scheduledAt?.getTime() ?? Number.POSITIVE_INFINITY
  const sortedItems = [...visible].sort((a, b) => {
    if (!isSearching && activeScope === 'waiting') return scheduled(a.priority) - scheduled(b.priority)
    if (!isSearching && activeScope === 'done') return scheduled(b.priority) - scheduled(a.priority)
    return group(a.priority.stage) - group(b.priority.stage) || compareOrderPriority(a.priority, b.priority)
  })
  let seenUrgent = false
  let dividerPlaced = false
  const rows: OrderWorkRow[] = sortedItems.map((item) => {
    const actionable = item.priority.needsAdmin
    if (actionable && item.priority.urgent) seenUrgent = true
    const divider = seenUrgent && !dividerPlaced && !(actionable && item.priority.urgent)
    if (divider) dividerPlaced = true
    return { ...item, divider }
  })
  const sortedOrders = rows.map((row) => row.order)
  const displayedOrders = sortedOrders
  const selectedOrder = selectedOrderNumber ? (allOrders.find((order) => order.orderNumber === selectedOrderNumber) ?? null) : null

  const scopeLabel = isDraftMode
    ? copy('Saved drafts', 'Draf tersimpan')
    : isSearching
      ? copy('Search results', 'Hasil pencarian')
      : activeScope === 'action'
        ? copy('Most urgent first', 'Yang paling mendesak di atas')
        : activeScope === 'waiting'
          ? copy('Florist or courier is working', 'Sedang dirangkai atau diantar')
          : activeScope === 'done'
            ? copy('Delivered or picked up today', 'Terkirim atau diambil hari ini')
            : copy('Orders on the picked dates', 'Pesanan pada tanggal terpilih')

  const emptyStateMessage = isDraftMode
    ? (query ? copy(`No drafts match "${searchQuery.trim()}".`, `Tidak ada draf yang cocok dengan "${searchQuery.trim()}".`) : copy('No saved order drafts yet.', 'Belum ada draf pesanan.'))
    : isSearching
      ? copy(`No orders match "${searchQuery.trim()}".`, `Tidak ada pesanan yang cocok dengan "${searchQuery.trim()}".`)
      : activeScope === 'action'
        ? copy('Nothing needs you right now.', 'Tidak ada pesanan yang perlu kamu kerjakan sekarang.')
        : activeScope === 'waiting'
          ? copy('No orders with a florist or courier right now.', 'Tidak ada pesanan yang sedang dirangkai atau dikirim.')
          : activeScope === 'done'
            ? copy('No orders finished today yet.', 'Belum ada pesanan yang selesai hari ini.')
            : copy('No orders on these dates.', 'Tidak ada pesanan pada tanggal ini.')

  const getNextStatusForOrder = (order: OrderTableRow): OrderStatus | null =>
    hasOrdersEditAccess && canDirectlyEditOrder(order, currentUserRole) && authorizeOrderMutation({ order, actor, permissions, actionPermissions, kind: 'status' }).allowed
      ? getNextStatus(order)
      : null

  const readyMessage = actionOrder && readyTrackingUrl
    ? actionModal === 'review'
      ? buildReviewRequestMessage(actionOrder.customerName, actionOrder.orderNumber, readyTrackingUrl)
      : actionModal === 'delivering'
        ? buildOnTheWayMessage(actionOrder.customerName, getProductName(actionOrder), readyTrackingUrl)
      : actionOrder.fulfillment === 'pickup'
        ? buildReadyForPickupMessage(actionOrder.customerName, getProductName(actionOrder), actionOrder.branch, readyTrackingUrl)
        : buildReadyForDeliveryMessage(actionOrder.customerName, getProductName(actionOrder), readyTrackingUrl)
    : ''
  const actionModalData = actionModal && actionOrder
    ? {
        kind: actionModal,
        order: actionOrder,
        customerWhatsappNumber: getCustomerWhatsappNumber(getCustomerContactForOrder(customers, actionOrder)) || undefined,
        readyMessage,
        whatsAppLink: readyMessage
          ? buildWhatsAppLink(getCustomerWhatsappNumber(getCustomerContactForOrder(customers, actionOrder)) || undefined, readyMessage)
          : '',
      }
    : null

  const isoDay = (date?: Date) => (date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : undefined)
  const exportDefaultRange = activeScope === 'done'
    ? { from: todayKey, to: todayKey }
    : activeScope === 'custom'
      ? { from: isoDay(dateRange?.from), to: isoDay(dateRange?.to ?? dateRange?.from) }
      : { from: todayKey }
  const exportDefaultStatus: OrdersExportStatusScope = activeScope === 'done' ? 'finished' : 'all'

  return {
    activeScope,
    onScopeChange,
    dateRange,
    onDateRangeChange,
    searchQuery,
    onSearchQueryChange,
    isDraftMode,
    workCounts,
    rows,
    isSearching,
    draftCount: branchDrafts.length,
    visibleDrafts,
    scopedOrderCount: isDraftMode ? branchDrafts.length : visible.length,
    displayedOrderCount: isDraftMode ? visibleDrafts.length : displayedOrders.length,
    sortedOrders,
    exportableOrders: allOrders,
    exportBranch: activeBranch,
    exportDefaultRange,
    exportDefaultStatus,
    orderKeys: sortedOrders.map((order) => order.orderNumber),
    formatter: new Intl.NumberFormat('id-ID'),
    selectedOrder,
    scopeLabel,
    emptyStateMessage,
    hasOrdersEditAccess,
    currentUserRole,
    paymentGate,
    finishPhotoGate,
    shipmentGate,
    actionModalData,
    processingAssignment,
    addressCopied,
    getProductName,
    getNextStatusForOrder,
    onToggleDrafts: () => setIsDraftMode((value) => !value),
    onResumeDraft: (draftId) => onOpenDraft?.(draftId),
    onDeleteDraft: deleteOrderDraft,
    onOpenDetails: (order) => setSelectedOrderNumber(order.orderNumber),
    onCloseDetails: () => setSelectedOrderNumber(null),
    onQuickAdvance: (order) => {
      if (!hasOrdersEditAccess) return
      if (!canDirectlyEditOrder(order, currentUserRole)) return
      const next = getNextStatus(order)
      if (!next) return
      if (next === 'processing' && (order.paymentStatus !== 'paid' || (order.paidAmountIdr ?? 0) < order.totalIdr)) {
        setPaymentGate({ order, nextStatus: next })
        return
      }
      runAdvance(order, next)
    },
    onCancelPaymentGate: () => setPaymentGate(null),
    onMarkPaidAndContinue: () => {
      // Payment confirmation is deliberately a separate action. The RPC has
      // already refreshed the order store; close here and require a fresh
      // Process Order click to assign the florist.
      setPaymentGate(null)
    },
    onCancelShipment: () => setShipmentGate(null),
    onShipmentSaved: (result) => {
      if (!shipmentGate) return
      const order = shipmentGate
      setShipmentGate(null)
      runAdvance({
        ...order,
        revision: result.revision,
        deliveryProvider: result.deliveryProvider ?? undefined,
        deliveryCourierName: result.deliveryCourierName ?? undefined,
        deliveryActualCostIdr: result.deliveryActualCostIdr ?? undefined,
        deliveryTrackingUrl: result.deliveryTrackingUrl ?? undefined,
      }, 'delivering')
    },
    onCancelFinishPhotoDialog: () => setFinishPhotoGate(null),
    onFinishPhotoUploaded: async (finishPhotoUrl) => {
      if (!finishPhotoGate) return
      const { order, nextStatus } = finishPhotoGate
      const persistedOrder = await attachOrderFinishPhoto(order, finishPhotoUrl, actor.name)
      setFinishPhotoGate(null)
      runAdvance(persistedOrder, nextStatus)
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
      navigator.clipboard.writeText(actionOrder.deliveryAddress)
        .then(() => setAddressCopied(true))
        .catch(() => { toast({ title: 'Could not copy address' }) })
    },
  }
}
