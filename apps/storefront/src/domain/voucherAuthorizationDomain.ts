import type { UserRole } from '../store/userStore'

/** Voucher management is intentionally limited to commercial roles. */
const canViewVouchers = (role: UserRole): boolean =>
  role === 'owner' || role === 'admin' || role === 'finance'

export const canManageVouchers = canViewVouchers
