import { useMemo } from 'react'
import { getOrderAlerts } from '../../domain/alertsDomain'
import { getTodaySummary } from '../../domain/revenueDomain'
import { getLowStockItems } from '../../domain/stockDomain'
import { useOrdersStore } from '../../store/ordersStore'
import { useStockStore } from '../../store/stockStore'
import { formatIdrCurrency as formatIdr } from '../../lib/formatters'
import { useSettingsStore } from '../../store/settingsStore'

const formatSignedDelta = (value: number): string =>
  value > 0 ? `+${value}` : `${value}`

const formatSignedPercent = (value: number): string =>
  `${value > 0 ? '+' : ''}${Math.round(value)}%`

export interface OverviewCardsViewModel {
  ordersToday: string
  ordersHelper: string
  ordersTone: 'success' | 'danger'
  revenueToday: string
  revenueHelper: string
  revenueTone: 'success' | 'danger'
  atRiskCount: string
  atRiskHelper: string
  atRiskTone: 'success' | 'danger'
  lowStockCount: string
  lowStockHelper: string
  lowStockTone: 'success' | 'danger'
  inventoryEnabled: boolean
}

export const useOverviewCardsController = (): OverviewCardsViewModel => {
  const orders = useOrdersStore((state) => state.orders)
  const stockItems = useStockStore((state) => state.items)
  const inventoryEnabled = useSettingsStore((state) => state.storeProfile.inventoryEnabled)

  const todaySummary = useMemo(() => getTodaySummary(orders), [orders])
  const orderAlerts = useMemo(() => getOrderAlerts(orders), [orders])
  const lowStockCount = useMemo(
    () => getLowStockItems(stockItems).length,
    [stockItems],
  )

  const atRiskCount = orderAlerts.late.length + orderAlerts.dueSoon.length
  const revenueGrowthPercent = todaySummary.revenueGrowthPercent

  return {
    ordersToday: String(todaySummary.ordersToday),
    ordersHelper: `${formatSignedDelta(todaySummary.ordersDeltaVsYesterday)} vs yesterday`,
    ordersTone:
      todaySummary.ordersDeltaVsYesterday >= 0 ? 'success' : 'danger',
    revenueToday: formatIdr(todaySummary.revenueTodayIdr),
    revenueHelper:
      revenueGrowthPercent === null
        ? 'No data for yesterday'
        : formatSignedPercent(revenueGrowthPercent),
    revenueTone:
      revenueGrowthPercent === null || revenueGrowthPercent >= 0
        ? 'success'
        : 'danger',
    atRiskCount: String(atRiskCount),
    atRiskHelper: atRiskCount > 0 ? 'Needs attention' : 'All on track',
    atRiskTone: atRiskCount > 0 ? 'danger' : 'success',
    lowStockCount: String(lowStockCount),
    lowStockHelper: lowStockCount > 0 ? 'Review inventory' : 'Stock healthy',
    lowStockTone: lowStockCount > 0 ? 'danger' : 'success',
    inventoryEnabled,
  }
}
