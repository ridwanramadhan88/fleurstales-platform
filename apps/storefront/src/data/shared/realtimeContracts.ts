export type SharedRealtimeDomain = 'catalog' | 'store' | 'customers' | 'orders' | 'staff_session'
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


/** Canonical table-to-domain map for the future Supabase Realtime adapter. */
export const SHARED_REALTIME_TABLE_DOMAIN = {
  store_profile: 'store',
  branches: 'store',
  public_payment_accounts: 'store',
  storefront_payment_settings: 'store',
  occasions: 'catalog',
  products: 'catalog',
  product_occasions: 'catalog',
  product_variants: 'catalog',
  product_images: 'catalog',
  size_guide_templates: 'catalog',
  size_guide_targets: 'catalog',
  customers: 'customers',
  customer_addresses: 'customers',
  orders: 'orders',
  order_items: 'orders',
  order_payment_events: 'orders',
  order_activities: 'orders',
  staff_access_profiles: 'staff_session',
} as const satisfies Record<string, SharedRealtimeDomain>

export type SharedRealtimeTable = keyof typeof SHARED_REALTIME_TABLE_DOMAIN
