/**
 * @file FinanceWorkspace.tsx
 * @description The Finance tab. Four tabs from the registry in
 * financeWorkspaceDomain (Tasks, Cash & Transactions, Payroll, Reports), a
 * month picker for the month-based tabs, Finance settings, and the sheets
 * every tab shares (order review, transaction detail, edit, void) — mounted
 * once here instead of once per screen.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import type { BranchId, OrderTableRow } from '../../types/orders'
import { useFinanceStore } from '../../store/financeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { usePayrollStore } from '../../store/payrollStore'
import { buildFinanceTasks } from '../../domain/financeTasksDomain'
import { FINANCE_MODULES, type FinanceWorkspaceModule } from '../../domain/financeWorkspaceDomain'
import { formatMonthKey, jakartaMonthKey, nextMonthKey, previousMonthKey, recentMonthKeys } from '../../domain/financeDates'
import { getFinanceCategoryLabel } from '../../domain/financeTransactionCategoryDomain'
import { canEditFinanceTransaction, canVoidFinanceTransaction } from '../../domain/financeTransactionActionsDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { useActiveItemScroll } from '../../hooks/useActiveItemScroll'
import { cn } from '../../lib/utils'
import { AppSheet } from '../ui/app-sheet'
import { FinanceCategorySettingsPanel } from '../settings/FinanceCategorySettingsPanel'
import { usePendingPurchasesStore } from '../inventory/pendingPurchasesStore'
import { FinanceTasksTab } from './FinanceTasksTab'
import { FinanceCashTab } from './FinanceCashTab'
import { FinanceReportTab } from './FinanceReportTab'
import { FinancePayrollScheduleAdjustment } from './FinancePayrollScheduleAdjustment'
import { FinancePayrollReview } from './FinancePayrollReview'
import { OrderFinanceReviewSheetContainer } from './OrderFinanceReviewSheetContainer'
import { FinanceTransactionDetailSheet } from './FinanceTransactionDetailSheet'
import { FinancePostedTransactionEditor } from './FinancePostedTransactionEditor'
import { FinanceVoidTransactionDialog } from './FinanceVoidTransactionDialog'
import { useFinanceUiStore } from './financeUiStore'
import { useFinanceAccess } from './useFinanceAccess'
import { useFinanceAccounts } from './useFinanceAccounts'

interface FinanceWorkspaceProps {
  activeModule: FinanceWorkspaceModule
  onChangeModule: (module: FinanceWorkspaceModule) => void
  /** Orders already scoped to the active branch. */
  orders: OrderTableRow[]
  branches: BranchId[]
  defaultBranch?: BranchId
  /** Shared top-bar search; used by Tasks and Cash & Transactions. */
  searchQuery: string
  onOpenOrder: (orderNumber: string) => void
}

const MONTH_RANGE = 24

