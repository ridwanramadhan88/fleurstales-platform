export type SharedRealtimeDomain = 'catalog' | 'store' | 'customers' | 'orders'
export type SharedRealtimeOperation = 'insert' | 'update' | 'delete' | 'snapshot' | 'invalidate'
export type SharedRealtimeSource = 'local' | 'supabase'

export interface SharedRealtimeEvent {
  id: string
  domain: SharedRealtimeDomain
  operation: SharedRealtimeOperation
  /** Table/entity family, for example `orders` or `products`. */
  entity: string
  entityId?: string
  revision?: number
  occurredAt: string
  source: SharedRealtimeSource
}

export type SharedRealtimeHandler = (event: SharedRealtimeEvent) => void

export interface SharedRealtimeClient {
  subscribe(domain: SharedRealtimeDomain | SharedRealtimeDomain[], handler: SharedRealtimeHandler): () => void
  /** Releases transport resources when a screen/app session is torn down. */
  dispose?(): void
}

/** Local QA transport may publish; the future Supabase transport is subscribe-only to app code. */
export interface MutableSharedRealtimeClient extends SharedRealtimeClient {
  publish(event: Omit<SharedRealtimeEvent, 'id' | 'occurredAt' | 'source'> & Partial<Pick<SharedRealtimeEvent, 'id' | 'occurredAt'>>): SharedRealtimeEvent
}

export interface SupabaseRealtimeAdapterFactory {
  /**
   * Phase 9 contract only. The live implementation may use `@supabase/supabase-js`
   * later without changing domain bridges or UI code.
   */
  create(): SharedRealtimeClient
}


/** Shared-domain subset of the live Supabase Realtime publication. */
export const SHARED_REALTIME_TABLE_DOMAIN = {
  customers: 'customers',
  orders: 'orders',
  order_activities: 'orders',
} as const satisfies Record<string, SharedRealtimeDomain>

export type SharedRealtimeTable = keyof typeof SHARED_REALTIME_TABLE_DOMAIN
