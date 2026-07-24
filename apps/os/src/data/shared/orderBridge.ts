import { deriveInitialSequences } from '../../store/ordersStoreSeedData'
import { useOrdersStore } from '../../store/ordersStore'
import { bootstrapSharedData } from './bootstrap'
import { sharedOrderToOrderTableRow } from './orderLocalAdapter'
import { browserSupabaseTokenProvider } from './supabaseSession'

let stopOrderSync: (() => void) | undefined

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
    stopOrderSync?.()
    const knownRevisions = new Map(mapped.map((order) => [order.id ?? order.orderNumber, order.revision ?? 1]))
    let applyingRemote = true
    applyingRemote = false
    stopOrderSync = useOrdersStore.subscribe((state) => {
      if (applyingRemote) return
      for (const order of state.orders) {
        const id = order.id ?? order.orderNumber
        const revision = order.revision ?? 1
        const known = knownRevisions.get(id)
        if (known !== undefined && revision <= known) continue
        knownRevisions.set(id, revision)
        void shared.repositories.client.update('orders', { id }, {
          revision,
          status: order.status,
          payment_status: order.paymentStatus,
          paid_amount_idr: order.paidAmountIdr ?? 0,
          finance_verified: order.financeVerified ?? false,
          finance_verified_by: order.financeVerifiedBy ?? null,
          finance_verified_at: order.financeVerifiedAt ?? null,
          updated_at: order.updatedAt ?? new Date().toISOString(),
          completed_at: order.completedAt ?? null,
        } as never).catch(() => {
          // A failed background write is retried by the next local mutation.
        })
      }
    })
    return true
  } catch {
    // Keep the local operational data visible if the remote read is temporarily unavailable.
    return false
  }
}
