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

const paidCashOrder = (patch: Parameters<typeof makeOrder>[0] = {}) => makeOrder({
  orderNumber: 'A',
  status: 'processing',
  paymentStatus: 'paid',
  paymentMethod: 'cash',
  totalIdr: 100_000,
  paidAmountIdr: 100_000,
  financeVerified: false,
  ...patch,
})

describe('Finance order reconciliation actions', () => {
  it('allows Finance to reconcile an Admin-confirmed paid order before fulfillment finishes', () => {
    const store = buildActions([paidCashOrder()])

    const result = store.verifyOrderFinance({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { name: 'Finance A', role: 'finance' },
    })

    expect(result.allowed).toBe(true)
    expect(store.findOrder('A')?.financeVerified).toBe(true)
    expect(store.findOrder('A')?.financeVerifiedBy).toBe('Finance A')
  })

  it('does not allow Owner to use the Finance reconciliation capability', () => {
    const store = buildActions([paidCashOrder({ status: 'picked_up' })])

    const result = store.verifyOrderFinance({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { name: 'Owner A', role: 'owner' },
    })

    expect(result.allowed).toBe(false)
    expect(store.findOrder('A')?.financeVerified).toBe(false)
  })

  it('allows Finance to return a paid order for correction with a reason', () => {
    const store = buildActions([paidCashOrder()])

    const result = store.rejectOrderFinance({
      orderNumber: 'A',
      expectedRevision: store.findOrder('A')?.revision ?? 1,
      actor: { name: 'Finance A', role: 'finance' },
      note: 'Missing receipt detail',
    })

    expect(result.allowed).toBe(true)
    expect(store.findOrder('A')?.financeVerificationStatus).toBe('rejected')
    expect(store.findOrder('A')?.financeVerificationNote).toBe('Missing receipt detail')
    expect(store.findOrder('A')?.editUnlocked).toBe(true)
  })

  it('leaves a pre-existing verification stamp unchanged', () => {
    const store = buildActions([
      paidCashOrder({
        status: 'delivered',
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
  it('re-locks an approved unlocked edit without needing another workflow status change', () => {
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
