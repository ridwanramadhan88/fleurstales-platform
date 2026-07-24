/**
 * @file financeDomain.ts
 * @description Verified transaction summary math for the Finance workspace.
 * Filtering lives with each consuming screen; verified totals remain centralized here.
 */

import type {
  FinanceTransaction,
} from '../store/financeStoreTypes'

/**
 * @description Status filters exposed to UI.
 */
/**
 * @description Type filters exposed to UI.
 */
/**
 * @description Aggregated finance summary for a set of transactions.
 * Only 'verified' transactions count toward totals so pending/rejected
 * entries can't distort reported revenue or expenses.
 */
export interface FinanceSummary {
  totalVerifiedIncome: number
  totalVerifiedExpense: number
  netVerified: number
  pendingCount: number
  pendingAmount: number
}

/**
 * @description Computes the finance summary (verified totals + pending
 * queue size) for a list of transactions.
 */
export const getFinanceSummary = (
  transactions: FinanceTransaction[],
): FinanceSummary => {
  let totalVerifiedIncome = 0
  let totalVerifiedExpense = 0
  let pendingCount = 0
  let pendingAmount = 0

  transactions.forEach((transaction) => {
    if (transaction.status === 'verified') {
      if (transaction.type === 'income') {
        totalVerifiedIncome += transaction.amount
      } else {
        totalVerifiedExpense += transaction.amount
      }
    }
    if (transaction.status === 'pending') {
      pendingCount += 1
      pendingAmount += transaction.amount
    }
  })

  return {
    totalVerifiedIncome,
    totalVerifiedExpense,
    netVerified: totalVerifiedIncome - totalVerifiedExpense,
    pendingCount,
    pendingAmount,
  }
}
