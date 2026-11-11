import { useEffect, useMemo, useState } from 'react'
import { getOrderAlerts } from '../../domain/alertsDomain'
import { getTodaySummary } from '../../domain/revenueDomain'
import { fetchInventoryOverview } from '../../data/inventorySupabase'
import { summarizeInventory } from '../../domain/inventoryDomain'
import { useOrdersStore } from '../../store/ordersStore'
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
  revenueTone: 'success' | 'danger' | 'default'
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
  const inventoryEnabled = useSettingsStore((state) => state.storeProfile.inventoryEnabled)
  const [lowStockTotal, setLowStockTotal] = useState(0)

  useEffect(() => {
    if (!inventoryEnabled) return
    let cancelled = false
    void fetchInventoryOverview().then((overview) => {
      if (cancelled) return
      const summary = summarizeInventory(overview.items)
      setLowStockTotal(summary.low + summary.out)
    }).catch(() => { if (!cancelled) setLowStockTotal(0) })
    return () => { cancelled = true }
  }, [inventoryEnabled])

  const todaySummary = useMemo(() => getTodaySummary(orders), [orders])
  const orderAlerts = useMemo(() => getOrderAlerts(orders), [orders])
  const lowStockCount = lowStockTotal

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
    // No comparison is not good news: keep it neutral grey.
    revenueTone:
      revenueGrowthPercent === null
        ? 'default'
        : revenueGrowthPercent >= 0 ? 'success' : 'danger',
    atRiskCount: String(atRiskCount),
    atRiskHelper: atRiskCount > 0 ? 'Needs attention' : 'All on track',
    atRiskTone: atRiskCount > 0 ? 'danger' : 'success',
    lowStockCount: String(lowStockCount),
    lowStockHelper: lowStockCount > 0 ? 'Review inventory' : 'Stock healthy',
    lowStockTone: lowStockCount > 0 ? 'danger' : 'success',
    inventoryEnabled,
  }
}
