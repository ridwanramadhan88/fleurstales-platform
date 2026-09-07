import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import type { OrderChangeRequest } from '../types/orders'
import {
  applyApprovedEditChangeRequest,
  applyFinanceResubmission,
  applyFinanceVerification,
  applyRejectedChangeRequest,
  applySubmittedChangeRequest,
  applyUnlockedEditFinalization,
  canCancelOrder,
  canDirectlyEditOrder,
  canEditVerifiedOrder,
  canResolveChangeRequest,
  canResubmitOrderFinance,
  canSubmitChangeRequest,
  canVerifyOrder,
  canVerifyOrderFinance,
  createOrderChangeRequest,
  isMarkedForFinanceReview,
  isOrderFinished,
  isOrderLocked,
  isPendingFinanceVerification,
  isRejectedByFinance,
  isTerminalIssueOrder,
  isTerminalIssueStatus,
  isWorkflowHappyPathStatus,
} from './orderWorkflowDomain'

const paidCashOrder = (patch: Parameters<typeof makeOrder>[0] = {}) => makeOrder({
  paymentStatus: 'paid',
  paymentMethod: 'cash',
  totalIdr: 100_000,
  paidAmountIdr: 100_000,
  financeVerified: false,
  ...patch,
})

describe('status classification', () => {
  it('flags cancelled and failed as terminal issue statuses', () => {
    expect(isTerminalIssueStatus('cancelled')).toBe(true)
    expect(isTerminalIssueStatus('failed')).toBe(true)
    expect(isTerminalIssueStatus('delivered')).toBe(false)
  })

  it('derives isTerminalIssueOrder from the order status', () => {
    expect(isTerminalIssueOrder(makeOrder({ status: 'cancelled' }))).toBe(true)
    expect(isTerminalIssueOrder(makeOrder({ status: 'confirmed' }))).toBe(false)
  })

  it('treats every non-exception status as the happy path', () => {
    expect(isWorkflowHappyPathStatus('processing')).toBe(true)
    expect(isWorkflowHappyPathStatus('delivered')).toBe(true)
    expect(isWorkflowHappyPathStatus('cancelled')).toBe(false)
    expect(isWorkflowHappyPathStatus('failed')).toBe(false)
  })
})

describe('canCancelOrder', () => {
  it.each([
    ['pending_verification', true],
    ['confirmed', true],
    ['processing', true],
    ['ready', true],
    ['delivering', true],
    ['delivered', false],
    ['picked_up', false],
    ['cancelled', false],
    ['failed', false],
  ] as const)('status=%s -> cancellable=%s', (status, expected) => {
    expect(canCancelOrder(makeOrder({ status }))).toBe(expected)
  })
})

describe('role capability checks', () => {
  it('recognizes finance and owner as Finance decision roles at the pure domain layer', () => {
    expect(canVerifyOrder('finance')).toBe(true)
    expect(canVerifyOrder('owner')).toBe(true)
    expect(canVerifyOrder('admin')).toBe(false)
    expect(canVerifyOrder('hr')).toBe(false)
    expect(canVerifyOrder('florist')).toBe(false)
  })

  it('does not allow any role to directly edit a verified/locked order', () => {
    expect(canEditVerifiedOrder('finance')).toBe(false)
    expect(canEditVerifiedOrder('owner')).toBe(false)
    expect(canEditVerifiedOrder('admin')).toBe(false)
  })

  it('only admin and owner can submit change requests', () => {
    expect(canSubmitChangeRequest('admin')).toBe(true)
    expect(canSubmitChangeRequest('owner')).toBe(true)
    expect(canSubmitChangeRequest('finance')).toBe(false)
    expect(canSubmitChangeRequest('hr')).toBe(false)
    expect(canSubmitChangeRequest('florist')).toBe(false)
  })

  it('only finance and owner can resolve change requests', () => {
    expect(canResolveChangeRequest('finance')).toBe(true)
    expect(canResolveChangeRequest('owner')).toBe(true)
    expect(canResolveChangeRequest('admin')).toBe(false)
  })
})

