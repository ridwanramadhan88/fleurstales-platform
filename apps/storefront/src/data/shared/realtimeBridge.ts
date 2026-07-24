import type { SharedRealtimeClient, SharedRealtimeDomain, SharedRealtimeEvent } from './realtimeContracts'

export interface SharedRealtimeRefreshBridgeOptions {
  domains: SharedRealtimeDomain | SharedRealtimeDomain[]
  refresh: (event: SharedRealtimeEvent) => void | Promise<void>
  debounceMs?: number
}

/**
 * Converts granular realtime changes into a safe domain refresh. Repositories
 * remain authoritative; realtime is only an invalidation signal.
 */
export const subscribeSharedRealtimeRefresh = (
  client: SharedRealtimeClient,
  options: SharedRealtimeRefreshBridgeOptions,
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let latestEvent: SharedRealtimeEvent | undefined
  const debounceMs = Math.max(0, options.debounceMs ?? 80)

  const unsubscribe = client.subscribe(options.domains, (event) => {
    latestEvent = event
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      const next = latestEvent
      latestEvent = undefined
      if (next) void options.refresh(next)
    }, debounceMs)
  })

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}
