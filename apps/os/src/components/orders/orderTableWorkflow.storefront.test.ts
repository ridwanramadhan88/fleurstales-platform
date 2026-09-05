import { describe, expect, it } from 'vitest'
import { getNextStatus } from './orderTableWorkflow'

describe('storefront order confirmation routing', () => {
  it('does not expose a generic quick-advance for an unconfirmed storefront order', () => {
    expect(getNextStatus({
      source: 'customer_app',
      status: 'pending_verification',
      fulfillment: 'delivery',
      scheduleDate: '2026-09-06',
      scheduleLabel: 'Tomorrow',
    })).toBeNull()
  })
})
