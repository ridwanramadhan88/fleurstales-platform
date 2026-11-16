import type { FinanceTransaction } from '../store/financeStoreTypes'
import type { OrderTableRow } from '../types/orders'
import { isOrderFinished } from './orderBusinessRules'

export type FinanceReconciliationStatus = 'awaiting_review' | 'needs_correction' | 'reconciled'

export interface FinanceReconciliationOrderState {
  financeVerified?: boolean
  financeVerificationStatus?: string | null
}

export const getFinanceReconciliationStatus = (
  order: FinanceReconciliationOrderState,
): FinanceReconciliationStatus => {
  if (order.financeVerified) return 'reconciled'
  if (order.financeVerificationStatus === 'rejected') return 'needs_correction'
  return 'awaiting_review'
}

export const financeReconciliationPriority = (
  status: FinanceReconciliationStatus,
): number => {
  if (status === 'needs_correction') return 0
  if (status === 'awaiting_review') return 1
  return 2
}

/** @deprecated use jakartaMonthKey from financeDates. */
export { jakartaMonthKey as jakartaMonthKeyFromTimestamp } from './financeDates'

export const formatFinanceReconciliationMonth = (monthKey: string): string => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  const date = new Date(`${monthKey}-15T12:00:00+07:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * The single rule for "this order payment is on the reconciliation queue":
 * an order-payment ledger row that was not rejected or voided (a voided
 * payment cancelled the order, so there is nothing to reconcile).
 */
export const isReconcilablePayment = (
  transaction: Pick<FinanceTransaction, 'source' | 'orderNumber' | 'status'>,
): boolean =>
  transaction.source === 'order_payment'
  && Boolean(transaction.orderNumber)
  && transaction.status !== 'rejected'
  && transaction.status !== 'void'

export const reconcilableOrderNumbers = (
  transactions: Pick<FinanceTransaction, 'source' | 'orderNumber' | 'status'>[],
): Set<string> =>
  new Set(transactions.filter(isReconcilablePayment).map((transaction) => transaction.orderNumber as string))

export type OrderReconciliationStatus = 'in_progress' | 'complete'

export interface FinanceQueueRow {
  order: OrderTableRow
  status: OrderReconciliationStatus
  reconciliationStatus: FinanceReconciliationStatus
  paymentAmountIdr: number
  paymentMethod: FinanceTransaction['method']
  accountId?: string
  paymentConfirmedAt: string
  transactionId: string
  transactionStatus: FinanceTransaction['status']
  transactionCode?: string
  reference?: string
}

/** One reconciliation row per order that has a reconcilable payment. */
export const paymentRowsForOrders = (
  orders: OrderTableRow[],
  transactions: FinanceTransaction[],
): FinanceQueueRow[] => {
  const byOrder = new Map<string, FinanceTransaction[]>()
  for (const transaction of transactions) {
    if (!isReconcilablePayment(transaction)) continue
    const key = transaction.orderNumber as string
    byOrder.set(key, [...(byOrder.get(key) ?? []), transaction])
  }

  return orders.flatMap((order) => {
    const matching = (byOrder.get(order.orderNumber) ?? []).sort(
      (a, b) => Date.parse(a.transactionDate ?? a.createdAt) - Date.parse(b.transactionDate ?? b.createdAt),
    )
    if (matching.length === 0) return []

    const latest = matching[matching.length - 1]
    const terminal = isOrderFinished(order) || order.status === 'cancelled' || order.status === 'failed'
    const recordedAmount = matching.reduce((sum, transaction) => sum + transaction.amount, 0)

    return [{
      order,
      status: terminal ? 'complete' : 'in_progress',
      reconciliationStatus: getFinanceReconciliationStatus(order),
      paymentAmountIdr: Math.max(order.paidAmountIdr ?? 0, recordedAmount),
      paymentMethod: latest.method,
      accountId: latest.accountId,
      paymentConfirmedAt: latest.transactionDate ?? latest.createdAt,
      transactionId: latest.id,
      transactionStatus: latest.status,
      transactionCode: latest.transactionCode,
      reference: latest.reference,
    }]
  })
}

export const sortFinanceReconciliationRows = (rows: FinanceQueueRow[]): FinanceQueueRow[] =>
  [...rows].sort((a, b) => {
    const priority = financeReconciliationPriority(a.reconciliationStatus)
      - financeReconciliationPriority(b.reconciliationStatus)
    if (priority !== 0) return priority
    return Date.parse(b.paymentConfirmedAt) - Date.parse(a.paymentConfirmedAt)
      || a.order.orderNumber.localeCompare(b.order.orderNumber)
  })
