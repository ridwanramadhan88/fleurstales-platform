import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { transitionOrderStatus } from './orderStatusTransitionDomain'

const actor = { name: 'Admin A', role: 'admin' as const }
const at = '2026-07-10T01:00:00.000Z'

const run = (
  overrides: Partial<Parameters<typeof transitionOrderStatus>[0]> = {},
) =>
  transitionOrderStatus({
    order: makeOrder({ status: 'processing', fulfillment: 'delivery' }),
    nextStatus: 'ready',
    actor,
    source: 'workflow',
    canEditOrders: true,
    transitionedAt: at,
    ...overrides,
  })

describe('transitionOrderStatus — fulfillment pipeline', () => {
  it.each([
    ['pending_verification', 'confirmed'],
    ['confirmed', 'processing'],
    ['processing', 'ready'],
    ['ready', 'delivering'],
    ['delivering', 'delivered'],
  ] as const)('allows delivery %s → %s', (from, to) => {
    const result = run({
      order: makeOrder({ status: from, fulfillment: 'delivery' }),
      nextStatus: to,
    })
    expect(result.allowed).toBe(true)
  })

  it.each([
    ['pending_verification', 'confirmed'],
    ['confirmed', 'processing'],
    ['processing', 'ready'],
    ['ready', 'picked_up'],
  ] as const)('allows pickup %s → %s', (from, to) => {
    const result = run({
      order: makeOrder({ status: from, fulfillment: 'pickup' }),
      nextStatus: to,
    })
    expect(result.allowed).toBe(true)
  })

  it('allows Admin to advance processing directly to ready', () => {
    const result = run({
      order: makeOrder({ status: 'processing', fulfillment: 'delivery' }),
      nextStatus: 'ready',
    })
    expect(result).toMatchObject({ allowed: true, order: { status: 'ready' } })
  })

  it('blocks skipped stages', () => {
    const result = run({
      order: makeOrder({ status: 'processing', fulfillment: 'delivery' }),
      nextStatus: 'delivered',
    })
    expect(result).toMatchObject({ allowed: false, code: 'ILLEGAL_TRANSITION' })
  })

  it('blocks fulfillment-incompatible statuses', () => {
    const result = run({
      order: makeOrder({ status: 'ready', fulfillment: 'pickup' }),
      nextStatus: 'delivering',
    })
    expect(result).toMatchObject({
      allowed: false,
      code: 'INVALID_FULFILLMENT_STATUS',
    })
  })

  it('blocks same-state writes', () => {
    const result = run({ nextStatus: 'processing' })
    expect(result).toMatchObject({ allowed: false, code: 'SAME_STATUS' })
  })
})

describe('transitionOrderStatus — exception and lock rules', () => {
  it('allows cancellation while an order is active', () => {
    expect(run({ nextStatus: 'cancelled' }).allowed).toBe(true)
  })

  it('allows failed while fulfillment is active', () => {
    expect(run({ nextStatus: 'failed' }).allowed).toBe(true)
  })

  it('makes cancelled and failed states immutable outside exact Undo', () => {
    const result = run({
      order: makeOrder({ status: 'cancelled' }),
      nextStatus: 'processing',
    })
    expect(result).toMatchObject({ allowed: false, code: 'TERMINAL_STATUS' })
  })

  it('blocks Admin from changing a finished locked order', () => {
    const result = run({
      order: makeOrder({ status: 'delivered', fulfillment: 'delivery' }),
      nextStatus: 'cancelled',
    })
    expect(result).toMatchObject({ allowed: false, code: 'ORDER_LOCKED' })
  })

  it('allows Finance to directly cancel a finished locked order', () => {
    const result = run({
      order: makeOrder({ status: 'delivered', fulfillment: 'delivery' }),
      nextStatus: 'cancelled',
      actor: { name: 'Finance A', role: 'finance' },
      canEditOrders: false,
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks roles without Orders edit permission', () => {
    const result = run({ canEditOrders: false })
    expect(result).toMatchObject({ allowed: false, code: 'NOT_PERMITTED' })
  })
})

describe('transitionOrderStatus — cancellation approval', () => {
  const request = {
    id: 'chg_1',
    type: 'cancel' as const,
    reason: 'Customer request',
    requestedBy: 'Admin A',
    requestedAt: at,
  }

  it('routes a finished cancellation request through the same command and clears it', () => {
    const result = run({
      order: makeOrder({
        status: 'delivered',
        fulfillment: 'delivery',
        pendingChangeRequest: request,
      }),
      nextStatus: 'cancelled',
      actor: { name: 'Owner A', role: 'owner' },
      source: 'change_request_approval',
    })

    expect(result.allowed).toBe(true)
    if (result.allowed) {
      expect(result.order.status).toBe('cancelled')
      expect(result.order.pendingChangeRequest).toBeUndefined()
    }
  })

  it('blocks approval by a non-resolver role', () => {
    const result = run({
      order: makeOrder({ status: 'delivered', pendingChangeRequest: request }),
      nextStatus: 'cancelled',
      source: 'change_request_approval',
    })
    expect(result).toMatchObject({ allowed: false, code: 'NOT_PERMITTED' })
  })

  it('blocks approval when there is no pending cancellation request', () => {
    const result = run({
      order: makeOrder({ status: 'delivered' }),
      nextStatus: 'cancelled',
      actor: { name: 'Finance A', role: 'finance' },
      source: 'change_request_approval',
    })
    expect(result).toMatchObject({
      allowed: false,
      code: 'CHANGE_REQUEST_REQUIRED',
    })
  })
})

describe('transitionOrderStatus — exact Undo', () => {
  it('reverses the exact current transition and restores completedAt', () => {
    const originalCompletedAt = '2026-07-09T12:00:00.000Z'
    const result = run({
      order: makeOrder({ status: 'delivering', completedAt: at }),
      nextStatus: 'ready',
      source: 'undo',
      completedAtOverride: originalCompletedAt,
      undoOf: {
        previousStatus: 'ready',
        nextStatus: 'delivering',
        originalSource: 'workflow',
      },
    })

    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.order.completedAt).toBe(originalCompletedAt)
  })

  it('can reverse an active-order cancellation only when it matches the original transition', () => {
    const result = run({
      order: makeOrder({ status: 'cancelled' }),
      nextStatus: 'processing',
      source: 'undo',
      undoOf: {
        previousStatus: 'processing',
        nextStatus: 'cancelled',
        originalSource: 'workflow',
      },
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks stale or fabricated Undo descriptors', () => {
    const result = run({
      order: makeOrder({ status: 'delivered' }),
      nextStatus: 'processing',
      source: 'undo',
      undoOf: {
        previousStatus: 'processing',
        nextStatus: 'ready',
        originalSource: 'workflow',
      },
    })
    expect(result).toMatchObject({ allowed: false, code: 'INVALID_UNDO' })
  })
})

describe('transitionOrderStatus — timestamps', () => {
  it('stamps the authoritative transition time on delivered/picked_up', () => {
    const result = run({ order: makeOrder({ status: 'delivering', fulfillment: 'delivery' }), nextStatus: 'delivered' })
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.order.completedAt).toBe(at)
  })


  it('does not treat ready as the completed business event', () => {
    const result = run()
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.order.completedAt).toBeUndefined()
  })

  it('does not stamp an ordinary in-progress status', () => {
    const result = run({
      order: makeOrder({ status: 'confirmed', completedAt: undefined }),
      nextStatus: 'processing',
    })
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.order.completedAt).toBeUndefined()
  })
})
