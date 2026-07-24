import { describe, expect, it, vi } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import { countActiveFutureOrders } from './futureOrderBadgeDomain'

vi.mock('./orderTimingDomain', () => ({
  isFutureOrder: (order: OrderTableRow) => order.orderNumber.startsWith('FUTURE'),
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
