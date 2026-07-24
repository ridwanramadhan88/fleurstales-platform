/**
 * @file Home.tsx
 * @description Fleurstales Home shell with mobile-first layout and a desktop sidebar for the dashboard.
 *
 * This file intentionally stays a thin router/shell: it owns navigation
 * state (active tab, active branch, sheet/overlay visibility) and hands
 * everything else off to per-tab components. Section-level role branching
 * (who sees what on the Dashboard tab, etc.) lives inside those components
 * — see components/dashboard/DashboardTab.tsx — rather than inline here.
 */

import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { TopBarContainer } from '../components/dashboard/TopBarContainer'
import { DashboardTab } from '../components/dashboard/DashboardTab'
import { useUserStore } from '../store/userStore'
import { useOrdersStore } from '../store/ordersStore'
import { BottomTabBarContainer } from '../components/layout/BottomTabBarContainer'
import { NotificationCenter } from '../components/notifications/NotificationCenter'
import type { NotificationItem } from '../types/notifications'
import { NewOrderSheetContainer } from '../components/orders/NewOrderSheetContainer'
import {
  OrdersSubTabs,
  type OrdersSubTabId,
} from '../components/orders/OrdersSubTabs'
import { OrdersTableViewContainer } from '../components/orders/OrdersTableViewContainer'
import { OrdersTabHeader } from '../components/orders/OrdersTabHeader'
import { useOrderDrafts } from '../components/orders/orderDraftStore'
import { DesktopSidebarContainer } from '../components/layout/DesktopSidebarContainer'
import { StockTabContentContainer } from '../components/stock/StockTabContentContainer'
import { CatalogTabContentContainer } from '../components/catalog/CatalogTabContentContainer'
import { CustomersTabContentContainer } from '../components/customers/CustomersTabContentContainer'
import { RevenueDashboardContainer } from '../components/dashboard/RevenueDashboardContainer'
import { OrderTransactionVerificationQueueContainer } from '../components/finance/OrderTransactionVerificationQueueContainer'
import { InternalTransactionVerificationQueueContainer } from '../components/finance/InternalTransactionVerificationQueueContainer'
import { FinanceRefundQueue } from '../components/finance/FinanceRefundQueue'
import { PayrollScheduleCard } from '../components/payroll/PayrollScheduleCard'
import { FinancePayrollReview } from '../components/finance/FinancePayrollReview'
import { FinancePayrollScheduleAdjustment } from '../components/finance/FinancePayrollScheduleAdjustment'
import { AddInternalTransaction } from '../components/finance/AddInternalTransaction'
import { useFinanceStore } from '../store/financeStore'
import { canCreateOrderForBranch, canVerifyOrder, canResolveChangeRequest } from '../domain/orderBusinessRules'
import { HrTabContentContainer } from '../components/hr/HrTabContentContainer'
import type { HrSection } from '../components/hr/HrTabContentController'
import { SettingsCenterContainer } from '../components/settings/SettingsCenterContainer'
import { requestSettingsNavigation } from '../components/settings/settingsNavigationGuard'
import { canAccessSection, canEditSection } from '../config/permissions'
import { getAccessibleNavigationDestinationIds } from '../config/navigationGroups'
import { hasActionPermission } from '../config/actionPermissions'
import { useBranchOrderCounts, useFutureOrderCount } from '../hooks/useBranchOrders'
import { useTheme } from '../hooks/useTheme'
import type { DateRange } from 'react-day-picker'
import type { BranchFilter } from '../types/orders'
import { useRoleNotifications } from '../hooks/useRoleNotifications'
import { useSharedOrderBackend } from '../hooks/useSharedOrderBackend'
import { useSettingsStore } from '../store/settingsStore'
import { getActiveBranches } from '../domain/settings/settingsSelectors'
import { canViewScheduling } from '../domain/hrSchedulingDomain'
import { FinanceWorkspaceTabs } from '../components/finance/FinanceWorkspaceTabs'
import { getDefaultFinanceWorkspaceModule, getFinanceWorkspaceModules, type FinanceWorkspaceModule } from '../domain/financeWorkspaceDomain'
import { toast } from '../hooks/use-toast'
import { requestAppConfirmation } from '../components/ui/app-confirm'
import { getBranchSwitchDecision, isOperationalBranchRole } from '../domain/branchSelectionDomain'
import { getLocalDateString, nowInJakarta } from '../domain/orderTimingDomain'
import { useAuditLogStore } from '../store/auditLogStore'
import {
  normalizeNavigationRequest,
  toAppTab,
  toFinanceModule,
  toHrSection,
  toOrders,
  type AppNavigationRequest,
  type AppTabId,
} from '../config/appNavigation'

