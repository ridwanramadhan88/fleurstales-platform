/**
 * @file useFinanceAccess.ts
 * @description The one place Finance screens ask "may this person do X?".
 * Every value comes from the Owner-managed capability matrix
 * (`hasActionPermission`), so a screen never hides itself with a hard-coded
 * role check while its tab is still visible.
 */

import { useMemo } from 'react'
import { hasActionPermission, type ActionCapability } from '../../config/actionPermissions'
import { canEditSection } from '../../config/permissions'
import { canResolveChangeRequest, canVerifyOrder } from '../../domain/orderBusinessRules'
import {
  getFinanceWorkspaceModules,
  type FinanceWorkspaceModule,
} from '../../domain/financeWorkspaceDomain'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore, type UserRole } from '../../store/userStore'

export interface FinanceAccess {
  role: UserRole
  actorName: string
  modules: FinanceWorkspaceModule[]
  canViewReconciliation: boolean
  canVerifyOrders: boolean
  canResolveChangeRequests: boolean
  canViewRefunds: boolean
  canManageRefunds: boolean
  canViewLedger: boolean
  /** Money In / Money Out, opening balance, adjustment, and transfer entries. */
  canCreateEntry: boolean
  /** Edit or void posted entries. */
  canEditEntry: boolean
  canViewPayroll: boolean
  canClosePeriod: boolean
  canReopenPeriod: boolean
  canConfirmPurchases: boolean
}

export const useFinanceAccess = (): FinanceAccess => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const permissions = useSettingsStore((state) => state.permissions)
  const inventoryEnabled = useSettingsStore((state) => state.storeProfile.inventoryEnabled)

  return useMemo(() => {
    const can = (capability: ActionCapability) =>
      hasActionPermission(role, capability, actionPermissions, permissions)
    const canEditFinance = canEditSection(role, 'finance', permissions)
    return {
      role,
      actorName,
      modules: getFinanceWorkspaceModules(role, actionPermissions, permissions),
      canViewReconciliation: can('finance.view_order_verification'),
      canVerifyOrders: canVerifyOrder(role) && can('finance.verify_order'),
      canResolveChangeRequests: canResolveChangeRequest(role) && can('orders.resolve_change_request'),
      canViewRefunds: can('finance.view_refunds'),
      canManageRefunds: can('finance.approve_refund'),
      canViewLedger: can('finance.view_ledger'),
      canCreateEntry: can('finance.create_ledger_entry'),
      canEditEntry: canEditFinance && can('finance.edit_ledger_entry'),
      canViewPayroll: can('finance.view_payroll'),
      canClosePeriod: can('finance.close_period'),
      canReopenPeriod: can('finance.reopen_period'),
      canConfirmPurchases: Boolean(inventoryEnabled) && can('inventory.confirm_purchase'),
    }
  }, [actionPermissions, actorName, inventoryEnabled, permissions, role])
}
