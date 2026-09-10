import { describe, expect, it, vi } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import { countActiveFutureOrders } from './futureOrderBadgeDomain'

const FIXED_NOW = new Date(2026, 8, 10, 10, 0, 0, 0)

vi.mock('./orderTimingDomain', () => ({
  nowInJakarta: () => FIXED_NOW,
  getOrderDateTime: (order: OrderTableRow) => {
    if (!order.orderNumber.startsWith('FUTURE')) return new Date(2026, 8, 10, 9, 0, 0, 0)
    return new Date(2026, 8, 10, 11, 0, 0, 0)
  },
}))

const order = (orderNumber: string, status: OrderTableRow['status']) =>
  ({ orderNumber, status }) as OrderTableRow

describe('future order badge', () => {
  it('counts active future orders only', () => {
    expect(countActiveFutureOrders([
      order('FUTURE-1', 'confirmed'),
      order('FUTURE-2', 'processing'),
      order('TODAY-1', 'ready'),
    ])).toBe(2)
  })

  it.each(['delivered', 'picked_up', 'cancelled', 'failed'] as const)(
    'excludes %s future orders',
    (status) => expect(countActiveFutureOrders([order('FUTURE-1', status)])).toBe(0),
  )
})
