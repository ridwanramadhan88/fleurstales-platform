/**
 * @file financeLedgerDomain.ts
 * @description Pure rules behind Cash & Transactions: which rows the ledger
 * shows, how they are filtered, account balances, and the month's cash flow.
 */

import type { FinanceTransaction, FinanceTransactionType } from '../store/financeStoreTypes'
import { financeBusinessDate, financeBusinessMonth } from './financeDates'

export const LEGACY_ACCOUNT_ID = 'legacy:unassigned'

export type LedgerSource = 'orders' | 'payroll' | 'refunds' | 'manual' | 'transfers' | 'other'
export type LedgerSourceFilter = 'all' | Exclude<LedgerSource, 'other'>

/** Opening balances, adjustments, and transfers move money between accounts; they are not operating cash flow. */
const BALANCE_SOURCES = new Set(['opening_balance', 'adjustment', 'transfer'])

const isManualEntry = (transaction: FinanceTransaction): boolean =>
  (transaction.entryMode ?? (transaction.isSystemGenerated ? 'automatic' : 'manual')) === 'manual'

export const ledgerSourceOf = (transaction: FinanceTransaction): LedgerSource => {
  const source = transaction.source ?? 'manual'
  if (source === 'order_payment') return 'orders'
  if (source === 'payroll') return 'payroll'
  if (source === 'order_refund') return 'refunds'
  if (BALANCE_SOURCES.has(source)) return 'transfers'
  if (isManualEntry(transaction)) return 'manual'
  return 'other'
}

/**
 * Pending order payments wait in Tasks (reconciliation); every other row —
 * including voided ones, struck through for the audit trail — is shown.
 */
export const isLedgerRow = (transaction: FinanceTransaction): boolean =>
  transaction.source !== 'order_payment' || transaction.status === 'verified' || transaction.status === 'void'

export const transactionScope = (transaction: FinanceTransaction): 'company' | 'branch' =>
  transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')

export interface LedgerFilters {
  /** `YYYY-MM`; null shows every month. */
  month: string | null
  source: LedgerSourceFilter
  direction: 'all' | FinanceTransactionType
  category: string
  /** 'All', 'Company-wide', or a branch id. */
  branch: string
  /** 'All' or an account id (including the legacy bucket). */
  accountId: string
  query: string
}

export const DEFAULT_LEDGER_FILTERS: Omit<LedgerFilters, 'month'> = {
  source: 'all',
  direction: 'all',
  category: 'all',
  branch: 'All',
  accountId: 'All',
  query: '',
}

export const filterLedger = (
  transactions: FinanceTransaction[],
  filters: LedgerFilters,
  searchText: (transaction: FinanceTransaction) => string,
): FinanceTransaction[] => {
  const query = filters.query.trim().toLowerCase()
  return transactions
    .filter(isLedgerRow)
    .filter((transaction) => {
      const scope = transactionScope(transaction)
      const accountId = transaction.accountId || LEGACY_ACCOUNT_ID
      return (!filters.month || financeBusinessMonth(transaction) === filters.month)
        && (filters.source === 'all' || ledgerSourceOf(transaction) === filters.source)
        && (filters.direction === 'all' || transaction.type === filters.direction)
        && (filters.category === 'all' || transaction.category === filters.category)
        && (filters.accountId === 'All' || accountId === filters.accountId)
        && (filters.branch === 'All'
          || (filters.branch === 'Company-wide' ? scope === 'company' : scope === 'branch' && transaction.branch === filters.branch))
        && (!query || searchText(transaction).toLowerCase().includes(query))
    })
    .sort((a, b) =>
      financeBusinessDate(b).localeCompare(financeBusinessDate(a))
      || b.createdAt.localeCompare(a.createdAt))
}

/** Running balance per account from every verified row (all time). */
export const accountBalances = (transactions: FinanceTransaction[]): Map<string, number> => {
  const balances = new Map<string, number>()
  for (const transaction of transactions) {
    if (transaction.status !== 'verified') continue
    const id = transaction.accountId || LEGACY_ACCOUNT_ID
    balances.set(id, (balances.get(id) ?? 0) + (transaction.type === 'income' ? transaction.amount : -transaction.amount))
  }
  return balances
}

/** Operating Money In / Money Out for one month (balance moves excluded). */
export const monthCashFlow = (
  transactions: FinanceTransaction[],
  month: string,
): { moneyIn: number; moneyOut: number; net: number } => {
  let moneyIn = 0
  let moneyOut = 0
  for (const transaction of transactions) {
    if (transaction.status !== 'verified') continue
    if (BALANCE_SOURCES.has(transaction.source ?? 'manual')) continue
    if (financeBusinessMonth(transaction) !== month) continue
    if (transaction.type === 'income') moneyIn += transaction.amount
    else moneyOut += transaction.amount
  }
  return { moneyIn, moneyOut, net: moneyIn - moneyOut }
}
