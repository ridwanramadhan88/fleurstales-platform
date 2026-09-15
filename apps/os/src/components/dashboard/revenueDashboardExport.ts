import { isOrderFinished } from '../../domain/orderBusinessRules'
import { isVerifiedCollectedIncome } from '../../domain/cashRevenueDomain'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { OrderTableRow } from '../../types/orders'

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

export interface RevenueDashboardRange {
  startDate: Date
  endDate: Date
}

const jakartaDateKey = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
}

const orderIsInRange = (order: OrderTableRow, range: RevenueDashboardRange): boolean => {
  if (!order.completedAt) return false
  const completedKey = jakartaDateKey(order.completedAt)
  if (!completedKey) return false
  return completedKey >= jakartaDateKey(range.startDate) && completedKey <= jakartaDateKey(range.endDate)
}

export const getGloballyConfirmedOrderNumbers = (transactions: FinanceTransaction[]): Set<string> =>
  new Set(
    transactions
      .filter(isVerifiedCollectedIncome)
      .map((transaction) => transaction.orderNumber?.trim())
      .filter((orderNumber): orderNumber is string => Boolean(orderNumber)),
  )

export const getEstimatedUnconfirmedOrders = (input: {
  orders: OrderTableRow[]
  transactions: FinanceTransaction[]
  branch: 'all' | string
  range: RevenueDashboardRange | null
}): OrderTableRow[] => {
  const range = input.range
  if (!range) return []
  const confirmedOrderNumbers = getGloballyConfirmedOrderNumbers(input.transactions)
  return input.orders.filter((order) => {
    if (input.branch !== 'all' && order.branch !== input.branch) return false
    if (!isOrderFinished(order) || !order.completedAt) return false
    if (!orderIsInRange(order, range)) return false
    if (order.financeVerified) return false
    return !confirmedOrderNumbers.has(order.orderNumber)
  })
}

const csvSafeString = (value: unknown): string => {
  const raw = String(value ?? '')
  const safe = /^[=+@]/.test(raw) || (/^-/.test(raw) && Number.isNaN(Number(raw))) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

export const buildRevenueDashboardCsv = (input: {
  scope: string
  period: string
  confirmedRevenueIdr: number
  estimatedRevenueIdr: number
  expenseIdr: number
  revenueTransactions: FinanceTransaction[]
  expenseTransactions: FinanceTransaction[]
  estimatedOrders: OrderTableRow[]
}): string => {
  const rows: unknown[][] = [
    ['Fleurstales Revenue Dashboard'],
    ['Scope', input.scope],
    ['Period', input.period],
    ['Revenue (confirmed)', input.confirmedRevenueIdr],
    ['Total revenue est. (finished orders)', input.estimatedRevenueIdr],
    ['Expense (confirmed)', input.expenseIdr],
    ['Net confirmed', input.confirmedRevenueIdr - input.expenseIdr],
    [],
    ['Confirmed revenue sources'],
    ['Accounting date', 'Created at', 'Branch', 'Category', 'Order number', 'Amount (IDR)', 'Verified by', 'Note'],
    ...input.revenueTransactions.map((item) => [
      item.transactionDate ?? item.createdAt,
      item.createdAt,
      item.branch,
      item.category,
      item.orderNumber ?? '',
      item.category === 'order_refund' ? -item.amount : item.amount,
      item.actor ?? '',
      item.note ?? '',
    ]),
    [],
    ['Estimated revenue orders'],
    ['Completed at', 'Branch', 'Order number', 'Customer', 'Finance status', 'Total (IDR)'],
    ...input.estimatedOrders.map((order) => [
      order.completedAt ?? '',
      order.branch,
      order.orderNumber,
      order.customerName,
      order.financeVerified ? 'confirmed' : 'not confirmed',
      order.totalIdr,
    ]),
    [],
    ['Confirmed expense sources'],
    ['Accounting date', 'Created at', 'Branch', 'Category', 'Amount (IDR)', 'Verified by', 'Note'],
    ...input.expenseTransactions.map((item) => [
      item.transactionDate ?? item.createdAt,
      item.createdAt,
      item.branch,
      item.category,
      item.amount,
      item.actor ?? '',
      item.note ?? '',
    ]),
  ]

  return rows.map((row) => row.map(csvSafeString).join(',')).join('\n')
}

export const downloadRevenueDashboardCsv = (filename: string, csv: string): void => {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
