import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'
import { hasActionPermission, type ActionPermissionMatrix } from '../config/actionPermissions'

export type FinanceWorkspaceModule =
  | 'order_verification'
  | 'payroll'
  | 'refunds'
  | 'ledger'

const MODULE_ORDER: FinanceWorkspaceModule[] = ['order_verification','ledger','payroll','refunds']

const CAPABILITY_BY_MODULE: Record<FinanceWorkspaceModule, Parameters<typeof hasActionPermission>[1]> = {
  order_verification: 'finance.view_order_verification',
  payroll: 'finance.view_payroll',
  refunds: 'finance.view_refunds',
  ledger: 'finance.view_ledger',
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
): FinanceWorkspaceModule => getFinanceWorkspaceModules(role, actionPermissions, sectionPermissions)[0] ?? 'order_verification'
