/**
 * @file voucherStore.ts
 * @description CRM voucher/promo code store. Vouchers are manually created
 * by staff (from the Customers tab) with a percent-off amount, optional
 * date-range and minimum-order rules, and an eligibility rule (everyone,
 * VIP-tagged customers only, or a hand-picked list of customers).
 *
 * This is the single source of truth for voucher codes — both the
 * storefront checkout (CartDrawer) and the admin New Order intake read
 * from this same store, so a code created here works everywhere
 * immediately (no separate sync step, same Zustand-singleton pattern used
 * by catalogStore/customerStore/ordersStore).
 */

import { create } from 'zustand'
import { useUserStore } from './userStore'
import { canManageVouchers } from '../domain/voucherAuthorizationDomain'

/** Who a voucher can be applied by. */
export type VoucherEligibility = 'all' | 'vip' | 'selected'

export interface Voucher {
  id: string
  /** Manually chosen code, stored upper-cased (e.g. "BDAY20"). */
  code: string
  /** Percent discount applied to the order subtotal, e.g. 20 for 20% off. */
  percentOff: number
  /** Optional start date (YYYY-MM-DD) — voucher isn't valid before this. */
  startDate?: string
  /** Optional end date (YYYY-MM-DD) — voucher isn't valid after this. */
  endDate?: string
  /** Optional minimum order subtotal (IDR) required to use this voucher. */
  minOrderIdr?: number
  /** Who is allowed to use this voucher. */
  eligibility: VoucherEligibility
  /** Customer IDs allowed to use this voucher, only set when eligibility is 'selected'. */
  selectedCustomerIds?: string[]
  /** Whether the voucher can currently be used at all (independent of date rules). */
  isActive: boolean
  createdAt: string
}

export type NewVoucherInput = Omit<Voucher, 'id' | 'createdAt'>

interface VoucherState {
  vouchers: Voucher[]
  addVoucher: (input: NewVoucherInput) => { ok: true; voucher: Voucher } | { ok: false; reason: string }
  updateVoucher: (
    id: string,
    patch: Partial<NewVoucherInput>,
  ) => { ok: true } | { ok: false; reason: string }
  deleteVoucher: (id: string) => void
  setVoucherActive: (id: string, isActive: boolean) => void
}

const INITIAL_VOUCHERS: Voucher[] = [
  {
    id: 'voucher-vip10',
    code: 'VIP10',
    percentOff: 10,
    eligibility: 'vip',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
]

const normalizeCode = (code: string) => code.trim().toUpperCase()

export const useVoucherStore = create<VoucherState>((set, get) => ({
  vouchers: INITIAL_VOUCHERS,

  addVoucher: (input) => {
    if (!canManageVouchers(useUserStore.getState().role)) return { ok: false, reason: 'This account cannot edit vouchers.' }
    const code = normalizeCode(input.code)
    if (!code) return { ok: false, reason: 'Please enter a voucher code.' }
    if (get().vouchers.some((voucher) => voucher.code === code)) {
      return { ok: false, reason: `Code "${code}" already exists.` }
    }
    if (!Number.isFinite(input.percentOff) || input.percentOff <= 0 || input.percentOff > 100) {
      return { ok: false, reason: 'Percent off must be between 1 and 100.' }
    }
    const voucher: Voucher = {
      ...input,
      code,
      id: `voucher-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({ vouchers: [voucher, ...state.vouchers] }))
    return { ok: true, voucher }
  },

  updateVoucher: (id, patch) => {
    if (!canManageVouchers(useUserStore.getState().role)) return { ok: false, reason: 'This account cannot edit vouchers.' }
    if (patch.code !== undefined) {
      const code = normalizeCode(patch.code)
      if (!code) return { ok: false, reason: 'Please enter a voucher code.' }
      if (get().vouchers.some((voucher) => voucher.id !== id && voucher.code === code)) {
        return { ok: false, reason: `Code "${code}" already exists.` }
      }
      patch = { ...patch, code }
    }
    if (
      patch.percentOff !== undefined &&
      (!Number.isFinite(patch.percentOff) || patch.percentOff <= 0 || patch.percentOff > 100)
    ) {
      return { ok: false, reason: 'Percent off must be between 1 and 100.' }
    }
    set((state) => ({
      vouchers: state.vouchers.map((voucher) =>
        voucher.id === id ? { ...voucher, ...patch } : voucher,
      ),
    }))
    return { ok: true }
  },

  deleteVoucher: (id) => {
    if (!canManageVouchers(useUserStore.getState().role)) return
    set((state) => ({
      vouchers: state.vouchers.filter((voucher) => voucher.id !== id),
    }))
  },

  setVoucherActive: (id, isActive) => {
    if (!canManageVouchers(useUserStore.getState().role)) return
    set((state) => ({
      vouchers: state.vouchers.map((voucher) =>
        voucher.id === id ? { ...voucher, isActive } : voucher,
      ),
    }))
  },
}))
