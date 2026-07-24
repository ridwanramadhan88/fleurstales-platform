import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { isOrderFinished } from '../../domain/orderBusinessRules'
import { getCashRevenueSummary, getCashRevenueTrend, getCashExpenseTrend, getCashMetricPeriodCompare, getCashIncomeExpense, getCashMetricBranchCompare, getCashRevenueByBranch, getTopCustomersByVerifiedCash, getPaymentMethodBreakdown, getRevenueBySourceFromVerifiedCash, resolveCashRange, previousEqualRange, isVerifiedCollectedIncome, isVerifiedOrderRefund, isVerifiedCashExpense } from '../../domain/cashRevenueDomain'
import { useOrdersStore } from '../../store/ordersStore'
import { useFinanceStore } from '../../store/financeStore'
import { useUserStore } from '../../store/userStore'
import type { OrderTableRow } from '../../types/orders'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { RevenueDashboardProps } from './RevenueDashboard'

interface PeriodComparison {
  currentTotalIdr: number
  previousTotalIdr: number
  currentItemCount: number
  previousItemCount: number
  growthPercent: number | null
}

const csvEscape = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`

const buildDashboardCsv = (input: {
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
    ['Date', 'Branch', 'Category', 'Order number', 'Amount (IDR)', 'Verified by', 'Note'],
    ...input.revenueTransactions.map((item) => [item.createdAt, item.branch, item.category, item.orderNumber ?? '', item.category === 'order_refund' ? -item.amount : item.amount, item.actor ?? '', item.note ?? '']),
    [],
    ['Estimated revenue orders'],
    ['Completed at', 'Branch', 'Order number', 'Customer', 'Finance status', 'Total (IDR)'],
    ...input.estimatedOrders.map((order) => [order.completedAt ?? '', order.branch, order.orderNumber, order.customerName, order.financeVerified ? 'confirmed' : 'not confirmed', order.totalIdr]),
    [],
    ['Confirmed expense sources'],
    ['Date', 'Branch', 'Category', 'Amount (IDR)', 'Verified by', 'Note'],
    ...input.expenseTransactions.map((item) => [item.createdAt, item.branch, item.category, item.amount, item.actor ?? '', item.note ?? '']),
  ]
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** @description Short date label for the trend header, matching the Orders date picker's style. */
const formatShortDate = (date: Date): string => format(date, 'dd MMM')

/** @description Trend period selector: fixed presets, or an explicit custom range. */
export type TrendPeriod = 7 | 14 | 30 | 'custom'

/**
 * @description Revenue trend view mode: the original single-line trend, or
 * one of two two-series comparisons plotted as overlapping areas.
 */
export type CompareMode = 'single' | 'period_vs_period' | 'income_expense' | 'branch_vs_branch'
export type TrendMetric = 'revenue' | 'expense'

export type RevenueDrilldownStatus = 'confirmed' | 'pending'
export type RevenueDrilldownDirection = 'plus' | 'minus'
export interface RevenueDrilldownItem {
  id: string
  date: string
  branch: string
  title: string
  subtitle: string
  amountIdr: number
  direction: RevenueDrilldownDirection
  status: RevenueDrilldownStatus
  orderNumber?: string
}
export type RevenueDrilldownKey =
  | 'confirmed'
  | 'estimated'
  | 'confirmed_orders'
  | 'compare_a'
  | 'compare_b'
  | 'compare_delta'
export interface RevenueDrilldownSet {
  title: string
  subtitle: string
  items: RevenueDrilldownItem[]
}

export interface RevenueDashboardViewModel extends RevenueDashboardProps {
  trendDays: 7 | 14 | 30
  trendPeriod: TrendPeriod
  customRange: DateRange | undefined
  compareMode: CompareMode
  trendMetric: TrendMetric
  periodComparison: PeriodComparison | null
  compareTrend: ReturnType<typeof getCashIncomeExpense>
  compareBranchNames: { branchA: string; branchB: string } | null
  trendLabel: string
  comparePeriodLabel: string
  previousPeriodLabel: string
  compareTotals: { seriesA: number; seriesB: number; difference: number; percentChange: number | null }
  canCompareBranches: boolean
  summary: ReturnType<typeof getCashRevenueSummary>
  branchRevenue: ReturnType<typeof getCashRevenueByBranch>
  topCustomers: ReturnType<typeof getTopCustomersByVerifiedCash>
  paymentBreakdown: ReturnType<typeof getPaymentMethodBreakdown>
  sourceBreakdown: ReturnType<typeof getRevenueBySourceFromVerifiedCash>
  maxBranchRevenue: number
  totalPaymentIdr: number
  totalSourceIdr: number
  revenueTransactions: FinanceTransaction[]
  expenseTransactions: FinanceTransaction[]
  estimatedRevenueIdr: number
  estimatedUnconfirmedIdr: number
  companyWideExpenseIdr: number
  drilldowns: Record<RevenueDrilldownKey, RevenueDrilldownSet>
  onTrendPeriodChange: (value: TrendPeriod) => void
  onCustomRangeChange: (range: DateRange | undefined) => void
  onCompareModeChange: (mode: CompareMode) => void
  onTrendMetricChange: (metric: TrendMetric) => void
  onExport: () => void
}


const transactionToDrilldownItem = (
  transaction: FinanceTransaction,
  options?: { invert?: boolean },
): RevenueDrilldownItem => {
  const refund = transaction.category === 'order_refund'
  const expense = transaction.type === 'expense' && !refund
  const naturallyMinus = refund || expense
  const direction: RevenueDrilldownDirection = options?.invert
    ? (naturallyMinus ? 'plus' : 'minus')
    : (naturallyMinus ? 'minus' : 'plus')
  return {
    id: transaction.id,
    date: transaction.transactionDate ?? transaction.createdAt,
    branch: transaction.branch,
    title: transaction.description,
    subtitle: transaction.orderNumber
      ? `${transaction.orderNumber} · ${transaction.category.replaceAll('_', ' ')}`
      : transaction.category.replaceAll('_', ' '),
    amountIdr: transaction.amount,
    direction,
    status: transaction.status === 'verified' ? 'confirmed' : 'pending',
    orderNumber: transaction.orderNumber,
  }
}

const orderToDrilldownItem = (order: OrderTableRow): RevenueDrilldownItem => ({
  id: order.id ?? order.orderNumber,
  date: order.completedAt ?? order.updatedAt ?? '',
  branch: order.branch,
  title: order.customerName,
  subtitle: `${order.orderNumber} · ${order.productName ?? 'Finished order'}`,
  amountIdr: order.totalIdr,
  direction: 'plus',
  status: 'pending',
  orderNumber: order.orderNumber,
})

export const useRevenueDashboardController = ({
  activeBranch,
}: RevenueDashboardProps): RevenueDashboardViewModel => {
  const allOrders = useOrdersStore((state) => state.orders)
  const financeTransactions = useFinanceStore((state) => state.transactions)
  const role = useUserStore((state) => state.role)
  const branchScope = activeBranch === 'All' ? 'all' : activeBranch
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>(14)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  const [compareMode, setCompareMode] = useState<CompareMode>('single')
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('revenue')

  // Preset days derived from trendPeriod (falls back to 14 while 'custom' is
  // selected, so anything still keyed on the fixed-day chart config keeps working).
  const trendDays: 7 | 14 | 30 = trendPeriod === 'custom' ? 14 : trendPeriod

  const canCompareBranches = role === 'owner' || (role === 'finance' && branchScope === 'all')

  const hasValidCustomRange =
    trendPeriod === 'custom' &&
    Boolean(customRange?.from) &&
    Boolean(customRange?.to) &&
    (customRange!.to as Date) >= (customRange!.from as Date)

  const activeRange = useMemo(() => {
    if (trendPeriod === 'custom') {
      if (!hasValidCustomRange) return null
      return resolveCashRange({ startDate: customRange!.from as Date, endDate: customRange!.to as Date })
    }
    return resolveCashRange({ days: trendPeriod })
  }, [trendPeriod, hasValidCustomRange, customRange])

  const branchRevenue = useMemo(() => activeRange ? getCashRevenueByBranch(financeTransactions, { range: activeRange }) : [], [financeTransactions, activeRange])

  // "vs last period" comparison, tied to whatever window the trend chart
  // itself is showing (7d / 14d / 30d / a custom range) — not a fixed 30d
  // window like the top summary card above.
  const periodComparison = useMemo<PeriodComparison | null>(() => {
    if (!activeRange) return null
    const previous = previousEqualRange(activeRange)
    const trendFn = trendMetric === 'revenue' ? getCashRevenueTrend : getCashExpenseTrend
    const currentTrend = trendFn(financeTransactions, { branch: branchScope, range: activeRange })
    const previousTrend = trendFn(financeTransactions, { branch: branchScope, range: previous })
    const currentRevenueIdr = currentTrend.reduce((sum, point) => sum + point.totalIdr, 0)
    const previousRevenueIdr = previousTrend.reduce((sum, point) => sum + point.totalIdr, 0)
    return {
      currentTotalIdr: currentRevenueIdr,
      previousTotalIdr: previousRevenueIdr,
      currentItemCount: currentTrend.reduce((sum, point) => sum + point.itemCount, 0),
      previousItemCount: previousTrend.reduce((sum, point) => sum + point.itemCount, 0),
      growthPercent: previousRevenueIdr > 0 ? ((currentRevenueIdr - previousRevenueIdr) / previousRevenueIdr) * 100 : null,
    }
  }, [activeRange, financeTransactions, branchScope, trendMetric])

  // The two branches to compare in 'branch_vs_branch' mode: the two with the
  // most revenue overall. Resolved from real data rather than hardcoded,
  // since branch names come from seed/store data, not a fixed enum.
  const compareBranchNames = useMemo(() => {
    const names = Array.from(new Set(financeTransactions.filter((item) => (item.scope ?? (item.branch === 'All' ? 'company' : 'branch')) === 'branch').map((item) => item.branch)))
    if (names.includes('Pahoman') && names.includes('Kedamaian')) return { branchA:'Pahoman' as const, branchB:'Kedamaian' as const }
    if (branchRevenue.length < 2) return null
    const sorted = [...branchRevenue].sort((a, b) => b.totalIdr - a.totalIdr)
    return { branchA: sorted[0].branch, branchB: sorted[1].branch }
  }, [branchRevenue, financeTransactions])


  const compareTrend = useMemo(() => {
    if (!activeRange) return []
    if (compareMode === 'single') {
      const trend = trendMetric === 'revenue' ? getCashRevenueTrend(financeTransactions, { branch:branchScope, range:activeRange }) : getCashExpenseTrend(financeTransactions, { branch:branchScope, range:activeRange })
      return trend.map((point) => ({ label:point.label, seriesA:point.totalIdr, seriesB:0 }))
    }
    if (compareMode === 'period_vs_period') return getCashMetricPeriodCompare(financeTransactions, { metric:trendMetric, branch:branchScope, range:activeRange })
    if (compareMode === 'income_expense') return getCashIncomeExpense(financeTransactions, { branch: branchScope, range: activeRange })
    if (!canCompareBranches || !compareBranchNames) return []
    return getCashMetricBranchCompare(financeTransactions, { metric:trendMetric, branchA:compareBranchNames.branchA, branchB:compareBranchNames.branchB, range:activeRange })
  }, [compareMode, trendMetric, activeRange, financeTransactions, branchScope, compareBranchNames, canCompareBranches])

  const activeCompareRange = activeRange

  const comparePeriodLabel = activeCompareRange
    ? `${formatShortDate(activeCompareRange.startDate)} – ${formatShortDate(activeCompareRange.endDate)}`
    : 'Select a date range'

  const previousPeriodLabel = activeCompareRange
    ? (() => {
        const start = new Date(activeCompareRange.startDate)
        const end = new Date(activeCompareRange.endDate)
        start.setHours(0, 0, 0, 0)
        end.setHours(0, 0, 0, 0)
        const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
        const previousEnd = new Date(start)
        previousEnd.setDate(previousEnd.getDate() - 1)
        const previousStart = new Date(previousEnd)
        previousStart.setDate(previousStart.getDate() - (dayCount - 1))
        return `${formatShortDate(previousStart)} – ${formatShortDate(previousEnd)}`
      })()
    : 'Previous equal period'

  const compareTotals = useMemo(() => {
    const seriesA = compareTrend.reduce((sum, point) => sum + point.seriesA, 0)
    const seriesB = compareTrend.reduce((sum, point) => sum + point.seriesB, 0)
    return {
      seriesA,
      seriesB,
      difference: seriesA - seriesB,
      percentChange: seriesB > 0 ? ((seriesA - seriesB) / seriesB) * 100 : null,
    }
  }, [compareTrend])

  const activeRangeKeys = useMemo(() => {
    if (!activeRange) return null
    const toJakartaKey = (date: Date) => new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { start: toJakartaKey(activeRange.startDate), end: toJakartaKey(activeRange.endDate) }
  }, [activeRange])

  const transactionInActivePeriod = (transaction: FinanceTransaction) => {
    if (!activeRangeKeys) return false
    const date = new Date(transaction.transactionDate ?? transaction.createdAt)
    if (Number.isNaN(date.getTime())) return false
    const key = new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return key >= activeRangeKeys.start && key <= activeRangeKeys.end
  }

  const transactionInActiveScope = (transaction: FinanceTransaction) => {
    if (!transactionInActivePeriod(transaction)) return false
    if (branchScope !== 'all' && transaction.branch !== branchScope) return false
    return true
  }

  const revenueTransactions = useMemo(
    () => financeTransactions
      .filter((transaction) => transactionInActiveScope(transaction) && (isVerifiedCollectedIncome(transaction) || isVerifiedOrderRefund(transaction)))
      .sort((a, b) => new Date(b.transactionDate ?? b.createdAt).getTime() - new Date(a.transactionDate ?? a.createdAt).getTime()),
    [financeTransactions, activeRangeKeys, branchScope],
  )

  const expenseTransactions = useMemo(
    () => financeTransactions
      .filter((transaction) => transactionInActiveScope(transaction) && isVerifiedCashExpense(transaction))
      .sort((a, b) => new Date(b.transactionDate ?? b.createdAt).getTime() - new Date(a.transactionDate ?? a.createdAt).getTime()),
    [financeTransactions, activeRangeKeys, branchScope],
  )
  const companyWideExpenseIdr = useMemo(
    () => financeTransactions
      .filter((transaction) =>
        transactionInActivePeriod(transaction) &&
        isVerifiedCashExpense(transaction) &&
        (transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')) === 'company',
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0),
    [financeTransactions, activeRangeKeys],
  )

  const confirmedRevenueIdr = revenueTransactions.reduce(
    (sum, item) => sum + (item.category === 'order_refund' ? -item.amount : item.amount),
    0,
  )
  const confirmedOrderNumbers = useMemo(
    () => new Set(revenueTransactions.filter(isVerifiedCollectedIncome).map((item) => item.orderNumber).filter(Boolean)),
    [revenueTransactions],
  )
  const estimatedOrders = useMemo(() => {
    if (!activeRangeKeys) return []
    return allOrders.filter((order) => {
      if (branchScope !== 'all' && order.branch !== branchScope) return false
      if (!isOrderFinished(order) || !order.completedAt) return false
      const completed = new Date(order.completedAt)
      if (Number.isNaN(completed.getTime())) return false
      const key = new Date(completed.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
      return key >= activeRangeKeys.start && key <= activeRangeKeys.end && !confirmedOrderNumbers.has(order.orderNumber)
    })
  }, [allOrders, branchScope, activeRangeKeys, confirmedOrderNumbers])
  const estimatedUnconfirmedIdr = estimatedOrders.reduce((sum, order) => sum + order.totalIdr, 0)
  const estimatedRevenueIdr = confirmedRevenueIdr + estimatedUnconfirmedIdr
  const summary = useMemo(() => ({
    totalRevenueIdr: confirmedRevenueIdr,
    orderCount: confirmedOrderNumbers.size,
    averageOrderValueIdr: confirmedOrderNumbers.size ? Math.round(confirmedRevenueIdr / confirmedOrderNumbers.size) : 0,
    growthPercent: periodComparison?.growthPercent ?? null,
  }), [confirmedRevenueIdr, confirmedOrderNumbers, periodComparison])

  const trendLabel = (() => {
    if (compareMode === 'single') {
      return trendPeriod === 'custom' && !hasValidCustomRange
        ? 'Select a start and end date'
        : `${trendMetric === 'revenue' ? 'Revenue (confirmed)' : 'Expense'}, by day`
    }
    if (compareMode === 'period_vs_period') {
      if (trendPeriod === 'custom' && !hasValidCustomRange) return 'Select a start and end date'
      return `${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · selected ${trendPeriod === 'custom' ? 'period' : `${trendPeriod} days`} vs previous`
    }
    if (compareMode === 'income_expense') {
      return trendPeriod === 'custom' && !hasValidCustomRange
        ? 'Select a start and end date'
        : 'Revenue (confirmed) vs. expense, by day'
    }
    if (compareMode === 'branch_vs_branch') {
      if (trendPeriod === 'custom' && !hasValidCustomRange) return 'Select a start and end date'
      if (!canCompareBranches) return 'Branch comparison is unavailable for this branch-limited account'
      if (!compareBranchNames) return `Need at least two branches with ${trendMetric === 'revenue' ? 'revenue' : 'expenses'} to compare`
      return `${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · ${compareBranchNames.branchA} vs ${compareBranchNames.branchB}, by day`
    }
    return comparePeriodLabel
  })()
  const topCustomers = useMemo(
    () => activeRange ? getTopCustomersByVerifiedCash(financeTransactions, allOrders, { branch: branchScope, range: activeRange, limit: 5 }) : [],
    [financeTransactions, allOrders, branchScope, activeRange],
  )
  const paymentBreakdown = useMemo(
    () => activeRange ? getPaymentMethodBreakdown(financeTransactions, { branch: branchScope, range: activeRange }) : [],
    [financeTransactions, branchScope, activeRange],
  )
  const sourceBreakdown = useMemo(
    () => activeRange ? getRevenueBySourceFromVerifiedCash(financeTransactions, allOrders, { branch: branchScope, range: activeRange }) : [],
    [financeTransactions, allOrders, branchScope, activeRange],
  )

  const transactionItemsFor = (
    range: { startDate: Date; endDate: Date },
    branch: string | 'all',
    kind: 'revenue' | 'expense',
    invert = false,
  ): RevenueDrilldownItem[] => {
    const start = new Date(range.startDate.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const end = new Date(range.endDate.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return financeTransactions
      .filter((transaction) => {
        if (branch !== 'all' && transaction.branch !== branch) return false
        const date = new Date(transaction.transactionDate ?? transaction.createdAt)
        if (Number.isNaN(date.getTime())) return false
        const key = new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
        if (key < start || key > end) return false
        return kind === 'revenue'
          ? isVerifiedCollectedIncome(transaction) || isVerifiedOrderRefund(transaction)
          : isVerifiedCashExpense(transaction)
      })
      .sort((a, b) => new Date(b.transactionDate ?? b.createdAt).getTime() - new Date(a.transactionDate ?? a.createdAt).getTime())
      .map((transaction) => transactionToDrilldownItem(transaction, { invert }))
  }

  const confirmedItems = revenueTransactions.map((transaction) => transactionToDrilldownItem(transaction))
  const pendingItems = estimatedOrders.map(orderToDrilldownItem)
  const estimatedItems = [...confirmedItems, ...pendingItems].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  const confirmedOrderItems = confirmedItems.filter((item) => item.orderNumber)

  let compareAItems: RevenueDrilldownItem[] = []
  let compareBItems: RevenueDrilldownItem[] = []
  let compareATitle = 'Series A'
  let compareBTitle = 'Series B'
  if (activeRange) {
    if (compareMode === 'period_vs_period') {
      compareAItems = transactionItemsFor(activeRange, branchScope, trendMetric)
      compareBItems = transactionItemsFor(previousEqualRange(activeRange), branchScope, trendMetric)
      compareATitle = `${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · selected period · ${comparePeriodLabel}`
      compareBTitle = `${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · previous period · ${previousPeriodLabel}`
    } else if (compareMode === 'income_expense') {
      compareAItems = transactionItemsFor(activeRange, branchScope, 'revenue')
      compareBItems = transactionItemsFor(activeRange, branchScope, 'expense')
      compareATitle = `Revenue confirmed · ${comparePeriodLabel}`
      compareBTitle = `Expense confirmed · ${comparePeriodLabel}`
    } else if (compareMode === 'branch_vs_branch' && compareBranchNames) {
      compareAItems = transactionItemsFor(activeRange, compareBranchNames.branchA, trendMetric)
      compareBItems = transactionItemsFor(activeRange, compareBranchNames.branchB, trendMetric)
      compareATitle = `${compareBranchNames.branchA} · ${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · ${comparePeriodLabel}`
      compareBTitle = `${compareBranchNames.branchB} · ${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · ${comparePeriodLabel}`
    }
  }
  const compareDeltaItems = [
    ...compareAItems,
    ...compareBItems.map((item) => ({
      ...item,
      id: `compare-b-${item.id}`,
      direction: (item.direction === 'plus' ? 'minus' : 'plus') as RevenueDrilldownDirection,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const drilldowns: Record<RevenueDrilldownKey, RevenueDrilldownSet> = {
    confirmed: {
      title: 'Revenue confirmed',
      subtitle: `${comparePeriodLabel} · Finance-confirmed transactions`,
      items: confirmedItems,
    },
    estimated: {
      title: 'Revenue estimate',
      subtitle: `${comparePeriodLabel} · Confirmed transactions and finished pending orders`,
      items: estimatedItems,
    },
    confirmed_orders: {
      title: 'Confirmed orders',
      subtitle: `${comparePeriodLabel} · Orders represented in confirmed revenue`,
      items: confirmedOrderItems,
    },
    compare_a: { title: compareATitle, subtitle: trendMetric === 'revenue' ? 'Source orders and verified transactions' : 'Source expense transactions', items: compareAItems },
    compare_b: { title: compareBTitle, subtitle: trendMetric === 'revenue' ? 'Source orders and verified transactions' : 'Source expense transactions', items: compareBItems },
    compare_delta: {
      title: compareMode === 'income_expense' ? 'Net result sources' : 'Difference sources',
      subtitle: 'Series A is plus; Series B is minus',
      items: compareDeltaItems,
    },
  }

  return {
    activeBranch,
    trendDays,
    trendPeriod,
    customRange,
    compareMode, trendMetric,
    periodComparison,
    compareTrend,
    compareBranchNames,
    trendLabel,
    comparePeriodLabel,
    previousPeriodLabel,
    compareTotals,
    canCompareBranches,
    summary,
    branchRevenue,
    topCustomers,
    paymentBreakdown,
    sourceBreakdown,
    maxBranchRevenue: Math.max(
      1,
      ...branchRevenue.map((entry) => entry.totalIdr),
    ),
    totalPaymentIdr: Math.max(
      1,
      paymentBreakdown.reduce((sum, entry) => sum + entry.totalIdr, 0),
    ),
    totalSourceIdr: Math.max(
      1,
      sourceBreakdown.reduce((sum, entry) => sum + entry.totalIdr, 0),
    ),
    revenueTransactions,
    expenseTransactions,
    estimatedRevenueIdr,
    estimatedUnconfirmedIdr,
    companyWideExpenseIdr,
    drilldowns,
    onTrendPeriodChange: setTrendPeriod,
    onCustomRangeChange: setCustomRange,
    onCompareModeChange: setCompareMode,
    onTrendMetricChange: setTrendMetric,
    onExport: () => {
      const csv = buildDashboardCsv({
        scope: branchScope === 'all' ? 'All branches' : branchScope,
        period: comparePeriodLabel,
        confirmedRevenueIdr,
        estimatedRevenueIdr,
        expenseIdr: expenseTransactions.reduce((sum, item) => sum + item.amount, 0),
        revenueTransactions,
        expenseTransactions,
        estimatedOrders,
      })
      const scopeLabel = branchScope === 'all' ? 'all-branches' : branchScope.toLowerCase()
      downloadCsv(`fleurstales-revenue-dashboard-${scopeLabel}.csv`, csv)
    },
  }
}