/** Persistence transport. Uses the shared backend when configured and the browser locally otherwise. */
import { authHeaders, getSessionToken, sharedApiUrl } from './remoteSession'

const NAMESPACE = 'fleurstales'
const CHANNEL_NAME = `${NAMESPACE}.sync`
const namespacedKey = (key: string): string => `${NAMESPACE}.${key}`
let channel: BroadcastChannel | null = null
const getChannel = (): BroadcastChannel | null => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME)
  return channel
}
interface SyncMessage { key: string }
const revisions = new Map<string, number>()

const remoteRequest = async (key:string, init?:RequestInit) => {
  if (!sharedApiUrl) return undefined
  if (!getSessionToken()) return new Response(JSON.stringify({ value:null, revision:0 }), { status:200, headers:{ 'Content-Type':'application/json' } })
  return fetch(`${sharedApiUrl}/state/${encodeURIComponent(key)}`, {
    ...init,
    headers: { 'Content-Type':'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  })
}

export const getItem = async (key: string): Promise<string | null> => {
  const response = await remoteRequest(key)
  if (response) {
    if (response.status === 401) throw new Error('Your session expired. Sign in again.')
    if (!response.ok) throw new Error(`Shared data could not be loaded (${response.status}).`)
    const payload = await response.json() as { value:string|null; revision:number }
    revisions.set(key, payload.revision ?? 0)
    return payload.value
  }
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(namespacedKey(key)) } catch { return null }
}

export const setItem = async (key: string, value: string): Promise<void> => {
  const response = await remoteRequest(key, {
    method:'PUT',
    body:JSON.stringify({ value, expectedRevision:revisions.get(key) ?? 0 }),
  })
  if (response) {
    if (response.status === 409) throw new Error('Newer data exists. Reload before saving.')
    if (response.status === 401) throw new Error('Your session expired. Sign in again.')
    if (!response.ok) throw new Error(`Shared data could not be saved (${response.status}).`)
    const payload = await response.json() as { revision:number }
    revisions.set(key, payload.revision ?? 0)
    return
  }
  if (typeof window === 'undefined') return
  window.localStorage.setItem(namespacedKey(key), value)
  getChannel()?.postMessage({ key } satisfies SyncMessage)
}

export const removeItem = async (key: string): Promise<void> => {
  const response = await remoteRequest(key, { method:'DELETE' })
  if (response) {
    if (!response.ok) throw new Error(`Shared data could not be removed (${response.status}).`)
    revisions.delete(key)
    return
  }
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(namespacedKey(key))
  getChannel()?.postMessage({ key } satisfies SyncMessage)
}

export const subscribe = (key: string, onChange: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {}
  if (sharedApiUrl && getSessionToken()) {
    const token = getSessionToken()!
    const source = new EventSource(`${sharedApiUrl}/state/stream?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`)
    source.onmessage = (event) => {
      try { const payload = JSON.parse(event.data) as { type?:string; key?:string }; if (payload.type === 'resource.updated' && payload.key === key) onChange() } catch { /* ignore malformed event */ }
    }
    return () => source.close()
  }
  if (sharedApiUrl) return () => {}
  const bc = getChannel()
  const handleMessage = (event: MessageEvent<SyncMessage>) => { if (event.data?.key === key) onChange() }
  bc?.addEventListener('message', handleMessage)
  const handleStorage = (event: StorageEvent) => { if (event.key === namespacedKey(key)) onChange() }
  window.addEventListener('storage', handleStorage)
  return () => { bc?.removeEventListener('message', handleMessage); window.removeEventListener('storage', handleStorage) }
}
