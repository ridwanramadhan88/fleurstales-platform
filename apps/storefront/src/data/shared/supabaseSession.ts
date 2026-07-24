import type { SupabaseAuthTokenProvider } from './supabaseHttpClient'

const ACCESS_TOKEN_KEY = 'fleurstales.supabase-access-token'
const SESSION_META_KEY = 'fleurstales.supabase-session-meta'

export interface SupabaseBrowserSession {
  accessToken: string
  /** Auth user UUID when known. The server remains authoritative. */
  userId?: string
  /** ISO timestamp. Refresh remains the future Auth adapter's responsibility. */
  expiresAt?: string
}

const listeners = new Set<(session: SupabaseBrowserSession | null) => void>()

const notify = (): void => {
  const session = getSupabaseBrowserSession()
  for (const listener of listeners) listener(session)
}

export const getSupabaseAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export const getSupabaseBrowserSession = (): SupabaseBrowserSession | null => {
  const accessToken = getSupabaseAccessToken()
  if (!accessToken) return null
  if (typeof window === 'undefined') return { accessToken }
  try {
    const raw = window.sessionStorage.getItem(SESSION_META_KEY)
    if (!raw) return { accessToken }
    const parsed = JSON.parse(raw) as { userId?: unknown; expiresAt?: unknown }
    return {
      accessToken,
      ...(typeof parsed.userId === 'string' ? { userId: parsed.userId } : {}),
      ...(typeof parsed.expiresAt === 'string' ? { expiresAt: parsed.expiresAt } : {}),
    }
  } catch {
    return { accessToken }
  }
}

/**
 * Narrow browser session bridge. Phase 9 intentionally does not implement
 * password login/refresh; a future Supabase Auth adapter owns that lifecycle.
 */
export const setSupabaseBrowserSession = (session?: SupabaseBrowserSession | null): void => {
  if (typeof window === 'undefined') return
  if (!session?.accessToken) {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    window.sessionStorage.removeItem(SESSION_META_KEY)
    notify()
    return
  }
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken)
  window.sessionStorage.setItem(SESSION_META_KEY, JSON.stringify({ userId: session.userId, expiresAt: session.expiresAt }))
  notify()
}

/** Backward-compatible token-only setter used by Phase 4-8 bridges. */
export const setSupabaseAccessToken = (accessToken?: string | null): void => {
  if (!accessToken) setSupabaseBrowserSession(null)
  else setSupabaseBrowserSession({ accessToken })
}

export const subscribeSupabaseBrowserSession = (
  listener: (session: SupabaseBrowserSession | null) => void,
): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const browserSupabaseTokenProvider: SupabaseAuthTokenProvider = {
  getAccessToken: getSupabaseAccessToken,
}