export type { AppTabId } from '../config/appNavigation'

/**
 * @description Returns greeting text and formatted date for the dashboard header.
 */
const getDashboardHeaderMeta = () => {
  const now = new Date()
  const hours = now.getHours()

  const greeting =
    hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening'

  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return { greeting, formattedDate }
}

/**
 * @description Main Home page for Fleurstales OS with dashboard + tabbed sections and a desktop sidebar layout.
 */
export interface HomePageProps {
  /** Signs the current demo user out, returning to the role-select login screen. */
  onSignOut?: () => void
  /** Optional externally-managed theme; falls back to its own useTheme() instance if omitted. */
  theme?: 'light' | 'dark'
  /** Optional externally-managed theme toggle handler. */
  onToggleTheme?: () => void
  /**
   * @description Branch chosen on the post-login branch picker. Seeds the
   * app-wide branch filter so the whole app opens already scoped to what
   * the person picked, instead of always defaulting to one hardcoded branch.
   */
  initialBranch?: BranchFilter
}

const getDefaultTabForRole = (role: ReturnType<typeof useUserStore.getState>['role']): AppTabId =>
  role === 'finance' ? 'finance' : role === 'hr' ? 'hr' : 'dashboard'

const HomePage: FC<HomePageProps> = ({
  onSignOut,
  theme: themeProp,
  onToggleTheme: onToggleThemeProp,
  initialBranch = 'Kedamaian',
}) => {
  const userRole = useUserStore((state) => state.role)
  const [activeBranch, setActiveBranch] = useState<BranchFilter>(initialBranch)
  const [activeTab, setActiveTab] = useState<AppTabId>(() => getDefaultTabForRole(userRole))
  const [financeModule, setFinanceModule] = useState<FinanceWorkspaceModule>(() => getDefaultFinanceWorkspaceModule(userRole))
  const notifications = useRoleNotifications(activeBranch)
  useSharedOrderBackend(activeBranch)
  /**
   * @description Single global search query, owned here and rendered by
   * TopBar, so every tab that supports search (Orders, Customers, Product
   * Catalog) shares one search field in the main header instead of each
   * tab having its own. Cleared whenever the person switches to a tab (or
   * Product sub-tab) where it means something different, so a leftover
   * query from one context doesn't silently filter another.
   */
  const [searchQuery, setSearchQuery] = useState('')
  const [peopleSection, setPeopleSection] = useState<HrSection>('employees')
  const [isNewOrderOpen, setIsNewOrderOpen] = useState<boolean>(false)
  const permissions = useSettingsStore((state) => state.permissions)
  const inventoryEnabled = useSettingsStore((state) => state.storeProfile.inventoryEnabled)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const settingsHasUnsavedChanges = useSettingsStore((state) => state.settingsHasUnsavedChanges)
  const configuredBranches = useSettingsStore((state) => state.branches)
  const activeBranchIds = getActiveBranches({ branches: configuredBranches }).map((branch) => branch.id)
  const actorName = useUserStore((state) => state.name)
  const actorEmployeeId = useUserStore((state) => state.employeeId)
  const actorBranchId = useUserStore((state) => state.branchId)
  const scheduledBranchId = useUserStore((state) => state.scheduledBranchId)
  const setOperationalBranch = useUserStore((state) => state.setOperationalBranch)
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] =
    useState<boolean>(false)
  const [editingOrderDraftId, setEditingOrderDraftId] = useState<string | null>(null)
  const [activeOrdersSubTab, setActiveOrdersSubTab] =
    useState<OrdersSubTabId>('today')
  const [ordersInitialStatusGroup, setOrdersInitialStatusGroup] = useState<'finished' | undefined>(undefined)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  /**
   * @description Order number to deep-link straight to when arriving at the
   * Orders tab via a notification click. Cleared once consumed by
   * OrdersTableViewContainer so re-clicking the same notification later
   * still re-opens the panel.
   */
  const [deepLinkOrderNumber, setDeepLinkOrderNumber] = useState<
    string | null
  >(null)

  // Home can manage its own theme instance if the caller (App.tsx) didn't
  // pass one down, so this component still works standalone.
  const ownTheme = useTheme()
  const theme = themeProp ?? ownTheme.theme
  const onToggleTheme = onToggleThemeProp ?? ownTheme.toggleTheme

  const { greeting, formattedDate } = getDashboardHeaderMeta()

  /**
   * @description Real, branch-scoped order counts for the Orders tab header
   * chips — previously hardcoded literals that never matched the list below
   * them (bug 1.2). Derived from the same data source OrdersTableView uses,
   * via useBranchOrderCounts, so they can't drift apart again.
   */
  const orderCounts = useBranchOrderCounts(activeBranch)
  const futureOrderCount = useFutureOrderCount(activeBranch)
  const orderDrafts = useOrderDrafts()
  const draftCount = orderDrafts.filter((draft) => activeBranch === 'All' || draft.branch === activeBranch).length

  // Data + permissions for the Finance tab's two verification queues.
  const allOrders = useOrdersStore((state) => state.orders)
  const branchOrders =
    activeBranch === 'All'
      ? allOrders
      : allOrders.filter((order) => order.branch === activeBranch)
  const allTransactions = useFinanceStore((state) => state.transactions)
  const canAccessHrWorkspace = canAccessSection(userRole, 'hr', permissions) || canViewScheduling(userRole, permissions)
  const canVerifyFinance = canVerifyOrder(userRole) && hasActionPermission(userRole, 'finance.verify_order', actionPermissions, permissions)
  const canVerifyInternalTransactions = canEditSection(userRole, 'finance', permissions) && hasActionPermission(userRole, 'finance.verify_ledger_entry', actionPermissions, permissions)
  const canResolveFinanceRequest = canResolveChangeRequest(userRole)
  const financeModules = useMemo(
    () => getFinanceWorkspaceModules(userRole, actionPermissions, permissions),
    [userRole, actionPermissions, permissions],
  )
  const canAttemptOrderCreation =
    (userRole === 'owner' || userRole === 'admin') && canEditSection(userRole, 'orders', permissions)
  const createOrderDecision = !canAttemptOrderCreation
    ? { allowed: false as const, reason: undefined }
    : activeBranch === 'All'
      ? {
          allowed: false as const,
          reason: userRole === 'admin' && !actorBranchId
            ? 'No branch is assigned for your current shift. Ask HR or Owner to update the schedule.'
            : 'Select a specific branch before creating an order.',
        }
      : canCreateOrderForBranch({
          actor: { employeeId: actorEmployeeId, name: actorName, role: userRole, branchId: actorBranchId },
          branch: activeBranch,
          orderType: 'admin_created',
          permissions,
        })
  const canCreateOrder = createOrderDecision.allowed
  const createOrderBlockedReason = canAttemptOrderCreation && !createOrderDecision.allowed
    ? createOrderDecision.reason
    : undefined

  useEffect(() => {
    if (activeTab !== 'finance') return
    if (financeModules.includes(financeModule)) return
    const fallback = financeModules[0]
    if (fallback) {
      setFinanceModule(fallback)
      setSearchQuery('')
    }
  }, [activeTab, financeModule, financeModules])

  const accessibleNavigationIds = useMemo(
    () => getAccessibleNavigationDestinationIds({
      role: userRole,
      permissions,
      inventoryEnabled,
    }),
    [inventoryEnabled, permissions, userRole],
  )

  /**
   * Single navigation command for top-level destinations and existing
   * workspace deep links. Access remains controlled by the current permission
   * matrix; a navigation target can never grant access by itself.
   */
  const navigate = (request: AppNavigationRequest): boolean => {
    const target = normalizeNavigationRequest(request)

    if (!accessibleNavigationIds.includes(target.tab)) {
      toast({
        title: 'Workspace unavailable',
        description: 'Your current role or Owner access settings do not allow this destination.',
        variant: 'destructive',
      })
      return false
    }

    let nextFinanceModule: FinanceWorkspaceModule | undefined
    if (target.tab === 'finance') {
      if (financeModules.length === 0) {
        toast({
          title: 'Finance workspace unavailable',
          description: 'No Finance module is enabled for your current role.',
          variant: 'destructive',
        })
        return false
      }

      if (target.financeModule && !financeModules.includes(target.financeModule)) {
        toast({
          title: 'Finance tool unavailable',
          description: 'Your current access settings do not allow this Finance module.',
          variant: 'destructive',
        })
        return false
      }

      nextFinanceModule = target.financeModule ?? financeModules[0]
    }

    const continueNavigation = () => {
      if (activeTab !== target.tab) setSearchQuery('')

      if (nextFinanceModule) setFinanceModule(nextFinanceModule)

      if (target.tab === 'orders') {
        if (target.ordersSubTab) setActiveOrdersSubTab(target.ordersSubTab)
        setOrdersInitialStatusGroup(target.ordersStatusGroup)

        if (target.orderNumber) {
          const order = allOrders.find((item) => item.orderNumber === target.orderNumber)
          setActiveOrdersSubTab('custom')
          setDateRange(undefined)
          if (order && activeBranch !== 'All' && order.branch !== activeBranch) {
            setActiveBranch('All')
          }
          setDeepLinkOrderNumber(target.orderNumber)
        }
      }

      setActiveTab(target.tab)

      if (target.tab === 'hr' && target.hrSection) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('hr-open-section', {
            detail: { section: target.hrSection, targetId: target.targetId },
          }))
        }, 0)
      }
    }

    if (activeTab === 'settings' && target.tab !== 'settings' && settingsHasUnsavedChanges) {
      requestSettingsNavigation(continueNavigation)
      return true
    }

    continueNavigation()
    return true
  }

  /** Existing top-level shell adapters now delegate to the navigation command. */
  const handleTabChange = (tab: AppTabId) => { navigate(toAppTab(tab)) }
  const goToOrders = () => { navigate(toOrders({ ordersSubTab: 'today' })) }
  const goToFinishedOrders = () => { navigate(toOrders({ ordersSubTab: 'today', ordersStatusGroup: 'finished' })) }

  const handleOpenOrderFromNotification = (orderNumber: string) => {
    if (navigate(toOrders({ orderNumber }))) setIsNotificationCenterOpen(false)
  }

  const handleOpenNotification = (item: NotificationItem) => {
    notifications.markRead(item.id)

    const didNavigate = item.target === 'order' && item.orderNumber
      ? navigate(toOrders({ orderNumber: item.orderNumber }))
      : item.target === 'finance_orders'
        ? navigate(toFinanceModule('collect_orders'))
        : item.target === 'hr_attendance'
          ? navigate(toHrSection('attendance', item.targetId))
          : item.target === 'hr_reports'
            ? navigate(toHrSection('reports', item.targetId))
          : item.target === 'my_schedule'
            ? navigate(toAppTab('dashboard'))
            : false

    if (didNavigate) setIsNotificationCenterOpen(false)
  }

  const handleBranchChange = async (nextBranch: BranchFilter): Promise<void> => {
    if (nextBranch === activeBranch) return
    const decision = getBranchSwitchDecision({
      role: userRole,
      scheduledBranchId,
      targetBranch: nextBranch,
    })
    if (!decision.allowed) {
      toast({ title: 'Select a branch', description: decision.reason, variant: 'destructive' })
      return
    }
    if (decision.requiresConfirmation) {
      const confirmed = await requestAppConfirmation({
        title: 'Work from another branch?',
        description: decision.reason ?? "This branch differs from today's schedule.",
        confirmLabel: 'Continue',
      })
      if (!confirmed) return
    }

    setActiveBranch(nextBranch)
    if (isOperationalBranchRole(userRole) && nextBranch !== 'All') {
      const date = getLocalDateString(nowInJakarta())
      setOperationalBranch(nextBranch, date)
      if (scheduledBranchId !== nextBranch) {
        useAuditLogStore.getState().append({
          entityType: 'system',
          entityId: actorEmployeeId,
          entityLabel: actorName,
          action: 'session.branch.override',
          outcome: 'succeeded',
          actor: { employeeId: actorEmployeeId, name: actorName, role: userRole },
          metadata: {
            scheduledBranchId,
            selectedBranchId: nextBranch,
            date,
          },
        })
      }
    }
  }

  /** @description Central navigation handler passed to dashboard sections. */
  const handleNavigate = (request: AppNavigationRequest) => { navigate(request) }

  // Access and feature toggles can change while a workspace is open. Move
  // through the same command instead of leaving the shell on a blank page.
  useEffect(() => {
    if (accessibleNavigationIds.includes(activeTab)) return
    const preferred = getDefaultTabForRole(userRole)
    const fallback = accessibleNavigationIds.includes(preferred)
      ? preferred
      : accessibleNavigationIds[0]
    if (fallback) navigate(toAppTab(fallback))
    // navigate intentionally omitted: this effect only reacts to access state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, accessibleNavigationIds, userRole])

  /**
   * @description Determines whether the main top bar's search field should
   * show for the current tab, and what it should say/search, so search
   * stays in one shared place instead of living on each tab individually.
   */
  const searchConfig: { show: boolean; placeholder: string; tabletPlaceholder?: string } =
    activeTab === 'orders'
      ? { show: true, placeholder: 'Search orders, customer, phone, or ID…' }
      : activeTab === 'customers'
        ? { show: true, placeholder: 'Search name, phone, or email' }
        : activeTab === 'finance' && financeModule === 'collect_orders'
          ? {
              show: true,
              placeholder: 'Search collect orders, customer, or ID...',
            }
        : activeTab === 'hr'
          ? {
              show: true,
              placeholder: ({
                employees: 'Search employees by name, phone, role, or ID…',
                attendance: 'Search attendance by employee or record…',
                scheduling: 'Search schedules by employee, branch, or shift…',
                reports: 'Search problems by employee, order, or type…',
                points: 'Search employee points…',
                payroll: 'Search payroll by employee or period…',
              } satisfies Record<HrSection, string>)[peopleSection],
              tabletPlaceholder: ({
                employees: 'Search employees…',
                attendance: 'Search attendance…',
                scheduling: 'Search schedules…',
                reports: 'Search reports…',
                points: 'Search points…',
                payroll: 'Search payroll…',
              } satisfies Record<HrSection, string>)[peopleSection],
            }
        : activeTab === 'catalog'
          ? { show: true, placeholder: 'Search products, SKU...' }
          : activeTab === 'stock' && inventoryEnabled
            ? { show: true, placeholder: 'Search inventory items...' }
            : { show: false, placeholder: '' }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar (hidden on mobile) */}
      <DesktopSidebarContainer
        activeBranch={activeBranch}
        onBranchChange={handleBranchChange}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        activeHrSection={peopleSection}
        onHrSectionChange={(section) => navigate(toHrSection(section))}
        onSignOut={onSignOut}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {/* Main vertical layout */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBarContainer
          activeBranch={activeBranch}
          onBranchChange={handleBranchChange}
          onOpenNotifications={() => setIsNotificationCenterOpen(true)}
          onSignOut={onSignOut}
          theme={theme}
          onToggleTheme={onToggleTheme}
          showSearch={searchConfig.show}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchPlaceholder={searchConfig.placeholder}
          tabletSearchPlaceholder={searchConfig.tabletPlaceholder}
          notificationCount={notifications.unreadCount}
        />

        <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-4 pt-5 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:gap-5 sm:px-6 sm:py-7 sm:pb-8 lg:gap-6 lg:px-8 lg:py-8">
          {activeTab === 'dashboard' && (
            <DashboardTab
              activeBranch={activeBranch}
              userRole={userRole}
              greeting={greeting}
              formattedDate={formattedDate}
              onNavigate={handleNavigate}
              onGoToOrders={goToOrders}
              onGoToFinishedOrders={goToFinishedOrders}
            />
          )}

          {activeTab === 'orders' && canAccessSection(userRole, 'orders', permissions) && (
            <section className="space-y-4">
              <OrdersTabHeader
                activeOrdersSubTab={activeOrdersSubTab}
                orderCounts={orderCounts}
                draftCount={draftCount}
                canCreateOrder={canCreateOrder}
                createOrderBlockedReason={createOrderBlockedReason}
                onNewOrder={() => { setEditingOrderDraftId(null); setIsNewOrderOpen(true) }}
              />

              <OrdersSubTabs
                activeTab={activeOrdersSubTab}
                onTabChange={setActiveOrdersSubTab}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                futureOrderCount={futureOrderCount}
              />

              <OrdersTableViewContainer
                activeScope={activeOrdersSubTab}
                activeBranch={activeBranch}
                dateRange={dateRange}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                initialSelectedOrderNumber={deepLinkOrderNumber}
                onInitialSelectedOrderNumberConsumed={() =>
                  setDeepLinkOrderNumber(null)
                }
                initialStatusGroupFilter={ordersInitialStatusGroup}
                onOpenDraft={(draftId) => {
                  setEditingOrderDraftId(draftId)
                  setIsNewOrderOpen(true)
                }}
              />
            </section>
          )}

          {activeTab === 'revenue' && canAccessSection(userRole, 'revenue', permissions) && (
            <RevenueDashboardContainer activeBranch={activeBranch} />
          )}

          {activeTab === 'finance' && canAccessSection(userRole, 'finance', permissions) && (
            <section className="space-y-4 sm:space-y-5">
              {financeModules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center shadow-ios-sm">
                  <p className="text-sm font-semibold">No Finance module available</p>
                  <p className="mt-1 text-xs text-muted-foreground">{userRole === 'owner' ? 'Enable at least one Finance feature in Owner Settings.' : 'Ask the Owner to enable a Finance feature for your role.'}</p>
                </div>
              ) : <>
              <FinanceWorkspaceTabs
                modules={financeModules}
                activeModule={financeModule}
                onChange={(module) => { navigate(toFinanceModule(module)) }}
              />

              {financeModule === 'collect_orders' && (
                <OrderTransactionVerificationQueueContainer
                  orders={branchOrders}
                  canVerify={canVerifyFinance}
                  canResolveRequest={canResolveFinanceRequest}
                  actorName={actorName}
                  userRole={userRole}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  showHeading={financeModules.length > 1}
                />
              )}

              {financeModule === 'payroll' && hasActionPermission(userRole, 'finance.view_payroll', actionPermissions, permissions) && (
                <>
                  <PayrollScheduleCard title="Payroll schedule" />
                  <FinancePayrollScheduleAdjustment />
                  <FinancePayrollReview />
                </>
              )}

              {financeModule === 'refunds' && hasActionPermission(userRole, 'finance.view_refunds', actionPermissions, permissions) && (
                <FinanceRefundQueue
                  orders={branchOrders}
                  actorName={actorName}
                  actorRole={userRole}
                  onOpenOrder={handleOpenOrderFromNotification}
                />
              )}

              {financeModule === 'ledger' && hasActionPermission(userRole, 'finance.view_ledger', actionPermissions, permissions) && (
                <>
                  {hasActionPermission(userRole, 'finance.create_ledger_entry', actionPermissions, permissions) && <AddInternalTransaction
                    branches={activeBranchIds}
                    defaultBranch={activeBranch === 'All' ? undefined : activeBranch}
                    actorName={actorName}
                    actorRole={userRole}
                  />}
                  <InternalTransactionVerificationQueueContainer
                    transactions={allTransactions}
                    defaultBranch={activeBranch}
                    canVerify={canVerifyInternalTransactions}
                    actorName={actorName}
                    actorRole={userRole}
                  />
                </>
              )}
              </>}
            </section>
          )}

          {activeTab === 'hr' && canAccessHrWorkspace && (
            <HrTabContentContainer
              activeBranch={activeBranch}
              onOpenOrder={handleOpenOrderFromNotification}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onActiveSectionChange={setPeopleSection}
            />
          )}

          {activeTab === 'catalog' && canAccessSection(userRole, 'catalog', permissions) && (
            <CatalogTabContentContainer
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
            />
          )}

          {activeTab === 'stock' && inventoryEnabled && canAccessSection(userRole, 'stock', permissions) && (
            <StockTabContentContainer
              activeBranch={activeBranch}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
            />
          )}

          {activeTab === 'customers' && canAccessSection(userRole, 'customers', permissions) && (
            <CustomersTabContentContainer
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
            />
          )}

          {activeTab === 'settings' && canAccessSection(userRole, 'settings', permissions) && (
            <SettingsCenterContainer />
          )}
        </main>

        {/* Mobile bottom tab bar (hidden on desktop) */}
        <div className="md:hidden">
          <BottomTabBarContainer
            activeTab={activeTab}
            activeHrSection={peopleSection}
            onTabChange={(tab) => {
              if (tab === 'hr-attendance') navigate(toHrSection('attendance'))
              else if (tab === 'hr-people') navigate(toHrSection('employees'))
              else if (tab === 'hr-payroll') navigate(toHrSection('payroll'))
              else handleTabChange(tab)
            }}
            onOpenNewOrder={() => { if (activeBranch === 'All') return; setEditingOrderDraftId(null); setIsNewOrderOpen(true) }}
          />
        </div>
      </div>

      {/* New Order sheet overlay, opened from the main button or bottom tab bar */}
      <NewOrderSheetContainer
        open={isNewOrderOpen}
        onClose={() => { setIsNewOrderOpen(false); setEditingOrderDraftId(null) }}
        activeBranch={activeBranch}
        draftId={editingOrderDraftId}
      />

      <NotificationCenter
        open={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        items={notifications.items}
        onMarkAllRead={notifications.markAllRead}
        onOpenNotification={handleOpenNotification}
      />

    </div>
  )
}

export default HomePage
