import { beforeEach, describe, expect, it } from 'vitest'
import { SESSION_MAX_MS, clearSessionOrigin, getSessionRemainingMs, readSessionIdFromToken, recordSessionOrigin } from './sessionLifetime'

const token = (claims: Record<string, unknown>) =>
  `h.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`

describe('sessionLifetime', () => {
  beforeEach(() => window.localStorage.clear())

  it('reads session_id from a JWT and ignores bad tokens', () => {
    expect(readSessionIdFromToken(token({ session_id: 'abc' }))).toBe('abc')
    expect(readSessionIdFromToken('nope')).toBeNull()
  })

  it('counts down from the first time a session is seen and keeps it across refreshes', () => {
    recordSessionOrigin(token({ session_id: 's1' }), 1_000)
    recordSessionOrigin(token({ session_id: 's1' }), 5_000_000)
    expect(getSessionRemainingMs(1_000 + 60_000)).toBe(SESSION_MAX_MS - 60_000)
  })

  it('restarts for a new session and clears on sign-out', () => {
    recordSessionOrigin(token({ session_id: 's1' }), 1_000)
    recordSessionOrigin(token({ session_id: 's2' }), 9_000)
    expect(getSessionRemainingMs(9_000)).toBe(SESSION_MAX_MS)
    clearSessionOrigin()
    expect(getSessionRemainingMs()).toBeNull()
  })
})
