import { describe, expect, it, vi } from 'vitest'
import { SupabaseHttpError } from './shared/supabaseHttpClient'

vi.mock('./shared/bootstrap', () => ({ bootstrapSharedData: () => ({ enabled: false }) }))

const { isSessionExpiredError } = await import('./operationalSupabaseSync')

describe('isSessionExpiredError', () => {
  it('treats a missing session, a 401 and an expired token as an ended session', () => {
    expect(isSessionExpiredError(new SupabaseHttpError('SESSION_REQUIRED', 401, { code: 'SESSION_REQUIRED' }))).toBe(true)
    expect(isSessionExpiredError(new SupabaseHttpError('JWT expired', 401, { code: 'PGRST303' }))).toBe(true)
    expect(isSessionExpiredError(new SupabaseHttpError('AUTH_REQUIRED', 403, { code: '42501' }))).toBe(true)
  })

  it('keeps network, conflict and validation failures as ordinary save failures', () => {
    expect(isSessionExpiredError(new SupabaseHttpError('Supabase request timed out.', 408, null))).toBe(false)
    expect(isSessionExpiredError(new SupabaseHttpError('REVISION_CONFLICT:hr:expected=1:actual=2', 409, { code: '40001' }))).toBe(false)
    expect(isSessionExpiredError(new TypeError('Failed to fetch'))).toBe(false)
  })
})
