import type { FinanceTransaction, FinanceTransactionSource } from '../store/financeStoreTypes'

export type FinancePeriodReportSource = 'orders' | 'refunds' | 'payroll' | 'manual' | 'transfers'

export interface FinancePeriodAccountReport {
  accountId: string
  openingBalance: number
  moneyIn: number
  moneyOut: number
  closingBalance: number
  transactionCount: number
}

export interface FinancePeriodSourceReport {
  source: FinancePeriodReportSource
  label: string
  moneyIn: number
  moneyOut: number
  net: number
  transactionCount: number
}

export interface FinancePeriodReport {
  periodMonth: string
  openingBalance: number
  operatingMoneyIn: number
  operatingMoneyOut: number
  operatingNetCashFlow: number
  balanceAdjustments: number
  internalTransferNet: number
  closingBalance: number
  transactionCount: number
  accounts: FinancePeriodAccountReport[]
  sources: FinancePeriodSourceReport[]
}

const LEGACY_ACCOUNT_ID = 'legacy:unassigned'
const BALANCE_ADJUSTMENT_SOURCES = new Set<FinanceTransactionSource>(['opening_balance', 'adjustment'])
const NON_OPERATING_SOURCES = new Set<FinanceTransactionSource>(['opening_balance', 'adjustment', 'transfer'])

const SOURCE_ORDER: FinancePeriodReportSource[] = ['orders', 'refunds', 'payroll', 'manual', 'transfers']
const SOURCE_LABELS: Record<FinancePeriodReportSource, string> = {
  orders: 'Orders',
  refunds: 'Refunds',
  payroll: 'Payroll',
  manual: 'Manual',
  transfers: 'Transfers',
}

export const jakartaMonthKey = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  return year && month ? `${year}-${month}` : ''
}

const signedAmount = (transaction: FinanceTransaction): number =>
  transaction.type === 'income' ? transaction.amount : -transaction.amount

const sourceGroup = (source?: FinanceTransactionSource): FinancePeriodReportSource => {
  if (source === 'order_payment') return 'orders'
  if (source === 'order_refund') return 'refunds'
  if (source === 'payroll') return 'payroll'
  if (source === 'transfer') return 'transfers'
  return 'manual'
}

export const buildFinancePeriodReport = (
  transactions: FinanceTransaction[],
  periodMonth: string,
): FinancePeriodReport => {
  const targetMonth = periodMonth.slice(0, 7)
  const verified = transactions.filter((transaction) => transaction.status === 'verified' && transaction.amount > 0)
  const beforePeriod = verified.filter((transaction) => {
    const key = jakartaMonthKey(transaction.transactionDate ?? transaction.createdAt)
    return key !== '' && key < targetMonth
  })
  const inPeriod = verified.filter((transaction) =>
    jakartaMonthKey(transaction.transactionDate ?? transaction.createdAt) === targetMonth,
  )

  const openingBalance = beforePeriod.reduce((sum, transaction) => sum + signedAmount(transaction), 0)
  const operatingRows = inPeriod.filter((transaction) => !NON_OPERATING_SOURCES.has(transaction.source ?? 'manual'))
  const operatingMoneyIn = operatingRows
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const operatingMoneyOut = operatingRows
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const operatingNetCashFlow = operatingMoneyIn - operatingMoneyOut
  const balanceAdjustments = inPeriod
    .filter((transaction) => BALANCE_ADJUSTMENT_SOURCES.has(transaction.source ?? 'manual'))
    .reduce((sum, transaction) => sum + signedAmount(transaction), 0)
  const internalTransferNet = inPeriod
    .filter((transaction) => transaction.source === 'transfer')
    .reduce((sum, transaction) => sum + signedAmount(transaction), 0)
  const closingBalance = openingBalance + inPeriod.reduce((sum, transaction) => sum + signedAmount(transaction), 0)

  const accountIds = new Set<string>()
  for (const transaction of [...beforePeriod, ...inPeriod]) {
    accountIds.add(transaction.accountId || LEGACY_ACCOUNT_ID)
  }
  const accounts = [...accountIds].map((accountId) => {
    const opening = beforePeriod
      .filter((transaction) => (transaction.accountId || LEGACY_ACCOUNT_ID) === accountId)
      .reduce((sum, transaction) => sum + signedAmount(transaction), 0)
    const rows = inPeriod.filter((transaction) => (transaction.accountId || LEGACY_ACCOUNT_ID) === accountId)
    const moneyIn = rows.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0)
    const moneyOut = rows.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0)
    return {
      accountId,
      openingBalance: opening,
      moneyIn,
      moneyOut,
      closingBalance: opening + moneyIn - moneyOut,
      transactionCount: rows.length,
    }
  })

  const sources = SOURCE_ORDER.map((source) => {
    const rows = inPeriod.filter((transaction) => sourceGroup(transaction.source) === source)
    const moneyIn = rows.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0)
    const moneyOut = rows.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0)
    return {
      source,
      label: SOURCE_LABELS[source],
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
      transactionCount: rows.length,
    }
  })

  return {
    periodMonth,
    openingBalance,
    operatingMoneyIn,
    operatingMoneyOut,
    operatingNetCashFlow,
    balanceAdjustments,
    internalTransferNet,
    closingBalance,
    transactionCount: inPeriod.length,
    accounts,
    sources,
  }
}
