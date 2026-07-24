import type { BranchId, OrderSource, OrderTableRow } from '../types/orders'
import type { FinancePaymentMethod } from '../store/financeStoreTypes'
import type { FinanceTransaction } from '../store/financeStoreTypes'

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

const dayKey = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
}

const dateKey = (date: Date): string =>
  new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)

const isVerified = (transaction: FinanceTransaction): boolean => transaction.status === 'verified'

export const isVerifiedCollectedIncome = (transaction: FinanceTransaction): boolean =>
  isVerified(transaction) &&
  transaction.type === 'income' &&
  transaction.category === 'order_payment'

export const isVerifiedOrderRefund = (transaction: FinanceTransaction): boolean =>
  isVerified(transaction) &&
  transaction.type === 'expense' &&
  transaction.category === 'order_refund'

export const isVerifiedCashExpense = (transaction: FinanceTransaction): boolean =>
  isVerified(transaction) &&
  transaction.type === 'expense' &&
  transaction.category !== 'order_refund'

const isBranchScoped = (
  transaction: FinanceTransaction,
  branch?: BranchId | 'all',
): boolean => !branch || branch === 'all' || transaction.branch === branch

/** Cash-basis net collected revenue: verified payments less verified refunds. */
const signedRevenueAmount = (transaction: FinanceTransaction): number => {
  if (isVerifiedCollectedIncome(transaction)) return transaction.amount
  if (isVerifiedOrderRefund(transaction)) return -transaction.amount
  return 0
}

export const resolveCashRange = (
  window: { days: number } | { startDate: Date; endDate: Date },
): { startDate: Date; endDate: Date } => {
  if ('startDate' in window) return window
  const endDate = new Date()
  endDate.setHours(23, 59, 59, 999)
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - (window.days - 1))
  startDate.setHours(0, 0, 0, 0)
  return { startDate, endDate }
}

export const previousEqualRange = (range: { startDate: Date; endDate: Date }) => {
  const start = new Date(range.startDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(range.endDate)
  end.setHours(0, 0, 0, 0)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - (days - 1))
  return { startDate: previousStart, endDate: previousEnd }
}

const isInRange = (
  transaction: FinanceTransaction,
  range: { startDate: Date; endDate: Date },
): boolean => {
  const key = dayKey(transaction.transactionDate ?? transaction.createdAt)
  return key >= dateKey(range.startDate) && key <= dateKey(range.endDate)
}

const sumRevenue = (
  transactions: FinanceTransaction[],
  branch: BranchId | 'all' | undefined,
  range: { startDate: Date; endDate: Date },
): number =>
  transactions
    .filter((transaction) => isBranchScoped(transaction, branch) && isInRange(transaction, range))
    .reduce((total, transaction) => total + signedRevenueAmount(transaction), 0)

export const getCashRevenueSummary = (
  transactions: FinanceTransaction[],
  options?: { branch?: BranchId | 'all'; windowDays?: number },
) => {
  const range = resolveCashRange({ days: options?.windowDays ?? 30 })
  const previousRange = previousEqualRange(range)
  const totalRevenueIdr = sumRevenue(transactions, options?.branch, range)
  const previousRevenueIdr = sumRevenue(transactions, options?.branch, previousRange)
  const orderIds = new Set(
    transactions
      .filter(
        (transaction) =>
          isVerifiedCollectedIncome(transaction) &&
          isBranchScoped(transaction, options?.branch) &&
          isInRange(transaction, range),
      )
      .map((transaction) => transaction.orderNumber)
      .filter(Boolean),
  )
  const orderCount = orderIds.size
  return {
    totalRevenueIdr,
    orderCount,
    averageOrderValueIdr: orderCount ? Math.round(totalRevenueIdr / orderCount) : 0,
    growthPercent:
      previousRevenueIdr !== 0
        ? ((totalRevenueIdr - previousRevenueIdr) / Math.abs(previousRevenueIdr)) * 100
        : null,
  }
}

export interface CashTrendPoint {
  label: string
  totalIdr: number
  itemCount: number
}

