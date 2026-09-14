import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'
import { hasActionPermission, type ActionPermissionMatrix } from '../config/actionPermissions'

/**
 * Internal Finance route ids are intentionally kept stable for notification,
 * deep-link, and permission compatibility. The UI groups order_verification
 * and refunds under the single Reconciliation workspace in Finance v2.
 */
export type FinanceWorkspaceModule =
  | 'order_verification'
  | 'payroll'
  | 'refunds'
  | 'ledger'
  | 'balance'

/** Finance v2 visible order: Overview → Reconciliation → Transactions → Payroll. */
const MODULE_ORDER: FinanceWorkspaceModule[] = ['balance','order_verification','refunds','ledger','payroll']

const CAPABILITY_BY_MODULE: Record<FinanceWorkspaceModule, Parameters<typeof hasActionPermission>[1]> = {
  order_verification: 'finance.view_order_verification',
  payroll: 'finance.view_payroll',
  refunds: 'finance.view_refunds',
  ledger: 'finance.view_ledger',
  // Overview shares the ledger capability because every displayed balance is ledger-derived.
  balance: 'finance.view_ledger',
}

export const getFinanceWorkspaceModules = (
  role: UserRole,
  actionPermissions?: ActionPermissionMatrix,
  sectionPermissions?: PermissionMatrix,
): FinanceWorkspaceModule[] =>
  MODULE_ORDER.filter((module) =>
    hasActionPermission(role, CAPABILITY_BY_MODULE[module], actionPermissions, sectionPermissions),
  )

export const getDefaultFinanceWorkspaceModule = (
  role: UserRole,
  actionPermissions?: ActionPermissionMatrix,
  sectionPermissions?: PermissionMatrix,
): FinanceWorkspaceModule => getFinanceWorkspaceModules(role, actionPermissions, sectionPermissions)[0] ?? 'balance'
