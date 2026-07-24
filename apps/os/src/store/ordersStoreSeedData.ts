import type { BranchId, OrderStatus, OrderTableRow, PaymentStatus } from '../types/orders'

/**
 * @description Maps branch ids to the order number prefix.
 */
export const BRANCH_CODE_MAP: Record<BranchId, string> = {
  Kedamaian: 'KDM',
  Pahoman: 'PHM',
}

/**
 * @description Derives an initial status for a new order based on its origin.
 */
export const deriveInitialStatus = (
  orderType: 'walk_in' | 'admin_created' | 'customer_created',
): OrderStatus =>
  orderType === 'walk_in' ? 'confirmed' : 'pending_verification'

/**
 * @description Derives a payment status from the deposit and total amount.
 */
export const derivePaymentStatus = (
  depositAmount: number,
  totalIdr: number,
): PaymentStatus => {
  if (totalIdr <= 0) {
    return depositAmount <= 0 ? 'unpaid' : 'partial'
  }
  if (depositAmount <= 0) return 'unpaid'
  if (depositAmount < totalIdr) return 'partial'
  return 'paid'
}

/**
 * @description The single reconciling writer for `paidAmountIdr` on any
 * payment-status transition — mirrors `derivePaymentStatus`'s reasoning at
 * creation time, but for edits. Previously `updatePayment` only set
 * `paidAmountIdr` when the new status was `'paid'` (defaulting to
 * `totalIdr`) or when explicitly passed; every other transition (e.g.
 * `paid` -> `unpaid`, or setting `partial` with no deposit prompt) left the
 * old `paidAmountIdr` in place, unreconciled against the new status, with
 * nothing enforcing `0 <= paidAmountIdr <= totalIdr` (gap-log §22).
 *
 * Rules, in order:
 * 1. An explicit `paidAmountIdr` always wins, but is clamped to
 *    `[0, totalIdr]` — a caller can never push the invariant out of range.
 * 2. `'unpaid'` always reconciles to `0`.
 * 3. `'paid'` always reconciles to `totalIdr`.
 * 4. `'partial'` with no explicit amount keeps the previous amount if it's
 *    already a valid partial value (`0 < amount < totalIdr`); otherwise it
 *    falls back to half of `totalIdr`, rounded, so the invariant always
 *    holds instead of silently carrying over a stale `0` or `totalIdr`
 *    from a previous status.
 */
export const reconcilePaidAmountIdr = (
  paymentStatus: PaymentStatus,
  totalIdr: number,
  previousPaidAmountIdr: number,
  explicitPaidAmountIdr?: number,
): number => {
  const clamp = (value: number) => Math.min(Math.max(value, 0), Math.max(totalIdr, 0))

  if (typeof explicitPaidAmountIdr === 'number') {
    return clamp(explicitPaidAmountIdr)
  }

  if (paymentStatus === 'unpaid') return 0
  if (paymentStatus === 'paid') return Math.max(totalIdr, 0)

  // 'partial'
  const isValidExistingPartial =
    previousPaidAmountIdr > 0 && previousPaidAmountIdr < totalIdr
  if (isValidExistingPartial) return previousPaidAmountIdr
  return Math.round(Math.max(totalIdr, 0) / 2)
}

/**
 * @description Formats a creation timestamp label in a compact Indonesian style.
 */
export const formatCreatedAtLabel = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Replace the comma with a separator dot to match the design.
  return formatter.format(date).replace(',', ' ·')
}

/**
 * @description Orders start without seeded records. Orders must be
 * created through the real intake workflow so payment, Finance,
 * inventory, audit, and revenue state stay consistent.
 */
export const INITIAL_ORDERS: OrderTableRow[] = []

/**
 * @description Derives initial lastSequence per branch from a list of orders.
 */
export const deriveInitialSequences = (
  orders: OrderTableRow[],
): Record<BranchId, number> => {
  const base: Record<BranchId, number> = {
    Kedamaian: 0,
    Pahoman: 0,
  }

  orders.forEach((order) => {
    const parts = order.orderNumber.split('-')
    const maybeSeq = parts[parts.length - 1]
    const parsed = Number.parseInt(maybeSeq, 10)
    if (!Number.isFinite(parsed)) return

    const current = base[order.branch] ?? 0
    if (parsed > current) {
      base[order.branch] = parsed
    }
  })

  return base
}
