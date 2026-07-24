import { useSettingsStore } from '../../store/settingsStore'
import type { OwnerSettingsStateValue } from '../../types/settings'
import type { StoreAdminRepository } from './repositoryContracts'
import type { SharedStoreSnapshot } from './contracts'
import { buildSharedStoreSnapshot, mergeSharedStoreSnapshot, validateSharedStoreSnapshot } from './storeSettingsDomain'

let localRevision = 0
let localUpdatedAt: string | undefined

export const applySharedStoreSnapshotToLocalState = (snapshot: SharedStoreSnapshot): void => {
  const errors = validateSharedStoreSnapshot(snapshot)
  if (errors.length > 0) throw new Error(`Invalid shared Store snapshot: ${errors.join(' ')}`)
  useSettingsStore.setState((state: OwnerSettingsStateValue) => mergeSharedStoreSnapshot(state, snapshot))
}

export const getLocalSharedStoreSnapshot = (): SharedStoreSnapshot =>
  buildSharedStoreSnapshot(useSettingsStore.getState())

/**
 * Local adapter used before a real Supabase project is attached.
 * It implements the same Store repository contract so shared-data QA can run
 * without changing Storefront or Business OS components.
 */
export const createLocalStoreAdminRepository = (): StoreAdminRepository => ({
  async getStoreProfile() {
    return getLocalSharedStoreSnapshot().profile
  },
  async listBranches(options) {
    const branches = getLocalSharedStoreSnapshot().branches
    return options?.includeInactive ? branches : branches.filter((branch) => branch.isActive)
  },
  async listPublicPaymentAccounts(options) {
    return getLocalSharedStoreSnapshot().paymentAccounts.filter((account) =>
      (options?.includeInactive || account.isActive)
      && (options?.includeHidden || account.isCustomerVisible)
      && (!options?.branchId || account.branchIds.length === 0 || account.branchIds.includes(options.branchId)),
    )
  },
  async getPaymentInstructions() {
    return getLocalSharedStoreSnapshot().paymentInstructions
  },
  async getAdminState() {
    return { revision: localRevision, updatedAt: localUpdatedAt }
  },
  async replaceSnapshot(input) {
    if (input.baseRevision !== localRevision) {
      throw new Error(`STORE_CONFLICT: expected revision ${input.baseRevision}, current revision ${localRevision}.`)
    }
    applySharedStoreSnapshotToLocalState(input.snapshot)
    localRevision += 1
    localUpdatedAt = new Date().toISOString()
    return {
      revision: localRevision,
      branchCount: input.snapshot.branches.length,
      paymentAccountCount: input.snapshot.paymentAccounts.length,
    }
  },
})
