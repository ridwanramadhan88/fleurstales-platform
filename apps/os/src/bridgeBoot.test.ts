import { describe, expect, it } from 'vitest'
import { getCatalogBridgeStatus, initializeBusinessOsCatalogBridge, subscribeCatalogBridgeStatus } from './data/shared/catalogBridge'
import { getStoreBridgeStatus, initializeBusinessOsStoreBridge, subscribeStoreBridgeStatus } from './data/shared/storeBridge'

describe('Business OS bridge boot', () => {
  it('skips the pre-sign-in remote load when asked to', async () => {
    const catalogBefore = getCatalogBridgeStatus().phase
    const storeBefore = getStoreBridgeStatus().phase
    await initializeBusinessOsCatalogBridge({ skipInitialRefresh: true })
    await initializeBusinessOsStoreBridge({ skipInitialRefresh: true })
    expect(getCatalogBridgeStatus().phase).toBe(catalogBefore)
    expect(getStoreBridgeStatus().phase).toBe(storeBefore)
  })

  it('does not refresh on window focus before anything loaded since sign-in', async () => {
    // While a session is restored the role is still the demo `admin`
    // default; a focus refresh would run admin-only queries for HR or Florist.
    await initializeBusinessOsCatalogBridge({ skipInitialRefresh: true })
    await initializeBusinessOsStoreBridge({ skipInitialRefresh: true })
    let refreshes = 0
    const stopCatalog = subscribeCatalogBridgeStatus(() => { refreshes += 1 })
    const stopStore = subscribeStoreBridgeStatus(() => { refreshes += 1 })
    window.dispatchEvent(new Event('focus'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    stopCatalog(); stopStore()
    expect(refreshes).toBe(0)
  })

  it('still loads immediately by default (local demo mode)', async () => {
    await initializeBusinessOsCatalogBridge()
    expect(getCatalogBridgeStatus().phase).toBe('local_fallback')
    await initializeBusinessOsStoreBridge()
    expect(getStoreBridgeStatus().phase).toBe('local_fallback')
  })
})
