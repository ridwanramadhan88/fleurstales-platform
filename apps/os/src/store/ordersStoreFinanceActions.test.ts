import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { createFakeOrdersStore } from '../test/factories/storeHarness'
import { createOrderFinanceActions } from './ordersStoreFinanceActions'
import type { OrdersStoreSet } from './ordersStoreTypes'

const buildActions = (initialOrders: Parameters<typeof createFakeOrdersStore>[0]) => {
  const harness = createFakeOrdersStore(initialOrders)
  const actions = createOrderFinanceActions(harness.set as unknown as OrdersStoreSet, harness.get as any)
  return { ...harness, ...actions }
}

describe('legacy Finance order-decision actions', () => {
  it('does not allow Finance to re-verify a completed paid order', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', paymentStatus: 'paid', financeVerified: false }),
    ])

    const result = store.verifyOrderFinance({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { name: 'Finance A', role: 'finance' },
    })

    expect(result.allowed).toBe(false)
    expect(store.findOrder('A')?.financeVerified).toBe(false)
    expect(store.findOrder('A')?.financeVerifiedBy).toBeUndefined()
  })

  it('does not allow Owner to use the retired Finance verification command', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'picked_up', paymentStatus: 'paid', financeVerified: false }),
    ])

    const result = store.verifyOrderFinance({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { name: 'Owner A', role: 'owner' },
    })

    expect(result.allowed).toBe(false)
    expect(store.findOrder('A')?.financeVerified).toBe(false)
  })

  it('does not create legacy rejected or review states', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', paymentStatus: 'paid', financeVerified: false }),
    ])
    const revision = store.findOrder('A')?.revision ?? 1

    expect(store.rejectOrderFinance({
      orderNumber: 'A', expectedRevision: revision,
      actor: { name: 'Finance A', role: 'finance' }, note: 'Missing receipt',
    }).allowed).toBe(false)
    expect(store.markOrderForFinanceReview({
      orderNumber: 'A', expectedRevision: revision,
      actor: { name: 'Finance A', role: 'finance' }, note: 'Review',
    }).allowed).toBe(false)

    expect(store.findOrder('A')?.financeVerificationStatus).toBeUndefined()
    expect(store.findOrder('A')?.financeVerificationNote).toBeUndefined()
  })

  it('leaves a pre-existing legacy verification stamp unchanged', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        paymentStatus: 'paid',
        financeVerified: true,
        financeVerifiedBy: 'Legacy Finance',
        financeVerifiedAt: '2026-01-01T00:00:00.000Z',
      }),
    ])

    const result = store.verifyOrderFinance({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { name: 'Finance B', role: 'finance' },
    })

    expect(result.allowed).toBe(false)
    expect(store.findOrder('A')?.financeVerifiedBy).toBe('Legacy Finance')
    expect(store.findOrder('A')?.financeVerifiedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('finished-order edit governance', () => {
  it('re-locks an approved unlocked edit without needing Finance verification', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', editUnlocked: true }),
    ])

    const result = store.finalizeUnlockedEdit({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { employeeId: 'admin-a', name: 'Admin A', role: 'admin', branchId: 'Kedamaian' },
    })

    expect(result.allowed).toBe(true)
    expect(store.findOrder('A')?.editUnlocked).toBe(false)
  })

  it('does nothing when the order is not edit-unlocked', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', editUnlocked: false }),
    ])

    const result = store.finalizeUnlockedEdit({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { employeeId: 'admin-a', name: 'Admin A', role: 'admin', branchId: 'Kedamaian' },
    })

    expect(result.allowed).toBe(false)
    expect(store.findOrder('A')?.editUnlocked).toBe(false)
  })
})