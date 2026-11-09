import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGoogleMapsBrowserKey, resolvePlace, searchPlaces } from './googlePlaces'

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body })

describe('googlePlaces', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete (globalThis as { __FLEURSTALES_CONFIG__?: unknown }).__FLEURSTALES_CONFIG__ })

  it('reads the browser key from runtime config and is empty without it', () => {
    expect(getGoogleMapsBrowserKey()).toBe('')
    ;(globalThis as { __FLEURSTALES_CONFIG__?: unknown }).__FLEURSTALES_CONFIG__ = { googleMapsBrowserKey: ' key ' }
    expect(getGoogleMapsBrowserKey()).toBe('key')
  })

  it('does not call Google for short input or without a key', async () => {
    const fetchMock = respond({})
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchPlaces('ab', { key: 'k', sessionToken: 's' })).toEqual([])
    expect(await searchPlaces('Jalan Mawar', { key: '', sessionToken: 's' })).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps suggestions and biases around the branch', async () => {
    const fetchMock = respond({ suggestions: [
      { placePrediction: { placeId: 'p1', structuredFormat: { mainText: { text: 'Jl. Mawar' }, secondaryText: { text: 'Bandar Lampung' } } } },
      { placePrediction: {} },
    ] })
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchPlaces('Jalan Mawar', { key: 'k', sessionToken: 's', center: { latitude: -5.39, longitude: 105.26 } })
    expect(result).toEqual([{ placeId: 'p1', title: 'Jl. Mawar', subtitle: 'Bandar Lampung' }])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.includedRegionCodes).toEqual(['id'])
    expect(body.locationBias.circle.radius).toBe(50000)
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('k')
  })

  it('resolves a place to coordinates and rejects failures', async () => {
    vi.stubGlobal('fetch', respond({ location: { latitude: -5.4, longitude: 105.2 }, formattedAddress: 'Jl. Mawar 1' }))
    expect(await resolvePlace('p1', { key: 'k', sessionToken: 's' })).toEqual({ latitude: -5.4, longitude: 105.2, address: 'Jl. Mawar 1' })
    vi.stubGlobal('fetch', respond({}, false, 403))
    await expect(resolvePlace('p1', { key: 'k', sessionToken: 's' })).rejects.toThrow('PLACES_403')
  })
})
