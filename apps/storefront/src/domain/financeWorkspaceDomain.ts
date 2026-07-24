import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'
import { hasActionPermission, type ActionPermissionMatrix } from '../config/actionPermissions'

export type FinanceWorkspaceModule =
  | 'collect_orders'
  | 'payroll'
  | 'refunds'
  | 'ledger'

const MODULE_ORDER: FinanceWorkspaceModule[] = ['collect_orders','ledger','payroll','refunds']

const CAPABILITY_BY_MODULE: Record<FinanceWorkspaceModule, Parameters<typeof hasActionPermission>[1]> = {
  collect_orders: 'finance.view_collect_orders',
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
): FinanceWorkspaceModule => getFinanceWorkspaceModules(role, actionPermissions, sectionPermissions)[0] ?? 'collect_orders'
