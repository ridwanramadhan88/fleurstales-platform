import { useState } from 'react'
import type { OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import { canPrepareFinanceResubmission, type OrderActor } from '../../domain/orderBusinessRules'
import { useOrdersStore } from '../../store/ordersStore'
import { toast } from '../../hooks/use-toast'

export const useOrderDetailsFinance = ({
  order,
  canVerifyThisOrder,
  actor,
  addActivity,
}: {
  order: OrderTableRow
  canVerifyThisOrder: boolean
  actor: OrderActor
  addActivity: (
    orderNumber: string,
    event: Omit<OrderActivityEvent, 'id' | 'at'>,
  ) => void
}) => {
  const [resubmissionNote, setResubmissionNote] = useState('')
  const canResubmitFinance = canPrepareFinanceResubmission(order, actor.role)

  const onVerifyOrder = () => {
    if (!canVerifyThisOrder) return
    const result = useOrdersStore.getState().verifyOrderFinance({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      actor,
    })
    if (!result.allowed) {
      toast({
        title: 'Order was not verified',
        description: result.reason,
        variant: 'destructive',
      })
      return
    }
    addActivity(order.orderNumber, {
      kind: 'system',
      description: `Order verified by Finance · ${actor.name}`,
      actor: actor.name,
    })
    toast({
      title: `${order.orderNumber} verified`,
      description: 'Revenue and linked payment ledger entries are confirmed.',
    })
  }

  const onResubmitFinance = () => {
    if (!canResubmitFinance) return
    const result = useOrdersStore.getState().resubmitOrderFinance({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      actor,
      note: resubmissionNote,
    })
    if (!result.allowed) {
      toast({
        title: 'Order was not resubmitted',
        description: result.reason,
        variant: 'destructive',
      })
      return
    }
    addActivity(order.orderNumber, {
      kind: 'system',
      description: `Corrected and resubmitted to Finance · ${actor.name}`,
      actor: actor.name,
    })
    setResubmissionNote('')
    toast({
      title: `${order.orderNumber} resubmitted`,
      description: 'The order is back in the Finance verification queue.',
    })
  }

  return {
    onVerifyOrder,
    canResubmitFinance,
    resubmissionNote,
    setResubmissionNote,
    onResubmitFinance,
  }
}
