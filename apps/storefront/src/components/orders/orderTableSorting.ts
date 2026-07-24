import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { SOURCE_LABELS, STATUS_LABELS } from './orderTableLabels'
import { type OrderSortKey, type SortDirection } from './orderTableColumns'
import { getCreatedAtTimestamp, getScheduleDateFromLabel, getOrderDateTime, getOrderDisplayLabel } from './orderTableFormatters'

/**
 * @description Resolves a comparable timestamp for an order's scheduled-time label, for
 * sorting by "soonest due first". Orders with no parseable schedule sort to the
 * very end (treated as +Infinity) rather than the beginning.
 */
export const getEtaTimestamp = (order: OrderTableRow): number => {
  const eta = getOrderDateTime(order) ?? getScheduleDateFromLabel(order.scheduleLabel ?? null)
  return eta ? eta.getTime() : Number.POSITIVE_INFINITY
}

/**
 * @description Compares two orders by the given sort key, ascending. Callers
 * flip the sign for descending order.
 */
export const compareOrders = (
  a: OrderTableRow,
  b: OrderTableRow,
  key: OrderSortKey,
  catalogProducts: CatalogProduct[] = [],
): number => {
  switch (key) {
    case 'order':
      return getOrderDisplayLabel(a, catalogProducts).localeCompare(
        getOrderDisplayLabel(b, catalogProducts),
      )
    case 'source':
      return SOURCE_LABELS[a.source].localeCompare(SOURCE_LABELS[b.source])
    case 'fulfillment':
      return a.fulfillment.localeCompare(b.fulfillment)
    case 'status':
      return STATUS_LABELS[a.status].localeCompare(STATUS_LABELS[b.status])
    case 'florist':
      return (a.florist ?? '').localeCompare(b.florist ?? '')
    case 'total':
      return a.totalIdr - b.totalIdr
    case 'createdAt':
      return (
        getCreatedAtTimestamp(a.createdAtLabel) -
        getCreatedAtTimestamp(b.createdAtLabel)
      )
    case 'eta':
      return getEtaTimestamp(a) - getEtaTimestamp(b)
    default:
      return 0
  }
}

/**
 * @description Sorts a list of orders by the given key/direction without
 * mutating the input array.
 */
export const sortOrders = (
  orders: OrderTableRow[],
  key: OrderSortKey,
  direction: SortDirection,
  catalogProducts: CatalogProduct[] = [],
): OrderTableRow[] => {
  const sorted = [...orders].sort((a, b) => compareOrders(a, b, key, catalogProducts))
  return direction === 'asc' ? sorted : sorted.reverse()
}

/**
 * @description Statuses considered "finished" for urgency-sorting purposes:
 * there's nothing left to act on, so these orders always sink to the bottom
 * of the list regardless of their schedule.
 */
const FINISHED_STATUSES: OrderStatus[] = ['delivered', 'picked_up', 'cancelled', 'failed']

/**
 * @description The list's one and only sort order: soonest-due-first by scheduled time,
 * with any already-finished order (delivered/picked up/cancelled/failed)
 * pushed to the bottom regardless of its schedule. This replaces manual
 * column/dropdown sorting so staff always see what needs attention next.
 */
export const sortOrdersByUrgency = (orders: OrderTableRow[]): OrderTableRow[] => {
  return [...orders].sort((a, b) => {
    const aFinished = FINISHED_STATUSES.includes(a.status)
    const bFinished = FINISHED_STATUSES.includes(b.status)
    if (aFinished !== bFinished) return aFinished ? 1 : -1
    return getEtaTimestamp(a) - getEtaTimestamp(b)
  })
}
