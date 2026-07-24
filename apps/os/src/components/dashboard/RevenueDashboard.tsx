/**
 * @file RevenueDashboard.tsx
 * @description Revenue Dashboard for authorized reporting roles. Presentational component that
 * renders verified-cash Revenue and Expense figures supplied by its controller.
 * Presentation remains separate from accounting and filtering rules.
 */

import { useEffect, useState, type FC } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, FileText, Calendar as CalendarIcon, ChevronDown, TrendingUp, TrendingDown, Minus, ChevronRight, ArrowLeft, ReceiptText } from 'lucide-react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import type { CompareMode, RevenueDrilldownKey, TrendMetric } from './RevenueDashboardController'
import { OverviewStatCard, OverviewStatGrid } from '../ui/overview-card'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { Calendar } from '../ui/calendar'
import type { BranchFilter } from '../../types/orders'
import type { RevenueDashboardViewModel } from './RevenueDashboardController'
import { formatIdrCurrency } from '../../lib/formatters'
import { downloadRevenueVectorPdf } from '../../lib/vectorPdfExport'
import { ChipRow, FilterChip } from '../ui/chip'

export interface RevenueDashboardProps {
  /**
   * @description Active branch chosen from the global switcher (top bar +
   * sidebar). Revenue used to have its own separate "All branches /
   * Kedamaian / Pahoman" selector here, out of sync with the rest of the
   * app — removed in favor of this single global source of truth.
   */
  activeBranch: BranchFilter
}

/** @description Shared IDR formatter — canonical implementation lives in lib/formatters. */
const formatIdr = formatIdrCurrency

/** @description Human-friendly labels for payment status badges. */
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  card: 'Card',
  other: 'Other',
  paid: 'Paid',
  partial: 'Partial',
  unpaid: 'Unpaid',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
}

/** @description Human-friendly labels for order source badges. */
const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  walk_in: 'Walk-in',
  customer_app: 'Customer app',
}

/** @description Value text sizing shared by all Revenue overview cards. */
const REVENUE_VALUE_CLASS =
  'font-display text-2xl font-semibold leading-tight text-foreground sm:text-3xl'

/** @description Toggle options for the trend view mode, shown under the period selector. */
const COMPARE_MODE_OPTIONS: { value: CompareMode; label: string }[] = [
  { value: 'single', label: 'Single view' },
  { value: 'period_vs_period', label: 'Period vs Previous Period' },
  { value: 'income_expense', label: 'Revenue vs Expense' },
  { value: 'branch_vs_branch', label: 'Branch vs Branch' },
]

/** @description Quick-pick shortcuts shown above the calendar, same pattern as the Orders date filter. */
const buildCustomRangePresets = (): { label: string; range: DateRange }[] => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const addDays = (date: Date, days: number) => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
  }
  return [
    { label: 'Last 7 days', range: { from: addDays(today, -6), to: today } },
    { label: 'Last 14 days', range: { from: addDays(today, -13), to: today } },
    { label: 'Last 30 days', range: { from: addDays(today, -29), to: today } },
    { label: 'This month', range: { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today } },
  ]
}

/**
 * @description Revenue Dashboard: totals, trend, branch comparison,
 * top customers, and payment/source breakdowns, with a CSV export action.
 */
