import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  RPC_CIRCUIT_OPEN,
  SupabaseHttpClient,
  resetSupabaseRpcBreakers,
} from '../data/shared/supabaseHttpClient'

const config = { url: 'https://example.supabase.co', publishableKey: 'publishable-test-key' }
const conflictBody = () =>
  new Response(JSON.stringify({ message: 'CATALOG_CONFLICT: expected revision 183, current revision 491.' }), { status: 409 })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  resetSupabaseRpcBreakers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetSupabaseRpcBreakers()
})

describe('SupabaseHttpClient guarded Catalog entrypoints', () => {
  it('calls the guarded Catalog writers, never the retired names', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config, { getAccessToken: () => 'jwt' })

    await client.rpc('replace_catalog_snapshot', { p_base_revision: 1, p_occasions: [], p_products: [] })
    await client.rpc('replace_catalog_flower_recipes', { p_base_revision: 1, p_products: [] })
    await client.rpc('replace_product_images_metadata', { p_base_revision: 1, p_product_id: 'x', p_images: [] })

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://example.supabase.co/rest/v1/rpc/replace_catalog_snapshot_guarded',
      'https://example.supabase.co/rest/v1/rpc/replace_catalog_flower_recipes_guarded',
      'https://example.supabase.co/rest/v1/rpc/replace_product_images_metadata_guarded',
    ])
  })

  it('calls the guarded autosave writers, never the retired names', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config, { getAccessToken: () => 'jwt' })
    const writers = [
      'save_operational_domain_state',
      'save_finance_operational_state',
      'replace_public_store_snapshot',
      'save_authorization_config',
      'save_internal_settings_config',
      'save_customer_profile',
      'delete_customer_profile',
    ]

    for (const writer of writers) await client.rpc(writer, {})

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(
      writers.map((writer) => `https://example.supabase.co/rest/v1/rpc/${writer}_guarded`),
    )
  })
})

describe('SupabaseHttpClient RPC circuit breaker', () => {
  it('stops sending a repeatedly failing RPC and sends nothing while the breaker is open', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => conflictBody())
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config, { getAccessToken: () => 'jwt' })
    const call = () => client.rpc('replace_catalog_snapshot', { p_base_revision: 183, p_occasions: [], p_products: [] })

    for (let attempt = 0; attempt < 3; attempt += 1) await expect(call()).rejects.toMatchObject({ status: 409 })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // A stuck loop hammering the same call must now fail locally with no network traffic.
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      await expect(call()).rejects.toMatchObject({ status: 429, payload: expect.objectContaining({ code: RPC_CIRCUIT_OPEN }) })
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reopens after the cooldown, doubles the cooldown on a repeat, and closes on success', async () => {
    let healthy = false
    const fetchMock = vi.fn().mockImplementation(async () => (healthy ? new Response('{}', { status: 200 }) : conflictBody()))
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config, { getAccessToken: () => 'jwt' })
    const call = () => client.rpc('replace_catalog_snapshot', { p_base_revision: 183, p_occasions: [], p_products: [] })

    for (let attempt = 0; attempt < 3; attempt += 1) await expect(call()).rejects.toBeDefined()
    vi.advanceTimersByTime(29_000)
    await expect(call()).rejects.toMatchObject({ status: 429 })

    vi.advanceTimersByTime(2_000) // 31s: first 30s cooldown is over
    for (let attempt = 0; attempt < 3; attempt += 1) await expect(call()).rejects.toMatchObject({ status: 409 })
    vi.advanceTimersByTime(31_000) // second cooldown is 60s, so still blocked
    await expect(call()).rejects.toMatchObject({ status: 429 })

    vi.advanceTimersByTime(30_000)
    healthy = true
    await expect(call()).resolves.toEqual({})
    healthy = false
    await expect(call()).rejects.toMatchObject({ status: 409 }) // success reset the breaker to a clean slate
  })

  it('does not count the local SESSION_REQUIRED gap as a server failure', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config, { getAccessToken: () => null })
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(client.rpc('replace_catalog_snapshot', {})).rejects.toMatchObject({ message: 'SESSION_REQUIRED' })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('catalogBridge conflict lock contract', () => {
  const bridge = readFileSync(resolve(__dirname, '../data/shared/catalogBridge.ts'), 'utf8')

  it('blocks every save path while the Catalog revision is stale', () => {
    expect(bridge).toContain('let conflictLocked = false')
    expect(bridge).toContain('remoteRevision === undefined || conflictLocked')
    expect(bridge).toContain('if (conflictLocked) {')
    expect(bridge).toContain('if (conflict) conflictLocked = true')
    expect(bridge).toContain('if (conflictLocked || getCatalogBridgeStatus().phase')
  })

  it('releases the lock only after the latest Catalog is loaded or the bridge stops', () => {
    const releases = bridge.match(/conflictLocked = false/g) ?? []
    expect(releases.length).toBe(3) // declaration, successful remote load, stopBusinessOsCatalogBridge
    expect(bridge).toContain('resetSupabaseRpcBreakers()')
  })
})