describe('isOrderFinished', () => {
  it.each([
    ['delivered', true],
    ['picked_up', true],
    ['delivering', false],
    ['ready', false],
    ['cancelled', false],
    ['failed', false],
    ['confirmed', false],
    ['processing', false],
    ['pending_verification', false],
  ] as const)('status=%s -> finished=%s', (status, expected) => {
    expect(isOrderFinished(makeOrder({ status }))).toBe(expected)
  })
})

describe('isOrderLocked', () => {
  it('is unlocked while the order has not finished its fulfillment pipeline', () => {
    expect(isOrderLocked(makeOrder({ status: 'processing' }))).toBe(false)
    expect(isOrderLocked(makeOrder({ status: 'delivering' }))).toBe(false)
  })

  it('locks the moment an order finishes, even before Finance reconciles it', () => {
    expect(isOrderLocked(makeOrder({ status: 'delivered', financeVerified: false }))).toBe(true)
    expect(isOrderLocked(makeOrder({ status: 'picked_up', financeVerified: false }))).toBe(true)
  })

  it('stays locked after Finance reconciliation too', () => {
    expect(isOrderLocked(makeOrder({ status: 'delivered', financeVerified: true }))).toBe(true)
  })

  it('is unlocked while editUnlocked is true, regardless of finished status', () => {
    expect(isOrderLocked(makeOrder({ status: 'delivered', editUnlocked: true }))).toBe(false)
  })

  it('cancelled/failed orders are never locked by this rule', () => {
    expect(isOrderLocked(makeOrder({ status: 'cancelled' }))).toBe(false)
    expect(isOrderLocked(makeOrder({ status: 'failed' }))).toBe(false)
  })
})

describe('canDirectlyEditOrder', () => {
  it('allows any role through this lock-only helper when the order is not locked', () => {
    const order = makeOrder({ status: 'processing' })
    expect(canDirectlyEditOrder(order, 'admin')).toBe(true)
    expect(canDirectlyEditOrder(order, 'owner')).toBe(true)
    expect(canDirectlyEditOrder(order, 'florist')).toBe(true)
  })

  it('does not allow any role to edit a locked finished order directly', () => {
    const order = makeOrder({ status: 'delivered' })
    expect(canDirectlyEditOrder(order, 'finance')).toBe(false)
    expect(canDirectlyEditOrder(order, 'owner')).toBe(false)
    expect(canDirectlyEditOrder(order, 'admin')).toBe(false)
  })

  it('allows the lock-only helper back in once editUnlocked lifts the lock', () => {
    const order = makeOrder({ status: 'delivered', editUnlocked: true })
    expect(canDirectlyEditOrder(order, 'admin')).toBe(true)
    expect(canDirectlyEditOrder(order, 'owner')).toBe(true)
  })
})

describe('finance verification queue eligibility', () => {
  it('requires Admin-confirmed paid status, not finished fulfillment', () => {
    expect(isPendingFinanceVerification(paidCashOrder({ status: 'processing' }))).toBe(true)
    expect(isPendingFinanceVerification(makeOrder({ status: 'delivered', paymentStatus: 'unpaid' }))).toBe(false)
  })

  it('includes paid, unverified, non-rejected orders while fulfillment is still active', () => {
    expect(isPendingFinanceVerification(paidCashOrder({ status: 'ready' }))).toBe(true)
    expect(isPendingFinanceVerification(paidCashOrder({ status: 'delivered' }))).toBe(true)
  })

  it('excludes orders that are already Finance-reconciled', () => {
    expect(isPendingFinanceVerification(paidCashOrder({ status: 'delivered', financeVerified: true }))).toBe(false)
  })

  it('excludes orders Finance has returned for correction', () => {
    expect(isPendingFinanceVerification(paidCashOrder({
      status: 'processing',
      financeVerificationStatus: 'rejected',
    }))).toBe(false)
  })

  it('keeps review-flagged paid orders in the queue because review is a soft flag', () => {
    expect(isPendingFinanceVerification(paidCashOrder({
      status: 'processing',
      financeVerificationStatus: 'review',
    }))).toBe(true)
  })
})

