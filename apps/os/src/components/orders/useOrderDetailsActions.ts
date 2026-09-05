import { useEffect, useState } from 'react'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import type { UpdateOrderStatusInput, UpdateOrderStatusResult } from '../../store/ordersStoreTypes'
import type { OrderActor } from '../../domain/orderBusinessRules'
import { canCancelOrder } from '../../domain/orderBusinessRules'
import { toast } from '../../hooks/use-toast'
import { advanceOrderStatus } from './orderTableWorkflow'
import { requestAppConfirmation } from '../ui/app-confirm'
import { formatOrderHandoffText } from './orderHandoffText'
import { buildOrderTrackingUrl, getOrderTrackingId } from '../../data/orderCustomerConfirmation'
import { attachOrderFinishPhoto } from '../../data/orderMediaUpload'

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
  addActivity: (orderNumber: string, event: Omit<OrderActivityEvent, 'id' | 'at'>) => void
  actor: OrderActor
}) => {
  const [actionModal, setActionModal] = useState<'ready' | 'delivering' | 'review' | null>(null)
  const [readyTrackingUrl, setReadyTrackingUrl] = useState<string | undefined>(undefined)
  const [addressCopied, setAddressCopied] = useState(false)
  const [detailsCopied, setDetailsCopied] = useState(false)
  const [showPaymentGate, setShowPaymentGate] = useState(false)
  const [showFinishPhotoDialog, setShowFinishPhotoDialog] = useState(false)
  const [floristDialogMode, setFloristDialogMode] = useState<'assign-and-process' | 'reassign' | null>(null)
  const isCancellable = canCancelOrder(order) && ['owner', 'admin', 'finance'].includes(actor.role)

  useEffect(() => {
    if ((actionModal !== 'ready' && actionModal !== 'review') || !order.id) return
    let active = true
    getOrderTrackingId(order.id)
      .then((trackingId) => {
        const moment = actionModal === 'review' ? 'finished' : 'ready'
        if (active) setReadyTrackingUrl(buildOrderTrackingUrl(order.orderNumber, trackingId, moment))
      })
      .catch(() => { /* best-effort */ })
    return () => { active = false }
  }, [actionModal, order.id, order.orderNumber])

  const onCancelOrder = async () => {
    if (!canAdvance || !isCancellable || order.status === 'cancelled') return
    const confirmed = await requestAppConfirmation({
      title: 'Cancel this order?',
      description: `Cancel order for ${order.customerName}? This can be undone from the toast immediately after.`,
      confirmLabel: 'Cancel order',
      destructive: true,
    })
    if (!confirmed) return
    advanceOrderStatus({ order, nextStatus: 'cancelled', updateOrderStatus, addActivity, actor, quick: false })
  }

  const onMoveToNextStatus = () => {
    if (!canAdvance || !nextStatus) return
    if (nextStatus === 'processing') {
      if (order.paymentStatus !== 'paid' || (order.paidAmountIdr ?? 0) < order.totalIdr) {
        setShowPaymentGate(true)
        return
      }
      setFloristDialogMode('assign-and-process')
      return
    }
    if (nextStatus === 'ready' && !order.finishPhotoUrl) {
      setShowFinishPhotoDialog(true)
      return
    }
    runAdvance(order)
  }

  const onFinishPhotoUploaded = async (finishPhotoUrl: string): Promise<void> => {
    const persistedOrder = await attachOrderFinishPhoto(order, finishPhotoUrl, actor.name)
    setShowFinishPhotoDialog(false)
    runAdvance(persistedOrder)
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

    if (nextStatus === 'ready') {
      setAddressCopied(false)
      setReadyTrackingUrl(undefined)
      setActionModal('ready')
    } else if (nextStatus === 'delivering') {
      setAddressCopied(false)
      setActionModal('delivering')
    } else if (nextStatus === 'delivered' || nextStatus === 'picked_up') {
      setReadyTrackingUrl(undefined)
      setActionModal('review')
    }
  }

  const onMarkPaidAndContinue = () => {
    // Payment confirmation is a separate step. The payment RPC refreshes the
    // order store; close this dialog and require an explicit Process Order click.
    setShowPaymentGate(false)
  }

  const onCopyAddress = () => {
    if (!order.deliveryAddress) return
    navigator.clipboard.writeText(order.deliveryAddress)
      .then(() => setAddressCopied(true))
      .catch(() => toast({ title: 'Could not copy address' }))
  }

  const onCopyOrderDetails = () => {
    navigator.clipboard.writeText(formatOrderHandoffText(order))
      .then(() => setDetailsCopied(true))
      .catch(() => toast({ title: 'Could not copy order details' }))
  }

  return {
    actionModal,
    readyTrackingUrl,
    addressCopied,
    detailsCopied,
    showPaymentGate,
    showFinishPhotoDialog,
    showFloristAssignment: floristDialogMode !== null,
    floristDialogMode,
    isCancellable,
    onCancelOrder,
    onMoveToNextStatus,
    onFinishPhotoUploaded,
    onCancelFinishPhotoDialog: () => setShowFinishPhotoDialog(false),
    onCancelPaymentGate: () => setShowPaymentGate(false),
    onOpenFloristReassignment: () => setFloristDialogMode('reassign'),
    onCancelFloristAssignment: () => setFloristDialogMode(null),
    onFloristAssigned: (assignedOrder: OrderTableRow) => {
      addActivity(assignedOrder.orderNumber, {
        kind: floristDialogMode === 'reassign' ? 'assignment' : 'status',
        description: floristDialogMode === 'reassign'
          ? `Assigned florist changed to ${assignedOrder.florist}`
          : `Assigned to ${assignedOrder.florist} and moved to Processing`,
        actor: actor.name,
      })
      setFloristDialogMode(null)
    },
    onMarkPaidAndContinue,
    onCloseActionModal: () => setActionModal(null),
    onCopyAddress,
    onCopyOrderDetails,
  }
}
