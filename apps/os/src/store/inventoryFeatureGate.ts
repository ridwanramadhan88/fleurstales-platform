import { useSettingsStore } from './settingsStore'

/** Authoritative runtime gate for every inventory mutation. */
export const isInventoryEnabled = (): boolean =>
  useSettingsStore.getState().storeProfile.inventoryEnabled === true

export const inventoryDisabledReason = 'Inventory is disabled in Store Profile settings.'
