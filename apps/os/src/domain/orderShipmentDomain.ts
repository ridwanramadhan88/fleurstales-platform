/** Gojek tracking links must be https and short enough for the database. */
export const isValidTrackingUrl = (value: string): boolean => {
  const url = value.trim()
  if (!url || url.length > 500 || !/^https:\/\//i.test(url)) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** What the customer paid for delivery versus what it really cost. */
export const deliveryMargin = (chargedIdr: number, actualCostIdr: number | undefined): number | null =>
  typeof actualCostIdr === 'number' ? chargedIdr - actualCostIdr : null

export interface DeliveryMarginSummary {
  orderCount: number
  chargedIdr: number
  actualCostIdr: number
  differenceIdr: number
}

/**
 * Delivered Gojek orders of one month (YYYY-MM, by delivery date): what
 * customers were charged for delivery versus what Gojek really cost.
 */
export const summarizeDeliveryMargin = (
  orders: ReadonlyArray<{
    status?: string
    scheduleDate?: string
    deliveryFeeIdr?: number
    deliveryProvider?: 'gojek' | 'internal'
    deliveryActualCostIdr?: number
  }>,
  monthKey: string,
): DeliveryMarginSummary => {
  let orderCount = 0
  let chargedIdr = 0
  let actualCostIdr = 0
  for (const order of orders) {
    if (order.status !== 'delivered' || order.deliveryProvider !== 'gojek') continue
    if (typeof order.deliveryActualCostIdr !== 'number' || !order.scheduleDate?.startsWith(monthKey)) continue
    orderCount += 1
    chargedIdr += order.deliveryFeeIdr ?? 0
    actualCostIdr += order.deliveryActualCostIdr
  }
  return { orderCount, chargedIdr, actualCostIdr, differenceIdr: chargedIdr - actualCostIdr }
}
