/**
 * @file OrderDetailsController.ts
 * @description Controller hook for OrderDetailsPanel. Owns every Zustand
 * store subscription and mutating store call that used to live directly in
 * the component, plus all local UI state, derived/computed values, and
 * event handlers. The component itself becomes a pure function of the
 * single view-model object this hook returns — it never imports a
 * `store/*` hook or calls a mutating store action directly.
 *
 * Extraction is a straight move, not a rewrite: every handler's body below
 * is byte-for-byte the same logic that used to sit inline in
 * OrderDetailsPanel.tsx, just relocated. See the focused orderTable* helper modules for the
 * shared domain helpers this calls into (unchanged, still pure).
 */

import { useMemo } from 'react'
import type {
  OrderFulfillment,
  OrderStatus,
  OrderTableRow,
} from '../../types/orders'
import { useOrderRuntimeStore, type OrderActivityEvent } from '../../store/orderRuntimeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useCatalogStore } from '../../store/catalogStore'
import { useCustomerStore } from '../../store/customerStore'
import { resolveOrderProductDisplay } from '../../domain/catalogDomain'
import { getCustomerContactForOrder, getCustomerWhatsappNumber } from '../../domain/customerDomain'
import { useUserStore } from '../../store/userStore'
import { canEditSection } from '../../config/permissions'
import { authorizeOrderMutation, canViewOrder } from '../../domain/orderBusinessRules'
import { useSettingsStore } from '../../store/settingsStore'
import {
  canDirectlyEditOrder,
  canResolveChangeRequest,
  canSubmitChangeRequest,
  canVerifyOrder,
  isOrderLocked,
  isPendingFinanceVerification,
  isTerminalIssueOrder,
} from '../../domain/orderBusinessRules'
import { useDismissableModal } from '../../hooks/useDismissableModal'
import { STATUS_ICONS } from './orderTableLabels'
import {
  getOrderUrgency,
  isFutureOrder,
} from './orderTableFormatters'
import { getNextStatus } from './orderTableWorkflow'
import { buildReadyForPickupMessage, buildWhatsAppLink } from './orderTableWhatsApp'
import { EMPTY_ACTIVITIES } from './orderTableSharedConstants'
import { useOrderDetailsActions } from './useOrderDetailsActions'
import { useOrderDetailsChangeRequest } from './useOrderDetailsChangeRequest'
import { useOrderDetailsEditing, type OrderEditDraft } from './useOrderDetailsEditing'
import { useOrderDetailsFinance } from './useOrderDetailsFinance'
import { useOrderDetailsRefund, type RefundDialogMode } from './useOrderDetailsRefund'

export interface UseOrderDetailsControllerParams {
  order: OrderTableRow
  onClose: () => void
  formatter: Intl.NumberFormat
}

export interface OrderDetailsViewModel {
  // Pass-through
  order: OrderTableRow
  formatter: Intl.NumberFormat
  onClose: () => void

  // Derived display data
  productDisplay: ReturnType<typeof resolveOrderProductDisplay>
  customerWhatsappNumber: string | undefined
  activities: OrderActivityEvent[]
  nextStatus: OrderStatus | null
  isOrderFuture: boolean
  urgency: ReturnType<typeof getOrderUrgency>
  StatusIcon: (typeof STATUS_ICONS)[OrderStatus]
  currentUserRole: ReturnType<typeof useUserStore.getState>['role']
  isCancellable: boolean
  isTerminalIssue: boolean
  /** Pre-built pickup-ready WhatsApp message text, for OrderPostActionModal. */
  readyMessage: string
  /** WhatsApp deep link for the ready message, for OrderPostActionModal. */
  whatsAppLink: string

  // Permissions
  canEdit: boolean
  canVerify: boolean
  canVerifyThisOrder: boolean
  canRequestChange: boolean
  canResolveRequest: boolean
  hasPendingRequest: boolean
  locked: boolean
  canManageRefund: boolean
  canCompleteRefund: boolean
  canCancelRefund: boolean
  canResubmitFinance: boolean

  // Local UI state
  isEditing: boolean
  setIsEditing: (value: boolean) => void
  draft: OrderEditDraft
  actionModal: 'ready' | 'delivering' | null
  addressCopied: boolean
  showPaymentGate: boolean
  showFloristAssignment: boolean
  floristDialogMode: 'assign-and-process' | 'reassign' | null
  isRequestModalOpen: 'edit' | 'cancel' | null
  requestReason: string
  setRequestReason: (value: string) => void
  refundDialogMode: RefundDialogMode
  refundReason: string
  resubmissionNote: string
  setRefundReason: (value: string) => void