describe('isMarkedForFinanceReview / isRejectedByFinance', () => {
  it('reads the financeVerificationStatus flag directly', () => {
    expect(isMarkedForFinanceReview(makeOrder({ financeVerificationStatus: 'review' }))).toBe(true)
    expect(isMarkedForFinanceReview(makeOrder({ financeVerificationStatus: 'rejected' }))).toBe(false)
    expect(isMarkedForFinanceReview(makeOrder())).toBe(false)

    expect(isRejectedByFinance(makeOrder({ financeVerificationStatus: 'rejected' }))).toBe(true)
    expect(isRejectedByFinance(makeOrder())).toBe(false)
  })
})

describe('createOrderChangeRequest', () => {
  it('builds a request carrying the given fields, with a derived id', () => {
    const request = createOrderChangeRequest({
      orderNumber: 'ORD-0099',
      type: 'edit',
      reason: 'Wrong flowers',
      requestedBy: 'Admin A',
      requestedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(request.type).toBe('edit')
    expect(request.reason).toBe('Wrong flowers')
    expect(request.requestedBy).toBe('Admin A')
    expect(request.requestedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(request.id).toBe(`chg_ORD-0099_${Date.parse('2026-01-01T00:00:00.000Z')}`)
  })
})

describe('applySubmittedChangeRequest', () => {
  it('attaches the request to the order, without touching anything else', () => {
    const order = makeOrder({ status: 'delivered' })
    const request: OrderChangeRequest = {
      id: 'chg_1',
      type: 'cancel',
      reason: 'Customer no longer wants it',
      requestedBy: 'Admin A',
      requestedAt: '2026-01-01T00:00:00.000Z',
    }

    const updated = applySubmittedChangeRequest(order, request)

    expect(updated.pendingChangeRequest).toEqual(request)
    expect(updated.status).toBe('delivered')
    expect(updated).not.toBe(order)
  })
})

describe('applyApprovedEditChangeRequest', () => {
  it('returns the order unchanged if there is no pending request', () => {
    const order = makeOrder()
    expect(applyApprovedEditChangeRequest(order)).toBe(order)
  })

  it('does not write status for a cancel request', () => {
    const order = makeOrder({
      status: 'delivered',
      pendingChangeRequest: {
        id: 'chg_1',
        type: 'cancel',
        reason: 'Duplicate order',
        requestedBy: 'Admin A',
        requestedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    const updated = applyApprovedEditChangeRequest(order)

    expect(updated).toBe(order)
    expect(updated.status).toBe('delivered')
    expect(updated.pendingChangeRequest).toBeDefined()
  })

  it('unlocks an edit request and clears the request', () => {
    const order = makeOrder({
      status: 'delivered',
      pendingChangeRequest: {
        id: 'chg_2',
        type: 'edit',
        reason: 'Wrong address',
        requestedBy: 'Admin A',
        requestedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    const updated = applyApprovedEditChangeRequest(order)

    expect(updated.editUnlocked).toBe(true)
    expect(updated.pendingChangeRequest).toBeUndefined()
    expect(updated.status).toBe('delivered')
  })
})

describe('applyRejectedChangeRequest', () => {
  it('clears the pending request without any other side effects', () => {
    const order = makeOrder({
      status: 'delivered',
      financeVerified: true,
      pendingChangeRequest: {
        id: 'chg_1',
        type: 'edit',
        reason: 'Wrong item',
        requestedBy: 'Admin A',
        requestedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    const updated = applyRejectedChangeRequest(order)

    expect(updated.pendingChangeRequest).toBeUndefined()
    expect(updated.status).toBe('delivered')
    expect(updated.financeVerified).toBe(true)
  })
})

describe('applyUnlockedEditFinalization', () => {
  it('is a no-op when the order is not currently edit-unlocked', () => {
    const order = makeOrder({ status: 'delivered', editUnlocked: false })
    expect(applyUnlockedEditFinalization(order)).toBe(order)
  })

  it('re-locks the order after the edit is saved', () => {
    const order = makeOrder({ status: 'delivered', editUnlocked: true, financeVerified: false })
    const updated = applyUnlockedEditFinalization(order)
    expect(updated.editUnlocked).toBe(false)
  })

  it('resets financeVerified if a previously reconciled order is edited', () => {
    const order = makeOrder({
      status: 'delivered',
      editUnlocked: true,
      financeVerified: true,
      financeVerifiedBy: 'Finance A',
      financeVerifiedAt: '2026-01-01T00:00:00.000Z',
      financeVerificationStatus: undefined,
    })

    const updated = applyUnlockedEditFinalization(order)

    expect(updated.editUnlocked).toBe(false)
    expect(updated.financeVerified).toBe(false)
    expect(updated.financeVerifiedBy).toBeUndefined()
    expect(updated.financeVerifiedAt).toBeUndefined()
    expect(updated.financeVerificationStatus).toBeUndefined()
    expect(updated.financeVerificationNote).toBeUndefined()
  })

  it('leaves financeVerified false if it was never verified', () => {
    const order = makeOrder({ status: 'delivered', editUnlocked: true, financeVerified: false })
    const updated = applyUnlockedEditFinalization(order)
    expect(updated.financeVerified).toBe(false)
  })
})

describe('applyFinanceVerification', () => {
  it('marks the order reconciled and stamps actor/time, clearing prior status/note', () => {
    const order = paidCashOrder({
      status: 'processing',
      financeVerificationStatus: 'review',
      financeVerificationNote: 'Double-check discount',
    })

    const updated = applyFinanceVerification(order, 'Finance A', '2026-02-01T00:00:00.000Z')

    expect(updated.financeVerified).toBe(true)
    expect(updated.financeVerifiedBy).toBe('Finance A')
    expect(updated.financeVerifiedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(updated.financeVerificationStatus).toBeUndefined()
    expect(updated.financeVerificationNote).toBeUndefined()
  })
})

describe('canVerifyOrderFinance', () => {
  it('allows a fully paid order for a permitted Finance decision role', () => {
    const order = paidCashOrder({ status: 'delivered' })
    expect(canVerifyOrderFinance(order, 'finance')).toEqual({ allowed: true })
    expect(canVerifyOrderFinance(order, 'owner')).toEqual({ allowed: true })
  })

  it('requires Admin-confirmed full payment', () => {
    const unpaid = canVerifyOrderFinance(
      makeOrder({ status: 'delivered', paymentStatus: 'unpaid', financeVerified: false }),
      'finance',
    )
    const refundPending = canVerifyOrderFinance(
      makeOrder({ status: 'picked_up', paymentStatus: 'refund_pending', financeVerified: false }),
      'finance',
    )

    expect(unpaid.allowed).toBe(false)
    expect(unpaid.allowed === false && unpaid.code).toBe('PAYMENT_NOT_CONFIRMED')
    expect(refundPending.allowed).toBe(false)
    expect(refundPending.allowed === false && refundPending.code).toBe('PAYMENT_NOT_CONFIRMED')
  })

  it('rejects when the order does not exist', () => {
    const result = canVerifyOrderFinance(null, 'finance')
    expect(result).toEqual({
      allowed: false,
      code: 'ORDER_NOT_FOUND',
      reason: expect.any(String),
    })
  })

  it('rejects when the order is cancelled', () => {
    const result = canVerifyOrderFinance(paidCashOrder({ status: 'cancelled' }), 'finance')
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.code).toBe('ORDER_CANCELLED')
  })

  it('rejects when the order is voided', () => {
    const result = canVerifyOrderFinance(paidCashOrder({ status: 'failed' }), 'finance')
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.code).toBe('ORDER_VOIDED')
  })

  it('rejects when the order is already finance-reconciled', () => {
    const result = canVerifyOrderFinance(paidCashOrder({ status: 'delivered', financeVerified: true }), 'finance')
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.code).toBe('ALREADY_VERIFIED')
  })

  it('allows Finance to reconcile while fulfillment is still in progress', () => {
    const result = canVerifyOrderFinance(paidCashOrder({ status: 'processing' }), 'finance')
    expect(result).toEqual({ allowed: true })
  })

  it('rejects broken paid amounts', () => {
    const negative = paidCashOrder({ totalIdr: 100_000, paidAmountIdr: -1 })
    const overpaid = paidCashOrder({ totalIdr: 100_000, paidAmountIdr: 999_999 })

    const negativeResult = canVerifyOrderFinance(negative, 'finance')
    const overpaidResult = canVerifyOrderFinance(overpaid, 'finance')
    expect(negativeResult.allowed).toBe(false)
    expect(negativeResult.allowed === false && negativeResult.code).toBe('INVALID_PAYMENT_INFO')
    expect(overpaidResult.allowed).toBe(false)
    expect(overpaidResult.allowed === false && overpaidResult.code).toBe('INVALID_PAYMENT_INFO')
  })

  it('requires transfer evidence', () => {
    const result = canVerifyOrderFinance(paidCashOrder({
      paymentMethod: 'transfer',
      paymentProofUrl: undefined,
    }), 'finance')
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.code).toBe('INVALID_PAYMENT_INFO')
  })

  it('rejects when the role lacks permission', () => {
    const result = canVerifyOrderFinance(paidCashOrder({ status: 'delivered' }), 'admin')
    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.code).toBe('NOT_PERMITTED')
  })
})

describe('Finance resubmission domain', () => {
  const rejectedPaidOrder = paidCashOrder({
    status: 'delivered',
    financeVerificationStatus: 'rejected',
    financeVerificationNote: 'Receipt does not match',
    financeVerificationActor: 'Finance A',
    financeVerificationAt: '2026-07-17T09:00:00.000Z',
    editUnlocked: true,
    revision: 7,
  })

  it('allows Admin and Owner to resubmit a rejected paid order with a note', () => {
    expect(canResubmitOrderFinance({ order: rejectedPaidOrder, role: 'admin', note: 'Receipt corrected' })).toEqual({ allowed: true })
    expect(canResubmitOrderFinance({ order: rejectedPaidOrder, role: 'owner', note: 'Receipt corrected' })).toEqual({ allowed: true })
  })

  it.each(['finance', 'hr', 'florist'] as const)('blocks %s from resubmitting', (role) => {
    const result = canResubmitOrderFinance({ order: rejectedPaidOrder, role, note: 'Receipt corrected' })
    expect(result.allowed).toBe(false)
  })

  it('requires rejected status, confirmed payment, and a meaningful correction note', () => {
    expect(canResubmitOrderFinance({
      order: makeOrder({ ...rejectedPaidOrder, financeVerificationStatus: undefined }),
      role: 'admin',
      note: 'Receipt corrected',
    }).allowed).toBe(false)
    expect(canResubmitOrderFinance({
      order: makeOrder({ ...rejectedPaidOrder, status: 'processing', paymentStatus: 'unpaid' }),
      role: 'admin',
      note: 'Receipt corrected',
    }).allowed).toBe(false)
    expect(canResubmitOrderFinance({ order: rejectedPaidOrder, role: 'admin', note: '   ' }).allowed).toBe(false)
  })

  it('does not require fulfillment completion before resubmission', () => {
    const processing = makeOrder({ ...rejectedPaidOrder, status: 'processing' })
    expect(canResubmitOrderFinance({ order: processing, role: 'admin', note: 'Receipt corrected' })).toEqual({ allowed: true })
  })

  it('clears the rejection decision and stamps the correction handoff', () => {
    const updated = applyFinanceResubmission(
      rejectedPaidOrder,
      'Admin A',
      '  Uploaded the corrected receipt  ',
      '2026-07-17T10:00:00.000Z',
    )

    expect(updated).toMatchObject({
      financeVerified: false,
      financeVerificationStatus: undefined,
      financeVerificationNote: undefined,
      financeVerificationActor: undefined,
      financeVerificationAt: undefined,
      financeVerifiedBy: undefined,
      financeVerifiedAt: undefined,
      editUnlocked: false,
      financeResubmittedBy: 'Admin A',
      financeResubmittedAt: '2026-07-17T10:00:00.000Z',
      financeResubmissionNote: 'Uploaded the corrected receipt',
      financeSubmissionRevision: 7,
    })
    expect(isPendingFinanceVerification(updated)).toBe(true)
  })
})
