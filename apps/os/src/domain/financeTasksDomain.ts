/**
 * @file financeTasksDomain.ts
 * @description Everything waiting on Finance, built once from the same data
 * the Tasks tab lists. The tab badge, the filter chips, and the lists all
 * read this result, so their numbers cannot disagree.
 *
 * Only work Finance can act on counts as a task. Payments returned to Admin
 * for correction are listed (so Finance can follow them) but do not count:
 * they wait on Admin, not on Finance.
 */

import type { FinanceTransaction } from '../store/financeStoreTypes'
import type { EmployeePayrollDraft, PayrollProposal } from '../store/payrollStore'
import type { OrderTableRow } from '../types/orders'
import {
  paymentRowsForOrders,
  sortFinanceReconciliationRows,
  type FinanceQueueRow,
} from './financeReconciliationDomain'
import { countPayrollNeedingFinance, countPayrollReadyToPay } from './payrollFinanceDomain'

const LEGACY_ACCOUNT_ID = 'legacy:unassigned'

export interface FinanceTaskCounts {
  requests: number
  purchases: number
  reconciliation: number
  /** Returned to Admin; listed but not counted in `total`. */
  awaitingAdmin: number
  refunds: number
  payrollReview: number
  payrollReady: number
  accounts: number
  total: number
}

export interface FinanceTasks {
  requests: OrderTableRow[]
  reconciliation: FinanceQueueRow[]
  awaitingAdmin: FinanceQueueRow[]
  refunds: OrderTableRow[]
  counts: FinanceTaskCounts
}

const matches = (query: string, values: Array<string | number | undefined | null>): boolean =>
  !query || values.filter((value) => value !== undefined && value !== null).join(' ').toLowerCase().includes(query)

export const buildFinanceTasks = ({
  orders,
  transactions,
  payrollProposals,
  payrollDrafts = [],
  purchaseCount = 0,
  searchQuery = '',
}: {
  orders: OrderTableRow[]
  transactions: FinanceTransaction[]
  payrollProposals: (Pick<PayrollProposal, 'status'> & Partial<Pick<PayrollProposal, 'employeePayrollIds'>>)[]
  /** Employee rows, to tell whether a returned proposal still waits on Finance. */
  payrollDrafts?: Pick<EmployeePayrollDraft, 'id' | 'status'>[]
  purchaseCount?: number
  searchQuery?: string
}): FinanceTasks => {
  const query = searchQuery.trim().toLowerCase()

  const requests = orders.filter((order) =>
    Boolean(order.pendingChangeRequest)
    && matches(query, [order.orderNumber, order.customerName, order.productName, order.branch]))

  const openRows = sortFinanceReconciliationRows(
    paymentRowsForOrders(orders, transactions).filter((row) => row.reconciliationStatus !== 'reconciled'),
  ).filter((row) => matches(query, [
    row.order.orderNumber,
    row.order.customerName,
    row.order.productName,
    row.order.branch,
    row.transactionCode,
    row.reference,
    row.paymentAmountIdr,
  ]))
  const reconciliation = openRows.filter((row) => row.reconciliationStatus === 'awaiting_review')
  const awaitingAdmin = openRows.filter((row) => row.reconciliationStatus === 'needs_correction')

  const refunds = orders
    .filter((order) => order.paymentStatus === 'refund_pending')
    .filter((order) => matches(query, [order.orderNumber, order.customerName, order.refundReason, order.branch]))
    .sort((a, b) => (a.refundInitiatedAt ?? '').localeCompare(b.refundInitiatedAt ?? ''))

  const payrollReview = countPayrollNeedingFinance(payrollProposals, payrollDrafts)
  const payrollReady = countPayrollReadyToPay(payrollProposals)
  const accounts = transactions.filter((transaction) =>
    transaction.status === 'verified' && (!transaction.accountId || transaction.accountId === LEGACY_ACCOUNT_ID)).length

  const counts: FinanceTaskCounts = {
    requests: requests.length,
    purchases: purchaseCount,
    reconciliation: reconciliation.length,
    awaitingAdmin: awaitingAdmin.length,
    refunds: refunds.length,
    payrollReview,
    payrollReady,
    accounts,
    total: requests.length + purchaseCount + reconciliation.length + refunds.length + payrollReview + payrollReady + accounts,
  }

  return { requests, reconciliation, awaitingAdmin, refunds, counts }
}
