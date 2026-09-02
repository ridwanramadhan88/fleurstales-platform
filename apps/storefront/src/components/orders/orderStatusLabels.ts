import type { OrderFulfillment, OrderSource, OrderStatus, PaymentStatus } from '../../types/orders'
import type { OrderUrgency } from '../../domain/ordersDomain'
import type { OrderStatusFilter } from './OrdersTableView'

/**
 * @file orderStatusLabels.ts
 * @description Pure static, human-facing text for Orders: labels and option
 * lists only. No React types, icon components, colors, or CSS class names —
 * that visual/styling concern lives in `orderStatusBadgeStyles.ts`. Keeping
 * this split means a copy change here can never accidentally touch how a
 * status badge is drawn, and vice versa.
 */

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_verification: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready',
  delivering: 'Delivering',
  delivered: 'Delivered',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export const SOURCE_LABELS: Record<OrderSource, string> = {
  whatsapp: 'WhatsApp',
  walk_in: 'Walk-in',
  customer_app: 'Customer app',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partial payment',
  paid: 'Paid',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
}

export const URGENCY_LABELS: Record<OrderUrgency, string> = {
  late: 'Late',
  dueSoon: 'Due soon',
  onTrack: 'On track',
  done: 'Ready',
}

export const DELIVERY_ONLY_STATUS_IDS: OrderStatus[] = ['delivering', 'delivered']
export const PICKUP_ONLY_STATUS_IDS: OrderStatus[] = ['ready', 'picked_up']

/**
 * @description Returns the status pipeline (in order) for an order, aware of
 * fulfillment type:
 * - Delivery orders: Pending → Confirmed → Processing → Ready → Delivering → Finished
 * - Pickup orders:   Pending → Confirmed → Processing → Ready to pick up → Finished
 * "Confirmed" is part of every order's pipeline regardless of whether it's
 * scheduled for today or a future day.
 * `cancelled` / `failed` are appended as exception states, not part of the
 * happy-path pipeline itself.
 */
export const getOrderStatusOptionsForFulfillment = (
  fulfillment: OrderFulfillment,
  _isFutureOrderFlag: boolean = false,
): { id: OrderStatus; label: string }[] => {
  const finishedId: OrderStatus = fulfillment === 'delivery' ? 'delivered' : 'picked_up'
  const readyLabel = 'Ready'

  const orderedIds: OrderStatus[] = [
    'pending_verification',
    'confirmed',
    'processing',
    'ready',
    ...(fulfillment === 'delivery' ? (['delivering'] as OrderStatus[]) : []),
    finishedId,
    'cancelled',
    'failed',
  ]

  return orderedIds.map((id) => ({
    id,
    label:
      id === 'ready'
        ? readyLabel
        : id === finishedId
          ? 'Finished'
          : STATUS_LABELS[id],
  }))
}

export const ORDER_SOURCE_OPTIONS: { id: OrderSource; label: string }[] = [
  { id: 'whatsapp', label: SOURCE_LABELS.whatsapp },
  { id: 'walk_in', label: SOURCE_LABELS.walk_in },
  { id: 'customer_app', label: SOURCE_LABELS.customer_app },
]

export const FULFILLMENT_OPTIONS: { id: OrderFulfillment; label: string }[] = [
  { id: 'delivery', label: 'Delivery' },
  { id: 'pickup', label: 'Pickup' },
]

export const PAYMENT_STATUS_OPTIONS: { id: Exclude<PaymentStatus, 'refund_pending' | 'refunded'>; label: string }[] = [
  { id: 'unpaid', label: PAYMENT_STATUS_LABELS.unpaid },
  { id: 'partial', label: PAYMENT_STATUS_LABELS.partial },
  { id: 'paid', label: PAYMENT_STATUS_LABELS.paid },
]

export const STATUS_FILTER_OPTIONS: { id: OrderStatusFilter; label: string }[] = [
  { id: 'all', label: 'All statuses' },
  { id: 'pending_verification', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'processing', label: 'Processing' },
  { id: 'ready', label: 'Ready' },
  { id: 'delivering', label: 'Delivering' },
  { id: 'picked_up', label: 'Picked up' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'failed', label: 'Failed' },
]

/**
 * @description UI-only high-level status groups for scanning and filtering.
 * Backend statuses remain unchanged; this is purely a visual / UX abstraction.
 *
 * Conceptual mapping:
 * - New: Pending Verification, Confirmed
 * - Processing: Processing
 * - Ready: Ready
 * - Delivering: Delivering
 * - Closed: Delivered, Picked up, Cancelled, Failed
 */
export type UiStatusGroup = 'new' | 'processing' | 'ready' | 'delivering' | 'finished'

export const STATUS_GROUP_LABELS: Record<UiStatusGroup, string> = {
  new: 'New',
  processing: 'Processing',
  ready: 'Ready',
  delivering: 'Delivering',
  finished: 'Closed',
}

export const STATUS_GROUP_FROM_STATUS: Record<OrderStatus, UiStatusGroup> = {
  pending_verification: 'new',
  confirmed: 'new',
  processing: 'processing',
  ready: 'ready',
  delivering: 'delivering',
  delivered: 'finished',
  picked_up: 'finished',
  cancelled: 'finished',
  failed: 'finished',
}

export const STATUS_GROUP_FILTER_OPTIONS: { id: UiStatusGroup | 'all'; label: string }[] =
  [
    { id: 'all', label: 'All' },
    { id: 'new', label: STATUS_GROUP_LABELS.new },
    { id: 'processing', label: STATUS_GROUP_LABELS.processing },
    { id: 'ready', label: STATUS_GROUP_LABELS.ready },
    { id: 'delivering', label: STATUS_GROUP_LABELS.delivering },
    { id: 'finished', label: STATUS_GROUP_LABELS.finished },
  ]