const MonthPicker: FC = () => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const month = useFinanceUiStore((state) => state.month)
  const setMonth = useFinanceUiStore((state) => state.setMonth)
  const current = jakartaMonthKey()
  const months = useMemo(() => recentMonthKeys(MONTH_RANGE, current), [current])
  const oldest = months[months.length - 1]
  return (
    <div className="inline-flex h-10 items-center rounded-full bg-card ring-1 ring-border/70">
      <button type="button" aria-label={tr('Previous month', 'Bulan sebelumnya')} disabled={month <= oldest} onClick={() => setMonth(previousMonthKey(month))} className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30">
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <select
        aria-label={tr('Month', 'Bulan')}
        value={month}
        onChange={(event) => setMonth(event.target.value)}
        className="h-10 appearance-none bg-transparent px-1 text-center text-sm font-semibold outline-none"
      >
        {months.map((item) => <option key={item} value={item}>{formatMonthKey(item, language)}</option>)}
      </select>
      <button type="button" aria-label={tr('Next month', 'Bulan berikutnya')} disabled={month >= current} onClick={() => setMonth(nextMonthKey(month))} className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30">
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export const FinanceWorkspace: FC<FinanceWorkspaceProps> = ({
  activeModule,
  onChangeModule,
  orders,
  branches,
  defaultBranch,
  searchQuery,
  onOpenOrder,
}) => {
  const tr = useBilingualCopy()
  const access = useFinanceAccess()
  const transactions = useFinanceStore((state) => state.transactions)
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const allOrders = useOrdersStore((state) => state.orders)
  const payrollProposals = usePayrollStore((state) => state.payrollProposals)
  const purchases = usePendingPurchasesStore((state) => state.purchases)
  const loadPurchases = usePendingPurchasesStore((state) => state.load)
  const ui = useFinanceUiStore()
  const { labelOf } = useFinanceAccounts()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const tabsRef = useActiveItemScroll<HTMLElement>(activeModule, '[aria-current="page"]')

  useEffect(() => {
    if (access.canConfirmPurchases) void loadPurchases()
  }, [access.canConfirmPurchases, loadPurchases])

  // A focus request (notification, Tasks link) switches to the tab it targets.
  useEffect(() => {
    const target = ui.focus?.module
    if (target && target !== activeModule && access.modules.includes(target)) onChangeModule(target)
    // Only react to new focus requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.focusVersion])

  const purchaseCount = access.canConfirmPurchases ? purchases.length : 0
  const tasks = useMemo(
    () => buildFinanceTasks({ orders, transactions, payrollProposals, purchaseCount, searchQuery }),
    [orders, payrollProposals, purchaseCount, searchQuery, transactions],
  )
  // Badges ignore the search box: they count the work, not the current view.
  const badgeCounts = useMemo(
    () => (searchQuery ? buildFinanceTasks({ orders, transactions, payrollProposals, purchaseCount }).counts : tasks.counts),
    [orders, payrollProposals, purchaseCount, searchQuery, tasks.counts, transactions],
  )
  const badges: Partial<Record<FinanceWorkspaceModule, number>> = {
    tasks: badgeCounts.total,
    payroll: badgeCounts.payrollReview + badgeCounts.payrollReady,
  }

  const modules = FINANCE_MODULES.filter((module) => access.modules.includes(module.id))
  const showMonth = activeModule === 'cash' || activeModule === 'report'
  // Categories are about recording money, so their settings sit with the ledger.
  const showSettings = activeModule === 'cash' && access.canCreateEntry

  const reviewOrder = ui.reviewOrderNumber
    ? allOrders.find((order) => order.orderNumber === ui.reviewOrderNumber) ?? null
    : null
  const detail = ui.detailTransactionId
    ? transactions.find((transaction) => transaction.id === ui.detailTransactionId) ?? null
    : null
  const detailOrder = detail?.orderNumber ? allOrders.find((order) => order.orderNumber === detail.orderNumber) : undefined
  const detailEditable = detail ? canEditFinanceTransaction(detail, access.canEditEntry) : false
  const detailVoidable = detail ? canVoidFinanceTransaction(detail, access.canEditEntry) : false

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          ref={tabsRef}
          aria-label={tr('Finance', 'Keuangan')}
          role="tablist"
          className="no-scrollbar -mx-4 flex min-w-0 max-w-full gap-1 overflow-x-auto px-4 py-1 sm:mx-0 sm:rounded-xl sm:bg-muted/55 sm:p-1"
        >
          {modules.map((module) => {
            const active = module.id === activeModule
            const badge = badges[module.id] ?? 0
            const label = tr(module.label.en, module.label.id)
            const shortLabel = module.shortLabel ? tr(module.shortLabel.en, module.shortLabel.id) : label
            return (
              <button
                key={module.id}
                type="button"
                role="tab"
                aria-label={badge > 0 ? `${label} ${badge}` : label}
                aria-selected={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => onChangeModule(module.id)}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                  active ? 'bg-primary text-primary-foreground shadow-ios-sm' : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {/* Phones get the short name so all four tabs fit on one line. */}
                <span className="sm:hidden" aria-hidden="true">{shortLabel}</span>
                <span className="hidden sm:inline" aria-hidden="true">{label}</span>
                {badge > 0 && (
                  <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', active ? 'bg-primary-foreground/20' : 'bg-warning/15 text-warning')}>{badge}</span>
                )}
              </button>
            )
          })}
        </nav>
        {(showMonth || showSettings) && <div className="flex items-center gap-2">
          {showMonth && <MonthPicker />}
          {showSettings && (
            <button type="button" aria-label={tr('Finance settings', 'Pengaturan keuangan')} onClick={() => setSettingsOpen(true)} className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border/70 hover:bg-muted hover:text-foreground">
              <Settings2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>}
      </div>

      {activeModule === 'tasks' && <FinanceTasksTab tasks={tasks} access={access} onOpenOrder={onOpenOrder} />}
      {activeModule === 'cash' && (
        <FinanceCashTab transactions={transactions} access={access} branches={branches} defaultBranch={defaultBranch} searchQuery={searchQuery} />
      )}
      {activeModule === 'payroll' && (
        <div className="space-y-5">
          <FinancePayrollScheduleAdjustment />
          <FinancePayrollReview />
        </div>
      )}
      {activeModule === 'report' && <FinanceReportTab access={access} />}

      {reviewOrder && (
        <OrderFinanceReviewSheetContainer
          order={reviewOrder}
          onClose={() => ui.openOrderReview(null)}
          canVerify={access.canVerifyOrders}
          actorName={access.actorName}
          userRole={access.role}
        />
      )}
      <FinanceTransactionDetailSheet
        transaction={detail}
        accountLabel={detail ? labelOf(detail.accountId) : '—'}
        categoryLabel={detail ? getFinanceCategoryLabel(detail.category, customCategories, categoryOverrides) : '—'}
        editable={detailEditable}
        onClose={() => ui.openTransactionDetail(null)}
        onEdit={detail && detailEditable ? () => ui.openTransactionEdit(detail.id) : undefined}
        onVoid={detail && detailVoidable ? () => ui.openTransactionVoid(detail.id) : undefined}
        onOpenOrder={detailOrder ? () => {
          ui.openTransactionDetail(null)
          ui.openOrderReview(detailOrder.orderNumber)
        } : undefined}
        onOpenPayroll={detail?.payrollProposalId ? () => {
          const proposalId = detail.payrollProposalId
          ui.openTransactionDetail(null)
          ui.requestFocus({ module: 'payroll', view: 'history', proposalId })
        } : undefined}
      />
      <FinancePostedTransactionEditor />
      <FinanceVoidTransactionDialog />

      <AppSheet open={settingsOpen} onOpenChange={setSettingsOpen} side="responsiveRight" size="wide" title={tr('Finance settings', 'Pengaturan keuangan')}>
        <div className="overflow-y-auto px-4 pb-6 pt-4 sm:px-5">
          <FinanceCategorySettingsPanel />
        </div>
      </AppSheet>
    </div>
  )
}
