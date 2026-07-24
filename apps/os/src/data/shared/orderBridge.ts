import { deriveInitialSequences } from '../../store/ordersStoreSeedData'
import { useOrdersStore } from '../../store/ordersStore'
import { bootstrapSharedData } from './bootstrap'
import { sharedOrderToOrderTableRow } from './orderLocalAdapter'
import { browserSupabaseTokenProvider } from './supabaseSession'

/**
 * Loads the authoritative order list into the OS store after staff sign-in.
 * Storefront orders are created in Supabase, so the operational UI must hydrate
 * from the same source before rendering its branch/status views.
 */
export const refreshBusinessOsOrdersFromRemote = async (): Promise<boolean> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return false

  try {
    const orders = await shared.repositories.ordersAdmin.listOrders()
    const mapped = orders.map(sharedOrderToOrderTableRow)
    useOrdersStore.setState((state) => ({
      ...state,
      orders: mapped,
      lastSequence: deriveInitialSequences(mapped),
    }))
    return true
  } catch {
    // Keep the local operational data visible if the remote read is temporarily unavailable.
    return false
  }
}
