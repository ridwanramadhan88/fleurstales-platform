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

describe('verifyOrderFinance', () => {
  it('marks the matching order as finance-verified with actor stamped', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', paymentStatus: 'paid', financeVerified: false }),
      makeOrder({ orderNumber: 'B', status: 'delivered', paymentStatus: 'paid', financeVerified: false }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    expect(store.findOrder('A')?.financeVerified).toBe(true)
    expect(store.findOrder('A')?.financeVerifiedBy).toBe('Finance A')
    expect(store.findOrder('A')?.financeVerifiedAt).toBeDefined()
    // Untouched sibling order stays unverified.
    expect(store.findOrder('B')?.financeVerified).toBe(false)
  })

  it('is a no-op (stays verified, unchanged) if the order is already verified', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        paymentStatus: 'paid',
        financeVerified: true,
        financeVerifiedBy: 'Finance A',
        financeVerifiedAt: '2026-01-01T00:00:00.000Z',
      }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance B', role:'finance' } })

    expect(store.findOrder('A')?.financeVerifiedBy).toBe('Finance A')
    expect(store.findOrder('A')?.financeVerifiedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('does nothing when the order number does not exist', () => {
    const store = buildActions([makeOrder({ orderNumber: 'A' })])
    store.verifyOrderFinance({ orderNumber:'DOES_NOT_EXIST', expectedRevision:store.findOrder('DOES_NOT_EXIST')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })
    expect(store.getOrders()).toHaveLength(1)
    expect(store.findOrder('A')?.financeVerified).toBeFalsy()
  })

  // --- gap-log §8: verifyOrderFinance must re-check eligibility itself,
  // not rely on the queue/UI having already filtered the order out. ---

  it('verifies a completed (finished), paid, eligible order', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', paymentStatus: 'paid', financeVerified: false }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    expect(store.findOrder('A')?.financeVerified).toBe(true)
  })

  it('does not verify a processing (not yet finished) order', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'processing', paymentStatus: 'paid', financeVerified: false }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    const order = store.findOrder('A')
    expect(order?.financeVerified).toBe(false)
    expect(order?.financeVerifiedBy).toBeUndefined()
    expect(order?.financeVerifiedAt).toBeUndefined()
  })

  it('does not verify a draft-stage (pending_verification) order', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'pending_verification',
        paymentStatus: 'unpaid',
        financeVerified: false,
      }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    expect(store.findOrder('A')?.financeVerified).toBe(false)
  })

  it('does not verify a cancelled order', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'cancelled', paymentStatus: 'paid', financeVerified: false }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    expect(store.findOrder('A')?.financeVerified).toBe(false)
  })

  it('does not verify a voided (failed) order', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'failed', paymentStatus: 'paid', financeVerified: false }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    expect(store.findOrder('A')?.financeVerified).toBe(false)
  })

  it('does not verify an already-verified order again (rejects re-verification)', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        paymentStatus: 'paid',
        financeVerified: true,
        financeVerifiedBy: 'Finance A',
        financeVerifiedAt: '2026-01-01T00:00:00.000Z',
      }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance B', role:'finance' } })

    const order = store.findOrder('A')
    expect(order?.financeVerifiedBy).toBe('Finance A')
    expect(order?.financeVerifiedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('does not verify an order with invalid payment information (paidAmountIdr exceeds total)', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        paymentStatus: 'paid',
        totalIdr: 100_000,
        paidAmountIdr: 999_999,
        financeVerified: false,
      }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    expect(store.findOrder('A')?.financeVerified).toBe(false)
  })

  it('does not verify an order without permission (role lacks access)', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', paymentStatus: 'paid', financeVerified: false }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' } })

    expect(store.findOrder('A')?.financeVerified).toBe(false)
  })

  it('rejected verification does not alter revenue-relevant fields', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'processing',
        paymentStatus: 'unpaid',
        totalIdr: 500_000,
        financeVerified: false,
      }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    const order = store.findOrder('A')
    expect(order?.totalIdr).toBe(500_000)
    expect(order?.financeVerified).toBe(false)
  })

  it('rejected verification does not lock the order (editUnlocked untouched, no verified stamp)', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'processing',
        paymentStatus: 'unpaid',
        editUnlocked: false,
        financeVerified: false,
      }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' } })

    const order = store.findOrder('A')
    expect(order?.editUnlocked).toBe(false)
    expect(order?.financeVerified).toBe(false)
    expect(order?.financeVerifiedBy).toBeUndefined()
  })

  it('a valid verification moves the order from unverified to verified (pending to confirmed revenue)', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'picked_up',
        paymentStatus: 'paid',
        totalIdr: 250_000,
        financeVerified: false,
      }),
    ])

    store.verifyOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'owner' } })

    const order = store.findOrder('A')
    expect(order?.financeVerified).toBe(true)
    expect(order?.totalIdr).toBe(250_000)
  })
})