export const getCashRevenueTrend = (
  transactions: FinanceTransaction[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date } },
): CashTrendPoint[] => {
  const start = new Date(options.range.startDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(options.range.endDate)
  end.setHours(0, 0, 0, 0)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const buckets = Array.from({ length: Math.max(0, days) }, (_, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    return {
      label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      key: dateKey(date),
      totalIdr: 0,
      orderIds: new Set<string>(),
    }
  })

  transactions
    .filter((transaction) => isBranchScoped(transaction, options.branch))
    .forEach((transaction) => {
      const amount = signedRevenueAmount(transaction)
      if (amount === 0) return
      const bucket = buckets.find((entry) => entry.key === dayKey(transaction.transactionDate ?? transaction.createdAt))
      if (!bucket) return
      bucket.totalIdr += amount
      if (amount > 0 && transaction.orderNumber) bucket.orderIds.add(transaction.orderNumber)
    })

  return buckets.map(({ label, totalIdr, orderIds }) => ({
    label,
    totalIdr,
    itemCount: orderIds.size,
  }))
}

export interface CashComparePoint {
  label: string
  seriesA: number
  seriesB: number
}

export const getCashExpenseTrend = (
  transactions: FinanceTransaction[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date } },
): CashTrendPoint[] => {
  const start = new Date(options.range.startDate); start.setHours(0,0,0,0)
  const end = new Date(options.range.endDate); end.setHours(0,0,0,0)
  const days = Math.round((end.getTime()-start.getTime())/86_400_000)+1
  const buckets = Array.from({length:Math.max(0,days)},(_,index)=>{const date=new Date(start);date.setDate(date.getDate()+index);return {label:date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}),key:dateKey(date),totalIdr:0,itemCount:0}})
  transactions.filter((transaction)=>isVerifiedCashExpense(transaction)&&isBranchScoped(transaction,options.branch)).forEach((transaction)=>{const bucket=buckets.find((entry)=>entry.key===dayKey(transaction.transactionDate??transaction.createdAt));if(bucket){bucket.totalIdr+=transaction.amount;bucket.itemCount+=1}})
  return buckets.map((entry)=>({label:entry.label,totalIdr:entry.totalIdr,itemCount:entry.itemCount}))
}

export const getCashMetricPeriodCompare = (
  transactions: FinanceTransaction[],
  options: { metric:'revenue'|'expense'; branch?:BranchId|'all'; range:{startDate:Date;endDate:Date} },
): CashComparePoint[] => {
  const fn=options.metric==='revenue'?getCashRevenueTrend:getCashExpenseTrend
  const current=fn(transactions,{branch:options.branch,range:options.range})
  const previous=fn(transactions,{branch:options.branch,range:previousEqualRange(options.range)})
  return current.map((point,index)=>({label:point.label,seriesA:point.totalIdr,seriesB:previous[index]?.totalIdr??0}))
}

export const getCashMetricBranchCompare = (
  transactions: FinanceTransaction[],
  options:{metric:'revenue'|'expense';branchA:BranchId;branchB:BranchId;range:{startDate:Date;endDate:Date}},
): CashComparePoint[] => {
  const fn=options.metric==='revenue'?getCashRevenueTrend:getCashExpenseTrend
  const a=fn(transactions,{branch:options.branchA,range:options.range})
  const b=fn(transactions,{branch:options.branchB,range:options.range})
  return a.map((point,index)=>({label:point.label,seriesA:point.totalIdr,seriesB:b[index]?.totalIdr??0}))
}

export const getCashPeriodCompare = (
  transactions: FinanceTransaction[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date } },
): CashComparePoint[] => {
  const current = getCashRevenueTrend(transactions, options)
  const previous = getCashRevenueTrend(transactions, {
    branch: options.branch,
    range: previousEqualRange(options.range),
  })
  return current.map((point, index) => ({
    label: point.label,
    seriesA: point.totalIdr,
    seriesB: previous[index]?.totalIdr ?? 0,
  }))
}

export const getCashIncomeExpense = (
  transactions: FinanceTransaction[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date } },
): CashComparePoint[] => {
  const revenue = getCashRevenueTrend(transactions, options)
  const start = new Date(options.range.startDate)
  start.setHours(0, 0, 0, 0)
  return revenue.map((point, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    const key = dateKey(date)
    const expense = transactions
      .filter(
        (transaction) =>
          isVerifiedCashExpense(transaction) &&
          isBranchScoped(transaction, options.branch) &&
          dayKey(transaction.transactionDate ?? transaction.createdAt) === key,
      )
      .reduce((total, transaction) => total + transaction.amount, 0)
    return { label: point.label, seriesA: point.totalIdr, seriesB: expense }
  })
}

export const getCashBranchCompare = (
  transactions: FinanceTransaction[],
  options: {
    branchA: BranchId
    branchB: BranchId
    range: { startDate: Date; endDate: Date }
  },
): CashComparePoint[] => {
  const branchA = getCashRevenueTrend(transactions, {
    branch: options.branchA,
    range: options.range,
  })
  const branchB = getCashRevenueTrend(transactions, {
    branch: options.branchB,
    range: options.range,
  })
  return branchA.map((point, index) => ({
    label: point.label,
    seriesA: point.totalIdr,
    seriesB: branchB[index]?.totalIdr ?? 0,
  }))
}

