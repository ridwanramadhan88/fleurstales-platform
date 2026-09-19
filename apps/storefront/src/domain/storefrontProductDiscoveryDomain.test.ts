import { describe, expect, it } from 'vitest'
import {
  STOREFRONT_INITIAL_PRODUCT_BATCH_SIZE,
  getNextStorefrontVisibleCount,
  clampStorefrontVisibleCount,
} from './storefrontProductDiscoveryDomain'

describe('storefront product discovery batching', () => {
  it('starts with the release batch size and never exceeds the total', () => {
    expect(clampStorefrontVisibleCount(STOREFRONT_INITIAL_PRODUCT_BATCH_SIZE, 100)).toBe(24)
    expect(clampStorefrontVisibleCount(72, 50)).toBe(50)
    expect(clampStorefrontVisibleCount(24, 0)).toBe(0)
  })

  it('reveals the next batch without resetting already-visible products', () => {
    expect(getNextStorefrontVisibleCount(24, 100)).toBe(48)
    expect(getNextStorefrontVisibleCount(48, 60)).toBe(60)
  })
})
