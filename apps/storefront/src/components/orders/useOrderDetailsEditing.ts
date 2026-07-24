import { useEffect, useState } from 'react'
import type {
  OrderFulfillment,
  OrderSource,
  OrderStatus,
  OrderTableRow,
  PaymentMethod,
  PaymentStatus,
} from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import type { OrderActor } from '../../domain/orderBusinessRules'
import { useOrdersStore } from '../../store/ordersStore'
import type { resolveOrderProductDisplay } from '../../domain/catalogDomain'
import { sanitizeCurrency } from '../../lib/formatters'
import { toast } from '../../hooks/use-toast'
import { PAYMENT_STATUS_LABELS, STATUS_LABELS, getOrderStatusOptionsForFulfillment } from './orderTableLabels'
import {
  formatOrderScheduleLabel,
  getOrderTimeString,
  isFutureOrder,
  parseOrderDateString,
} from './orderTableFormatters'

export interface OrderEditDraft {
  customerName: string
  customerWhatsappNumber: string
  customerEmail: string
  productName: string
  florist: string
  source: OrderSource
  fulfillment: OrderFulfillment
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod | ''
  totalIdrText: string
  scheduleDate: string
  scheduleTime: string
  orderNote: string
  greetingMessage: string
  greetingCardName: string
  deliveryAddress: string
  deliveryInstructions: string
}

export const buildDraftFromOrder = (order: OrderTableRow): OrderEditDraft => ({
  customerName: order.customerName,
  customerWhatsappNumber: order.customerSnapshot?.whatsappNumber ?? order.customerSnapshot?.phone ?? '',
  customerEmail: order.customerSnapshot?.email ?? '',
  productName: order.productName ?? '',
  florist: order.florist ?? '',
  source: order.source,
  fulfillment: order.fulfillment,
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod ?? '',
  totalIdrText: order.totalIdr.toString(),
  scheduleDate: parseOrderDateString(order) ?? '',
  scheduleTime: getOrderTimeString(order),
  orderNote: order.orderNote ?? order.internalNote ?? '',
  greetingMessage: order.greetingMessage ?? order.giftMessage ?? '',
  greetingCardName: order.greetingCardName ?? '',
  deliveryAddress: order.deliveryAddress ?? '',
  deliveryInstructions: order.deliveryInstructions ?? '',
})

