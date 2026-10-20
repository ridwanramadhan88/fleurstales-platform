import { describe, expect, it } from 'vitest'
import { getCatalogBridgeStatus, initializeBusinessOsCatalogBridge } from './data/shared/catalogBridge'
import { getStoreBridgeStatus, initializeBusinessOsStoreBridge } from './data/shared/storeBridge'

describe('Business OS bridge boot', () => {
  it('skips the pre-sign-in remote load when asked to', async () => {
    const catalogBefore = getCatalogBridgeStatus().phase
    const storeBefore = getStoreBridgeStatus().phase
    await initializeBusinessOsCatalogBridge({ skipInitialRefresh: true })
    await initializeBusinessOsStoreBridge({ skipInitialRefresh: true })
    expect(getCatalogBridgeStatus().phase).toBe(catalogBefore)
    expect(getStoreBridgeStatus().phase).toBe(storeBefore)
  })

  it('still loads immediately by default (local demo mode)', async () => {
    await initializeBusinessOsCatalogBridge()
    expect(getCatalogBridgeStatus().phase).toBe('local_fallback')
    await initializeBusinessOsStoreBridge()
    expect(getStoreBridgeStatus().phase).toBe('local_fallback')
  })
})
