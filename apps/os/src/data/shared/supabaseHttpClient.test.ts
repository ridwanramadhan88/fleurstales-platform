import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupabaseHttpClient, SupabaseHttpError } from './supabaseHttpClient'

const config = {
  url: 'https://example.supabase.co',
  publishableKey: 'publishable-test-key',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SupabaseHttpClient authentication boundary', () => {
  it('does not send authenticated staff requests when the JWT bridge is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config, { getAccessToken: () => null })

    await expect(client.rpc('get_operational_domain_state', { p_domain: 'finance' }))
      .rejects.toEqual(expect.objectContaining({
        name: 'SupabaseHttpError',
        message: 'SESSION_REQUIRED',
        status: 401,
        payload: { code: 'SESSION_REQUIRED' },
      } satisfies Partial<SupabaseHttpError>))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps anonymous requests available for clients without an auth token provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('null', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config)

    await client.rpc('public_ping', {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('apikey')).toBe(config.publishableKey)
    expect(headers.has('Authorization')).toBe(false)
  })
})
