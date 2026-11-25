import type { DateRange } from 'react-day-picker'
import type { OrderTableRow } from '../../types/orders'
import { qrisAmountFor } from '../../data/shared/qrisPayment'
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
  if (compactQuery.length >= 6 && order.orderNumber.toLowerCase().replace(/[^a-z0-9]/g, '').includes(compactQuery)) return true
  return doesQrisPaymentMatch(order, normalizedQuery)
}

/**
 * QRIS payments seen in Livin' Merchant (25 Nov 2026): the amount
 * ("329007", "329.007", "Rp329.007") or its last 3 digits ("007") finds the
 * QRIS order waiting for that payment. Codes repeat across branches, so the
 * branch filter decides which branch's orders are searched.
 */
export const doesQrisPaymentMatch = (order: OrderTableRow, query: string): boolean => {
  if (order.paymentChannel !== 'qris' || order.paymentStatus !== 'unpaid' || order.status === 'cancelled' || order.status === 'failed') return false
  const cleaned = query.trim().toLowerCase().replace(/^rp\s*/, '')
  if (!/^[\d.,\s]+$/.test(cleaned)) return false
  const digits = cleaned.replace(/[^\d]/g, '')
  if (digits.length === 3) return order.orderNumber.endsWith(`-${digits}`)
  if (digits.length < 4) return false
  return qrisAmountFor(order.orderNumber, order.totalIdr - (order.paidAmountIdr ?? 0)) === Number(digits)
}
