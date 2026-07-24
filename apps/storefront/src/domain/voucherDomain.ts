/**
 * @file voucherDomain.ts
 * @description Pure validation logic for applying a voucher code at
 * checkout. Used by both the storefront cart (CartDrawer) and the admin
 * New Order intake, so a code created in the Customers tab's voucher
 * manager behaves identically everywhere it can be entered.
 */

import type { Voucher } from '../store/voucherStore'
import type { CustomerProfile } from '../store/customerStoreTypes'
import { getLocalDateString, nowInJakarta } from './orderTimingDomain'

export interface VoucherValidationResult {
  ok: boolean
  reason?: string
  voucher?: Voucher
  /** Discount amount in IDR, only set when ok is true. */
  discountIdr?: number
}

/**
 * Today as a YYYY-MM-DD string in Jakarta (GMT+7) wall-clock time, for
 * comparing against voucher date rules. Using the device/server's raw UTC
 * date here would flip the day boundary up to 7 hours early or late
 * relative to local time near midnight — the same class of bug that made
 * orders show the wrong Late/Due-soon status — so this goes through the
 * same Jakarta-anchored helper as Orders/Notifications instead.
 */
const todayIso = () => getLocalDateString(nowInJakarta())

/**
 * @description Result of `calculateOrderTotal`, broken into its component
 * parts so callers can display a line-item breakdown (subtotal, discount,
 * delivery fee) alongside the final total.
 */
export interface OrderTotalBreakdown {
  /** Sum of item prices before any discount or delivery fee. */
  itemsTotalIdr: number
  /** Voucher discount applied, in IDR. 0 when no voucher is applied. */
  discountIdr: number
  /** Delivery fee, in IDR. 0 for pickup orders. */
  deliveryFeeIdr: number
  /** Final payable amount: itemsTotalIdr - discountIdr + deliveryFeeIdr. */
  grandTotalIdr: number
}

/**
 * @description Computes the final payable total for an order from its
 * component parts. Pure/no side effects, so it can be used identically by
 * the storefront cart and any other checkout surface that needs the same
 * math (e.g. a future admin-side discount preview).
 */
export const calculateOrderTotal = (params: {
  itemsTotalIdr: number
  discountIdr: number
  deliveryFeeIdr: number
}): OrderTotalBreakdown => {
  const { itemsTotalIdr, discountIdr, deliveryFeeIdr } = params
  return {
    itemsTotalIdr,
    discountIdr,
    deliveryFeeIdr,
    grandTotalIdr: itemsTotalIdr - discountIdr + deliveryFeeIdr,
  }
}

/**
 * @description Validates a voucher code against order context and returns
 * the discount to apply if valid. `customer` may be undefined (e.g. a
 * brand-new storefront customer not yet in the CRM) — vouchers scoped to
 * 'vip' or 'selected' customers will then correctly fail as not eligible.
 */
export const validateVoucherCode = (
  code: string,
  vouchers: Voucher[],
  options: {
    orderSubtotalIdr: number
    customer?: Pick<CustomerProfile, 'id' | 'tags'> | null
  },
): VoucherValidationResult => {
  const normalized = code.trim().toUpperCase()
  if (!normalized) {
    return { ok: false, reason: 'Enter a voucher code.' }
  }

  const voucher = vouchers.find((item) => item.code === normalized)
  if (!voucher) {
    return { ok: false, reason: 'Voucher code not found.' }
  }
  if (!voucher.isActive) {
    return { ok: false, reason: 'This voucher is no longer active.' }
  }

  const today = todayIso()
  if (voucher.startDate && today < voucher.startDate) {
    return { ok: false, reason: `This voucher starts on ${voucher.startDate}.` }
  }
  if (voucher.endDate && today > voucher.endDate) {
    return { ok: false, reason: 'This voucher has expired.' }
  }

  if (voucher.minOrderIdr && options.orderSubtotalIdr < voucher.minOrderIdr) {
    return {
      ok: false,
      reason: `Minimum order for this voucher is Rp ${voucher.minOrderIdr.toLocaleString('id-ID')}.`,
    }
  }

  if (voucher.eligibility === 'vip') {
    const isVip = Boolean(options.customer?.tags?.includes('VIP'))
    if (!isVip) {
      return { ok: false, reason: 'This voucher is only available for VIP customers.' }
    }
  }

  if (voucher.eligibility === 'selected') {
    const isSelected = Boolean(
      options.customer?.id &&
        voucher.selectedCustomerIds?.includes(options.customer.id),
    )
    if (!isSelected) {
      return { ok: false, reason: 'This voucher isn\'t available for your account.' }
    }
  }

  const discountIdr = Math.round((options.orderSubtotalIdr * voucher.percentOff) / 100)
  return { ok: true, voucher, discountIdr }
}
