import type {
  CatalogAdminRepository,
  CatalogReadRepository,
  CustomerAdminRepository,
  OrdersAdminRepository,
  StoreAdminRepository,
  StoreReadRepository,
  StorefrontCheckoutRepository,
  StaffAccessRepository,
} from './repositoryContracts'
import {
  createCatalogAdminRepository,
  createCatalogReadRepository,
  createCustomerAdminRepository,
  createOrdersAdminRepository,
  createStoreAdminRepository,
  createStoreReadRepository,
  createStorefrontCheckoutRepository,
  createStaffAccessRepository,
} from './repositories'
import { resolveSupabaseConfig, type SupabaseConfigState } from './supabaseConfig'
import { SupabaseHttpClient, type SupabaseAuthTokenProvider } from './supabaseHttpClient'
import { rememberStorefrontCheckoutResult } from './storefrontCheckoutResult'

export interface SharedDataRepositorySet {
  client: SupabaseHttpClient
  catalog: CatalogReadRepository
  catalogAdmin: CatalogAdminRepository
  store: StoreReadRepository
  storeAdmin: StoreAdminRepository
  customersAdmin: CustomerAdminRepository
  ordersAdmin: OrdersAdminRepository
  checkout: StorefrontCheckoutRepository
  staffAccess: StaffAccessRepository
}

export type SharedDataBootstrapResult =
  | { enabled: false; configState: Extract<SupabaseConfigState, { enabled: false }> }
  | { enabled: true; repositories: SharedDataRepositorySet }

/** Creates repositories without mutating any application store. */
export const bootstrapSharedData = (tokenProvider?: SupabaseAuthTokenProvider): SharedDataBootstrapResult => {
  const configState = resolveSupabaseConfig()
  if (configState.enabled === false) return { enabled: false, configState }

  const client = new SupabaseHttpClient(configState.config, tokenProvider)
  return {
    enabled: true,
    repositories: {
      client,
      catalog: createCatalogReadRepository(client),
      catalogAdmin: createCatalogAdminRepository(client),
      store: createStoreReadRepository(client),
      storeAdmin: createStoreAdminRepository(client),
      customersAdmin: createCustomerAdminRepository(client),
      ordersAdmin: createOrdersAdminRepository(client),
      checkout: rememberStorefrontCheckoutResult(createStorefrontCheckoutRepository(client)),
      staffAccess: createStaffAccessRepository(client),
    },
  }
}
