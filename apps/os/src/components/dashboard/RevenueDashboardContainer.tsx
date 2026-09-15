import { useMemo, type FC } from 'react'
import { resolveCashRange } from '../../domain/cashRevenueDomain'
import { useFinanceStore } from '../../store/financeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { RevenueDashboard, type RevenueDashboardProps } from './RevenueDashboard'
import { useRevenueDashboardController } from './RevenueDashboardController'
import {
  buildRevenueDashboardCsv,
  downloadRevenueDashboardCsv,
  getEstimatedUnconfirmedOrders,
} from './revenueDashboardExport'

export const RevenueDashboardContainer: FC<RevenueDashboardProps> = (props) => {
  const viewModel = useRevenueDashboardController(props)
  const allOrders = useOrdersStore((state) => state.orders)
  const financeTransactions = useFinanceStore((state) => state.transactions)
  const branchScope = props.activeBranch === 'All' ? 'all' : props.activeBranch

  const activeRange = useMemo(() => {
    if (viewModel.trendPeriod === 'custom') {
      if (!viewModel.customRange?.from || !viewModel.customRange.to) return null
      return resolveCashRange({
        startDate: viewModel.customRange.from,
        endDate: viewModel.customRange.to,
      })
    }
    return resolveCashRange({ days: viewModel.trendPeriod })
  }, [viewModel.customRange, viewModel.trendPeriod])

  const estimatedOrders = useMemo(
    () => getEstimatedUnconfirmedOrders({
      orders: allOrders,
      transactions: financeTransactions,
      branch: branchScope,
      range: activeRange,
    }),
    [activeRange, allOrders, branchScope, financeTransactions],
  )

  const estimatedUnconfirmedIdr = estimatedOrders.reduce((sum, order) => sum + order.totalIdr, 0)
  const estimatedRevenueIdr = viewModel.summary.totalRevenueIdr + estimatedUnconfirmedIdr
  const pendingOrderNumbers = new Set(estimatedOrders.map((order) => order.orderNumber))
  const drilldowns = {
    ...viewModel.drilldowns,
    estimated: {
      ...viewModel.drilldowns.estimated,
      items: viewModel.drilldowns.estimated.items.filter(
        (item) => item.status !== 'pending' || Boolean(item.orderNumber && pendingOrderNumbers.has(item.orderNumber)),
      ),
    },
  }

  const onExport = () => {
    const csv = buildRevenueDashboardCsv({
      scope: branchScope === 'all' ? 'All branches' : branchScope,
      period: viewModel.comparePeriodLabel,
      confirmedRevenueIdr: viewModel.summary.totalRevenueIdr,
      estimatedRevenueIdr,
      expenseIdr: viewModel.expenseTransactions.reduce((sum, item) => sum + item.amount, 0),
      revenueTransactions: viewModel.revenueTransactions,
      expenseTransactions: viewModel.expenseTransactions,
      estimatedOrders,
    })
    const scopeLabel = branchScope === 'all' ? 'all-branches' : branchScope.toLowerCase()
    downloadRevenueDashboardCsv(`fleurstales-revenue-dashboard-${scopeLabel}.csv`, csv)
  }

  return (
    <RevenueDashboard
      {...viewModel}
      estimatedRevenueIdr={estimatedRevenueIdr}
      estimatedUnconfirmedIdr={estimatedUnconfirmedIdr}
      drilldowns={drilldowns}
      onExport={onExport}
    />
  )
}
