import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupabaseHttpClient, SupabaseHttpError } from '../data/shared/supabaseHttpClient'

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

  it('forwards the current staff JWT when an authenticated session is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('null', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new SupabaseHttpClient(config, { getAccessToken: () => 'staff-jwt' })

    await client.rpc('get_operational_domain_state', { p_domain: 'finance' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer staff-jwt')
  })

  it('reads the token provider again for every request so refreshed JWTs are used', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('null', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    let token = 'staff-jwt-1'
    const client = new SupabaseHttpClient(config, { getAccessToken: () => token })

    await client.rpc('first_staff_request', {})
    token = 'staff-jwt-2'
    await client.rpc('second_staff_request', {})

    const firstHeaders = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    const secondHeaders = new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers)
    expect(firstHeaders.get('Authorization')).toBe('Bearer staff-jwt-1')
    expect(secondHeaders.get('Authorization')).toBe('Bearer staff-jwt-2')
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