  // Handlers
  onDraftChange: <K extends keyof OrderEditDraft>(field: K, value: OrderEditDraft[K]) => void
  onFulfillmentChange: (fulfillment: OrderFulfillment) => void
  onCancelOrder: () => void
  onVerifyOrder: () => void
  onResubmitFinance: () => void
  setResubmissionNote: (value: string) => void
  onApproveRequest: () => void
  onRejectRequest: (note?: string) => void
  onOpenRequestModal: (mode: 'edit' | 'cancel') => void
  onCloseRequestModal: () => void
  onSubmitChangeRequest: () => void
  onCancelEdit: () => void
  onSaveChanges: () => void
  onMoveToNextStatus: () => void
  onCancelPaymentGate: () => void
  onOpenFloristReassignment: () => void
  onCancelFloristAssignment: () => void
  onFloristAssigned: (order: OrderTableRow) => void
  onMarkPaidAndContinue: () => void
  onOpenInitiateRefund: () => void
  onOpenCompleteRefund: () => void
  onOpenCancelRefund: () => void
  onCloseRefundDialog: () => void
  onSubmitRefundAction: () => void
  onCloseActionModal: () => void
  onCopyAddress: () => void
}

/**
 * @description Controller for OrderDetailsPanel: owns every store
 * subscription/mutation, all local state, derived values, and handlers, and
 * returns a single view-model object the (purely presentational) component
 * renders from.
 */