describe('rejectOrderFinance', () => {
  it('flags an unverified order as rejected with actor/note/timestamp', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', financeVerified: false }),
    ])

    store.rejectOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Missing receipt' })

    const order = store.findOrder('A')
    expect(order?.financeVerificationStatus).toBe('rejected')
    expect(order?.financeVerificationNote).toBe('Missing receipt')
    expect(order?.financeVerified).toBe(false)
    expect(order?.editUnlocked).toBe(true)
  })

  it('does not reject an order that is already verified', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', financeVerified: true }),
    ])

    store.rejectOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Too late' })

    expect(store.findOrder('A')?.financeVerificationStatus).toBeUndefined()
  })

  it('requires a rejection reason', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', financeVerified: false }),
    ])

    store.rejectOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:undefined })

    expect(store.findOrder('A')?.financeVerificationStatus).toBeUndefined()
    expect(store.findOrder('A')?.financeVerificationNote).toBeUndefined()
  })
})

describe('markOrderForFinanceReview', () => {
  it('flags an unverified order for review with actor/note/timestamp', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'picked_up', financeVerified: false }),
    ])

    store.markOrderForFinanceReview({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Check discount code' })

    const order = store.findOrder('A')
    expect(order?.financeVerificationStatus).toBe('review')
    expect(order?.financeVerificationNote).toBe('Check discount code')
  })

  it('does not mark an already-verified order for review', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'picked_up', financeVerified: true }),
    ])

    store.markOrderForFinanceReview({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'note' })

    expect(store.findOrder('A')?.financeVerificationStatus).toBeUndefined()
  })

  it('allows an optional review note', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'picked_up', financeVerified: false }),
    ])

    store.markOrderForFinanceReview({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:undefined })

    expect(store.findOrder('A')?.financeVerificationStatus).toBe('review')
    expect(store.findOrder('A')?.financeVerificationNote).toBeUndefined()
  })
})


describe('shared Finance decision guard', () => {
  it('blocks rejection by a role without Finance decision permission', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', financeVerified: false }),
    ])

    store.rejectOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' }, note:'Missing receipt' })

    expect(store.findOrder('A')?.financeVerificationStatus).toBeUndefined()
  })

  it('blocks review marking before the order is finished', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'processing', financeVerified: false }),
    ])

    store.markOrderForFinanceReview({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Check totals' })

    expect(store.findOrder('A')?.financeVerificationStatus).toBeUndefined()
  })

  it('blocks rejection when payment information is invalid', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        totalIdr: 100_000,
        paidAmountIdr: 200_000,
        financeVerified: false,
      }),
    ])

    store.rejectOrderFinance({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Finance A', role:'finance' }, note:'Invalid payment' })

    expect(store.findOrder('A')?.financeVerificationStatus).toBeUndefined()
  })

  it('allows Owner to mark a finished valid order for review', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'picked_up', financeVerified: false }),
    ])

    store.markOrderForFinanceReview({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Owner A', role:'owner' }, note:'Check discount' })

    expect(store.findOrder('A')?.financeVerificationStatus).toBe('review')
  })
})

