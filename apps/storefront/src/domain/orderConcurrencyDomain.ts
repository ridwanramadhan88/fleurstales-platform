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

/** Jakarta calendar day as YY-MM-DD, the date part of a daily order number. */
export const jakartaOrderDatePart = (at: Date | string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(typeof at === 'string' ? new Date(at) : at)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${String(values.year).slice(-2)}-${values.month}-${values.day}`
}

/**
 * Daily order number (25 Nov 2026): <BRANCH>-YY-MM-DD-NNN, a separate
 * sequence per branch per Jakarta day starting at 001, growing past 999.
 * Matches private.allocate_order_number in Supabase.
 */
export const formatDailyOrderNumber = (prefix: string, datePart: string, sequence: number): string =>
  `${prefix}-${datePart}-${sequence < 1000 ? String(sequence).padStart(3, '0') : String(sequence)}`

/** Highest daily sequence already used for this branch prefix and day. */
export const currentDailyOrderSequence = (prefix: string, datePart: string, orderNumbers: Iterable<string>): number => {
  const dayPrefix = `${prefix}-${datePart}-`.toUpperCase()
  let highest = 0
  for (const orderNumber of orderNumbers) {
    if (!orderNumber.toUpperCase().startsWith(dayPrefix)) continue
    const tail = orderNumber.slice(dayPrefix.length)
    if (!/^\d+$/.test(tail)) continue
    highest = Math.max(highest, Number(tail))
  }
  return highest
}

export const allocateUniqueOrderNumber = ({
  prefix,
  datePart,
  currentSequence,
  existingOrderNumbers,
}: {
  prefix: string
  datePart: string
  currentSequence: number
  existingOrderNumbers: Iterable<string>
}): { orderNumber: string; sequence: number } => {
  const used = new Set(existingOrderNumbers)
  let sequence = Math.max(0, currentSequence)
  do {
    sequence += 1
    const orderNumber = formatDailyOrderNumber(prefix, datePart, sequence)
    if (!used.has(orderNumber)) return { orderNumber, sequence }
  } while (sequence < Number.MAX_SAFE_INTEGER)
  throw new Error('Unable to allocate a unique order number.')
}
