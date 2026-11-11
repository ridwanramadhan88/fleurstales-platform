import { afterEach, describe, expect, it } from 'vitest'
import { createGoogleMapPin } from './googleMapPin'

describe('createGoogleMapPin', () => {
  afterEach(() => { delete (globalThis as { __FLEURSTALES_CONFIG__?: unknown }).__FLEURSTALES_CONFIG__ })

  it('returns null without a browser key so the caller falls back to Leaflet', async () => {
    const element = document.createElement('div')
    const handle = await createGoogleMapPin(element, {
      start: { latitude: -5.39, longitude: 105.26 },
      zoom: 14,
      pin: null,
      onPick: () => {},
      onFailure: () => {},
    })
    expect(handle).toBeNull()
  })
})
