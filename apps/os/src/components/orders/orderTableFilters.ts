import type { DateRange } from 'react-day-picker'
import type { OrderTableRow } from '../../types/orders'
import { getLocalDateString, isFutureOrder, nowInJakarta, parseOrderDateString } from './orderTableFormatters'

/** Date scopes: today, upcoming (tomorrow on), or a picked range. */
export type OrdersDateScope = 'today' | 'future' | 'custom'

/**
 * @description Returns a list of orders filtered by high-level scope.
 * Future (Mendatang) starts tomorrow; later-today orders stay in Today only.
 */
export const filterOrdersByScope = (
  scope: OrdersDateScope,
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
      return isFutureOrder(order, today)
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

  if (haystack.includes(normalizedQuery)) return true
  // Order numbers typed without dashes ("kdm261126001").
  const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, '')
  return compactQuery.length >= 6 && order.orderNumber.toLowerCase().replace(/[^a-z0-9]/g, '').includes(compactQuery)
}
