/**
 * @file FinanceTasksTab.tsx
 * @description Finance's inbox: every item waiting on Finance, in the order
 * that unblocks other people first — Admin change requests, Manager stock
 * purchases, payment reconciliation, refunds, payroll, account cleanup.
 * Finished items leave this list; their history lives in Cash & Transactions.
 */

import { useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronDown, Undo2 } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { FinanceQueueRow } from '../../domain/financeReconciliationDomain'
import type { FinanceTaskCounts, FinanceTasks } from '../../domain/financeTasksDomain'
import { daysSince } from '../../domain/financeDates'
import { formatIdrCurrency } from '../../lib/formatters'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { toast } from '../../hooks/use-toast'
import { isServerAuthoritative } from '../../data/serverAuthority'
import { reconcileOrderPayments, type BulkReconciliationOutcome } from '../../data/orderFinanceReconciliation'
import { ChipRow, FilterChip, StatusChip } from '../ui/chip'
import { Checkbox } from '../ui/checkbox'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { PurchaseConfirmationQueue } from '../inventory/PurchaseConfirmationQueue'
import { ChangeRequestList } from './ChangeRequestList'
import { FinanceRefundDialog, type FinanceRefundAction } from './FinanceRefundDialog'
import { useFinanceUiStore, type FinanceTaskFilter } from './financeUiStore'
import type { FinanceAccess } from './useFinanceAccess'
import { useFinanceAccounts } from './useFinanceAccounts'

/**
 * How long a one-tap "Cocok" waits before it is sent. Reconciliation has no
 * server-side undo, so a mis-tap on a phone must be catchable here.
 */
export const MATCH_UNDO_MS = 5000

type LocalVerify = (order: OrderTableRow) => { allowed: boolean; reason?: string }

/** Sends matches to the server (or the offline store); never touches component state. */
const commitReconciliation = async (orders: OrderTableRow[], verifyLocal: LocalVerify): Promise<BulkReconciliationOutcome> => {
  if (isServerAuthoritative()) return reconcileOrderPayments(orders)
  const outcome: BulkReconciliationOutcome = { reconciled: [], failed: [] }
  for (const order of orders) {
    const result = verifyLocal(order)
    if (result.allowed) outcome.reconciled.push(order.orderNumber)
    else outcome.failed.push({ orderNumber: order.orderNumber, reason: result.reason ?? '' })
  }
  return outcome
}

interface FinanceTasksTabProps {
  tasks: FinanceTasks
  access: FinanceAccess
  /** Top-bar search the lists are already filtered by; only used to word the empty state. */
  searchQuery: string
}

const Section: FC<{ title: string; count: number; actions?: ReactNode; children: ReactNode }> = ({ title, count, actions, children }) => (
  <section aria-label={title} className="space-y-2">
    <header className="flex min-h-9 flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">
        {title} <span className="ml-1 tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {actions}
    </header>
    {children}
  </section>
)

const ageLabel = (value: string | undefined, tr: (en: string, id: string) => string): string => {
  const days = daysSince(value)
  if (days === 0) return tr('today', 'hari ini')
  return tr(`${days}d ago`, `${days} hari lalu`)
}

/** One line of work: what it is, the money, how old, and one action. */
const TaskRow: FC<{
  title: ReactNode
  /** Rendered as separate text nodes so system text (e.g. a refund reason) translates on its own. */
  meta: Array<string | undefined | null>
  amount?: number
  onOpen?: () => void
  leading?: ReactNode
  action?: ReactNode
  tone?: 'default' | 'muted'
}> = ({ title, meta, amount, onOpen, leading, action, tone = 'default' }) => (
  <div className={`flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border/60 ${tone === 'muted' ? 'bg-surface-panel' : 'bg-card'}`}>
    {leading}
    <button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default">
      <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
      {/* Phones: the amount leads the second line so the name keeps its width. */}
      {amount !== undefined && <span className="mt-0.5 block text-sm font-semibold tabular-nums text-foreground sm:hidden">{formatIdrCurrency(amount)}</span>}
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
        {meta.filter(Boolean).map((part, index) => <span key={`${index}-${part}`}>{index > 0 ? ' · ' : ''}<span>{part}</span></span>)}
      </span>
    </button>
    {amount !== undefined && <span className="hidden shrink-0 text-sm font-semibold tabular-nums text-foreground sm:block">{formatIdrCurrency(amount)}</span>}
    {action}
  </div>
)

