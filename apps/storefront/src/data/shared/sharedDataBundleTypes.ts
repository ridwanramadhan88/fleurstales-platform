/** Portable Phase 10 shared-data schema. No Zustand or browser dependency. */
import type { SharedCatalogAdminState, SharedCustomerAddress, SharedCustomer, SharedOccasion, SharedOrder, SharedProduct, SharedStoreAdminState, SharedStoreSnapshot } from './contracts'


export interface SharedCatalogSnapshot {
  adminState: SharedCatalogAdminState
  occasions: SharedOccasion[]
  products: SharedProduct[]
}

export const SHARED_DATA_BUNDLE_KIND = 'fleurstales.shared-data' as const
export const SHARED_DATA_BUNDLE_VERSION = 1 as const

export type SharedDataBundleSource = 'business_os' | 'storefront' | 'local_qa' | 'migration'

export interface SharedDataBundleV1 {
  kind: typeof SHARED_DATA_BUNDLE_KIND
  version: typeof SHARED_DATA_BUNDLE_VERSION
  exportedAt: string
  source: {
    app: SharedDataBundleSource
    appVersion?: string
    note?: string
  }
  catalog: SharedCatalogSnapshot
  store: {
    adminState: SharedStoreAdminState
    snapshot: SharedStoreSnapshot
  }
  customers: {
    customers: SharedCustomer[]
    addresses: SharedCustomerAddress[]
  }
  orders: {
    orders: SharedOrder[]
  }
}

export interface SharedDataBundleValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

