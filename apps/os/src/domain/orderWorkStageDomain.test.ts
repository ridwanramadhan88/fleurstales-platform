import { describe, expect, it } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import {
  PRODUCTION_LEAD_MINUTES,
  getOrderPriority,
  getOrderWorkStage,
  orderHasNote,
  prioritizeOrders,
} from './orderWorkStageDomain'

// "Now" in the Jakarta wall clock, built the same way getOrderDateTime builds schedule times.
const NOW = new Date(2026, 10, 8, 12, 0, 0, 0)

const order = (overrides: Partial<OrderTableRow>): OrderTableRow => ({
  orderNumber: overrides.orderNumber ?? 'KDM-1',
  status: 'confirmed',
  paymentStatus: 'unpaid',
  paidAmountIdr: 0,
  totalIdr: 100_000,
  scheduleDate: '2026-11-08',
  scheduleTime: '15:00',
  ...overrides,
}) as OrderTableRow

describe('getOrderWorkStage', () => {
  it('maps every status to the Admin work stage', () => {
    expect(getOrderWorkStage(order({ status: 'pending_verification' }))).toBe('confirm')
    expect(getOrderWorkStage(order({ status: 'confirmed', paymentStatus: 'unpaid' }))).toBe('payment')
    expect(getOrderWorkStage(order({ status: 'confirmed', paymentStatus: 'partial', paidAmountIdr: 50_000 }))).toBe('payment')
    expect(getOrderWorkStage(order({ status: 'confirmed', paymentStatus: 'paid', paidAmountIdr: 100_000 }))).toBe('assign')
    expect(getOrderWorkStage(order({ status: 'processing' }))).toBe('arranging')
    expect(getOrderWorkStage(order({ status: 'processing', finishPhotoUrl: 'orders/x.jpg' }))).toBe('photo_in')
    expect(getOrderWorkStage(order({ status: 'ready' }))).toBe('handover')
    expect(getOrderWorkStage(order({ status: 'delivering' }))).toBe('delivering')
    expect(getOrderWorkStage(order({ status: 'delivered' }))).toBe('done')
    expect(getOrderWorkStage(order({ status: 'picked_up' }))).toBe('done')
    expect(getOrderWorkStage(order({ status: 'cancelled' }))).toBe('cancelled')
  })

  it('an active order being refunded waits on Finance; a refunded active order counts as cancelled', () => {
    expect(getOrderWorkStage(order({ status: 'processing', paymentStatus: 'refund_pending' }))).toBe('refunding')
    expect(getOrderPriority(order({ status: 'confirmed', paymentStatus: 'refund_pending' }), NOW).needsAdmin).toBe(false)
    expect(getOrderWorkStage(order({ status: 'confirmed', paymentStatus: 'refunded', paidAmountIdr: 0 }))).toBe('cancelled')
    // Finished orders keep their stage after an after-sale refund.
    expect(getOrderWorkStage(order({ status: 'delivered', paymentStatus: 'refunded' }))).toBe('done')
  })

  it('treats a paid status with a short amount as not paid', () => {
    expect(getOrderWorkStage(order({ status: 'confirmed', paymentStatus: 'paid', paidAmountIdr: 90_000 }))).toBe('payment')
  })
})

