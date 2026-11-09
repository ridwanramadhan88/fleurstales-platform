import { describe, expect, it } from 'vitest'
import { deliveryMargin, isValidTrackingUrl, summarizeDeliveryMargin } from './orderShipmentDomain'

describe('isValidTrackingUrl', () => {
  it('accepts https links only', () => {
    expect(isValidTrackingUrl('https://gojek.link/abc')).toBe(true)
    expect(isValidTrackingUrl('http://gojek.link/abc')).toBe(false)
    expect(isValidTrackingUrl('javascript:alert(1)')).toBe(false)
    expect(isValidTrackingUrl('')).toBe(false)
    expect(isValidTrackingUrl(`https://x.test/${'a'.repeat(500)}`)).toBe(false)
  })
})

describe('deliveryMargin', () => {
  it('is charged minus real cost, null when unknown', () => {
    expect(deliveryMargin(25000, 22000)).toBe(3000)
    expect(deliveryMargin(25000, 30000)).toBe(-5000)
    expect(deliveryMargin(25000, undefined)).toBeNull()
  })
})

describe('summarizeDeliveryMargin', () => {
  it('counts delivered Gojek orders of the month only', () => {
    const summary = summarizeDeliveryMargin([
      { status: 'delivered', scheduleDate: '2026-11-03', deliveryFeeIdr: 25000, deliveryProvider: 'gojek', deliveryActualCostIdr: 22000 },
      { status: 'delivered', scheduleDate: '2026-11-20', deliveryFeeIdr: 15000, deliveryProvider: 'gojek', deliveryActualCostIdr: 18000 },
      { status: 'delivered', scheduleDate: '2026-10-30', deliveryFeeIdr: 15000, deliveryProvider: 'gojek', deliveryActualCostIdr: 18000 },
      { status: 'delivered', scheduleDate: '2026-11-05', deliveryFeeIdr: 15000, deliveryProvider: 'internal' },
      { status: 'cancelled', scheduleDate: '2026-11-05', deliveryFeeIdr: 15000, deliveryProvider: 'gojek', deliveryActualCostIdr: 10000 },
    ], '2026-11')
    expect(summary).toEqual({ orderCount: 2, chargedIdr: 40000, actualCostIdr: 40000, differenceIdr: 0 })
  })
})