export const useOrderDetailsEditing = ({
  order,
  canEdit,
  actor,
  productDisplay,
  addActivity,
  onClose,
}: {
  order: OrderTableRow
  canEdit: boolean
  actor: OrderActor
  productDisplay: ReturnType<typeof resolveOrderProductDisplay>
  addActivity: (
    orderNumber: string,
    event: Omit<OrderActivityEvent, 'id' | 'at'>,
  ) => void
  onClose: () => void
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<OrderEditDraft>(() => buildDraftFromOrder(order))
  const isOrderFuture = isFutureOrder(order)

  useEffect(() => {
    setIsEditing(false)
    setDraft(buildDraftFromOrder(order))
  }, [order])

  const onDraftChange = <K extends keyof OrderEditDraft>(
    field: K,
    value: OrderEditDraft[K],
  ) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const onFulfillmentChange = (nextFulfillment: OrderFulfillment) => {
    const validStatusIds = getOrderStatusOptionsForFulfillment(
      nextFulfillment,
      isOrderFuture,
    ).map((option) => option.id)
    setDraft((previous) => ({
      ...previous,
      fulfillment: nextFulfillment,
      status: validStatusIds.includes(previous.status) ? previous.status : 'processing',
    }))
  }

  const onCancelEdit = () => {
    setIsEditing(false)
    setDraft(buildDraftFromOrder(order))
  }

  const onSaveChanges = () => {
    if (!canEdit) return
    const total = sanitizeCurrency(draft.totalIdrText, order.totalIdr)
    const scheduleLabel = formatOrderScheduleLabel(
      draft.fulfillment,
      draft.scheduleDate,
      draft.scheduleTime,
    )

    if (
      draft.paymentStatus === 'refund_pending' ||
      draft.paymentStatus === 'refunded'
    ) {
      toast({
        title: 'Changes were not saved',
        description:
          'Refund states can only be changed through the dedicated Finance refund workflow.',
        variant: 'destructive',
      })
      return
    }

    const result = useOrdersStore.getState().updateOrderDetails({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      actor,
      patch: {
        customerName: draft.customerName.trim() || order.customerName,
        customerSnapshot: {
          name: draft.customerName.trim() || order.customerName,
          whatsappNumber: draft.customerWhatsappNumber.trim(),
          email: draft.customerEmail.trim() || undefined,
        },
        productName: productDisplay.isLinkedToCatalog
          ? order.productName
          : draft.productName.trim() || order.productName,
        source: draft.source,
        fulfillment: draft.fulfillment,
        status: draft.status,
        paymentStatus: draft.paymentStatus,
        paymentMethod: draft.paymentMethod || undefined,
        totalIdr: total,
        scheduleDate: draft.scheduleDate || undefined,
        scheduleTime: draft.scheduleTime || undefined,
        scheduleLabel,
        orderNote: draft.orderNote.trim() || undefined,
        greetingMessage: draft.greetingMessage.trim() || undefined,
        greetingCardName: draft.greetingCardName.trim() || undefined,
        deliveryAddress:
          draft.fulfillment === 'delivery'
            ? draft.deliveryAddress.trim() || undefined
            : undefined,
        deliveryInstructions:
          draft.fulfillment === 'delivery'
            ? draft.deliveryInstructions.trim() || undefined
            : undefined,
      },
    })

    if (!result.allowed) {
      toast({
        title: 'Changes were not saved',
        description: result.reason,
        variant: 'destructive',
      })
      return
    }

    const changeMessages: string[] = []
    if (draft.status !== order.status) {
      changeMessages.push(
        `Status → ${STATUS_LABELS[draft.status]} (was ${STATUS_LABELS[order.status]})`,
      )
    }
    if (draft.paymentStatus !== order.paymentStatus) {
      changeMessages.push(
        `Payment → ${PAYMENT_STATUS_LABELS[draft.paymentStatus]} (was ${
          PAYMENT_STATUS_LABELS[order.paymentStatus]
        })`,
      )
    }
    if (draft.fulfillment !== order.fulfillment) {
      changeMessages.push(
        `Fulfillment → ${draft.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}`,
      )
    }
    if (draft.customerName.trim() !== order.customerName) {
      changeMessages.push(`Customer → ${draft.customerName.trim()}`)
    }
    if (
      draft.customerWhatsappNumber.trim() !== (order.customerSnapshot?.whatsappNumber ?? order.customerSnapshot?.phone ?? '') ||
      draft.customerEmail.trim() !== (order.customerSnapshot?.email ?? '')
    ) {
      changeMessages.push('Customer contact updated')
    }
    if (!productDisplay.isLinkedToCatalog && draft.productName.trim() !== (order.productName ?? '')) {
      changeMessages.push(`Product → ${draft.productName.trim()}`)
    }
    if (draft.source !== order.source) changeMessages.push(`Source → ${draft.source}`)
    if (draft.scheduleDate !== (parseOrderDateString(order) ?? '') || draft.scheduleTime !== getOrderTimeString(order)) {
      changeMessages.push(`Schedule → ${scheduleLabel || 'Not set'}`)
    }
    if (draft.orderNote.trim() !== (order.orderNote ?? order.internalNote ?? '')) {
      changeMessages.push('Internal note updated')
    }
    if (draft.greetingMessage.trim() !== (order.greetingMessage ?? order.giftMessage ?? '')) {
      changeMessages.push('Gift message updated')
    }
    if (draft.greetingCardName.trim() !== (order.greetingCardName ?? '')) {
      changeMessages.push('Name on card updated')
    }
    if (
      draft.deliveryAddress.trim() !== (order.deliveryAddress ?? '') ||
      draft.deliveryInstructions.trim() !== (order.deliveryInstructions ?? '')
    ) {
      changeMessages.push('Delivery details updated')
    }

    if (changeMessages.length > 0) {
      addActivity(order.orderNumber, {
        kind: 'status',
        description: changeMessages.join(' · '),
        actor: actor.name,
      })
    }

    if (result.sentBackForReverification) {
      addActivity(order.orderNumber, {
        kind: 'system',
        description: 'Revision saved — sent back to Finance for re-verification',
        actor: actor.name,
      })
      toast({
        title: 'Sent back for re-verification',
        description:
          'This order was already verified, so your revision needs Finance to verify it again.',
      })
    }

    onClose()
  }

  return {
    isEditing,
    setIsEditing,
    draft,
    onDraftChange,
    onFulfillmentChange,
    onCancelEdit,
    onSaveChanges,
  }
}
