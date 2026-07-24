import type {
  MutableSharedRealtimeClient,
  SharedRealtimeDomain,
  SharedRealtimeEvent,
  SharedRealtimeHandler,
} from './realtimeContracts'

const CHANNEL = 'fleurstales.shared-realtime.v1'
const randomId = (): string => `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const isEvent = (value: unknown): value is SharedRealtimeEvent => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<SharedRealtimeEvent>
  return typeof event.id === 'string'
    && typeof event.domain === 'string'
    && typeof event.operation === 'string'
    && typeof event.entity === 'string'
    && typeof event.occurredAt === 'string'
    && event.source === 'local'
}

export const createLocalSharedRealtimeClient = (): MutableSharedRealtimeClient => {
  const subscriptions = new Set<{ domains: Set<SharedRealtimeDomain>; handler: SharedRealtimeHandler }>()
  const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel(CHANNEL)
    : null

  const deliver = (event: SharedRealtimeEvent): void => {
    for (const subscription of subscriptions) {
      if (subscription.domains.has(event.domain)) subscription.handler(event)
    }
  }

  const onMessage = (message: MessageEvent<unknown>): void => {
    if (isEvent(message.data)) deliver(message.data)
  }
  channel?.addEventListener('message', onMessage)

  return {
    subscribe(domain, handler) {
      const domains = new Set(Array.isArray(domain) ? domain : [domain])
      const subscription = { domains, handler }
      subscriptions.add(subscription)
      return () => subscriptions.delete(subscription)
    },
    publish(input) {
      const event: SharedRealtimeEvent = {
        ...input,
        id: input.id ?? randomId(),
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        source: 'local',
      }
      // BroadcastChannel does not echo to its sender, so deliver locally too.
      deliver(event)
      channel?.postMessage(event)
      return event
    },
    dispose() {
      subscriptions.clear()
      channel?.removeEventListener('message', onMessage)
      channel?.close()
    },
  }
}
