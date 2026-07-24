import { useState } from 'react'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import type { UpdateOrderStatusInput, UpdateOrderStatusResult } from '../../store/ordersStoreTypes'
import type { OrderActor } from '../../domain/orderBusinessRules'
import { useOrdersStore } from '../../store/ordersStore'
import { canCancelOrder } from '../../domain/orderBusinessRules'
import { shouldGateOrderAdvanceForPayment } from '../../domain/orderPaymentGateDomain'
import { toast } from '../../hooks/use-toast'
import { advanceOrderStatus } from './orderTableWorkflow'
import { requestAppConfirmation } from '../ui/app-confirm'

export const useOrderDetailsActions = ({
  order,
  canAdvance,
  nextStatus,
  updateOrderStatus,
  addActivity,
  actor,
}: {
  order: OrderTableRow
  canAdvance: boolean
  nextStatus: OrderStatus | null
  updateOrderStatus: (input: UpdateOrderStatusInput) => UpdateOrderStatusResult
  addActivity: (
    orderNumber: string,
    event: Omit<OrderActivityEvent, 'id' | 'at'>,
  ) => void
  actor: OrderActor
}) => {
  const [actionModal, setActionModal] = useState<'ready' | 'delivering' | null>(null)
  const [addressCopied, setAddressCopied] = useState(false)
  const [showPaymentGate, setShowPaymentGate] = useState(false)
  const [floristDialogMode, setFloristDialogMode] = useState<'assign-and-process' | 'reassign' | null>(null)
  const isCancellable = canCancelOrder(order) && ['owner', 'admin', 'finance'].includes(actor.role)

  const onCancelOrder = async () => {
    if (!canAdvance || !isCancellable || order.status === 'cancelled') return
    const confirmed = await requestAppConfirmation({
      title: 'Cancel this order?',
      description: `Cancel order for ${order.customerName}? This can be undone from the toast immediately after.`,
      confirmLabel: 'Cancel order',
      destructive: true,
    })
    if (!confirmed) return

    advanceOrderStatus({
      order,
      nextStatus: 'cancelled',
      updateOrderStatus,
      addActivity,
      actor,
      quick: false,
    })
  }

  const onMoveToNextStatus = () => {
    if (!canAdvance || !nextStatus) return
    if (nextStatus === 'processing') {
      setFloristDialogMode('assign-and-process')
      return
    }
    if (shouldGateOrderAdvanceForPayment(order, nextStatus)) {
      setShowPaymentGate(true)
      return
    }
    runAdvance(order)
  }

  const runAdvance = (startingOrder: OrderTableRow = order) => {
    if (!nextStatus) return
    const advanced = advanceOrderStatus({
      order: startingOrder,
      nextStatus,
      updateOrderStatus,
      addActivity,
      actor,
      quick: true,
    })
    if (!advanced) return

    if (nextStatus === 'ready' && order.fulfillment === 'pickup') {
      setAddressCopied(false)
      setActionModal('ready')
    } else if (nextStatus === 'delivering') {
      setAddressCopied(false)
      setActionModal('delivering')
    }
  }

  const onMarkPaidAndContinue = () => {
    if (!nextStatus) return
    const payment = useOrdersStore.getState().updatePayment({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      paymentStatus: 'paid',
      paidAmountIdr: order.totalIdr,
      actor,
    })
    if (!payment.allowed) {
      toast({
        title: 'Payment was not updated',
        description: payment.reason,
        variant: 'destructive',
      })
      return
    }
    setShowPaymentGate(false)
    runAdvance(payment.order)
  }

  const onCopyAddress = () => {
    if (!order.deliveryAddress) return
    navigator.clipboard
      .writeText(order.deliveryAddress)
      .then(() => setAddressCopied(true))
      .catch(() => toast({ title: 'Could not copy address' }))
  }

  return {
    actionModal,
    addressCopied,
    showPaymentGate,
    showFloristAssignment: floristDialogMode !== null,
    floristDialogMode,
    isCancellable,
    onCancelOrder,
    onMoveToNextStatus,
    onCancelPaymentGate: () => setShowPaymentGate(false),
    onOpenFloristReassignment: () => setFloristDialogMode('reassign'),
    onCancelFloristAssignment: () => setFloristDialogMode(null),
    onFloristAssigned: (assignedOrder: OrderTableRow) => {
      addActivity(assignedOrder.orderNumber, { kind: floristDialogMode === 'reassign' ? 'assignment' : 'status', description: floristDialogMode === 'reassign' ? `Assigned florist changed to ${assignedOrder.florist}` : `Assigned to ${assignedOrder.florist} and moved to Processing`, actor: actor.name })
      setFloristDialogMode(null)
    },
    onMarkPaidAndContinue,
    onCloseActionModal: () => setActionModal(null),
    onCopyAddress,
  }
}
