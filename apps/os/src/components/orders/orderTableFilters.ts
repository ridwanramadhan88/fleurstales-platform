import type { DateRange } from 'react-day-picker'
import type { OrderTableRow } from '../../types/orders'
import type { OrdersSubTabId } from './OrdersSubTabs'
import { getLocalDateString, nowInJakarta, parseOrderDateString } from './orderTableFormatters'

/**
 * @description Returns a list of orders filtered by high-level scope.
 * Conceptually:
 * - Active: all non-terminal statuses.
 * - Completed: delivered, cancelled, failed.
 * Any legacy scope other than "completed" is treated as "active".
 */
export const filterOrdersByScope = (
  scope: OrdersSubTabId,
  orders: OrderTableRow[],
  dateRange?: DateRange,
): OrderTableRow[] => {
  const today = nowInJakarta()
  const todayStr = getLocalDateString(today)

  return orders.filter((order) => {
    const orderDateStr = parseOrderDateString(order)

    if (!orderDateStr) return false

    if (scope === 'today') {
      return orderDateStr === todayStr
    }

    if (scope === 'future') {
      return orderDateStr > todayStr
    }

    if (scope === 'custom') {
      if (!dateRange || (!dateRange.from && !dateRange.to)) return true

      const [y, m, d] = orderDateStr.split('-').map(Number)
      const orderDate = new Date(y, m - 1, d)

      if (dateRange.from) {
        const fromCompare = new Date(dateRange.from)
        fromCompare.setHours(0, 0, 0, 0)
        if (orderDate < fromCompare) return false
      }

      if (dateRange.to) {
        const toCompare = new Date(dateRange.to)
        toCompare.setHours(23, 59, 59, 999)
        if (orderDate > toCompare) return false
      }

      return true
    }

    return true
  })
}

/**
 * @description Matches the Orders search contract. Includes order number,
 * customer name/contact, product, and branch so phone/email search behaves
 * exactly as the UI promises.
 */
export const doesOrderMatchSearch = ({
  order,
  query,
  productName,
  customerContact,
}: {
  order: OrderTableRow
  query: string
  productName: string
  customerContact?: { whatsappNumber?: string; email?: string }
}): boolean => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  const haystack = `${order.orderNumber} ${order.customerName} ${
    customerContact?.whatsappNumber ?? ''
  } ${customerContact?.email ?? ''} ${productName} ${order.branch}`
    .toLowerCase()
    .trim()

  return haystack.includes(normalizedQuery)
}