export const RevenueDashboard: FC<RevenueDashboardViewModel> = ({
  activeBranch,
  trendDays,
  trendPeriod,
  customRange,
  compareMode,
  trendMetric,
  summary,
  periodComparison,
  compareTrend,
  compareBranchNames,
  trendLabel,
  comparePeriodLabel,
  previousPeriodLabel,
  compareTotals,
  canCompareBranches,
  branchRevenue,
  topCustomers,
  paymentBreakdown,
  sourceBreakdown,
  maxBranchRevenue,
  totalPaymentIdr,
  totalSourceIdr,
  estimatedRevenueIdr,
  estimatedUnconfirmedIdr,
  companyWideExpenseIdr,
  drilldowns,
  onTrendPeriodChange,
  onCustomRangeChange,
  onCompareModeChange,
  onTrendMetricChange,
  onExport,
}) => {
  /** @description Controls the custom-range popover, same pattern as the Orders date filter. */
  const [isCustomPopoverOpen, setIsCustomPopoverOpen] = useState(false)
  /** Draft selection while choosing the start and end dates. The completed range
   * is committed and the popover closes as soon as the end date is selected. */
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(customRange)
  /** Detailed breakdowns are secondary to the top-line business health view. */
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false)
  const [detailKey, setDetailKey] = useState<RevenueDrilldownKey | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    if (isCustomPopoverOpen) {
      setDraftRange(customRange)
    }
  }, [isCustomPopoverOpen, customRange])

  const customRangePresets = buildCustomRangePresets()
  const comparisonItemLabel = trendMetric === 'revenue' ? 'orders' : 'transactions'

  const commitCustomRange = (range: DateRange | undefined) => {
    if (!range?.from || !range.to) return
    setDraftRange(range)
    onCustomRangeChange(range)
    onTrendPeriodChange('custom')
    setIsCustomPopoverOpen(false)
  }

  const exportDashboardPdf = () => {
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      const scopeLabel = activeBranch === 'All' ? 'All branches' : activeBranch
      const scopeFile = activeBranch === 'All' ? 'all-branches' : activeBranch.toLowerCase()
      const selectedPeriod = trendPeriod === 'custom' ? 'Custom' : `${trendPeriod}d`
      const metricLabel = trendMetric === 'revenue' ? 'Revenue' : 'Expense'
      const firstLabel = compareMode === 'period_vs_period'
        ? `${metricLabel} · selected period`
        : compareMode === 'income_expense'
          ? 'Revenue (confirmed)'
          : (compareBranchNames?.branchA ?? 'Branch A')
      const secondLabel = compareMode === 'period_vs_period'
        ? `${metricLabel} · previous period`
        : compareMode === 'income_expense'
          ? 'Expense'
          : (compareBranchNames?.branchB ?? 'Branch B')
      const deltaLabel = compareMode === 'income_expense' ? 'Net result' : 'Difference'
      const differenceTone: 'success' | 'danger' | 'default' = compareTotals.difference > 0 ? 'success' : compareTotals.difference < 0 ? 'danger' : 'default'
      const compareCards = compareMode === 'single' ? undefined : [
        {
          label: firstLabel,
          value: formatIdr(compareTotals.seriesA),
          helper: compareMode === 'period_vs_period' && periodComparison
            ? `${comparePeriodLabel} · ${periodComparison.currentItemCount} ${comparisonItemLabel}`
            : comparePeriodLabel,
          badge: 'A',
          tone: (compareMode === 'income_expense' || trendMetric === 'revenue' ? 'success' : 'danger') as 'success' | 'danger',
        },
        {
          label: secondLabel,
          value: formatIdr(compareTotals.seriesB),
          helper: compareMode === 'period_vs_period' && periodComparison
            ? `${previousPeriodLabel} · ${periodComparison.previousItemCount} ${comparisonItemLabel}`
            : compareMode === 'period_vs_period' ? previousPeriodLabel : comparePeriodLabel,
          badge: 'B',
          tone: (compareMode === 'income_expense' ? 'danger' : trendMetric === 'revenue' ? 'success' : 'danger') as 'success' | 'danger',
        },
        {
          label: deltaLabel,
          value: `${compareTotals.difference >= 0 ? '+' : '−'}${formatIdr(Math.abs(compareTotals.difference))}`,
          helper: compareMode === 'income_expense'
            ? `${compareTotals.seriesA > 0 ? ((compareTotals.difference / compareTotals.seriesA) * 100).toFixed(1) : '0.0'}% margin · Revenue minus expense`
            : `${compareTotals.percentChange === null ? 'No comparison baseline' : `${compareTotals.percentChange >= 0 ? '+' : ''}${compareTotals.percentChange.toFixed(1)}%`} · ${firstLabel} minus ${secondLabel}`,
          tone: differenceTone,
        },
      ]
      const seriesALabel = compareMode === 'single'
        ? (trendMetric === 'revenue' ? 'Revenue (confirmed)' : 'Expense')
        : compareMode === 'period_vs_period'
          ? `${metricLabel} · selected period`
          : compareMode === 'income_expense'
            ? 'Revenue (confirmed)'
            : (compareBranchNames?.branchA ?? 'Branch A')
      const seriesBLabel = compareMode === 'single'
        ? undefined
        : compareMode === 'period_vs_period'
          ? `${metricLabel} · previous period`
          : compareMode === 'income_expense'
            ? 'Expense'
            : (compareBranchNames?.branchB ?? 'Branch B')

      downloadRevenueVectorPdf({
        title: 'Revenue',
        subtitle: `Confirmed collections and finished-order estimates · ${scopeLabel}`,
        scope: `${scopeLabel} · ${comparePeriodLabel}`,
        periodLabel: comparePeriodLabel,
        selectedPeriod,
        compareMode,
        compareModeLabels: COMPARE_MODE_OPTIONS
          .filter((option) => option.value !== 'branch_vs_branch' || canCompareBranches)
          .map((option) => option.label),
        summaryCards: [
          {
            label: `Revenue (confirmed) · ${comparePeriodLabel}`,
            value: formatIdr(summary.totalRevenueIdr),
            helper: summary.growthPercent === null
              ? 'Finance confirmed'
              : `${summary.growthPercent >= 0 ? '+' : ''}${summary.growthPercent.toFixed(1)}% vs previous period`,
            tone: summary.growthPercent === null ? 'default' : summary.growthPercent >= 0 ? 'success' : 'danger',
          },
          {
            label: `Revenue est. · ${comparePeriodLabel}`,
            value: formatIdr(estimatedRevenueIdr),
            helper: `Confirmed + ${formatIdr(estimatedUnconfirmedIdr)} pending`,
          },
          {
            label: `Orders confirmed · ${comparePeriodLabel}`,
            value: String(summary.orderCount),
            helper: 'Orders in confirmed revenue',
          },
          {
            label: 'Avg. order value',
            value: formatIdr(summary.averageOrderValueIdr),
            helper: 'Per confirmed order',
          },
        ],
        compareCards,
        trendLabel,
        trend: compareTrend,
        seriesALabel,
        seriesBLabel,
        detailedAnalysis: isAnalysisOpen ? {
          branchRevenue,
          topCustomers,
          paymentBreakdown,
          sourceBreakdown,
        } : undefined,
      }, `fleurstales-revenue-dashboard-${scopeFile}.pdf`)
    } finally {
      setExportingPdf(false)
    }
  }

  if (detailKey) {
    const detail = drilldowns[detailKey]
    const total = detail.items.reduce(
      (sum, item) => sum + (item.direction === 'minus' ? -item.amountIdr : item.amountIdr),
      0,
    )
    return (
      <section className="space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setDetailKey(null)}
              className="tap-scale mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-ios-sm transition hover:bg-muted hover:text-foreground"
              aria-label="Back to revenue overview"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">{detail.title}</h1>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail.subtitle}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3 text-right shadow-ios-sm">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Net total</p>
            <p className={`mt-1 text-xl font-semibold ${total < 0 ? 'text-destructive' : 'text-foreground'}`}>
              {total < 0 ? '−' : ''}{formatIdr(Math.abs(total))}
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">{detail.items.length} source items</p>
          </div>
        </header>

        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-ios">
          {detail.items.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <ReceiptText className="size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">No source items</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Nothing contributes to this card in the selected period.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {detail.items.map((item) => {
                const isMinus = item.direction === 'minus'
                return (
                  <article key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${item.status === 'confirmed' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                          {item.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                        {item.date && <span>{format(new Date(item.date), 'dd MMM yyyy, HH:mm')}</span>}
                        <span>{item.branch}</span>
                      </div>
                    </div>
                    <p className={`text-base font-semibold ${isMinus ? 'text-destructive' : 'text-success'}`}>
                      {isMinus ? '−' : '+'}{formatIdr(item.amountIdr)}
                    </p>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6 sm:space-y-4">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">Revenue</h1>
          <p className="mt-1 text-sm leading-5 text-muted-foreground sm:hidden">
            Confirmed revenue and finished-order estimates · {activeBranch === 'All' ? 'All branches' : activeBranch}
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Revenue confirmed by Finance. Estimate includes finished Orders still pending. Branch:{' '}
            {activeBranch === 'All' ? 'all branches' : activeBranch}.
          </p>
        </div>

        <div className="flex w-full items-center justify-start gap-2 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={onExport}
            aria-label="Download revenue dashboard as CSV"
            className="tap-scale inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-card text-xs font-semibold text-foreground shadow-ios-sm transition hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
          >
            <Download className="size-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={exportDashboardPdf}
            disabled={exportingPdf}
            aria-label="Download revenue dashboard as PDF"
            className="tap-scale inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-foreground text-xs font-semibold text-background shadow-ios-sm transition hover:opacity-90 disabled:opacity-60 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
          >
            <FileText className="size-3.5" />
            <span>{exportingPdf ? 'Creating…' : 'PDF'}</span>
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <OverviewStatGrid className="gap-2 min-[420px]:gap-3 sm:gap-4">
        <OverviewStatCard
          label={`Revenue (confirmed) · ${comparePeriodLabel}`}
          value={formatIdr(summary.totalRevenueIdr)}
          valueClassName={REVENUE_VALUE_CLASS}
          helper={summary.growthPercent === null ? 'Finance confirmed' : `${summary.growthPercent >= 0 ? '+' : ''}${summary.growthPercent.toFixed(1)}% vs previous period`}
          helperClassName="sm:min-h-10"
          onClick={() => setDetailKey('confirmed')}
          tone={
            summary.growthPercent === null
              ? 'default'
              : summary.growthPercent >= 0
                ? 'success'
                : 'danger'
          }
        />
        <OverviewStatCard
          label={`Revenue est. · ${comparePeriodLabel}`}
          value={formatIdr(estimatedRevenueIdr)}
          valueClassName={REVENUE_VALUE_CLASS}
          helper={`Confirmed + ${formatIdr(estimatedUnconfirmedIdr)} pending`}
          helperClassName="sm:min-h-10"
          tone="default"
          onClick={() => setDetailKey('estimated')}
        />
        <OverviewStatCard
          label={`Orders confirmed · ${comparePeriodLabel}`}
          value={String(summary.orderCount)}
          valueClassName={REVENUE_VALUE_CLASS}
          helper="Orders in confirmed revenue"
          helperClassName="sm:min-h-10"
          tone="default"
          onClick={() => setDetailKey('confirmed_orders')}
        />
        <OverviewStatCard
          label="Avg. order value"
          value={formatIdr(summary.averageOrderValueIdr)}
          valueClassName={REVENUE_VALUE_CLASS}
          helper="Per confirmed order"
          helperClassName="sm:min-h-10"
          tone="default"
        />
      </OverviewStatGrid>

      {/* Revenue trend */}
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-ios sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold leading-6 text-foreground">{compareMode === 'income_expense' ? 'Revenue trend' : trendMetric === 'revenue' ? 'Revenue trend' : 'Expense trend'}</h2>
            <p className="text-sm text-muted-foreground">{trendLabel}</p>
          </div>
          <ChipRow activeKey={trendPeriod} className="w-full sm:mx-0 sm:w-auto sm:px-0">
            {([7, 14, 30] as const).map((option) => {
              const isActive = trendPeriod === option
              return (
                <FilterChip key={option} active={isActive} data-active={isActive} onClick={() => onTrendPeriodChange(option)} className="shrink-0">
                  {option}d
                </FilterChip>
              )
            })}
            <Popover open={isCustomPopoverOpen} onOpenChange={setIsCustomPopoverOpen}>
              <PopoverTrigger asChild>
                <FilterChip
                  active={trendPeriod === 'custom'}
                  data-active={trendPeriod === 'custom'}
                  onClick={() => onTrendPeriodChange('custom')}
                  className="shrink-0 gap-1.5"
                >
                  <span>
                    {trendPeriod === 'custom' && customRange?.from ? (
                      <>
                        {format(customRange.from, 'dd MMM')}
                        {customRange.to && customRange.to.getTime() !== customRange.from.getTime()
                          ? ` - ${format(customRange.to, 'dd MMM')}`
                          : ''}
                      </>
                    ) : (
                      'Custom'
                    )}
                  </span>
                  <CalendarIcon className="size-4 opacity-60" />
                </FilterChip>
              </PopoverTrigger>
              <PopoverContent className="w-[21rem] border border-border bg-surface-popover p-3" align="end">
                <div className="mb-2 grid grid-cols-2 gap-1.5">
                  {customRangePresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => commitCustomRange(preset.range)}
                      className={`rounded-xs px-2.5 py-2 text-left text-xs font-medium transition ${
                        draftRange?.from?.getTime() === preset.range.from?.getTime() &&
                        draftRange?.to?.getTime() === preset.range.to?.getTime()
                          ? 'bg-surface-selected text-primary-foreground ring-1 ring-primary/30'
                          : 'bg-muted text-foreground hover:bg-card'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={draftRange?.from}
                  selected={draftRange}
                  onSelect={(range) => {
                    setDraftRange(range)
                    if (range?.from && range.to) commitCustomRange(range)
                  }}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          </ChipRow>
        </div>

        <ChipRow activeKey={compareMode} className="mt-3">
          {COMPARE_MODE_OPTIONS.filter((option) => option.value !== 'branch_vs_branch' || canCompareBranches).map((option) => {
            const isActive = compareMode === option.value
            return (
              <FilterChip key={option.value} active={isActive} data-active={isActive} onClick={() => onCompareModeChange(option.value)} className="shrink-0">
                {option.label}
              </FilterChip>
            )
          })}
        </ChipRow>

        {compareMode !== 'income_expense' && (
          <div className="mt-3 inline-flex rounded-full bg-surface-track p-1" aria-label="Trend metric">
            {(['revenue','expense'] as TrendMetric[]).map((metric) => (
              <button key={metric} type="button" onClick={() => onTrendMetricChange(metric)} className={`h-9 rounded-full px-4 text-sm font-semibold ${trendMetric === metric ? metric === 'revenue' ? 'bg-success/15 text-success shadow-sm' : 'bg-destructive/10 text-destructive shadow-sm' : 'text-muted-foreground'}`}>
                {metric === 'revenue' ? 'Revenue' : 'Expense'}
              </button>
            ))}
          </div>
        )}

        {activeBranch !== 'All' && trendMetric === 'expense' && compareMode !== 'income_expense' && (
          <p className="mt-3 rounded-lg bg-info/8 px-3 py-2 text-xs text-muted-foreground ring-1 ring-info/15">
            Showing {activeBranch} branch expenses. Company-wide expenses are excluded from this branch view.
          </p>
        )}

        {compareMode !== 'single' && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
          {(() => {
            const firstLabel = compareMode === 'period_vs_period'
              ? `${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · selected period`
              : compareMode === 'income_expense'
                ? 'Revenue (confirmed)'
                : (compareBranchNames?.branchA ?? 'Branch A')
            const secondLabel = compareMode === 'period_vs_period'
              ? `${trendMetric === 'revenue' ? 'Revenue' : 'Expense'} · previous period`
              : compareMode === 'income_expense'
                ? 'Expense'
                : (compareBranchNames?.branchB ?? 'Branch B')
            const firstPeriod = comparePeriodLabel
            const secondPeriod = compareMode === 'period_vs_period' ? previousPeriodLabel : comparePeriodLabel
            const deltaPositive = compareTotals.difference > 0
            const deltaNegative = compareTotals.difference < 0
            const DeltaIcon = deltaPositive ? TrendingUp : deltaNegative ? TrendingDown : Minus
            const deltaTone = deltaPositive ? 'text-success' : deltaNegative ? 'text-destructive' : 'text-muted-foreground'
            const deltaTitle = compareMode === 'income_expense' ? 'Net result' : 'Difference'
            const percentText = compareTotals.percentChange === null
              ? 'No comparison baseline'
              : `${compareTotals.percentChange >= 0 ? '+' : ''}${compareTotals.percentChange.toFixed(1)}%`
            return (
              <>
                <button
                  type="button"
                  onClick={() => setDetailKey('compare_a')}
                  className={`group min-w-[16rem] cursor-pointer rounded-xl border bg-card p-3.5 text-left shadow-ios-sm transition hover:-translate-y-0.5 hover:shadow-ios focus-visible:outline-none focus-visible:ring-2 sm:min-w-0 lg:p-4 ${trendMetric === 'expense' && compareMode !== 'income_expense' ? 'border-destructive/25 hover:border-destructive/40 focus-visible:ring-destructive/30' : 'border-success/25 hover:border-success/40 focus-visible:ring-success/30'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{firstLabel}</p>
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${trendMetric === 'expense' && compareMode !== 'income_expense' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>A</span>
                  </div>
                  <p className="mt-2 text-xl font-semibold text-foreground">{formatIdr(compareTotals.seriesA)}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">{firstPeriod}</p>
                  {compareMode === 'period_vs_period' && periodComparison && (
                    <p className="mt-2 text-2xs font-medium text-foreground">{periodComparison.currentItemCount} {comparisonItemLabel}</p>
                  )}
                  <p className={`mt-2 inline-flex items-center gap-1 text-2xs font-semibold ${trendMetric === 'expense' && compareMode !== 'income_expense' ? 'text-destructive' : 'text-success'}`}>View sources <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" /></p>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailKey('compare_b')}
                  className={`group min-w-[16rem] cursor-pointer rounded-xl border bg-card p-3.5 text-left shadow-ios-sm transition hover:-translate-y-0.5 hover:shadow-ios focus-visible:outline-none focus-visible:ring-2 sm:min-w-0 lg:p-4 ${compareMode === 'income_expense' || trendMetric === 'expense' ? 'border-destructive/20 hover:border-destructive/35 focus-visible:ring-destructive/25' : 'border-success/20 hover:border-success/35 focus-visible:ring-success/25'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{secondLabel}</p>
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${compareMode === 'income_expense' || trendMetric === 'expense' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>B</span>
                  </div>
                  <p className="mt-2 text-xl font-semibold text-foreground">{formatIdr(compareTotals.seriesB)}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">{secondPeriod}</p>
                  {compareMode === 'period_vs_period' && periodComparison && (
                    <p className="mt-2 text-2xs font-medium text-foreground">{periodComparison.previousItemCount} {comparisonItemLabel}</p>
                  )}
                  <p className={`mt-2 inline-flex items-center gap-1 text-2xs font-semibold ${compareMode === 'income_expense' || trendMetric === 'expense' ? 'text-destructive' : 'text-success'}`}>View sources <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" /></p>
                </button>
                <button type="button" onClick={() => setDetailKey('compare_delta')} className="group min-w-[16rem] cursor-pointer rounded-xl border border-border/70 bg-card p-3.5 text-left shadow-ios-sm sm:min-w-0 lg:p-4 transition hover:-translate-y-0.5 hover:border-border hover:shadow-ios focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{deltaTitle}</p>
                    <DeltaIcon className={`size-4 ${deltaTone}`} />
                  </div>
                  <p className={`mt-2 text-xl font-semibold ${deltaTone}`}>
                    {compareTotals.difference >= 0 ? '+' : '−'}{formatIdr(Math.abs(compareTotals.difference))}
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${deltaTone}`}>
                    {compareMode === 'income_expense'
                      ? `${compareTotals.seriesA > 0 ? ((compareTotals.difference / compareTotals.seriesA) * 100).toFixed(1) : '0.0'}% margin`
                      : percentText}
                  </p>
                  <p className="mt-2 text-2xs text-muted-foreground">
                    {compareMode === 'income_expense' ? 'Revenue minus expense' : `${firstLabel} minus ${secondLabel}`}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1 text-2xs font-semibold text-foreground">View sources <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" /></p>
                </button>
              </>
            )
          })()}
        </div>
        )}

        {compareMode === 'branch_vs_branch' && trendMetric === 'expense' && (
          <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Company-wide expenses: <span className="font-semibold text-foreground">{formatIdr(companyWideExpenseIdr)}</span> · shown separately and not assigned to Pahoman or Kedamaian.
          </p>
        )}

        {compareTrend.length === 0 ? (
          <div className="mt-3 flex h-56 w-full items-center justify-center text-xs text-muted-foreground">
            {trendPeriod === 'custom'
              ? 'Pick a start and end date to see the comparison.'
              : compareMode === 'branch_vs_branch'
                ? `Need at least two branches with ${trendMetric === 'revenue' ? 'revenue' : 'expenses'} to compare.`
                : 'No data recorded in this period.'}
          </div>
        ) : (
          <div className="mt-3 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={compareTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="compareFillA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendMetric === 'expense' && compareMode !== 'income_expense' ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={trendMetric === 'expense' && compareMode !== 'income_expense' ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="compareFillB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={compareMode === 'income_expense' || trendMetric === 'expense' ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={compareMode === 'income_expense' || trendMetric === 'expense' ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} interval={trendDays > 14 ? 3 : 1} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}jt` : `${value / 1000}rb`} width={40} />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', fontSize: 12 }}
                  formatter={(value: number, name: string) => [
                    formatIdr(value),
                    name === 'seriesA'
                      ? compareMode === 'single' ? (trendMetric === 'revenue' ? 'Revenue (confirmed)' : 'Expense') : compareMode === 'period_vs_period' ? 'Selected period' : compareMode === 'income_expense' ? 'Revenue (confirmed)' : (compareBranchNames?.branchA ?? 'Branch A')
                      : compareMode === 'period_vs_period' ? 'Previous period' : compareMode === 'income_expense' ? 'Expense' : (compareBranchNames?.branchB ?? 'Branch B'),
                  ]}
                />
                <Area type="monotone" dataKey="seriesA" stroke={trendMetric === 'expense' && compareMode !== 'income_expense' ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} strokeWidth={2} fill="url(#compareFillA)" />
                {compareMode !== 'single' && (
                  <Area type="monotone" dataKey="seriesB" stroke={compareMode === 'income_expense' || trendMetric === 'expense' ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} strokeWidth={2} strokeOpacity={compareMode === 'income_expense' ? 1 : 0.58} strokeDasharray={compareMode === 'income_expense' ? undefined : '5 4'} fill="url(#compareFillB)" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="no-scrollbar mt-2 flex items-center gap-4 overflow-x-auto text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${trendMetric === 'expense' && compareMode !== 'income_expense' ? 'bg-destructive' : 'bg-success'}`} />{compareMode === 'single' ? (trendMetric === 'revenue' ? 'Revenue (confirmed)' : 'Expense') : compareMode === 'period_vs_period' ? 'Selected period' : compareMode === 'income_expense' ? 'Revenue (confirmed)' : (compareBranchNames?.branchA ?? 'Branch A')}</span>
          {compareMode !== 'single' && (
            <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${compareMode === 'income_expense' || trendMetric === 'expense' ? 'bg-destructive' : 'bg-success'} opacity-60`} />{compareMode === 'period_vs_period' ? 'Previous period' : compareMode === 'income_expense' ? 'Expense' : (compareBranchNames?.branchB ?? 'Branch B')}</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-card shadow-ios">
        <button
          type="button"
          onClick={() => setIsAnalysisOpen((open) => !open)}
          aria-expanded={isAnalysisOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
        >
          <div>
            <h2 className="text-sm font-semibold leading-5 text-foreground">Detailed analysis</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Branches, customers, payment method, and order sources
            </p>
          </div>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${isAnalysisOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isAnalysisOpen && (
          <div className="space-y-4 border-t border-border/70 p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Branch comparison */}
              <div className="rounded-lg border border-border/70 bg-card p-4 shadow-ios sm:p-5">
                <h2 className="text-2xs font-semibold text-muted-foreground">
                        Branch comparison
                </h2>
                <div className="mt-3 space-y-3">
                        {branchRevenue.length === 0 && (
                          <p className="text-xs text-muted-foreground">No revenue recorded yet.</p>
                        )}
                        {branchRevenue.map((entry) => (
                          <div key={entry.branch}>
                            <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-foreground">{entry.branch}</span>
                                    <span className="text-muted-foreground">
                                      {formatIdr(entry.totalIdr)} · {entry.orderCount} orders
                                    </span>
                            </div>
                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-primary"
                                      style={{ width: `${(entry.totalIdr / maxBranchRevenue) * 100}%` }}
                                    />
                            </div>
                          </div>
                        ))}
                </div>
              </div>

              {/* Top customers */}
              <div className="rounded-lg border border-border/70 bg-card p-4 shadow-ios sm:p-5">
                <h2 className="text-2xs font-semibold text-muted-foreground">
                        Top customers
                </h2>
                <div className="mt-3 space-y-2">
                        {topCustomers.length === 0 && (
                          <p className="text-xs text-muted-foreground">No customer revenue yet.</p>
                        )}
                        {topCustomers.map((entry, index) => (
                          <div
                            key={entry.customerName}
                            className="flex items-center justify-between rounded-xl bg-muted px-3 py-2"
                          >
                            <div className="flex items-center gap-2.5">
                                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary">
                                      {index + 1}
                                    </span>
                                    <div className="leading-tight">
                                      <p className="text-xs font-medium text-foreground">
                                        {entry.customerName}
                                      </p>
                                      <p className="text-2xs text-muted-foreground">
                                        {entry.orderCount} order{entry.orderCount === 1 ? '' : 's'}
                                      </p>
                                    </div>
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                                    {formatIdr(entry.totalIdr)}
                            </span>
                          </div>
                        ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Payment method breakdown */}
              <div className="rounded-lg border border-border/70 bg-card p-4 shadow-ios sm:p-5">
                <h2 className="text-2xs font-semibold text-muted-foreground">
                        Payment method
                </h2>
                <div className="mt-3 space-y-2.5">
                        {paymentBreakdown.map((entry) => (
                          <div key={entry.status}>
                            <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-foreground">
                                      {PAYMENT_STATUS_LABEL[entry.status] ?? entry.status}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {formatIdr(entry.totalIdr)} · {entry.count}
                                    </span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={`h-full rounded-full ${
                                        entry.status === 'cash'
                                          ? 'bg-success'
                                          : entry.status === 'transfer'
                                            ? 'bg-info'
                                            : entry.status === 'card'
                                              ? 'bg-warning'
                                              : 'bg-primary'
                                      }`}
                                      style={{ width: `${(entry.totalIdr / totalPaymentIdr) * 100}%` }}
                                    />
                            </div>
                          </div>
                        ))}
                </div>
              </div>

              {/* Source breakdown */}
              <div className="rounded-lg border border-border/70 bg-card p-4 shadow-ios sm:p-5">
                <h2 className="text-2xs font-semibold text-muted-foreground">
                        Revenue by source
                </h2>
                <div className="mt-3 space-y-2.5">
                        {sourceBreakdown.map((entry) => (
                          <div key={entry.source}>
                            <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-foreground">
                                      {SOURCE_LABEL[entry.source] ?? entry.source}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {formatIdr(entry.totalIdr)} · {entry.count}
                                    </span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-info"
                                      style={{ width: `${(entry.totalIdr / totalSourceIdr) * 100}%` }}
                                    />
                            </div>
                          </div>
                        ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </section>
  )
}

export default RevenueDashboard