export const getCashRevenueByBranch = (
  transactions: FinanceTransaction[],
  options?: { range?: { startDate: Date; endDate: Date } },
) => {
  const totals = new Map<string, { totalIdr: number; orderIds: Set<string> }>()
  transactions.forEach((transaction) => {
    if (options?.range && !isInRange(transaction, options.range)) return
    const amount = signedRevenueAmount(transaction)
    if (amount === 0) return
    const value = totals.get(transaction.branch) ?? {
      totalIdr: 0,
      orderIds: new Set<string>(),
    }
    value.totalIdr += amount
    if (amount > 0 && transaction.orderNumber) value.orderIds.add(transaction.orderNumber)
    totals.set(transaction.branch, value)
  })
  return [...totals].map(([branch, value]) => ({
    branch,
    totalIdr: value.totalIdr,
    orderCount: value.orderIds.size,
  }))
}

const orderByNumber = (orders: OrderTableRow[]) =>
  new Map(orders.map((order) => [order.orderNumber, order]))

const scopedRevenueTransactions = (
  transactions: FinanceTransaction[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date } },
) => transactions.filter((transaction) =>
  isBranchScoped(transaction, options.branch) &&
  isInRange(transaction, options.range) &&
  (isVerifiedCollectedIncome(transaction) || isVerifiedOrderRefund(transaction)),
)

export interface CashCustomerBreakdownEntry {
  customerName: string
  totalIdr: number
  orderCount: number
}

/** Verified cash attributed to customers through each transaction's order number. */
export const getTopCustomersByVerifiedCash = (
  transactions: FinanceTransaction[],
  orders: OrderTableRow[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date }; limit?: number },
): CashCustomerBreakdownEntry[] => {
  const ordersByNumber = orderByNumber(orders)
  const totals = new Map<string, { totalIdr: number; orderIds: Set<string> }>()
  scopedRevenueTransactions(transactions, options).forEach((transaction) => {
    if (!transaction.orderNumber) return
    const order = ordersByNumber.get(transaction.orderNumber)
    if (!order) return
    const entry = totals.get(order.customerName) ?? { totalIdr: 0, orderIds: new Set<string>() }
    entry.totalIdr += signedRevenueAmount(transaction)
    if (isVerifiedCollectedIncome(transaction)) entry.orderIds.add(transaction.orderNumber)
    totals.set(order.customerName, entry)
  })
  return [...totals]
    .map(([customerName, entry]) => ({ customerName, totalIdr: entry.totalIdr, orderCount: entry.orderIds.size }))
    .sort((a, b) => b.totalIdr - a.totalIdr)
    .slice(0, options.limit ?? 5)
}

export interface CashPaymentMethodBreakdownEntry {
  status: FinancePaymentMethod
  totalIdr: number
  count: number
}

/** Verified cash grouped by payment method. `status` is retained for view compatibility. */
export const getPaymentMethodBreakdown = (
  transactions: FinanceTransaction[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date } },
): CashPaymentMethodBreakdownEntry[] => {
  const totals = new Map<FinancePaymentMethod, { totalIdr: number; transactionIds: Set<string> }>()
  scopedRevenueTransactions(transactions, options).forEach((transaction) => {
    const entry = totals.get(transaction.method) ?? { totalIdr: 0, transactionIds: new Set<string>() }
    entry.totalIdr += signedRevenueAmount(transaction)
    entry.transactionIds.add(transaction.id)
    totals.set(transaction.method, entry)
  })
  return [...totals].map(([status, entry]) => ({ status, totalIdr: entry.totalIdr, count: entry.transactionIds.size }))
}

export interface CashSourceBreakdownEntry {
  source: OrderSource
  totalIdr: number
  count: number
}

/** Verified order-linked cash grouped by the order intake source. */
export const getRevenueBySourceFromVerifiedCash = (
  transactions: FinanceTransaction[],
  orders: OrderTableRow[],
  options: { branch?: BranchId | 'all'; range: { startDate: Date; endDate: Date } },
): CashSourceBreakdownEntry[] => {
  const ordersByNumber = orderByNumber(orders)
  const totals = new Map<OrderSource, { totalIdr: number; orderIds: Set<string> }>()
  scopedRevenueTransactions(transactions, options).forEach((transaction) => {
    if (!transaction.orderNumber) return
    const order = ordersByNumber.get(transaction.orderNumber)
    if (!order) return
    const entry = totals.get(order.source) ?? { totalIdr: 0, orderIds: new Set<string>() }
    entry.totalIdr += signedRevenueAmount(transaction)
    if (isVerifiedCollectedIncome(transaction)) entry.orderIds.add(transaction.orderNumber)
    totals.set(order.source, entry)
  })
  return [...totals].map(([source, entry]) => ({ source, totalIdr: entry.totalIdr, count: entry.orderIds.size }))
}
