/**
 * @file stockStoreTransferActions.ts
 * @description Branch-transfer actions for the Stock store: creating a
 * transfer request and advancing its status. Each accepted mutation records
 * an audit event and re-emits the relevant event-service notification.
 *
 * Quantity-movement model:
 * - `requestTransfer` deducts `quantity` from the source item's
 *   `availableQty` immediately, clamped to available stock.
 * - `requested → in_transit` changes only the lifecycle label.
 * - `in_transit → received` applies the quantity to the destination exactly
 *   once, topping up a match or creating a destination item.
 * - `requested|in_transit → cancelled` restores the source exactly once.
 * - `received` and `cancelled` are terminal. Illegal and same-state writes are
 *   no-ops, so terminal quantity effects cannot be reversed or replayed.
 */

import type {
  StockEvent,
  StockItem,
  StockStoreGet,
  StockStoreSet,
  StockStoreState,
  StockTransfer,
} from './stockStoreTypes'
import {
  emitStockTransferred,
  emitStockUpdated,
  processStockAlertsAndEmit,
} from '../core/events/eventService'
import { canTransitionStockTransferStatus } from '../domain/stockTransferDomain'
import { generateId } from '../lib/id'
import { isSectionEditAuthorized } from '../config/authorization'
import { isInventoryEnabled } from './inventoryFeatureGate'

/**
 * @description Returns a compact ISO timestamp string for "now".
 */
const nowIso = (): string => new Date().toISOString()

type TransferActions = Pick<
  StockStoreState,
  'requestTransfer' | 'updateTransferStatus'
>

export const createStockTransferActions = (
  set: StockStoreSet,
  get: StockStoreGet,
): TransferActions => ({
  requestTransfer: ({ itemId, fromBranch, toBranch, quantity, actor }) => {
    if (!isInventoryEnabled() || !isSectionEditAuthorized('stock')) return
    const sourceItem = get().items.find((item) => item.id === itemId)
    if (!sourceItem || quantity <= 0) return

    // Never move more than the source branch actually has available.
    const deductQuantity = Math.min(quantity, sourceItem.availableQty)
    if (deductQuantity <= 0) return

    const id = generateId('tr')
    const timestamp = nowIso()

    const newTransfer: StockTransfer = {
      id,
      itemId,
      fromBranch,
      toBranch,
      quantity: deductQuantity,
      status: 'requested',
      createdAt: timestamp,
      updatedAt: timestamp,
      actor,
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? { ...item, availableQty: item.availableQty - deductQuantity }
          : item,
      ),
      transfers: [newTransfer, ...state.transfers],
    }))

    emitStockTransferred(newTransfer)
    const updatedSourceItem = get().items.find((item) => item.id === itemId)
    if (updatedSourceItem) {
      emitStockUpdated(updatedSourceItem, `Transfer requested to ${toBranch}`)
    }
    processStockAlertsAndEmit(get().items)
  },

  updateTransferStatus: ({ transferId, status, actor }) => {
    if (!isInventoryEnabled() || !isSectionEditAuthorized('stock')) return
    const timestamp = nowIso()
    let previousFromBranch = ''
    let updatedTransfer: StockTransfer | null = null
    let destinationItem: StockItem | null = null
    let restoredSourceItem: StockItem | null = null

    set((state) => {
      const currentTransfer = state.transfers.find(
        (transfer) => transfer.id === transferId,
      )

      // The state-machine guard is authoritative. It blocks same-state writes,
      // skipped stages, reversals, and every write out of a terminal state.
      if (
        !currentTransfer ||
        !canTransitionStockTransferStatus(currentTransfer.status, status)
      ) {
        return state
      }

      // Every accepted transition requires the source item to remain valid.
      // Never advance a transfer whose later quantity effect cannot be applied.
      const sourceItem = state.items.find(
        (item) => item.id === currentTransfer.itemId,
      )
      if (!sourceItem) return state

      previousFromBranch = currentTransfer.fromBranch
      const nextTransfer: StockTransfer = {
        ...currentTransfer,
        status,
        updatedAt: timestamp,
        actor,
      }
      updatedTransfer = nextTransfer

      let items = state.items

      if (status === 'received') {
        const matchIndex = items.findIndex(
          (item) =>
            item.branch === currentTransfer.toBranch &&
            item.category === sourceItem.category &&
            item.name.toLowerCase() === sourceItem.name.toLowerCase(),
        )

        if (matchIndex >= 0) {
          items = items.map((item, index) =>
            index === matchIndex
              ? {
                  ...item,
                  availableQty: item.availableQty + currentTransfer.quantity,
                }
              : item,
          )
          destinationItem = items[matchIndex]
        } else {
          const newItem: StockItem = {
            id: generateId('item'),
            name: sourceItem.name,
            branch: currentTransfer.toBranch,
            category: sourceItem.category,
            subCategory: sourceItem.subCategory,
            availableQty: currentTransfer.quantity,
            reservedQty: 0,
            unit: sourceItem.unit,
            lowStockThreshold: sourceItem.lowStockThreshold,
            isPerishable: sourceItem.isPerishable,
            expiryDate: sourceItem.expiryDate,
          }
          items = [newItem, ...items]
          destinationItem = newItem
        }
      }

      if (status === 'cancelled') {
        items = items.map((item) =>
          item.id === currentTransfer.itemId
            ? {
                ...item,
                availableQty: item.availableQty + currentTransfer.quantity,
              }
            : item,
        )
        restoredSourceItem =
          items.find((item) => item.id === currentTransfer.itemId) ?? null
      }

      const newEvent: StockEvent = {
        id: generateId('ev'),
        itemId: currentTransfer.itemId,
        kind: 'transfer',
        quantity: 0,
        reason: `Transfer status updated to ${status}`,
        actor,
        createdAt: timestamp,
      }

      return {
        transfers: state.transfers.map((transfer) =>
          transfer.id === transferId ? nextTransfer : transfer,
        ),
        items,
        events: [newEvent, ...state.events],
      }
    })

    // No accepted transition means no external event emission.
    if (!updatedTransfer) return

    emitStockTransferred(updatedTransfer)
    if (destinationItem) {
      emitStockUpdated(
        destinationItem,
        `Transfer received from ${previousFromBranch}`,
      )
    }
    if (restoredSourceItem) {
      emitStockUpdated(restoredSourceItem, 'Transfer cancelled')
    }
    if (destinationItem || restoredSourceItem) {
      processStockAlertsAndEmit(get().items)
    }
  },
})
