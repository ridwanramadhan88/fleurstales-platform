import { afterEach, describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import type { OrderStatus } from '../types/orders'
import type { UserRole } from './userStore'
import { useOrdersStore } from './ordersStore'

/**
 * These tests exercise the real `useOrdersStore` (backed by localStorage via
 * `apiStorage`, which jsdom provides) rather than a fake harness, since
 * `updateOrderStatus` and the edit/unlock finalize path aren't extracted as
 * standalone pure functions the way the Finance/change-request actions are.
 * Each test seeds `orders` directly via `setState` and restores the store
 * afterward so tests stay isolated from one another and from the seed data.
 */

const originalState = useOrdersStore.getState()

afterEach(() => {
  useOrdersStore.setState({
    orders: originalState.orders,
    lastSequence: originalState.lastSequence,
  })
})

const seed = (orders: ReturnType<typeof makeOrder>[]) => {
  useOrdersStore.setState((state) => ({ ...state, orders }))
}

const updateStatus = (
  orderNumber: string,
  status: OrderStatus,
  options: {
    role?: UserRole
    name?: string
    source?: 'workflow' | 'edit' | 'undo'
    completedAtOverride?: string
    undoOf?: {
      previousStatus: OrderStatus
      nextStatus: OrderStatus
      originalSource: 'workflow' | 'edit'
    }
  } = {},
) =>
  useOrdersStore.getState().updateOrderStatus({
    orderNumber,
    status,
    actor: {
      name: options.name ?? 'Admin A',
      role: options.role ?? 'admin',
    },
    expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === orderNumber)?.revision ?? 1,
    source: options.source ?? 'workflow',
    completedAtOverride: options.completedAtOverride,
    undoOf: options.undoOf,
  })

describe('updateOrderStatus', () => {
  it('blocks Confirmed to Processing when no florist is assigned', () => {
    seed([
      makeOrder({ orderNumber: 'A', status: 'confirmed' }),
      makeOrder({ orderNumber: 'B', status: 'confirmed' }),
    ])

    const result = updateStatus('A', 'processing')

    expect(result).toMatchObject({ allowed: false, reason: 'Assign a scheduled florist before starting Processing.' })
    const orders = useOrdersStore.getState().orders
    expect(orders.find((o) => o.orderNumber === 'A')?.status).toBe('confirmed')
    expect(orders.find((o) => o.orderNumber === 'B')?.status).toBe('confirmed')
  })

  it('allows Admin to advance Processing directly to Ready', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'processing' })])

    const result = updateStatus('A', 'ready')

    expect(result).toMatchObject({ allowed: true, order: { status: 'ready' } })
    expect(useOrdersStore.getState().orders[0].status).toBe('ready')
  })

  it('stamps completedAt when entering an actual completed status (delivered/picked_up)', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'delivering', fulfillment: 'delivery', completedAt: undefined })])

    updateStatus('A', 'delivered')

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.completedAt).toBeDefined()
  })



  it('does not stamp completedAt when an order is only ready', () => {
    seed([makeOrder({ orderNumber: 'READY', status: 'processing', fulfillment: 'pickup', completedAt: undefined })])

    updateStatus('READY', 'ready')

    expect(useOrdersStore.getState().orders.find((order) => order.orderNumber === 'READY')?.completedAt).toBeUndefined()
  })

  it('records actual pickup separately from the requested pickup slot', () => {
    seed([makeOrder({
      orderNumber: 'PICKUP',
      status: 'ready',
      fulfillment: 'pickup',
      scheduleDate: '2026-07-30',
      scheduleTime: '10:45',
      requestedPickupDate: '2026-07-30',
      requestedPickupTime: '10:45',
      actualPickedUpAt: undefined,
    })])

    updateStatus('PICKUP', 'picked_up')

    const order = useOrdersStore.getState().orders.find((item) => item.orderNumber === 'PICKUP')
    expect(order?.requestedPickupDate).toBe('2026-07-30')
    expect(order?.requestedPickupTime).toBe('10:45')
    expect(order?.actualPickedUpAt).toBeDefined()
  })

  it('does not stamp completedAt for a non-finished status', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'confirmed', completedAt: undefined })])

    updateStatus('A', 'processing')

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.completedAt).toBeUndefined()
  })

  it('uses an explicit completedAtOverride instead of re-stamping to now', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'delivering', fulfillment: 'delivery' })])
    const original = '2026-01-01T08:00:00.000Z'

    updateStatus('A', 'delivered', { completedAtOverride: original })

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.completedAt).toBe(original)
  })

  it('is a no-op for an order number that does not exist', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'processing' })])
    updateStatus('MISSING', 'delivered')
    expect(useOrdersStore.getState().orders).toHaveLength(1)
    expect(useOrdersStore.getState().orders[0].status).toBe('processing')
  })


  it('rejects a forward jump and leaves the persisted order unchanged', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'processing', fulfillment: 'delivery' })])

    const result = updateStatus('A', 'delivered')

    expect(result).toMatchObject({ allowed: false, code: 'ILLEGAL_TRANSITION' })
    expect(useOrdersStore.getState().orders[0].status).toBe('processing')
  })

  it('rejects reopening a terminal order through a normal status write', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'cancelled' })])

    const result = updateStatus('A', 'processing')

    expect(result).toMatchObject({ allowed: false, code: 'TERMINAL_STATUS' })
    expect(useOrdersStore.getState().orders[0].status).toBe('cancelled')
  })
})

