/**
 * @file stockStoreQuantityActions.ts
 * @description The Stock actions that mutate `availableQty` and write an
 * audit event: manual loss/write-off recording, automatic deduction for
 * completed sales, and restocking a voided (cancelled/failed) order's
 * previously-deducted quantities back. All three re-run low-stock/expiry
 * alerts after mutating.
 */

import type { StockEvent, StockStoreGet, StockStoreSet, StockStoreState } from './stockStoreTypes'
import { emitStockUpdated, processStockAlertsAndEmit } from '../core/events/eventService'
import { generateId } from '../lib/id'
import { isSectionEditAuthorized } from '../config/authorization'
import { isInventoryEnabled } from './inventoryFeatureGate'

/**
 * @description Returns a compact ISO timestamp string for "now".
 */
const nowIso = (): string => new Date().toISOString()

type QuantityActions = Pick<
  StockStoreState,
  'recordLossOrWriteOff' | 'deductStockForSale' | 'restockForOrder'
>

export const createStockQuantityActions = (
  set: StockStoreSet,
  get: StockStoreGet,
): QuantityActions => ({
  recordLossOrWriteOff: ({ itemId, quantity, kind, reason, actor }) => {
    if (!isInventoryEnabled() || !isSectionEditAuthorized('stock')) return
    const timestamp = nowIso()

    set((state) => {
      const items = state.items.map((item) => {
        if (item.id !== itemId) return item
        const nextAvailable = Math.max(0, item.availableQty - quantity)
        return { ...item, availableQty: nextAvailable }
      })

      const newEvent: StockEvent = {
        id: generateId('ev'),
        itemId,
        kind,
        quantity,
        reason,
        actor,
        createdAt: timestamp,
      }

      return {
        items,
        events: [newEvent, ...state.events],
      }
    })

    const updatedItem = get().items.find((item) => item.id === itemId)
    if (updatedItem) {
      emitStockUpdated(updatedItem, reason)
      processStockAlertsAndEmit(get().items)
    }
  },

  deductStockForSale: ({ deductions, reason }) => {
    if (!isInventoryEnabled()) return
    const timestamp = nowIso()
    const knownIds = new Set(get().items.map((item) => item.id))
    const validDeductions = deductions.filter((d) => knownIds.has(d.itemId))
    if (validDeductions.length === 0) return

    set((state) => {
      const items = state.items.map((item) => {
        const deduction = validDeductions.find((d) => d.itemId === item.id)
        if (!deduction) return item
        const nextAvailable = Math.max(0, item.availableQty - deduction.quantity)
        return { ...item, availableQty: nextAvailable }
      })

      const newEvents: StockEvent[] = validDeductions.map((deduction) => ({
        id: generateId('ev'),
        itemId: deduction.itemId,
        kind: 'sale',
        quantity: deduction.quantity,
        reason,
        actor: 'system',
        createdAt: timestamp,
      }))

      return {
        items,
        events: [...newEvents, ...state.events],
      }
    })

    validDeductions.forEach((deduction) => {
      const updatedItem = get().items.find((item) => item.id === deduction.itemId)
      if (updatedItem) emitStockUpdated(updatedItem, reason)
    })
    processStockAlertsAndEmit(get().items)
  },

  restockForOrder: ({ restocks, reason }) => {
    if (!isInventoryEnabled()) return
    const timestamp = nowIso()
    const knownIds = new Set(get().items.map((item) => item.id))
    const validRestocks = restocks.filter((r) => knownIds.has(r.itemId))
    if (validRestocks.length === 0) return

    set((state) => {
      const items = state.items.map((item) => {
        const restock = validRestocks.find((r) => r.itemId === item.id)
        if (!restock) return item
        return { ...item, availableQty: item.availableQty + restock.quantity }
      })

      const newEvents: StockEvent[] = validRestocks.map((restock) => ({
        id: generateId('ev'),
        itemId: restock.itemId,
        kind: 'restock',
        quantity: restock.quantity,
        reason,
        actor: 'system',
        createdAt: timestamp,
      }))

      return {
        items,
        events: [...newEvents, ...state.events],
      }
    })

    validRestocks.forEach((restock) => {
      const updatedItem = get().items.find((item) => item.id === restock.itemId)
      if (updatedItem) emitStockUpdated(updatedItem, reason)
    })
    processStockAlertsAndEmit(get().items)
  },
})
