/**
 * @file eventBus.ts
 * @description Simple type-safe pub/sub event bus used as the backbone of the
 * Fleurstales OS. All state changes and high-level business events are routed
 * through this bus so UI modules can react in real time.
 */

import type {
  DomainEventName,
  DomainEventHandler,
  DomainEventPayload,
} from './eventTypes'

/**
 * @description Internal registry of listeners keyed by event name.
 */
const listeners: {
  [K in DomainEventName]?: Set<DomainEventHandler<K>>
} = {}

/**
 * @description Typed event bus singleton for the entire application.
 */
export const eventBus = {
  /**
   * @description Emits an event with a strongly-typed payload.
   */
  emit<E extends DomainEventName>(
    name: E,
    payload: DomainEventPayload<E>,
  ): void {
    const set = listeners[name] as Set<DomainEventHandler<E>> | undefined
    if (!set || set.size === 0) return
    // Clone the set to avoid issues if handlers unsubscribe while iterating.
    Array.from(set).forEach((handler) => {
      handler(payload)
    })
  },

  /**
   * @description Subscribes to an event. Returns an unsubscribe function.
   */
  on<E extends DomainEventName>(
    name: E,
    handler: DomainEventHandler<E>,
  ): () => void {
    const existing = listeners[name] as
      | Set<DomainEventHandler<E>>
      | undefined
    const set = existing ?? new Set<DomainEventHandler<E>>()
    set.add(handler)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(listeners as any)[name] = set
    return () => {
      set.delete(handler)
    }
  },

  /**
   * @description Removes a previously subscribed handler.
   */
  off<E extends DomainEventName>(
    name: E,
    handler: DomainEventHandler<E>,
  ): void {
    const set = listeners[name] as Set<DomainEventHandler<E>> | undefined
    if (!set) return
    set.delete(handler)
  },
}
