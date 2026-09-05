import { describe, expect, it } from 'vitest'
import { buildOrderTrackingUrl, getStorefrontOrigin } from './orderCustomerConfirmation'

describe('customer storefront tracking links', () => {
  it('uses the canonical public Storefront origin', () => {
    expect(getStorefrontOrigin()).toBe('https://fleurstales-storefront.vercel.app')
    expect(getStorefrontOrigin()).not.toContain('-rid5.vercel.app')
  })

  it('builds customer-facing order links on the canonical production alias', () => {
    expect(buildOrderTrackingUrl('d2cf177c-3e6c-44d0-9d07-e28f161bd2f2')).toBe(
      'https://fleurstales-storefront.vercel.app/order/d2cf177c-3e6c-44d0-9d07-e28f161bd2f2',
    )
  })
})
