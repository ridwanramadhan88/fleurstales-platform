/**
 * Staff sessions are capped at 12 hours server-side (pg_cron removes older
 * auth sessions). The browser only learns about this when a token refresh
 * fails, so we remember when each session was first seen and warn before it ends.
 */
const ORIGIN_KEY = 'fleurstales.session-origin'

export const SESSION_MAX_MS = 12 * 60 * 60 * 1000
export const SESSION_WARNING_MS = 30 * 60 * 1000

interface SessionOrigin { sessionId: string; startedAt: number }

export const readSessionIdFromToken = (accessToken: string): string | null => {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const parsed = JSON.parse(atob(padded)) as { session_id?: unknown }
    return typeof parsed.session_id === 'string' ? parsed.session_id : null
  } catch {
    return null
  }
}

export const recordSessionOrigin = (accessToken: string, now = Date.now()): void => {
  if (typeof window === 'undefined') return
  const sessionId = readSessionIdFromToken(accessToken)
  if (!sessionId) return
  try {
    const raw = window.localStorage.getItem(ORIGIN_KEY)
    const existing = raw ? JSON.parse(raw) as Partial<SessionOrigin> : null
    if (existing?.sessionId === sessionId && typeof existing.startedAt === 'number') return
    window.localStorage.setItem(ORIGIN_KEY, JSON.stringify({ sessionId, startedAt: now } satisfies SessionOrigin))
  } catch { /* best-effort */ }
}

export const clearSessionOrigin = (): void => {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(ORIGIN_KEY) } catch { /* best-effort */ }
}

/** Milliseconds left in the 12-hour window, or null when unknown. */
export const getSessionRemainingMs = (now = Date.now()): number | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ORIGIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionOrigin>
    if (typeof parsed.startedAt !== 'number') return null
    return parsed.startedAt + SESSION_MAX_MS - now
  } catch {
    return null
  }
}