describe('getOrderPriority', () => {
  it('moves the deadline earlier by the production lead for orders not yet made', () => {
    const p = getOrderPriority(order({ status: 'pending_verification', scheduleTime: '14:00' }), NOW)
    expect(PRODUCTION_LEAD_MINUTES).toBe(90)
    expect(p.minutesLeft).toBe(30)
    expect(p.timeBucket).toBe('within60')
    expect(p.score).toBe(800 + 220)
    expect(p.urgent).toBe(true)
  })

  it('uses the scheduled time itself once the order is made', () => {
    const p = getOrderPriority(order({ status: 'ready', scheduleTime: '14:00' }), NOW)
    expect(p.minutesLeft).toBe(120)
    expect(p.timeBucket).toBe('within120')
    expect(p.score).toBe(600 + 250)
  })

  it('buckets late, later today, tomorrow and later', () => {
    expect(getOrderPriority(order({ status: 'ready', scheduleTime: '11:30' }), NOW).timeBucket).toBe('late')
    expect(getOrderPriority(order({ status: 'ready', scheduleTime: '11:30' }), NOW).score).toBe(1000 + 250)
    expect(getOrderPriority(order({ status: 'ready', scheduleTime: '17:00' }), NOW).timeBucket).toBe('today')
    expect(getOrderPriority(order({ status: 'ready', scheduleTime: '17:00' }), NOW).urgent).toBe(false)
    expect(getOrderPriority(order({ status: 'ready', scheduleDate: '2026-11-09', scheduleTime: '10:00' }), NOW).timeBucket).toBe('tomorrow')
    expect(getOrderPriority(order({ status: 'ready', scheduleDate: '2026-12-13', scheduleTime: '08:00' }), NOW).timeBucket).toBe('later')
  })

  it('a tomorrow-morning order needing production can already be late tonight', () => {
    // Pickup tomorrow 01:00, production lead 90 min → deadline today 23:30.
    const p = getOrderPriority(order({ status: 'confirmed', scheduleDate: '2026-11-09', scheduleTime: '01:00' }), NOW)
    expect(p.timeBucket).toBe('tomorrow')
    expect(p.minutesLeft).toBe(11 * 60 + 30)
  })

  it('exact boundaries: 60 and 120 minutes are still in the tighter bucket', () => {
    expect(getOrderPriority(order({ status: 'ready', scheduleTime: '13:00' }), NOW).timeBucket).toBe('within60')
    expect(getOrderPriority(order({ status: 'ready', scheduleTime: '13:01' }), NOW).timeBucket).toBe('within120')
    expect(getOrderPriority(order({ status: 'ready', scheduleTime: '14:01' }), NOW).timeBucket).toBe('today')
  })

  it('orders without a schedule get stage points only and sort last among equals', () => {
    const p = getOrderPriority(order({ status: 'ready', scheduleDate: undefined, scheduleTime: undefined, scheduleLabel: undefined }), NOW)
    expect(p.timeBucket).toBe('unscheduled')
    expect(p.score).toBe(250)
  })
})

describe('prioritizeOrders', () => {
  it('ranks the design example the same way (8 Nov 12.00)', () => {
    const list = [
      order({ orderNumber: 'Ayu', status: 'pending_verification', scheduleTime: '14:00' }),
      order({ orderNumber: 'Dimas', status: 'pending_verification', scheduleTime: '16:00' }),
      order({ orderNumber: 'Hendra', status: 'ready', scheduleTime: '13:00' }),
      order({ orderNumber: 'Rina', status: 'processing', finishPhotoUrl: 'x.jpg', scheduleTime: '13:30' }),
      order({ orderNumber: 'Siti', status: 'confirmed', paymentStatus: 'paid', paidAmountIdr: 100_000, scheduleTime: '15:00' }),
      order({ orderNumber: 'Maya', status: 'ready', scheduleTime: '17:00' }),
      order({ orderNumber: 'Bima', status: 'confirmed', scheduleDate: '2026-11-09', scheduleTime: '10:00' }),
      order({ orderNumber: 'Sari', status: 'confirmed', scheduleDate: '2026-12-13', scheduleTime: '08:00' }),
    ]
    expect(prioritizeOrders(list, NOW).map((item) => item.order.orderNumber)).toEqual([
      'Hendra', 'Ayu', 'Siti', 'Rina', 'Maya', 'Dimas', 'Bima', 'Sari',
    ])
  })

  it('breaks ties by the earliest deadline', () => {
    const list = [
      order({ orderNumber: 'later', status: 'ready', scheduleTime: '16:00' }),
      order({ orderNumber: 'sooner', status: 'ready', scheduleTime: '15:00' }),
    ]
    expect(prioritizeOrders(list, NOW).map((item) => item.order.orderNumber)).toEqual(['sooner', 'later'])
  })
})

describe('orderHasNote', () => {
  it('detects notes and greeting cards, ignoring whitespace', () => {
    expect(orderHasNote({ orderNote: '  ' })).toBe(false)
    expect(orderHasNote({ orderNote: 'Tanpa baby breath' })).toBe(true)
    expect(orderHasNote({ greetingMessage: 'Selamat ulang tahun' })).toBe(true)
    expect(orderHasNote({ internalNote: 'legacy' })).toBe(true)
  })
})

describe('isOrderFinishedOn', () => {
  it('counts delivered and picked-up orders by their Jakarta completion day', async () => {
    const { isOrderFinishedOn } = await import('./orderWorkStageDomain')
    // 2026-11-08 18:30 UTC = 9 Nov 01:30 WIB.
    expect(isOrderFinishedOn({ status: 'picked_up', completedAt: '2026-11-08T18:30:00Z' }, '2026-11-09')).toBe(true)
    expect(isOrderFinishedOn({ status: 'picked_up', completedAt: '2026-11-08T18:30:00Z' }, '2026-11-08')).toBe(false)
    expect(isOrderFinishedOn({ status: 'cancelled', completedAt: '2026-11-08T03:00:00Z' }, '2026-11-08')).toBe(false)
    expect(isOrderFinishedOn({ status: 'delivered' }, '2026-11-08')).toBe(false)
  })
})
