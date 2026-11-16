import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'
import { hasActionPermission, type ActionCapability, type ActionPermissionMatrix } from '../config/actionPermissions'

/**
 * @file financeWorkspaceDomain.ts
 * @description The single registry of Finance workspace tabs. Adding a tab
 * means adding one entry to FINANCE_MODULES — the tab bar, default landing,
 * access check, and legacy deep-link mapping all read from here.
 *
 * Finance v3 has four tabs, one job each:
 * - tasks:   everything waiting on Finance (reconciliation, refunds, change
 *            requests, stock purchases, payroll to pay, account cleanup)
 * - cash:    account balances, recording money, and the ledger
 * - payroll: monthly payroll review and payment
 * - report:  the month — period status/closing and the LK report
 */
export type FinanceWorkspaceModule = 'tasks' | 'cash' | 'payroll' | 'report'

/**
 * Route ids from Finance v2. Notifications, saved links, and older callers
 * may still send these; they map onto the v3 tab that now holds the work.
 */
export type LegacyFinanceWorkspaceModule = 'order_verification' | 'refunds' | 'ledger' | 'balance'

export type FinanceWorkspaceRoute = FinanceWorkspaceModule | LegacyFinanceWorkspaceModule

export interface FinanceModuleDefinition {
  id: FinanceWorkspaceModule
  label: { en: string; id: string }
  /** Shorter name for phones, where all tabs must fit on one line. */
  shortLabel?: { en: string; id: string }
  /** The tab is visible when the role holds ANY of these capabilities. */
  capabilities: ActionCapability[]
}

export const FINANCE_MODULES: readonly FinanceModuleDefinition[] = [
  {
    id: 'tasks',
    label: { en: 'Tasks', id: 'Tugas' },
    capabilities: ['finance.view_order_verification', 'finance.view_refunds'],
  },
  {
    id: 'cash',
    label: { en: 'Cash & Transactions', id: 'Kas & Transaksi' },
    shortLabel: { en: 'Cash', id: 'Kas' },
    capabilities: ['finance.view_ledger'],
  },
  {
    id: 'payroll',
    label: { en: 'Payroll', id: 'Penggajian' },
    capabilities: ['finance.view_payroll'],
  },
  {
    id: 'report',
    label: { en: 'Reports', id: 'Laporan' },
    capabilities: ['finance.view_ledger'],
  },
]

const LEGACY_ROUTE: Record<LegacyFinanceWorkspaceModule, FinanceWorkspaceModule> = {
  order_verification: 'tasks',
  refunds: 'tasks',
  ledger: 'cash',
  balance: 'cash',
}

export const normalizeFinanceRoute = (route: FinanceWorkspaceRoute): FinanceWorkspaceModule =>
  route in LEGACY_ROUTE ? LEGACY_ROUTE[route as LegacyFinanceWorkspaceModule] : (route as FinanceWorkspaceModule)

export const getFinanceModuleDefinition = (id: FinanceWorkspaceModule): FinanceModuleDefinition =>
  FINANCE_MODULES.find((module) => module.id === id) ?? FINANCE_MODULES[0]

export const getFinanceWorkspaceModules = (
  role: UserRole,
  actionPermissions?: ActionPermissionMatrix,
  sectionPermissions?: PermissionMatrix,
): FinanceWorkspaceModule[] =>
  FINANCE_MODULES
    .filter((module) => module.capabilities.some((capability) =>
      hasActionPermission(role, capability, actionPermissions, sectionPermissions)))
    .map((module) => module.id)

/** Finance lands on Tasks: the work waiting for them comes first. */
export const getDefaultFinanceWorkspaceModule = (
  role: UserRole,
  actionPermissions?: ActionPermissionMatrix,
  sectionPermissions?: PermissionMatrix,
): FinanceWorkspaceModule => getFinanceWorkspaceModules(role, actionPermissions, sectionPermissions)[0] ?? 'tasks'
