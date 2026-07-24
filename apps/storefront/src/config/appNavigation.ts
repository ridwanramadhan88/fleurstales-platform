import type { FinanceWorkspaceModule } from '../domain/financeWorkspaceDomain'
import type { NavigationDestinationId } from './navigationGroups'

/** Existing top-level application destinations. */
export type AppTabId = NavigationDestinationId
export type OrdersNavigationScope = 'today' | 'future' | 'custom'

/** HR sections that can already be opened through the existing event bridge. */
export type HrNavigationSection = 'attendance' | 'scheduling' | 'employees' | 'performance' | 'reports' | 'points' | 'payroll'

/**
 * A deterministic navigation request. Optional fields only refine an existing
 * workspace; they never create access by themselves.
 */
export interface AppNavigationTarget {
  tab: AppTabId
  financeModule?: FinanceWorkspaceModule
  ordersSubTab?: OrdersNavigationScope
  ordersStatusGroup?: 'finished'
  orderNumber?: string
  hrSection?: HrNavigationSection
  targetId?: string
}

export type AppNavigationRequest = AppTabId | AppNavigationTarget

export const toAppTab = (tab: AppTabId): AppNavigationTarget => ({ tab })

export const toFinanceModule = (
  financeModule: FinanceWorkspaceModule,
): AppNavigationTarget => ({ tab: 'finance', financeModule })

export const toOrders = (
  options: Pick<AppNavigationTarget, 'ordersSubTab' | 'ordersStatusGroup' | 'orderNumber'> = {},
): AppNavigationTarget => ({ tab: 'orders', ...options })

export const toHrSection = (
  hrSection: HrNavigationSection,
  targetId?: string,
): AppNavigationTarget => ({ tab: 'hr', hrSection, targetId })

export const normalizeNavigationRequest = (
  request: AppNavigationRequest,
): AppNavigationTarget =>
  typeof request === 'string' ? { tab: request } : request
