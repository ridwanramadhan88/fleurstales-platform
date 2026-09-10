import { describe, expect, it } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import {
  countOrdersInSlot,
  getAvailableOrderSlots,
  isOrderSlotTooSoon,
  validateOrderSlot,
} from './orderScheduleAvailabilityDomain'

const order = (id: string, status: OrderTableRow['status'] = 'confirmed'): OrderTableRow => ({
  id,
  orderNumber: `KDM-${id}`,
  branch: 'Kedamaian',
  status,
  scheduleDate: '2026-09-10',
  scheduleTime: '11:45',
} as OrderTableRow)

describe('storefront order schedule availability', () => {
  it('uses a strict more-than-45-minute lead time', () => {
    expect(isOrderSlotTooSoon('2026-09-10', '11:45', new Date(2026, 8, 10, 10, 59))).toBe(false)
    expect(isOrderSlotTooSoon('2026-09-10', '11:45', new Date(2026, 8, 10, 11, 0))).toBe(true)
  })

  it('blocks the fourth active order in the same branch/date/time slot', () => {
    const orders = [order('1'), order('2', 'processing'), order('3', 'ready')]
    expect(countOrdersInSlot(orders, 'Kedamaian', '2026-09-10', '11:45')).toBe(3)
    expect(validateOrderSlot({
      date: '2026-09-10',
      time: '11:45',
      branchId: 'Kedamaian',
      orders,
      now: new Date(2026, 8, 10, 10, 0),
    })).toBe('full')
  })

  it('does not let terminal orders consume future capacity', () => {
    const orders = [order('1'), order('2'), order('3', 'cancelled'), order('4', 'delivered')]
    expect(countOrdersInSlot(orders, 'Kedamaian', '2026-09-10', '11:45')).toBe(2)
    expect(getAvailableOrderSlots({
      openingSlots: ['11:30', '11:45', '12:00'],
      date: '2026-09-10',
      branchId: 'Kedamaian',
      orders,
      now: new Date(2026, 8, 10, 10, 45),
    })).toEqual(['11:45', '12:00'])
  })
})
