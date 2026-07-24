import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { createFakeOrdersStore } from '../test/factories/storeHarness'
import { createOrderChangeRequestActions } from './ordersStoreChangeRequestActions'
import type { OrdersStoreGet, OrdersStoreSet } from './ordersStoreTypes'

const buildActions = (initialOrders: Parameters<typeof createFakeOrdersStore>[0]) => {
  const harness = createFakeOrdersStore(initialOrders)
  const actions = createOrderChangeRequestActions(
    harness.set as unknown as OrdersStoreSet,
    harness.get as unknown as OrdersStoreGet,
  )
  return { ...harness, ...actions }
}

describe('submitChangeRequest', () => {
  it('attaches a pending change request with the given reason/requester', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered' }),
    ])

    store.submitChangeRequest({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      type: 'edit',
      reason: 'Wrong flower color',
      actor: { name: 'Admin A', role: 'admin' },
    })

    const order = store.findOrder('A')
    expect(order?.pendingChangeRequest).toBeDefined()
    expect(order?.pendingChangeRequest?.type).toBe('edit')
    expect(order?.pendingChangeRequest?.reason).toBe('Wrong flower color')
    expect(order?.pendingChangeRequest?.requestedBy).toBe('Admin A')
  })

  it('refuses to overwrite an existing unresolved request on the same order', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        pendingChangeRequest: {
          id: 'chg_old',
          type: 'edit',
          reason: 'Old reason',
          requestedBy: 'Admin A',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    const submitted = store.submitChangeRequest({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      type: 'cancel',
      reason: 'Customer changed their mind',
      actor: { name: 'Admin B', role: 'admin' },
    })

    const order = store.findOrder('A')
    expect(submitted.allowed).toBe(false)
    expect(order?.pendingChangeRequest?.id).toBe('chg_old')
    expect(order?.pendingChangeRequest?.type).toBe('edit')
    expect(order?.pendingChangeRequest?.reason).toBe('Old reason')
  })

  it('leaves other orders untouched when submitting a request for a specific order', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered' }),
      makeOrder({ orderNumber: 'B', status: 'delivered' }),
    ])

    store.submitChangeRequest({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      type: 'edit',
      reason: 'Wrong item',
      actor: { name: 'Admin A', role: 'admin' },
    })

    expect(store.findOrder('B')?.pendingChangeRequest).toBeUndefined()
  })
})

describe('approveChangeRequest', () => {
  it('voids the order when approving a cancel request', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        pendingChangeRequest: {
          id: 'chg_1',
          type: 'cancel',
          reason: 'Duplicate order',
          requestedBy: 'Admin A',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    store.approveChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Approved after review' })

    const order = store.findOrder('A')
    expect(order?.status).toBe('cancelled')
    expect(order?.pendingChangeRequest).toBeUndefined()
  })

  it('unlocks (editUnlocked) rather than directly applying an edit request', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        pendingChangeRequest: {
          id: 'chg_2',
          type: 'edit',
          reason: 'Wrong address',
          requestedBy: 'Admin A',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    store.approveChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Approved after review' })

    const order = store.findOrder('A')
    expect(order?.editUnlocked).toBe(true)
    expect(order?.pendingChangeRequest).toBeUndefined()
    expect(order?.status).toBe('delivered')
  })

  it('does nothing if there is no pending change request on the order', () => {
    const store = buildActions([makeOrder({ orderNumber: 'A', status: 'delivered' })])
    store.approveChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Approved after review' })
    expect(store.findOrder('A')?.status).toBe('delivered')
  })


  it('rejects approval by a role that cannot resolve change requests', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        pendingChangeRequest: {
          id: 'chg_unauthorized',
          type: 'cancel',
          reason: 'Duplicate order',
          requestedBy: 'Admin A',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    const approved = store.approveChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Admin B', role:'admin' } })

    expect(approved.allowed).toBe(false)
    expect(store.findOrder('A')?.status).toBe('delivered')
    expect(store.findOrder('A')?.pendingChangeRequest?.id).toBe('chg_unauthorized')
  })

  it('rejects cancellation approval when the order is not finished', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'processing',
        pendingChangeRequest: {
          id: 'chg_active',
          type: 'cancel',
          reason: 'Customer changed their mind',
          requestedBy: 'Admin A',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    const approved = store.approveChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Approved after review' })

    expect(approved.allowed).toBe(false)
    expect(store.findOrder('A')?.status).toBe('processing')
    expect(store.findOrder('A')?.pendingChangeRequest?.id).toBe('chg_active')
  })
})

describe('rejectChangeRequest', () => {
  it('clears the pending request and leaves the order otherwise unchanged', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        financeVerified: true,
        pendingChangeRequest: {
          id: 'chg_1',
          type: 'edit',
          reason: 'Wrong item',
          requestedBy: 'Admin A',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    store.rejectChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Not enough justification' })

    const order = store.findOrder('A')
    expect(order?.pendingChangeRequest).toBeUndefined()
    expect(order?.status).toBe('delivered')
    expect(order?.financeVerified).toBe(true)
  })

  it('does nothing if there is no pending request', () => {
    const store = buildActions([makeOrder({ orderNumber: 'A', status: 'delivered' })])
    store.rejectChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Rejected after review' })
    expect(store.findOrder('A')?.pendingChangeRequest).toBeUndefined()
  })

  it('also clears a rejected cancel-type request, leaving the order active', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        pendingChangeRequest: {
          id: 'chg_1',
          type: 'cancel',
          reason: 'Wants a refund instead',
          requestedBy: 'Admin A',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ])

    store.rejectChangeRequest({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Rejected after review' })

    const order = store.findOrder('A')
    expect(order?.pendingChangeRequest).toBeUndefined()
    expect(order?.status).toBe('delivered')
  })
})
