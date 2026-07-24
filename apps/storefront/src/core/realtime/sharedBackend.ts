/** @deprecated Phase 9: legacy prototype order-only SSE transport.
 * Keep until the live Supabase adapter replaces it in the deployment stages.
 */
import type { OrderTableRow } from '../../types/orders'
import { useOrdersStore } from '../../store/ordersStore'

export type RealtimeState = 'local' | 'connecting' | 'live' | 'reconnecting' | 'offline'
export interface RealtimeSnapshot { state: RealtimeState; lastUpdatedAt?: string; message?: string }
type Listener = (snapshot: RealtimeSnapshot) => void
const listeners = new Set<Listener>()
let snapshot: RealtimeSnapshot = { state: 'local', message: 'Local demo data' }
const publish = (next: RealtimeSnapshot) => { snapshot = next; listeners.forEach((listener) => listener(next)) }
export const subscribeRealtimeState = (listener: Listener) => { listeners.add(listener); listener(snapshot); return () => { listeners.delete(listener) } }
export const getRealtimeState = () => snapshot

const runtimeConfig = (globalThis as typeof globalThis & { __FLEURSTALES_CONFIG__?: { apiUrl?: string; apiToken?: string } }).__FLEURSTALES_CONFIG__ ?? {}
const apiUrl = runtimeConfig.apiUrl?.replace(/\/$/, '')
const token = runtimeConfig.apiToken
const headers = (): HeadersInit => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) })

/** Connects this device to the shared, server-authoritative order stream.
 * Without VITE_FLEURSTALES_API_URL the app deliberately stays in local demo mode. */
export const connectSharedOrderBackend = ({ branch, onConflict }: { branch: string | 'All'; onConflict?: (message: string) => void }) => {
  if (!apiUrl) { publish({ state: 'local', message: 'Set VITE_FLEURSTALES_API_URL for cross-device live sync.' }); return () => undefined }
  let source: EventSource | null = null
  let stopped = false
  let applyingRemote = false
  let unsubscribeStore: (() => void) | undefined
  const knownRevisions = new Map<string, number>()
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const load = async () => {
    publish({ state: snapshot.state === 'live' ? 'reconnecting' : 'connecting' })
    try {
      const query = branch === 'All' ? '' : `?branch=${encodeURIComponent(branch)}`
      const response = await fetch(`${apiUrl}/orders${query}`, { headers: headers() })
      if (!response.ok) throw new Error(`Order sync failed (${response.status})`)
      const orders = await response.json() as OrderTableRow[]
      applyingRemote = true
      useOrdersStore.setState({ orders })
      orders.forEach((order) => knownRevisions.set(order.id ?? order.orderNumber, order.revision ?? 0))
      applyingRemote = false
      publish({ state: 'live', lastUpdatedAt: new Date().toISOString() })
    } catch (error) {
      publish({ state: 'offline', message: error instanceof Error ? error.message : 'Unable to reach shared backend.' })
      if (!stopped) retryTimer = setTimeout(load, 5000)
    }
  }
  const openStream = () => {
    const query = branch === 'All' ? '' : `?branch=${encodeURIComponent(branch)}`
    source = new EventSource(`${apiUrl}/orders/stream${query}${query ? '&' : '?'}token=${encodeURIComponent(token ?? '')}`)
    source.onopen = () => publish({ state: 'live', lastUpdatedAt: new Date().toISOString() })
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: 'snapshot' | 'upsert' | 'delete' | 'conflict'; orders?: OrderTableRow[]; order?: OrderTableRow; orderId?: string; message?: string }
        if (payload.type === 'snapshot' && payload.orders) { applyingRemote = true; useOrdersStore.setState({ orders: payload.orders }); payload.orders.forEach((order) => knownRevisions.set(order.id ?? order.orderNumber, order.revision ?? 0)); applyingRemote = false }
        if (payload.type === 'upsert' && payload.order) { applyingRemote = true; knownRevisions.set(payload.order.id ?? payload.order.orderNumber, payload.order.revision ?? 0); useOrdersStore.setState((state) => ({ orders: [...state.orders.filter((order) => (order.id ?? order.orderNumber) !== (payload.order!.id ?? payload.order!.orderNumber)), payload.order!] })); applyingRemote = false }
        if (payload.type === 'delete' && payload.orderId) useOrdersStore.setState((state) => ({ orders: state.orders.filter((order) => (order.id ?? order.orderNumber) !== payload.orderId) }))
        if (payload.type === 'conflict') onConflict?.(payload.message ?? 'This order was updated on another device.')
        publish({ state: 'live', lastUpdatedAt: new Date().toISOString() })
      } catch { /* malformed server event is ignored */ }
    }
    source.onerror = () => { source?.close(); publish({ state: 'reconnecting', message: 'Connection lost. Reconnecting…' }); if (!stopped) retryTimer = setTimeout(() => { load(); openStream() }, 5000) }
  }
  load(); openStream()
  unsubscribeStore = useOrdersStore.subscribe((state) => {
    if (applyingRemote || stopped) return
    for (const order of state.orders) {
      const id = order.id ?? order.orderNumber
      const localRevision = order.revision ?? 1
      const known = knownRevisions.get(id)
      if (known !== undefined && localRevision <= known) continue
      const expectedRevision = known ?? Math.max(0, localRevision - 1)
      fetch(`${apiUrl}/orders/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ expectedRevision, order }),
      }).then(async (response) => {
        if (response.status === 409) { onConflict?.('This order was updated by another user. The latest server version has been restored.'); await load(); return }
        if (!response.ok) throw new Error(`Order update failed (${response.status})`)
        const confirmed = await response.json() as OrderTableRow
        knownRevisions.set(id, confirmed.revision ?? localRevision)
      }).catch((error) => publish({ state: 'offline', message: error instanceof Error ? error.message : 'Unable to save order.' }))
    }
  })
  return () => { stopped = true; source?.close(); unsubscribeStore?.(); if (retryTimer) clearTimeout(retryTimer) }
}

/** Server command helper with optimistic revision enforcement. */
export const sendOrderCommand = async <T>(path: string, body: T & { expectedRevision: number }) => {
  if (!apiUrl) return { localOnly: true as const }
  const response = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  if (response.status === 409) return { conflict: true as const, message: 'This order was updated by another user. Review the latest version before continuing.' }
  if (!response.ok) throw new Error(`Command failed (${response.status})`)
  return { order: await response.json() as OrderTableRow }
}
