import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import type { UpdateOrderStatusInput } from '../../store/ordersStoreTypes'
import type { OrderActor } from '../../domain/orderBusinessRules'
import type { UpdateOrderStatusResult } from '../../store/ordersStoreTypes'
import { isWorkflowHappyPathStatus } from '../../domain/orderBusinessRules'
import { toast } from '../../hooks/use-toast'
import { ToastAction } from '../ui/toast'
import { getOrderStatusOptionsForFulfillment, STATUS_LABELS } from './orderTableLabels'
import { isFutureOrder } from './orderTableFormatters'
import { getLocalDateString, nowInJakarta } from '../../domain/orderTimingDomain'

/** Current business date used by future-order status warnings. */
export const getProcessingDate = (): string =>
  getLocalDateString(nowInJakarta())

export type FutureProcessingKind = 'tomorrow' | 'future' | null

/** Whether the requested fulfillment date is after the actual Process date. */
export const getFutureProcessingKind = (
  scheduleDate: string | undefined,
  processingDate: string,
): FutureProcessingKind => {
  if (!scheduleDate || scheduleDate <= processingDate) return null
  const next = new Date(`${processingDate}T12:00:00+07:00`)
  next.setDate(next.getDate() + 1)
  return scheduleDate === getLocalDateString(next) ? 'tomorrow' : 'future'
}

/**
 * @description Returns the "next" status along the main happy-path lifecycle
 * for a given order, aware of both fulfillment type and whether the order is
 * scheduled for today or a future day (see getOrderStatusOptionsForFulfillment
 * for the exact pipelines). Delivery orders pass through an extra
 * "delivering" leg before finishing; only future (not-today) orders get a
 * "Confirm" step between Pending and Processing.
 */
export const getNextStatus = (
  order: Pick<OrderTableRow, 'status' | 'fulfillment' | 'scheduleDate' | 'scheduleLabel'>,
): OrderStatus | null => {
  const pipeline: OrderStatus[] = getOrderStatusOptionsForFulfillment(
    order.fulfillment,
    isFutureOrder(order as OrderTableRow),
  )
    .map((option) => option.id)
    .filter(isWorkflowHappyPathStatus)

  const currentIndex = pipeline.indexOf(order.status)
  if (currentIndex === -1 || currentIndex === pipeline.length - 1) return null
  return pipeline[currentIndex + 1]
}

/**
 * @description Moves an order to a new status, logs an activity event, and
 * surfaces an "Undo" toast so a mis-tap on the quick-advance control (row
 * button, card button, or the details panel's "Next status" button) doesn't
 * silently stick — staff can undo it immediately without re-opening the
 * order and manually rolling the status back (bug 4 in the data/logic gap
 * list).
 *
 * `quick` distinguishes a one-tap advance from a full edit-and-save so the
 * activity timeline can tell the two apart later (bug 9).
 */
export const advanceOrderStatus = ({
  order,
  nextStatus,
  updateOrderStatus,
  addActivity,
  actor,
  quick,
}: {
  order: OrderTableRow
  nextStatus: OrderStatus
  /**
   * `ordersStore.updateOrderStatus` — the authoritative persisted writer for
   * `status` and `completedAt`. Order UI state must never shadow these fields.
   */
  updateOrderStatus: (input: UpdateOrderStatusInput) => UpdateOrderStatusResult
  addActivity: (
    orderNumber: string,
    event: Omit<OrderActivityEvent, 'id' | 'at'>,
  ) => void
  actor: OrderActor
  quick: boolean
}): boolean => {
  const previousStatus = order.status

  // ordersStore.updateOrderStatus is also responsible for stamping
  // `completedAt` when the new status is one of the "finished" statuses
  // (ready / delivered / picked_up) — see its implementation for the
  // single source of truth on that behavior.
  const transition = updateOrderStatus({
    orderNumber: order.orderNumber,
    status: nextStatus,
    expectedRevision: order.revision ?? 1,
    actor,
    source: 'workflow',
  })

  if (!transition.allowed) {
    toast({
      title: 'Status was not changed',
      description: transition.reason,
      variant: 'destructive',
    })
    return false
  }

  addActivity(order.orderNumber, {
    kind: 'status',
    description: quick
      ? `Status advanced to ${STATUS_LABELS[nextStatus]} · quick action`
      : `Status advanced to ${STATUS_LABELS[nextStatus]}`,
    actor: actor.name,
  })

  toast({
    title: `${order.orderNumber} moved to ${STATUS_LABELS[nextStatus]}`,
    description: order.customerName,
    action: (
      <ToastAction
        altText="Undo status change"
        onClick={() => {
          // Explicit completedAtOverride restores the order's original
          // completedAt (captured in `order` before this advance) instead
          // of updateOrderStatus re-stamping it to "now" — matters when
          // undoing a second advance whose previousStatus was itself a
          // finished status (e.g. delivering -> back to ready).
          const undo = updateOrderStatus({
            orderNumber: order.orderNumber,
            status: previousStatus,
            expectedRevision: transition.order.revision ?? ((order.revision ?? 1) + 1),
            actor,
            source: 'undo',
            completedAtOverride: order.completedAt,
            undoOf: {
              previousStatus,
              nextStatus,
              originalSource: 'workflow',
            },
          })
          if (!undo.allowed) {
            toast({
              title: 'Status could not be undone',
              description: undo.reason,
              variant: 'destructive',
            })
            return
          }
          addActivity(order.orderNumber, {
            kind: 'status',
            description: `Status reverted to ${STATUS_LABELS[previousStatus]} · undo`,
            actor: actor.name,
          })
        }}
      >
        Undo
      </ToastAction>
    ),
  })

  return true
}
