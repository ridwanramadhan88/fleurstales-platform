import type { Employee } from '../store/hrStoreTypes'

interface RuntimeConfig { apiUrl?: string }
const config = (globalThis as typeof globalThis & { __FLEURSTALES_CONFIG__?: RuntimeConfig }).__FLEURSTALES_CONFIG__ ?? {}
export const sharedApiUrl = config.apiUrl?.replace(/\/$/, '')
const TOKEN_KEY = 'fleurstales.session-token'

export const getSessionToken = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  return window.sessionStorage.getItem(TOKEN_KEY) || undefined
}
export const setSessionToken = (token?: string): void => {
  if (typeof window === 'undefined') return
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
  else window.sessionStorage.removeItem(TOKEN_KEY)
}
export const isSharedBackendConfigured = (): boolean => Boolean(sharedApiUrl)
export const authHeaders = (): HeadersInit => {
  const token = getSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const signInSharedBackend = async (username: string, pin: string): Promise<Employee | null> => {
  if (!sharedApiUrl) return null
  let response: Response
  try {
    response = await fetch(`${sharedApiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ username, pin }),
    })
  } catch {
    const isLocalBackend = /^https?:\/\/(localhost|127\.0\.0\.1)(?::|\/|$)/i.test(sharedApiUrl)
    throw new Error(isLocalBackend
      ? 'Local backend is not running. Start Fleurstales with npm run dev.'
      : 'Unable to reach the sign-in service.')
  }
  if (response.status === 401) return null
  if (!response.ok) throw new Error(`Sign-in service unavailable (${response.status}).`)
  const payload = await response.json() as { token:string; account:Employee }
  setSessionToken(payload.token)
  return payload.account
}

export const signOutSharedBackend = async (): Promise<void> => {
  if (sharedApiUrl && getSessionToken()) {
    try { await fetch(`${sharedApiUrl}/auth/logout`, { method:'POST', headers:authHeaders() }) } catch { /* local sign-out still proceeds */ }
  }
  setSessionToken(undefined)
}
