/**
 * @file pendingPurchasesStore.ts
 * @description Stock purchases waiting for Finance confirmation, fetched once
 * and shared by the confirmation queue and the Finance Tasks badge so both
 * show the same list without a second request.
 */

import { create } from 'zustand'
import { fetchInventoryPurchases } from '../../data/inventorySupabase'
import type { InventoryPurchase } from '../../domain/inventoryDomain'

interface PendingPurchasesState {
  purchases: InventoryPurchase[]
  loading: boolean
  loaded: boolean
  error: string | null
  load: () => Promise<void>
}

export const usePendingPurchasesStore = create<PendingPurchasesState>((set, get) => ({
  purchases: [],
  loading: false,
  loaded: false,
  error: null,
  load: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      set({ purchases: await fetchInventoryPurchases('pending_finance'), error: null, loaded: true })
    } catch (caught) {
      set({ error: caught instanceof Error ? caught.message : String(caught), loaded: true })
    } finally {
      set({ loading: false })
    }
  },
}))
