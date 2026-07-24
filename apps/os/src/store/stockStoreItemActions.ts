/**
 * @file stockStoreItemActions.ts
 * @description Item lifecycle actions for the Stock store: creating,
 * editing, archiving, and deleting stock items.
 */

import type { StockItem, StockStoreGet, StockStoreSet, StockStoreState } from './stockStoreTypes'
import {
  emitStockDeleted,
  emitStockUpdated,
  processStockAlertsAndEmit,
} from '../core/events/eventService'
import { generateId } from '../lib/id'
import { isSectionEditAuthorized } from '../config/authorization'
import { applyStockCrossFieldRules } from '../domain/stockDomain'
import { isInventoryEnabled } from './inventoryFeatureGate'

type ItemActions = Pick<
  StockStoreState,
  'addItem' | 'updateItem' | 'archiveItems' | 'deleteItems'
>

export const createStockItemActions = (
  set: StockStoreSet,
  get: StockStoreGet,
): ItemActions => ({
  addItem: ({
    name,
    branch,
    category,
    subCategory,
    availableQty,
    reservedQty,
    unit,
    lowStockThreshold,
    isPerishable,
    expiryDate,
  }) => {
    if (!isInventoryEnabled() || !isSectionEditAuthorized('stock')) return
    const id = generateId('item')
    const newItem: StockItem = {
      id,
      ...applyStockCrossFieldRules({
        name,
        branch,
        category,
        subCategory,
        availableQty,
        reservedQty,
        unit,
        lowStockThreshold,
        isPerishable,
        expiryDate,
      }),
    }

    set((state) => ({
      items: [newItem, ...state.items],
    }))

    emitStockUpdated(newItem, 'Item created')
    processStockAlertsAndEmit(get().items)
  },

  updateItem: (itemId, patch) => {
    if (!isInventoryEnabled() || !isSectionEditAuthorized('stock')) return
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? applyStockCrossFieldRules({ ...item, ...patch, id: item.id })
          : item,
      ),
    }))

    const updatedItem = get().items.find((item) => item.id === itemId)
    if (updatedItem) {
      emitStockUpdated(updatedItem, 'Item updated')
      processStockAlertsAndEmit(get().items)
    }
  },

  archiveItems: (itemIds, isArchived) => {
    if (!isInventoryEnabled() || !isSectionEditAuthorized('stock')) return
    const idSet = new Set(itemIds)
    set((state) => ({
      items: state.items.map((item) =>
        idSet.has(item.id) ? { ...item, isArchived } : item,
      ),
    }))

    const reason = isArchived ? 'Item archived' : 'Item unarchived'
    get()
      .items.filter((item) => idSet.has(item.id))
      .forEach((item) => emitStockUpdated(item, reason))
    processStockAlertsAndEmit(get().items)
  },

  deleteItems: (itemIds) => {
    if (!isInventoryEnabled() || !isSectionEditAuthorized('stock')) return
    const idSet = new Set(itemIds)
    const removedIds = get()
      .items.filter((item) => idSet.has(item.id))
      .map((item) => item.id)

    set((state) => ({
      items: state.items.filter((item) => !idSet.has(item.id)),
    }))

    removedIds.forEach((itemId) => emitStockDeleted(itemId))
    processStockAlertsAndEmit(get().items)
  },
})
