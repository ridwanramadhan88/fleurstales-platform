/** Pure helpers for optimistic order concurrency and stable identity. */
import type { OrderTableRow } from '../types/orders'
import { generateId } from '../lib/id'

export const getOrderRevision = (order: OrderTableRow): number =>
  Number.isInteger(order.revision) && (order.revision ?? 0) > 0 ? order.revision! : 1

const getOrderStableId = (order: OrderTableRow): string =>
  order.id?.trim() || `legacy-order-${order.orderNumber.toLowerCase()}`

export const normalizeOrderConcurrencyMetadata = (
  order: OrderTableRow,
  fallbackUpdatedAt = new Date(0).toISOString(),
): OrderTableRow => ({
  ...order,
  id: getOrderStableId(order),
  revision: getOrderRevision(order),
  createdAt: order.createdAt || order.updatedAt || fallbackUpdatedAt,
  updatedAt: order.updatedAt || order.createdAt || fallbackUpdatedAt,
})

export const stampOrderRevision = (
  order: OrderTableRow,
  updatedAt = new Date().toISOString(),
): OrderTableRow => ({
  ...order,
  id: order.id || generateId('order'),
  revision: getOrderRevision(order) + 1,
  updatedAt,
})

export type OrderRevisionCheck =
  | { allowed: true }
  | { allowed: false; code: 'REVISION_CONFLICT'; reason: string; currentRevision: number }

export const checkExpectedOrderRevision = (
  order: OrderTableRow,
  expectedRevision: number,
): OrderRevisionCheck => {
  const currentRevision = getOrderRevision(order)
  return currentRevision === expectedRevision
    ? { allowed: true }
    : {
        allowed: false,
        code: 'REVISION_CONFLICT',
        reason: 'This order changed in another view. Reopen it and apply your change again.',
        currentRevision,
      }
}

export const allocateUniqueOrderNumber = ({
  prefix,
  year,
  currentSequence,
  existingOrderNumbers,
}: {
  prefix: string
  year: number
  currentSequence: number
  existingOrderNumbers: Iterable<string>
}): { orderNumber: string; sequence: number } => {
  const used = new Set(existingOrderNumbers)
  let sequence = Math.max(0, currentSequence)
  do {
    sequence += 1
    const orderNumber = `${prefix}-${year}-${sequence.toString().padStart(4, '0')}`
    if (!used.has(orderNumber)) return { orderNumber, sequence }
  } while (sequence < Number.MAX_SAFE_INTEGER)
  throw new Error('Unable to allocate a unique order number.')
}
