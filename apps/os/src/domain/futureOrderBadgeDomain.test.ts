import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import { countActiveFutureOrders, getActiveFutureOrderDates } from './futureOrderBadgeDomain'
import { filterOrdersByScope } from '../components/orders/orderTableFilters'

// 10 Sep 2026, 10:00 in Asia/Jakarta (03:00 UTC).
const FIXED_NOW = new Date('2026-09-10T03:00:00.000Z')

const order = (
  orderNumber: string,
  status: OrderTableRow['status'],
  scheduleDate: string,
  scheduleTime: string,
) => ({ orderNumber, status, scheduleDate, scheduleTime }) as OrderTableRow

const laterToday = order('TODAY-LATER', 'confirmed', '2026-09-10', '14:00')
const earlierToday = order('TODAY-EARLIER', 'ready', '2026-09-10', '09:00')
const tomorrow = order('TOMORROW', 'processing', '2026-09-11', '09:00')

describe('upcoming (Mendatang) orders', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('starts tomorrow: an order later today is not upcoming, one tomorrow is', () => {
    expect(countActiveFutureOrders([laterToday, earlierToday, tomorrow])).toBe(1)
    expect(getActiveFutureOrderDates([laterToday, earlierToday, tomorrow])).toEqual(['2026-09-11'])
  })

  it('keeps the Mendatang list in step with the badge', () => {
    const upcoming = filterOrdersByScope('future', [laterToday, earlierToday, tomorrow])
    expect(upcoming.map((item) => item.orderNumber)).toEqual(['TOMORROW'])
    const today = filterOrdersByScope('today', [laterToday, earlierToday, tomorrow])
    expect(today.map((item) => item.orderNumber)).toEqual(['TODAY-LATER', 'TODAY-EARLIER'])
  })

  it.each(['delivered', 'picked_up', 'cancelled', 'failed'] as const)(
    'excludes %s orders from the badge',
    (status) => expect(countActiveFutureOrders([order('DONE', status, '2026-09-11', '09:00')])).toBe(0),
  )
})
