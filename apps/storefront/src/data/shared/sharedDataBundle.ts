/**
 * Phase 10 local-store export/import runtime. The portable schema and validator
 * live in dependency-light sibling modules so QA tooling is not coupled to Zustand.
 */
import { useCustomerStore } from '../../store/customerStore'
import { useOrdersStore } from '../../store/ordersStore'
import { deriveInitialSequences } from '../../store/ordersStoreSeedData'
import type { SharedCustomerAddress } from './contracts'
import { customerProfileToSharedCustomer, sharedCustomerToCustomerProfile } from './customerLocalAdapter'
import { orderTableRowToSharedOrder, sharedOrderToOrderTableRow } from './orderLocalAdapter'
import { applySharedCatalogSnapshotToLocalState, getLocalSharedCatalogSnapshot } from './catalogLocalAdapter'
import { applySharedStoreSnapshotToLocalState, getLocalSharedStoreSnapshot } from './storeLocalAdapter'
import { validateSharedDataBundle } from './sharedDataBundleDomain'
import { SHARED_DATA_BUNDLE_KIND, SHARED_DATA_BUNDLE_VERSION, type SharedDataBundleSource, type SharedDataBundleV1, type SharedDataBundleValidationResult } from './sharedDataBundleTypes'

export { SHARED_DATA_BUNDLE_KIND, SHARED_DATA_BUNDLE_VERSION } from './sharedDataBundleTypes'
export type { SharedDataBundleSource, SharedDataBundleV1, SharedDataBundleValidationResult } from './sharedDataBundleTypes'
export { fingerprintSharedDataBundle, stableStringifySharedData, validateSharedDataBundle } from './sharedDataBundleDomain'

export const buildSharedDataBundleFromLocalStores = (options: {
  app: SharedDataBundleSource
  appVersion?: string
  note?: string
  exportedAt?: string
  catalogRevision?: number
  storeRevision?: number
  storeUpdatedAt?: string
  customerAddresses?: SharedCustomerAddress[]
}): SharedDataBundleV1 => ({
  kind: SHARED_DATA_BUNDLE_KIND,
  version: SHARED_DATA_BUNDLE_VERSION,
  exportedAt: options.exportedAt ?? new Date().toISOString(),
  source: {
    app: options.app,
    appVersion: options.appVersion,
    note: options.note,
  },
  catalog: getLocalSharedCatalogSnapshot(options.catalogRevision ?? 0),
  store: {
    adminState: { revision: options.storeRevision ?? 0, updatedAt: options.storeUpdatedAt },
    snapshot: getLocalSharedStoreSnapshot(),
  },
  customers: {
    customers: useCustomerStore.getState().customers.map(customerProfileToSharedCustomer),
    addresses: options.customerAddresses ?? [],
  },
  orders: {
    orders: useOrdersStore.getState().orders.map(orderTableRowToSharedOrder),
  },
})

const applyBundleUnchecked = (bundle: SharedDataBundleV1): void => {
  applySharedStoreSnapshotToLocalState(bundle.store.snapshot)
  applySharedCatalogSnapshotToLocalState(bundle.catalog)
  useCustomerStore.setState({
    customers: bundle.customers.customers.map(sharedCustomerToCustomerProfile),
  })
  const orders = bundle.orders.orders.map(sharedOrderToOrderTableRow)
  useOrdersStore.setState({ orders, lastSequence: deriveInitialSequences(orders) })
}

/**
 * Applies all four shared domains as one local QA import. If a domain throws,
 * the previous shared state is restored so a partially imported bundle is not
 * left behind.
 */
export const applySharedDataBundleToLocalStores = (bundle: SharedDataBundleV1): SharedDataBundleValidationResult => {
  const validation = validateSharedDataBundle(bundle)
  if (!validation.valid) throw new Error(`Invalid shared-data bundle: ${validation.errors.join(' ')}`)

  const previous = buildSharedDataBundleFromLocalStores({ app: 'local_qa', note: 'Automatic rollback snapshot' })
  try {
    applyBundleUnchecked(bundle)
  } catch (error) {
    applyBundleUnchecked(previous)
    throw error
  }
  return validation
}
