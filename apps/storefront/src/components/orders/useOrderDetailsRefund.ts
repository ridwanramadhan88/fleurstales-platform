import { useState } from 'react'
import type { OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import type { OrderActor } from '../../domain/orderBusinessRules'
import { useOrdersStore } from '../../store/ordersStore'
import { toast } from '../../hooks/use-toast'
import { canCancelOrderRefund, canCompleteOrderRefund, canInitiateOrderRefund } from '../../domain/orderBusinessRules'

export type RefundDialogMode = 'initiate' | 'complete' | 'cancel' | null

export const useOrderDetailsRefund = ({
  order,
  actor,
  addActivity,
}: {
  order: OrderTableRow
  actor: OrderActor
  addActivity: (
    orderNumber: string,
    event: Omit<OrderActivityEvent, 'id' | 'at'>,
  ) => void
}) => {
  const [refundDialogMode, setRefundDialogMode] = useState<RefundDialogMode>(null)
  const [refundReason, setRefundReason] = useState('')
  const canManageRefund = canInitiateOrderRefund(actor.role)
  const canCompleteRefund = canCompleteOrderRefund(actor.role)
  const canCancelRefund = canCancelOrderRefund(actor.role)

  const openInitiateRefund = () => {
    setRefundReason('')
    setRefundDialogMode('initiate')
  }
  const openCompleteRefund = () => setRefundDialogMode('complete')
  const openCancelRefund = () => { setRefundReason(''); setRefundDialogMode('cancel') }
  const closeRefundDialog = () => {
    setRefundDialogMode(null)
    setRefundReason('')
  }

  const submitRefundAction = () => {
    const result = refundDialogMode === 'initiate'
      ? useOrdersStore.getState().initiateRefund({
          orderNumber: order.orderNumber,
          expectedRevision: order.revision ?? 1,
          actor,
          reason: refundReason,
        })
      : refundDialogMode === 'complete'
        ? useOrdersStore.getState().completeRefund({
            orderNumber: order.orderNumber,
            expectedRevision: order.revision ?? 1,
            actor,
          })
        : refundDialogMode === 'cancel'
          ? useOrdersStore.getState().cancelRefund({ orderNumber: order.orderNumber, expectedRevision: order.revision ?? 1, actor, reason: refundReason })
          : null

    if (!result) return
    if (!result.allowed) {
      toast({ title: 'Refund action blocked', description: result.reason, variant: 'destructive' })
      return
    }

    const completed = refundDialogMode === 'complete'
    const cancelled = refundDialogMode === 'cancel'
    addActivity(order.orderNumber, {
      kind: 'system',
      description: completed ? `Refund completed by ${actor.name}` : cancelled ? `Refund cancelled by ${actor.name}` : `Refund initiated by ${actor.name}`,
      actor: actor.name,
    })
    toast({
      title: completed ? 'Refund completed' : cancelled ? 'Refund cancelled' : 'Refund initiated',
      description: completed
        ? 'The full refund is recorded and the paid amount is now zero.'
        : cancelled ? 'The pending Refund was cancelled and payment returned to Paid.' : 'The refund is pending completion by Finance.',
    })
    closeRefundDialog()
  }

  return {
    canManageRefund,
    canCompleteRefund,
    canCancelRefund,
    refundDialogMode,
    refundReason,
    setRefundReason,
    openInitiateRefund,
    openCompleteRefund,
    openCancelRefund,
    closeRefundDialog,
    submitRefundAction,
  }
}
