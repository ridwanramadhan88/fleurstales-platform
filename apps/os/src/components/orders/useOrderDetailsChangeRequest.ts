import { useState } from 'react'
import type { OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import type { OrderActor } from '../../domain/orderBusinessRules'
import { useOrdersStore } from '../../store/ordersStore'
import { toast } from '../../hooks/use-toast'

export const useOrderDetailsChangeRequest = ({
  order,
  canRequestChange,
  canResolveRequest,
  actor,
  addActivity,
  setIsEditing,
}: {
  order: OrderTableRow
  canRequestChange: boolean
  canResolveRequest: boolean
  actor: OrderActor
  addActivity: (
    orderNumber: string,
    event: Omit<OrderActivityEvent, 'id' | 'at'>,
  ) => void
  setIsEditing: (value: boolean) => void
}) => {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<'edit' | 'cancel' | null>(null)
  const [requestReason, setRequestReason] = useState('')

  const onApproveRequest = () => {
    if (!canResolveRequest || !order.pendingChangeRequest) return
    const request = order.pendingChangeRequest
    const result = useOrdersStore.getState().approveChangeRequest({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      actor,
    })
    if (!result.allowed) {
      toast({ title: 'Request was not approved', description: result.reason, variant: 'destructive' })
      return
    }
    addActivity(order.orderNumber, {
      kind: 'system',
      description: `${request.type === 'cancel' ? 'Cancellation' : 'Edit'} request approved by ${actor.name}`,
      actor: actor.name,
    })
    toast({
      title: 'Request approved',
      description: request.type === 'cancel' ? 'Order has been cancelled.' : 'The order is unlocked for one edit.',
    })
  }

  const onRejectRequest = (note?: string) => {
    if (!canResolveRequest || !order.pendingChangeRequest) return
    const result = useOrdersStore.getState().rejectChangeRequest({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      actor,
      note,
    })
    if (!result.allowed) {
      toast({ title: 'Request was not rejected', description: result.reason, variant: 'destructive' })
      return
    }
    addActivity(order.orderNumber, {
      kind: 'system',
      description: `Request rejected by ${actor.name}${note ? `: ${note}` : ''}`,
      actor: actor.name,
    })
    toast({ title: 'Request rejected', description: 'The order was not changed.' })
  }

  const onSubmitChangeRequest = () => {
    if (!canRequestChange || !isRequestModalOpen || !requestReason.trim()) return
    const result = useOrdersStore.getState().submitChangeRequest({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      type: isRequestModalOpen,
      reason: requestReason.trim(),
      actor,
    })
    if (!result.allowed) {
      toast({ title: 'Request not submitted', description: result.reason, variant: 'destructive' })
      return
    }
    addActivity(order.orderNumber, {
      kind: 'system',
      description: `${isRequestModalOpen === 'cancel' ? 'Cancellation' : 'Edit'} request submitted by ${actor.name}: ${requestReason.trim()}`,
      actor: actor.name,
    })
    toast({ title: 'Request submitted', description: 'Finance/Owner will review this request.' })
    setIsRequestModalOpen(null)
    setRequestReason('')
    setIsEditing(false)
  }

  return {
    isRequestModalOpen,
    requestReason,
    setRequestReason,
    onApproveRequest,
    onRejectRequest,
    onOpenRequestModal: (mode: 'edit' | 'cancel') => setIsRequestModalOpen(mode),
    onCloseRequestModal: () => {
      setIsRequestModalOpen(null)
      setRequestReason('')
    },
    onSubmitChangeRequest,
  }
}
