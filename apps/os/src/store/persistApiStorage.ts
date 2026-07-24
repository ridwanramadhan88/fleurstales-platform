/**
 * @file persistApiStorage.ts
 * @description Adapts `src/api/localApi.ts` to the `StateStorage` interface
 * Zustand's `persist` middleware expects, and adds cross-tab rehydration.
 *
 * Every store that should survive a refresh (and stay in sync across tabs —
 * e.g. an order placed on the storefront showing up on the admin Orders
 * list) should use `persist(..., { name, storage: apiStorage })` plus
 * `subscribeToExternalUpdates(name, store)` once, at module load.
 *
 * Nothing here is localStorage-specific from the call site's point of view —
 * all storage access goes through `localApi`, so migrating to a real backend
 * later only means changing `localApi.ts`.
 */

import type { StateStorage } from 'zustand/middleware'
import type { StoreApi } from 'zustand'
import { getItem, setItem, removeItem, subscribe } from '../api/localApi'

/**
 * @description Zustand `persist` storage adapter backed by the local API.
 * `persist` already serializes to/from JSON itself, so this just forwards
 * strings through.
 */
export const apiStorage: StateStorage = {
  getItem,
  setItem,
  removeItem,
}

/**
 * @description Subscribes a persisted store to changes made in *other*
 * browser tabs/windows under the same persist `name`, and re-hydrates the
 * store from storage when that happens. Call once per store, right after
 * creating it.
 *
 * This is what makes "storefront order in tab A" show up in "admin Orders
 * list in tab B" without a manual refresh, mirroring what a websocket/SSE
 * push from a real backend would do.
 */
export const subscribeToExternalUpdates = <T>(
  persistName: string,
  store: StoreApi<T> & {
    persist: { rehydrate: () => Promise<void> | void }
  },
): (() => void) => {
  return subscribe(persistName, () => {
    void store.persist.rehydrate()
  })
}