export const useOrderDetailsController = ({
  order,
  onClose,
  formatter,
}: UseOrderDetailsControllerParams): OrderDetailsViewModel => {
  const catalogProducts = useCatalogStore((state) => state.products)
  const productDisplay = resolveOrderProductDisplay(catalogProducts, order)
  const customers = useCustomerStore((state) => state.customers)
  const customerWhatsappNumber = useMemo(
    () => getCustomerWhatsappNumber(getCustomerContactForOrder(customers, order)) || undefined,
    [customers, order],
  )

  const activities = useOrderRuntimeStore(
    (state) => state.activities[order.orderNumber] ?? EMPTY_ACTIVITIES,
  )
  const addActivity = useOrderRuntimeStore((state) => state.addActivity)
  const updateOrderStatus = useOrdersStore((state) => state.updateOrderStatus)
  const currentUserName = useUserStore((state) => state.name)
  const userRole = useUserStore((state) => state.role)
  const currentUserEmployeeId = useUserStore((state) => state.employeeId)
  const currentUserBranchId = useUserStore((state) => state.branchId)
  const permissions = useSettingsStore((state) => state.permissions)
  const hasOrdersEditAccess = canEditSection(userRole, 'orders', permissions)
  const actor = {
    employeeId: currentUserEmployeeId,
    name: currentUserName,
    role: userRole,
    branchId: currentUserBranchId,
  }

  // Finance lock: once an order is finished (delivered/picked_up) — not
  // only once it's finance-verified — only Finance can edit or void it
  // directly. Admin/Owner (and anyone else with ordinary Orders edit
  // access) must submit a change request instead — see below.
  const locked = isOrderLocked(order)
  const canEdit =
    hasOrdersEditAccess &&
    canDirectlyEditOrder(order, userRole) &&
    authorizeOrderMutation({ order, actor, permissions, kind: 'details' }).allowed
  const canAdvance = authorizeOrderMutation({ order, actor, permissions, kind: 'status' }).allowed
  const canVerify = canVerifyOrder(userRole)
  // Whether Finance/Owner can verify THIS order right now: separate from
  // `locked`, because an order is locked for editing as soon as it's
  // finished — well before it's verified. Gating the Verify action on
  // `locked` would mean it's never available (finished-but-unverified
  // orders are always locked), so this checks the actual verification
  // eligibility instead (finished, not yet verified, not rejected).
  const canVerifyThisOrder =
    canVerify &&
    canViewOrder(order, actor, permissions) &&
    isPendingFinanceVerification(order)
  const canRequestChange =
    locked && !canEdit && canViewOrder(order, actor, permissions) && canSubmitChangeRequest(userRole)
  const canResolveRequest = canViewOrder(order, actor, permissions) && canResolveChangeRequest(userRole)
  const hasPendingRequest = Boolean(order.pendingChangeRequest)

  const nextStatus = getNextStatus(order)
  const isOrderFuture = isFutureOrder(order)
  const urgency = getOrderUrgency(order)
  const StatusIcon = STATUS_ICONS[order.status]

  // This panel is only mounted while an order is selected, so it's always
  // "open" for as long as it exists — Escape should close it right away.
  useDismissableModal(true, onClose)

  const editing = useOrderDetailsEditing({
    order,
    canEdit,
    actor,
    productDisplay,
    addActivity,
    onClose,
  })

  const finance = useOrderDetailsFinance({
    order,
    canVerifyThisOrder,
    actor,
    addActivity,
  })

  const refund = useOrderDetailsRefund({
    order,
    actor,
    addActivity,
  })

  const changeRequest = useOrderDetailsChangeRequest({
    order,
    canRequestChange,
    canResolveRequest,
    actor,
    addActivity,
    setIsEditing: editing.setIsEditing,
  })

  const actions = useOrderDetailsActions({
    order,
    canAdvance,
    nextStatus,
    updateOrderStatus,
    addActivity,
    actor,
  })

  const isTerminalIssue = isTerminalIssueOrder(order)

  const readyMessage = buildReadyForPickupMessage(
    order.customerName,
    productDisplay.name,
    order.branch,
  )
  const whatsAppLink = buildWhatsAppLink(customerWhatsappNumber, readyMessage)


  return {
    order,
    formatter,
    onClose,

    productDisplay,
    customerWhatsappNumber,
    activities,
    nextStatus,
    isOrderFuture,
    urgency,
    StatusIcon,
    currentUserRole: userRole,
    isCancellable: actions.isCancellable,
    isTerminalIssue,
    readyMessage,
    whatsAppLink,

    canEdit,
    canVerify,
    canVerifyThisOrder,
    canRequestChange,
    canResolveRequest,
    hasPendingRequest,
    locked,
    canManageRefund: refund.canManageRefund,
    canCompleteRefund: refund.canCompleteRefund,
    canCancelRefund: refund.canCancelRefund,
    canResubmitFinance: finance.canResubmitFinance,

    isEditing: editing.isEditing,
    setIsEditing: editing.setIsEditing,
    draft: editing.draft,
    actionModal: actions.actionModal,
    addressCopied: actions.addressCopied,
    showPaymentGate: actions.showPaymentGate,
    showFloristAssignment: actions.showFloristAssignment,
    floristDialogMode: actions.floristDialogMode,
    isRequestModalOpen: changeRequest.isRequestModalOpen,
    requestReason: changeRequest.requestReason,
    setRequestReason: changeRequest.setRequestReason,
    refundDialogMode: refund.refundDialogMode,
    refundReason: refund.refundReason,
    resubmissionNote: finance.resubmissionNote,
    setRefundReason: refund.setRefundReason,

    onDraftChange: editing.onDraftChange,
    onFulfillmentChange: editing.onFulfillmentChange,
    onCancelOrder: actions.onCancelOrder,
    onVerifyOrder: finance.onVerifyOrder,
    onResubmitFinance: finance.onResubmitFinance,
    setResubmissionNote: finance.setResubmissionNote,
    onApproveRequest: changeRequest.onApproveRequest,
    onRejectRequest: changeRequest.onRejectRequest,
    onOpenRequestModal: changeRequest.onOpenRequestModal,
    onCloseRequestModal: changeRequest.onCloseRequestModal,
    onSubmitChangeRequest: changeRequest.onSubmitChangeRequest,
    onCancelEdit: editing.onCancelEdit,
    onSaveChanges: editing.onSaveChanges,
    onMoveToNextStatus: actions.onMoveToNextStatus,
    onCancelPaymentGate: actions.onCancelPaymentGate,
    onOpenFloristReassignment: actions.onOpenFloristReassignment,
    onCancelFloristAssignment: actions.onCancelFloristAssignment,
    onFloristAssigned: actions.onFloristAssigned,
    onMarkPaidAndContinue: actions.onMarkPaidAndContinue,
    onOpenInitiateRefund: refund.openInitiateRefund,
    onOpenCompleteRefund: refund.openCompleteRefund,
    onOpenCancelRefund: refund.openCancelRefund,
    onCloseRefundDialog: refund.closeRefundDialog,
    onSubmitRefundAction: refund.submitRefundAction,
    onCloseActionModal: actions.onCloseActionModal,
    onCopyAddress: actions.onCopyAddress,
  }
}