describe('finalizeUnlockedEdit (edit flow regression)', () => {
  it('clears editUnlocked after the edit is saved', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'delivered', editUnlocked: true })])

    useOrdersStore.getState().finalizeUnlockedEdit({ orderNumber:'A', expectedRevision:useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' } })

    expect(
      useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')?.editUnlocked,
    ).toBe(false)
  })

  it('sends a previously-verified order back to pending re-verification', () => {
    seed([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        editUnlocked: true,
        financeVerified: true,
        financeVerifiedBy: 'Finance A',
      }),
    ])

    useOrdersStore.getState().finalizeUnlockedEdit({ orderNumber:'A', expectedRevision:useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' } })

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.financeVerified).toBe(false)
  })
})

describe('verify -> edit request -> approve -> finalize (full change-request lifecycle regression)', () => {
  it('re-locks and drops back to pending verification after a full edit-request cycle', () => {
    seed([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        financeVerified: true,
        financeVerifiedBy: 'Finance A',
      }),
    ])

    // Admin submits an edit request on the verified, locked order.
    useOrdersStore.getState().submitChangeRequest({
      orderNumber: 'A',
      expectedRevision: useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1,
      type: 'edit',
      reason: 'Wrong greeting card message',
      actor: { name: 'Admin A', role: 'admin' },
    })
    expect(
      useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')?.pendingChangeRequest,
    ).toBeDefined()

    // Finance approves — order is unlocked for editing, not yet changed.
    useOrdersStore.getState().approveChangeRequest({ orderNumber:'A', expectedRevision:useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Approved after review' })
    let order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.editUnlocked).toBe(true)
    expect(order?.financeVerified).toBe(true) // still true until the edit is actually saved

    // Admin saves the edit through the normal edit form -> finalize runs.
    useOrdersStore.getState().finalizeUnlockedEdit({ orderNumber:'A', expectedRevision:useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' } })
    order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.editUnlocked).toBe(false)
    expect(order?.financeVerified).toBe(false)
  })

  it('voids the order directly on a full cancel-request lifecycle', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'picked_up', financeVerified: true })])

    useOrdersStore.getState().submitChangeRequest({
      orderNumber: 'A',
      expectedRevision: useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1,
      type: 'cancel',
      reason: 'Customer refused delivery',
      actor: { name: 'Admin A', role: 'admin' },
    })
    useOrdersStore.getState().approveChangeRequest({ orderNumber:'A', expectedRevision:useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1, actor:{ name:'Owner A', role:'owner' }, note:'Owner approved after review' })

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.status).toBe('cancelled')
    expect(order?.pendingChangeRequest).toBeUndefined()
  })

  it('leaves the order untouched when Finance rejects the change request', () => {
    seed([makeOrder({ orderNumber: 'A', status: 'delivered', financeVerified: true })])

    useOrdersStore.getState().submitChangeRequest({
      orderNumber: 'A',
      expectedRevision: useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1,
      type: 'edit',
      reason: 'Wrong flowers',
      actor: { name: 'Admin A', role: 'admin' },
    })
    useOrdersStore.getState().rejectChangeRequest({ orderNumber:'A', expectedRevision:useOrdersStore.getState().orders.find((o)=>o.orderNumber==='A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Insufficient evidence' })

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.pendingChangeRequest).toBeUndefined()
    expect(order?.editUnlocked).toBeFalsy()
    expect(order?.financeVerified).toBe(true)
    expect(order?.status).toBe('delivered')
  })
})