const LinkRow: FC<{ label: string; detail?: string; onOpen: () => void }> = ({ label, detail, onOpen }) => (
  <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left ring-1 ring-border/60 transition hover:bg-surface-panel">
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
      {detail && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>}
    </span>
    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </button>
)

const filterVisible = (filter: FinanceTaskFilter, section: Exclude<FinanceTaskFilter, 'all'>): boolean =>
  filter === 'all' || filter === section

export const FinanceTasksTab: FC<FinanceTasksTabProps> = ({ tasks, access, searchQuery }) => {
  const tr = useBilingualCopy()
  const filter = useFinanceUiStore((state) => state.taskFilter)
  const setFilter = useFinanceUiStore((state) => state.setTaskFilter)
  const openOrderReview = useFinanceUiStore((state) => state.openOrderReview)
  const requestFocus = useFinanceUiStore((state) => state.requestFocus)
  const approveChangeRequest = useOrdersStore((state) => state.approveChangeRequest)
  const rejectChangeRequest = useOrdersStore((state) => state.rejectChangeRequest)
  const verifyOrderFinance = useOrdersStore((state) => state.verifyOrderFinance)
  const employeeId = useUserStore((state) => state.employeeId)
  const branchId = useUserStore((state) => state.branchId)
  const { labelOf } = useFinanceAccounts()
  const actor = { employeeId, name: access.actorName, role: access.role, branchId }

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [busyOrders, setBusyOrders] = useState<Set<string>>(new Set())
  const [refundAction, setRefundAction] = useState<FinanceRefundAction | null>(null)
  const [showAwaitingAdmin, setShowAwaitingAdmin] = useState(false)

  const { counts } = tasks
  const [queuedNumbers, setQueuedNumbers] = useState<Set<string>>(new Set())
  const selectableRows = useMemo(
    () => tasks.reconciliation.filter((row) => !queuedNumbers.has(row.order.orderNumber)),
    [queuedNumbers, tasks.reconciliation],
  )
  const selectedRows = useMemo(
    () => selectableRows.filter((row) => selected.has(row.order.orderNumber)),
    [selectableRows, selected],
  )
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.paymentAmountIdr, 0)

  // Latest actor + store action, for matches that are sent after a delay or on unmount.
  const latest = useRef<{ verifyLocal: LocalVerify; tr: typeof tr }>({ verifyLocal: () => ({ allowed: false }), tr })
  latest.current = {
    verifyLocal: (order) => verifyOrderFinance({ orderNumber: order.orderNumber, expectedRevision: order.revision ?? 1, actor }),
    tr,
  }

  const reportOutcome = (outcome: BulkReconciliationOutcome) => {
    const t = latest.current.tr
    if (outcome.reconciled.length > 0) {
      toast({ title: t(`${outcome.reconciled.length} payment(s) reconciled`, `${outcome.reconciled.length} pembayaran cocok`) })
    }
    if (outcome.failed.length > 0) {
      toast({
        title: t(`${outcome.failed.length} payment(s) not reconciled`, `${outcome.failed.length} pembayaran gagal dicocokkan`),
        description: outcome.failed.map((item) => `${item.orderNumber}: ${item.reason}`).join(' · '),
        variant: 'destructive',
      })
    }
  }

  const mounted = useRef(true)
  const reconcile = async (orders: OrderTableRow[]): Promise<void> => {
    const numbers = orders.map((order) => order.orderNumber)
    setBusyOrders((current) => new Set([...current, ...numbers]))
    let outcome: BulkReconciliationOutcome
    try {
      outcome = await commitReconciliation(orders, latest.current.verifyLocal)
    } catch (error) {
      outcome = { reconciled: [], failed: numbers.map((orderNumber) => ({ orderNumber, reason: error instanceof Error ? error.message : String(error) })) }
    } finally {
      if (mounted.current) setBusyOrders((current) => new Set([...current].filter((value) => !numbers.includes(value))))
    }
    if (mounted.current) setSelected((current) => new Set([...current].filter((value) => !outcome.reconciled.includes(value))))
    reportOutcome(outcome)
  }

  // One-tap matches wait MATCH_UNDO_MS with an "Urungkan" button before they are sent.
  const queued = useRef(new Map<string, { order: OrderTableRow; timer: ReturnType<typeof setTimeout> }>())
  const forgetQueued = (orderNumber: string) => {
    queued.current.delete(orderNumber)
    if (mounted.current) setQueuedNumbers(new Set(queued.current.keys()))
  }
  const queueMatch = (order: OrderTableRow) => {
    if (queued.current.has(order.orderNumber)) return
    const timer = setTimeout(() => {
      forgetQueued(order.orderNumber)
      void reconcile([order])
    }, MATCH_UNDO_MS)
    queued.current.set(order.orderNumber, { order, timer })
    setQueuedNumbers(new Set(queued.current.keys()))
  }
  const undoMatch = (orderNumber: string) => {
    const entry = queued.current.get(orderNumber)
    if (!entry) return
    clearTimeout(entry.timer)
    forgetQueued(orderNumber)
  }

  // Leaving the tab sends what is still queued: the tap was a decision, the delay only a safety net.
  useEffect(() => {
    mounted.current = true
    const pending = queued.current
    return () => {
      mounted.current = false
      const orders = [...pending.values()].map((entry) => {
        clearTimeout(entry.timer)
        return entry.order
      })
      pending.clear()
      if (orders.length > 0) void commitReconciliation(orders, latest.current.verifyLocal).then(reportOutcome)
    }
    // reportOutcome only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (orderNumber: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(orderNumber)
      else next.delete(orderNumber)
      return next
    })

  const allSelected = selectableRows.length > 0 && selectedRows.length === selectableRows.length

  const chips: Array<{ id: FinanceTaskFilter; label: string; count: number }> = [
    { id: 'requests', label: tr('Requests', 'Permintaan'), count: counts.requests },
    { id: 'purchases', label: tr('Purchases', 'Pembelian'), count: counts.purchases },
    { id: 'reconciliation', label: tr('Reconciliation', 'Rekonsiliasi'), count: counts.reconciliation },
    { id: 'refunds', label: tr('Refunds', 'Pengembalian dana'), count: counts.refunds },
    { id: 'payroll', label: tr('Payroll', 'Penggajian'), count: counts.payrollReview + counts.payrollReady },
    { id: 'accounts', label: tr('Accounts', 'Rekening'), count: counts.accounts },
  ]
  // Payments back with Admin are not Finance work, but their chip stays so they can be found.
  const visibleChips = chips.filter((chip) => chip.count > 0 || chip.id === filter || (chip.id === 'reconciliation' && counts.awaitingAdmin > 0))
  const nothingOpen = counts.total === 0 && counts.awaitingAdmin === 0

  const reconciliationRow = (row: FinanceQueueRow, awaitingAdmin: boolean) => {
    const orderNumber = row.order.orderNumber
    const busy = busyOrders.has(orderNumber)
    const isQueued = queuedNumbers.has(orderNumber)
    return (
      <TaskRow
        key={orderNumber}
        tone={awaitingAdmin || isQueued ? 'muted' : 'default'}
        title={`${orderNumber} · ${row.order.customerName}`}
        meta={[
          row.order.branch,
          labelOf(row.accountId),
          awaitingAdmin
            ? tr('waiting for Admin', 'menunggu Admin')
            : isQueued
              ? tr(`matching in ${MATCH_UNDO_MS / 1000}s`, `dicocokkan dalam ${MATCH_UNDO_MS / 1000} detik`)
              : ageLabel(row.paymentConfirmedAt, tr),
        ]}
        amount={row.paymentAmountIdr}
        onOpen={() => openOrderReview(orderNumber)}
        leading={!awaitingAdmin && access.canVerifyOrders ? (
          <Checkbox
            aria-label={tr(`Select ${orderNumber}`, `Pilih ${orderNumber}`)}
            checked={selected.has(orderNumber) && !isQueued}
            disabled={isQueued || busy}
            onCheckedChange={(checked) => toggle(orderNumber, checked === true)}
          />
        ) : undefined}
        action={!awaitingAdmin && access.canVerifyOrders ? (
          isQueued ? (
            <button
              type="button"
              onClick={() => undoMatch(orderNumber)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground"
            >
              <Undo2 className="size-4" aria-hidden="true" /> {tr('Undo', 'Urungkan')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => queueMatch(row.order)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Check className="size-4" aria-hidden="true" /> {busy ? tr('Matching…', 'Mencocokkan…') : tr('Match', 'Cocok')}
            </button>
          )
        ) : awaitingAdmin ? <StatusChip tone="warning">{tr('Correction', 'Koreksi')}</StatusChip> : undefined}
      />
    )
  }

  const searching = searchQuery.trim().length > 0
  const shownCount = (filter === 'all' || filter === 'requests' ? tasks.requests.length : 0)
    + (access.canConfirmPurchases && (filter === 'all' || filter === 'purchases') ? counts.purchases : 0)
    + (filter === 'all' || filter === 'reconciliation' ? tasks.reconciliation.length + tasks.awaitingAdmin.length : 0)
    + (access.canViewRefunds && (filter === 'all' || filter === 'refunds') ? tasks.refunds.length : 0)
    + (access.canViewPayroll && (filter === 'all' || filter === 'payroll') ? counts.payrollReview + counts.payrollReady : 0)
    + (access.canViewLedger && (filter === 'all' || filter === 'accounts') ? counts.accounts : 0)

  return (
    <div className="space-y-5">
      {(visibleChips.length > 0 || filter !== 'all') && (
        <ChipRow activeKey={filter} aria-label={tr('Task filters', 'Filter tugas')}>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            {tr('All', 'Semua')} <span className="tabular-nums">{counts.total}</span>
          </FilterChip>
          {visibleChips.map((chip) => (
            <FilterChip key={chip.id} active={filter === chip.id} onClick={() => setFilter(chip.id)}>
              {chip.label} <span className="tabular-nums">{chip.count}</span>
            </FilterChip>
          ))}
        </ChipRow>
      )}

      {shownCount === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {searching
            ? tr('No tasks match this search.', 'Tidak ada tugas yang cocok dengan pencarian.')
            : filter !== 'all' && !nothingOpen
              ? tr('Nothing left here.', 'Tidak ada lagi di sini.')
              : tr('All caught up.', 'Semua beres.')}
        </p>
      )}

      {filterVisible(filter, 'requests') && tasks.requests.length > 0 && (
        <Section title={tr('Admin change requests', 'Permintaan ubah dari Admin')} count={tasks.requests.length}>
          <ChangeRequestList
            orders={tasks.requests}
            canResolveRequest={access.canResolveChangeRequests}
            actorName={access.actorName}
            onSelectOrder={(order) => openOrderReview(order.orderNumber)}
            onApprove={(orderNumber, _actor, note) => {
              const order = tasks.requests.find((item) => item.orderNumber === orderNumber)
              if (!order) return
              const result = approveChangeRequest({ orderNumber, expectedRevision: order.revision ?? 1, actor, note })
              if (!result.allowed) toast({ title: tr('Request was not approved', 'Permintaan gagal disetujui'), description: result.reason, variant: 'destructive' })
            }}
            onReject={(orderNumber, _actor, note) => {
              const order = tasks.requests.find((item) => item.orderNumber === orderNumber)
              if (!order) return
              const result = rejectChangeRequest({ orderNumber, expectedRevision: order.revision ?? 1, actor, note })
              if (!result.allowed) toast({ title: tr('Request was not rejected', 'Permintaan gagal ditolak'), description: result.reason, variant: 'destructive' })
            }}
          />
        </Section>
      )}

      {access.canConfirmPurchases && filterVisible(filter, 'purchases') && counts.purchases > 0 && (
        <Section title={tr('Stock purchases to confirm', 'Pembelian stok untuk dikonfirmasi')} count={counts.purchases}>
          <PurchaseConfirmationQueue embedded />
        </Section>
      )}

      {filterVisible(filter, 'reconciliation') && (tasks.reconciliation.length > 0 || tasks.awaitingAdmin.length > 0) && (
        <Section
          title={tr('Payments to reconcile', 'Pembayaran untuk dicocokkan')}
          count={tasks.reconciliation.length}
          actions={access.canVerifyOrders && tasks.reconciliation.length > 1 ? (
            <div className="flex items-center gap-2">
              <label className="inline-flex h-9 items-center gap-2 rounded-full px-2 text-xs font-medium text-muted-foreground">
                <Checkbox
                  aria-label={tr('Select all', 'Pilih semua')}
                  checked={allSelected}
                  onCheckedChange={(checked) => setSelected(checked === true ? new Set(selectableRows.map((row) => row.order.orderNumber)) : new Set())}
                />
                {tr('All', 'Semua')}
              </label>
              {selectedRows.length > 0 && (
                <button type="button" onClick={() => setBulkConfirmOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground">
                  <Check className="size-3.5" aria-hidden="true" /> {tr(`Match ${selectedRows.length}`, `Cocokkan ${selectedRows.length}`)}
                </button>
              )}
            </div>
          ) : undefined}
        >
          <div className="space-y-2">
            {tasks.reconciliation.map((row) => reconciliationRow(row, false))}
            {tasks.awaitingAdmin.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowAwaitingAdmin((value) => !value)}
                  aria-expanded={showAwaitingAdmin}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={`size-4 transition-transform ${showAwaitingAdmin ? 'rotate-180' : ''}`} aria-hidden="true" />
                  {tr(`Returned to Admin for correction · ${tasks.awaitingAdmin.length}`, `Dikembalikan ke Admin untuk dikoreksi · ${tasks.awaitingAdmin.length}`)}
                </button>
                {showAwaitingAdmin && tasks.awaitingAdmin.map((row) => reconciliationRow(row, true))}
              </div>
            )}
          </div>
        </Section>
      )}

      {access.canViewRefunds && filterVisible(filter, 'refunds') && tasks.refunds.length > 0 && (
        <Section title={tr('Refunds to pay out', 'Pengembalian dana untuk dibayar')} count={tasks.refunds.length}>
          <div className="space-y-2">
            {tasks.refunds.map((order) => (
              <TaskRow
                key={order.orderNumber}
                title={`${order.orderNumber} · ${order.customerName}`}
                meta={[order.refundReason, ageLabel(order.refundInitiatedAt, tr)]}
                amount={order.refundAmountIdr ?? 0}
                onOpen={() => openOrderReview(order.orderNumber)}
                action={access.canManageRefunds ? (
                  <button type="button" onClick={() => setRefundAction({ type: 'complete', order })} className="inline-flex h-10 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
                    {tr('Pay out', 'Selesaikan')}
                  </button>
                ) : undefined}
              />
            ))}
          </div>
        </Section>
      )}

      {access.canViewPayroll && filterVisible(filter, 'payroll') && counts.payrollReview + counts.payrollReady > 0 && (
        <Section title={tr('Payroll', 'Penggajian')} count={counts.payrollReview + counts.payrollReady}>
          <div className="space-y-2">
            {counts.payrollReview > 0 && (
              <LinkRow
                label={tr(`${counts.payrollReview} proposal(s) to review`, `${counts.payrollReview} proposal perlu direview`)}
                onOpen={() => requestFocus({ module: 'payroll', view: 'review' })}
              />
            )}
            {counts.payrollReady > 0 && (
              <LinkRow
                label={tr(`${counts.payrollReady} ready to pay`, `${counts.payrollReady} siap dibayar`)}
                onOpen={() => requestFocus({ module: 'payroll', view: 'ready' })}
              />
            )}
          </div>
        </Section>
      )}

      {access.canViewLedger && filterVisible(filter, 'accounts') && counts.accounts > 0 && (
        <Section title={tr('Accounts to tidy', 'Rekening untuk dirapikan')} count={counts.accounts}>
          <LinkRow
            label={tr(`${counts.accounts} old transaction(s) without an account`, `${counts.accounts} transaksi lama belum ada rekening`)}
            detail={tr('Edit each one and choose the account.', 'Ubah satu per satu dan pilih rekeningnya.')}
            onOpen={() => requestFocus({ module: 'cash', accountId: 'legacy:unassigned' })}
          />
        </Section>
      )}

      <ConfirmActionDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title={tr(`Match ${selectedRows.length} payments?`, `Cocokkan ${selectedRows.length} pembayaran?`)}
        description={tr(
          `Total ${formatIdrCurrency(selectedTotal)}. Each payment is marked reconciled; the money is already posted.`,
          `Total ${formatIdrCurrency(selectedTotal)}. Setiap pembayaran ditandai cocok; uangnya sudah tercatat.`,
        )}
        confirmLabel={tr('Match all', 'Cocokkan semua')}
        cancelLabel={tr('Back', 'Kembali')}
        onConfirm={() => {
          setBulkConfirmOpen(false)
          void reconcile(selectedRows.map((row) => row.order))
        }}
      />

      <FinanceRefundDialog action={refundAction} onClose={() => setRefundAction(null)} onChangeAction={setRefundAction} />
    </div>
  )
}

/** Count shown on the Tasks tab. */
export const financeTaskBadge = (counts: FinanceTaskCounts): number => counts.total
