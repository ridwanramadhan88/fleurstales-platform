/**
 * @file stockStoreTransferActions.test.ts
 * @description Stock-transfer lifecycle and exactly-once inventory movement.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useStockStore } from './stockStore'
import { useSettingsStore } from './settingsStore'
import type { StockItem, StockTransferStatus } from './stockStoreTypes'

const makeStockItem = (overrides: Partial<StockItem> = {}): StockItem => ({
  id: 'stock_1',
  name: 'White Rose',
  branch: 'Kedamaian',
  category: 'Flowers',
  availableQty: 100,
  reservedQty: 0,
  unit: 'stems',
  lowStockThreshold: 5,
  isPerishable: false,
  ...overrides,
})

const resetStore = (items: StockItem[]) => {
  useSettingsStore.getState().updateStoreProfile({ inventoryEnabled: true })
  useStockStore.setState({ items, transfers: [], events: [] })
}

const requestTransfer = (quantity = 10): string => {
  useStockStore.getState().requestTransfer({
    itemId: 'stock_1',
    fromBranch: 'Kedamaian',
    toBranch: 'Pahoman',
    quantity,
    actor: 'Owner',
  })

  const transfer = useStockStore.getState().transfers[0]
  if (!transfer) throw new Error('Expected transfer request to be created')
  return transfer.id
}

const updateStatus = (transferId: string, status: StockTransferStatus) => {
  useStockStore.getState().updateTransferStatus({
    transferId,
    status,
    actor: 'Owner',
  })
}

describe('requestTransfer', () => {
  beforeEach(() => resetStore([makeStockItem()]))

  it('deducts the requested quantity from the source immediately', () => {
    requestTransfer(10)

    expect(
      useStockStore.getState().items.find((item) => item.id === 'stock_1')
        ?.availableQty,
    ).toBe(90)
    expect(useStockStore.getState().transfers[0]).toMatchObject({
      status: 'requested',
      quantity: 10,
    })
  })

  it('clamps the deduction to the available quantity', () => {
    resetStore([makeStockItem({ availableQty: 4 })])

    requestTransfer(10)

    expect(
      useStockStore.getState().items.find((item) => item.id === 'stock_1')
        ?.availableQty,
    ).toBe(0)
    expect(useStockStore.getState().transfers[0].quantity).toBe(4)
  })

  it('does nothing when the source has zero available stock', () => {
    resetStore([makeStockItem({ availableQty: 0 })])

    useStockStore.getState().requestTransfer({
      itemId: 'stock_1',
      fromBranch: 'Kedamaian',
      toBranch: 'Pahoman',
      quantity: 10,
      actor: 'Owner',
    })

    expect(useStockStore.getState().transfers).toHaveLength(0)
  })
})

describe('allowed stock-transfer transitions', () => {
  beforeEach(() => resetStore([makeStockItem()]))

  it('allows requested → in_transit without moving quantity', () => {
    const transferId = requestTransfer()

    updateStatus(transferId, 'in_transit')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('in_transit')
    expect(state.items[0].availableQty).toBe(90)
    expect(state.events).toHaveLength(1)
  })

  it('allows requested → cancelled and restores the source exactly once', () => {
    const transferId = requestTransfer()

    updateStatus(transferId, 'cancelled')
    updateStatus(transferId, 'cancelled')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('cancelled')
    expect(state.items[0].availableQty).toBe(100)
    expect(state.events).toHaveLength(1)
  })

  it('allows in_transit → cancelled and restores the source exactly once', () => {
    const transferId = requestTransfer()
    updateStatus(transferId, 'in_transit')

    updateStatus(transferId, 'cancelled')
    updateStatus(transferId, 'cancelled')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('cancelled')
    expect(state.items[0].availableQty).toBe(100)
    expect(state.events).toHaveLength(2)
  })

  it('allows in_transit → received and tops up an existing destination exactly once', () => {
    resetStore([
      makeStockItem({ id: 'stock_1', branch: 'Kedamaian', availableQty: 100 }),
      makeStockItem({ id: 'stock_2', branch: 'Pahoman', availableQty: 5 }),
    ])
    const transferId = requestTransfer()
    updateStatus(transferId, 'in_transit')

    updateStatus(transferId, 'received')
    updateStatus(transferId, 'received')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('received')
    expect(
      state.items.find((item) => item.id === 'stock_2')?.availableQty,
    ).toBe(15)
    expect(state.items).toHaveLength(2)
    expect(state.events).toHaveLength(2)
  })

  it('creates one destination item when receiving without an existing match', () => {
    const transferId = requestTransfer()
    updateStatus(transferId, 'in_transit')

    updateStatus(transferId, 'received')
    updateStatus(transferId, 'received')

    const state = useStockStore.getState()
    const destinationItems = state.items.filter(
      (item) => item.branch === 'Pahoman' && item.name === 'White Rose',
    )
    expect(destinationItems).toHaveLength(1)
    expect(destinationItems[0].availableQty).toBe(10)
  })
})

describe('blocked stock-transfer transitions', () => {
  beforeEach(() => resetStore([makeStockItem()]))

  it('blocks requested → received so the transit stage cannot be skipped', () => {
    const transferId = requestTransfer()

    updateStatus(transferId, 'received')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('requested')
    expect(state.items).toHaveLength(1)
    expect(state.items[0].availableQty).toBe(90)
    expect(state.events).toHaveLength(0)
  })

  it('blocks in_transit → requested', () => {
    const transferId = requestTransfer()
    updateStatus(transferId, 'in_transit')

    updateStatus(transferId, 'requested')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('in_transit')
    expect(state.items[0].availableQty).toBe(90)
    expect(state.events).toHaveLength(1)
  })

  it('keeps received terminal and blocks received → cancelled stock duplication', () => {
    resetStore([
      makeStockItem({ id: 'stock_1', branch: 'Kedamaian', availableQty: 100 }),
      makeStockItem({ id: 'stock_2', branch: 'Pahoman', availableQty: 5 }),
    ])
    const transferId = requestTransfer()
    updateStatus(transferId, 'in_transit')
    updateStatus(transferId, 'received')

    updateStatus(transferId, 'cancelled')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('received')
    expect(
      state.items.find((item) => item.id === 'stock_1')?.availableQty,
    ).toBe(90)
    expect(
      state.items.find((item) => item.id === 'stock_2')?.availableQty,
    ).toBe(15)
    expect(state.events).toHaveLength(2)
  })

  it('keeps cancelled terminal and blocks cancelled → received stock duplication', () => {
    resetStore([
      makeStockItem({ id: 'stock_1', branch: 'Kedamaian', availableQty: 100 }),
      makeStockItem({ id: 'stock_2', branch: 'Pahoman', availableQty: 5 }),
    ])
    const transferId = requestTransfer()
    updateStatus(transferId, 'cancelled')

    updateStatus(transferId, 'received')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('cancelled')
    expect(
      state.items.find((item) => item.id === 'stock_1')?.availableQty,
    ).toBe(100)
    expect(
      state.items.find((item) => item.id === 'stock_2')?.availableQty,
    ).toBe(5)
    expect(state.events).toHaveLength(1)
  })

  it('does not advance when the source item is missing', () => {
    const transferId = requestTransfer()
    updateStatus(transferId, 'in_transit')
    useStockStore.setState((state) => ({
      items: state.items.filter((item) => item.id !== 'stock_1'),
    }))

    updateStatus(transferId, 'received')

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('in_transit')
    expect(state.items).toHaveLength(0)
    expect(state.events).toHaveLength(1)
  })

  it('does nothing for an unknown transfer id', () => {
    updateStatus('missing_transfer', 'in_transit')

    const state = useStockStore.getState()
    expect(state.transfers).toHaveLength(0)
    expect(state.items[0].availableQty).toBe(100)
    expect(state.events).toHaveLength(0)
  })
})