describe('finalizeUnlockedEdit', () => {
  it('re-locks the order by clearing editUnlocked', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', editUnlocked: true }),
    ])

    store.finalizeUnlockedEdit({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' } })

    expect(store.findOrder('A')?.editUnlocked).toBe(false)
  })

  it('drops financeVerified back to false when a previously-verified order is edited', () => {
    const store = buildActions([
      makeOrder({
        orderNumber: 'A',
        status: 'delivered',
        editUnlocked: true,
        financeVerified: true,
        financeVerifiedBy: 'Finance A',
      }),
    ])

    store.finalizeUnlockedEdit({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' } })

    const order = store.findOrder('A')
    expect(order?.financeVerified).toBe(false)
    expect(order?.financeVerifiedBy).toBeUndefined()
  })

  it('is a no-op for an order that is not currently edit-unlocked', () => {
    const store = buildActions([
      makeOrder({ orderNumber: 'A', status: 'delivered', editUnlocked: false, financeVerified: true }),
    ])

    store.finalizeUnlockedEdit({ orderNumber:'A', expectedRevision:store.findOrder('A')?.revision ?? 1, actor:{ name:'Admin A', role:'admin' } })

    const order = store.findOrder('A')
    expect(order?.financeVerified).toBe(true)
  })
})


describe('resubmitOrderFinance', () => {
  const makeRejected = () => makeOrder({
    orderNumber: 'A',
    status: 'delivered',
    paymentStatus: 'paid',
    financeVerified: false,
    financeVerificationStatus: 'rejected',
    financeVerificationNote: 'Wrong receipt',
    financeVerificationActor: 'Finance A',
    financeVerificationAt: '2026-07-17T09:00:00.000Z',
    editUnlocked: true,
    revision: 4,
  })

  it.each([
    { name: 'Admin A', role: 'admin' as const },
    { name: 'Owner A', role: 'owner' as const },
  ])('allows $role to return a corrected order to the Finance queue', (actor) => {
    const store = buildActions([makeRejected()])
    const result = store.resubmitOrderFinance({
      orderNumber: 'A',
      expectedRevision: 4,
      actor,
      note: 'Corrected receipt uploaded',
    })

    expect(result.allowed).toBe(true)
    const order = store.findOrder('A')
    expect(order).toMatchObject({
      financeVerified: false,
      financeVerificationStatus: undefined,
      financeVerificationNote: undefined,
      financeVerificationActor: undefined,
      financeVerificationAt: undefined,
      editUnlocked: false,
      financeResubmittedBy: actor.name,
      financeResubmissionNote: 'Corrected receipt uploaded',
      financeSubmissionRevision: 4,
      revision: 5,
    })
    expect(order?.financeResubmittedAt).toBeDefined()
  })

  it.each([
    { name: 'Finance A', role: 'finance' as const },
    { name: 'HR A', role: 'hr' as const },
    { name: 'Florist A', role: 'florist' as const },
  ])('blocks $role from resubmitting', (actor) => {
    const store = buildActions([makeRejected()])
    const result = store.resubmitOrderFinance({
      orderNumber: 'A',
      expectedRevision: 4,
      actor,
      note: 'Corrected receipt uploaded',
    })

    expect(result.allowed).toBe(false)
    expect(store.findOrder('A')?.financeVerificationStatus).toBe('rejected')
  })

  it('rejects non-rejected, unfinished, and note-less resubmissions', () => {
    const notRejected = buildActions([makeOrder({ orderNumber: 'A', status: 'delivered', revision: 4 })])
    expect(notRejected.resubmitOrderFinance({
      orderNumber: 'A', expectedRevision: 4, actor: { name: 'Admin A', role: 'admin' }, note: 'Fixed',
    }).allowed).toBe(false)

    const unfinished = buildActions([makeOrder({ ...makeRejected(), status: 'processing' })])
    expect(unfinished.resubmitOrderFinance({
      orderNumber: 'A', expectedRevision: 4, actor: { name: 'Admin A', role: 'admin' }, note: 'Fixed',
    }).allowed).toBe(false)

    const missingNote = buildActions([makeRejected()])
    expect(missingNote.resubmitOrderFinance({
      orderNumber: 'A', expectedRevision: 4, actor: { name: 'Admin A', role: 'admin' }, note: '   ',
    }).allowed).toBe(false)
  })

  it('fails safely on an outdated expected revision', () => {
    const store = buildActions([makeRejected()])
    const result = store.resubmitOrderFinance({
      orderNumber: 'A',
      expectedRevision: 3,
      actor: { name: 'Admin A', role: 'admin' },
      note: 'Corrected receipt uploaded',
    })

    expect(result).toMatchObject({ allowed: false, code: 'REVISION_CONFLICT' })
    expect(store.findOrder('A')?.financeVerificationStatus).toBe('rejected')
    expect(store.findOrder('A')?.revision).toBe(4)
  })
})
