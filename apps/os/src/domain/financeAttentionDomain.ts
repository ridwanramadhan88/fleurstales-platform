/**
 * @file financeAttentionDomain.ts
 * @description The single definition of "Finance work that needs attention".
 * The Finance overview and the Finance home card both read from here, so
 * the two counts can never disagree again.
 */

import type { OrderTableRow } from '../types/orders'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import type { PayrollProposal } from '../store/payrollStore'

const LEGACY_ACCOUNT_ID = 'legacy:unassigned'

export interface FinanceAttention {
  /** Paid orders posted to the ledger and waiting for Finance reconciliation. */
  awaiting: number
  /** Reconciliation orders Finance sent back for correction. */
  correction: number
  refunds: number
  payrollReview: number
  payrollReady: number
  legacyRows: number
  total: number
}

export const getFinanceAttention = ({
  orders,
  transactions,
  payrollProposals,
}: {
  orders: Pick<OrderTableRow, 'orderNumber' | 'financeVerified' | 'financeVerificationStatus' | 'paymentStatus'>[]
  transactions: Pick<FinanceTransaction, 'status' | 'source' | 'orderNumber' | 'accountId'>[]
  payrollProposals: Pick<PayrollProposal, 'status'>[]
}): FinanceAttention => {
  const postedOrderNumbers = new Set(
    transactions
      .filter((transaction) => transaction.status === 'verified' && transaction.source === 'order_payment' && transaction.orderNumber)
      .map((transaction) => transaction.orderNumber as string),
  )
  const reconciliationOrders = orders.filter(
    (order) => postedOrderNumbers.has(order.orderNumber) && !order.financeVerified,
  )
  const correction = reconciliationOrders.filter((order) => order.financeVerificationStatus === 'rejected').length
  const awaiting = Math.max(0, reconciliationOrders.length - correction)
  const refunds = orders.filter((order) => order.paymentStatus === 'refund_pending').length
  const payrollReview = payrollProposals.filter((proposal) => ['submitted_to_finance', 'returned_to_hr'].includes(proposal.status)).length
  const payrollReady = payrollProposals.filter((proposal) => proposal.status === 'finance_approved').length
  const legacyRows = transactions.filter(
    (transaction) => transaction.status === 'verified' && (!transaction.accountId || transaction.accountId === LEGACY_ACCOUNT_ID),
  ).length
  const total = awaiting + correction + refunds + payrollReview + payrollReady + legacyRows
  return { awaiting, correction, refunds, payrollReview, payrollReady, legacyRows, total }
}

/** Orders on the Finance reconciliation queue (awaiting review or correction). */
export const countOrdersAwaitingReconciliation = (attention: FinanceAttention): number =>
  attention.awaiting + attention.correction
