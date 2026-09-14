import { useEffect, useMemo, useState, type FC, type KeyboardEvent } from 'react'
import { ExternalLink, FileCheck2, Pencil, ReceiptText, Search } from 'lucide-react'
import type {
  FinanceCategory,
  FinanceTransaction,
  FinanceTransactionType,
} from '../../store/financeStoreTypes'
import { useFinanceStore } from '../../store/financeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { isActionAuthorized } from '../../config/authorization'
import { getFinanceCategoryLabel } from '../../domain/financeTransactionCategoryDomain'
import { openFinanceTransactionProof } from '../../data/financeTransactionProof'
import { toast } from '../../hooks/use-toast'
import type { TransactionLedgerViewModel } from './TransactionLedgerController'
import { StatusChip } from '../ui/chip'
import { OrderFinanceReviewSheetContainer } from './OrderFinanceReviewSheetContainer'
import { FinanceTransactionDetailSheet } from './FinanceTransactionDetailSheet'
import { consumeFinanceWorkspaceFocus, subscribeFinanceWorkspaceFocus } from './financeWorkspaceNavigation'

type SourceTab = 'all' | 'orders' | 'payroll' | 'refunds' | 'manual' | 'cashflow'
type PeriodFilter = 'all' | 'today' | '30d'

export interface TransactionLedgerProps {
  transactions: FinanceTransaction[]
  canEditManual: boolean
  defaultBranch?: import('../../types/orders').BranchFilter
}

const formatIdr = (value: number) => `Rp ${value.toLocaleString('id-ID')}`
const businessDate = (transaction: FinanceTransaction) => (transaction.transactionDate ?? transaction.createdAt).slice(0, 10)
const isManual = (transaction: FinanceTransaction) => (transaction.entryMode ?? (transaction.isSystemGenerated ? 'automatic' : 'manual')) === 'manual'
const isCashFlowUtility = (transaction: FinanceTransaction) => ['opening_balance','adjustment','transfer'].includes(transaction.source ?? '')
const sourceMatches = (transaction: FinanceTransaction, tab: SourceTab) =>
  tab === 'all' ||
  (tab === 'orders' && transaction.source === 'order_payment') ||
  (tab === 'payroll' && transaction.source === 'payroll') ||
  (tab === 'refunds' && transaction.source === 'order_refund') ||
  (tab === 'manual' && isManual(transaction) && !isCashFlowUtility(transaction)) ||
  (tab === 'cashflow' && isCashFlowUtility(transaction))

const sourceLabel = (transaction: FinanceTransaction) => {
  if (transaction.source === 'order_payment') return 'Order'
  if (transaction.source === 'payroll') return 'Payroll'
  if (transaction.source === 'order_refund') return 'Refund'
  if (transaction.source === 'opening_balance') return 'Opening Balance'
  if (transaction.source === 'adjustment') return 'Adjustment'
  if (transaction.source === 'transfer') return 'Transfer'
  return 'Manual'
}

const statusLabel = (transaction: FinanceTransaction) => {
  if (transaction.status === 'pending') return 'Pending Finance reconciliation'
  if (transaction.status === 'rejected') return 'Rejected'
  return 'Posted'
}

const directionLabel = (transaction: FinanceTransaction): string =>
  transaction.type === 'income' ? 'In' : 'Out'

const isEditableManualTransaction = (transaction: FinanceTransaction, canEdit: boolean): boolean =>
  canEdit
  && transaction.status === 'verified'
  && isManual(transaction)
  && (transaction.source ?? 'manual') === 'manual'
  && !transaction.isSystemGenerated

const TransactionRow: FC<{
  transaction: FinanceTransaction
  canEdit: boolean
  accountLabel: string
  onOpenDetail: () => void
  onOpenOrder?: () => void
}> = ({ transaction, canEdit, accountLabel, onOpenDetail, onOpenOrder }) => {
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const scope = transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')
  const editable = isEditableManualTransaction(transaction, canEdit)

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.currentTarget !== event.target) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpenDetail()
  }

  const openProof = async () => {
    try {
      await openFinanceTransactionProof(transaction)
    } catch (error) {
      toast({
        title: 'Bukti transaksi tidak dapat dibuka',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open transaction ${transaction.transactionCode?.trim() || transaction.id} details`}
      onClick={onOpenDetail}
      onKeyDown={handleKeyDown}
      className="cursor-pointer rounded-xl border border-border/60 bg-card px-4 py-3.5 transition hover:border-primary/25 hover:bg-surface-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{transaction.name ?? transaction.description}</p>
            <StatusChip tone={transaction.type === 'income' ? 'success' : 'danger'}>{directionLabel(transaction)}</StatusChip>
            <StatusChip tone="neutral">{sourceLabel(transaction)}</StatusChip>
            {transaction.status !== 'verified' && <StatusChip tone="warning">{transaction.status}</StatusChip>}
          </div>

          <div className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Transaction Code</p>
              <p className="mt-0.5 break-all font-mono font-semibold text-foreground">{transaction.transactionCode?.trim() || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Type / Source</p>
              <p className="mt-0.5 font-medium text-foreground">{directionLabel(transaction)} · {sourceLabel(transaction)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Account</p>
              <p className="mt-0.5 font-medium text-foreground">{accountLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="mt-0.5 font-medium text-foreground">{getFinanceCategoryLabel(transaction.category, customCategories, categoryOverrides)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Scope</p>
              <p className="mt-0.5 font-medium text-foreground">{scope === 'company' ? 'Company-wide' : transaction.branch}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Method</p>
              <p className="mt-0.5 font-medium capitalize text-foreground">{transaction.method}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Transaction date</p>
              <p className="mt-0.5 font-medium text-foreground">
                {new Date(transaction.transactionDate ?? transaction.createdAt).toLocaleString('id-ID', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
                })} · {statusLabel(transaction)}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {transaction.orderNumber && <p className="text-xs font-medium text-foreground/80">Order {transaction.orderNumber}</p>}
            {onOpenOrder && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); onOpenOrder() }}
                className="inline-flex items-center gap-1 text-2xs font-semibold text-primary hover:underline"
              >
                Open order <ExternalLink className="size-3" />
              </button>
            )}
          </div>
          {transaction.adjustmentReason && <p className="mt-1 text-xs text-muted-foreground">Reason: {transaction.adjustmentReason}</p>}
          {transaction.editHistory?.length ? <p className="mt-1 text-2xs text-muted-foreground">Edited {transaction.editHistory.length}× · latest correction retained in audit history</p> : null}
        </div>

        <div className="shrink-0 text-right">
          <p className={`whitespace-nowrap text-sm font-semibold sm:text-base ${transaction.type === 'income' ? 'text-success' : 'text-destructive'}`}>
            {transaction.type === 'income' ? '+' : '−'}{formatIdr(transaction.amount)}
          </p>
          {transaction.proofPath && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void openProof()
              }}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground"
            >
              <FileCheck2 className="size-3.5" aria-hidden="true" /> Bukti
            </button>
          )}
          {editable && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                window.dispatchEvent(new CustomEvent('finance-edit-posted-transaction', { detail: transaction.id }))
              }}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold"
            >
              <Pencil className="size-3.5" aria-hidden="true" /> Edit
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export const TransactionLedger: FC<TransactionLedgerViewModel> = ({
  transactions,
  canEditManual,
  isVisible,
  defaultBranch,
}) => {
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const paymentAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const orders = useOrdersStore((state) => state.orders)
  const actorName = useUserStore((state) => state.name)
  const userRole = useUserStore((state) => state.role)
  const canVerifyOrderPayment = isActionAuthorized(userRole, 'finance.verify_order')
  const [initialFocus] = useState(() => consumeFinanceWorkspaceFocus('ledger'))
  const legacyFocus = initialFocus?.view === 'legacy'
  const [sourceTab, setSourceTab] = useState<SourceTab>('all')
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'all' | FinanceTransactionType>('all')
  const [category, setCategory] = useState<'all' | FinanceCategory>('all')
  const [branch, setBranch] = useState<string>(legacyFocus ? 'All' : defaultBranch ?? 'All')
  const [account, setAccount] = useState<string>(legacyFocus ? 'legacy:unassigned' : 'All')
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const [reviewingOrderNumber, setReviewingOrderNumber] = useState<string | null>(null)
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)

  useEffect(() => subscribeFinanceWorkspaceFocus('ledger', (focus) => {
    if (focus.view !== 'legacy') return
    setSourceTab('all')
    setSearch('')
    setDirection('all')
    setCategory('all')
    setBranch('All')
    setAccount('legacy:unassigned')
    setPeriod('all')
  }), [])

  const accountLabels = useMemo(() => new Map<string,string>([
    ...paymentAccounts.map((item) => [item.id, `${item.bankName} · ${item.accountNumber}`] as [string,string]),
    ['cash:main','Cash'],
    ['legacy:unassigned','Legacy / unassigned'],
  ]), [paymentAccounts])

  const accountIds = useMemo(() => Array.from(new Set(transactions.map((item) => item.accountId ?? 'legacy:unassigned'))), [transactions])
  const branchNames = useMemo(() => Array.from(new Set(transactions.filter((item) => (item.scope ?? (item.branch === 'All' ? 'company' : 'branch')) === 'branch').map((item) => item.branch))).sort(), [transactions])
  const availableCategories = useMemo(() => Array.from(new Set(transactions.filter((item) => direction === 'all' || item.type === direction).map((item) => item.category))), [transactions, direction])
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return transactions
      .filter((transaction) => {
        const scope = transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')
        const accountId = transaction.accountId ?? 'legacy:unassigned'
        const searchable = [
          transaction.name,
          transaction.description,
          transaction.orderNumber,
          transaction.reference,
          transaction.transactionCode,
          transaction.branch,
          sourceLabel(transaction),
          directionLabel(transaction),
          accountLabels.get(accountId),
          getFinanceCategoryLabel(transaction.category, customCategories, categoryOverrides),
        ].filter(Boolean).join(' ').toLowerCase()
        const date = businessDate(transaction)
        return sourceMatches(transaction, sourceTab)
          && (!query || searchable.includes(query))
          && (direction === 'all' || transaction.type === direction)
          && (category === 'all' || transaction.category === category)
          && (account === 'All' || accountId === account)
          && (branch === 'All' || (branch === 'Company-wide' ? scope === 'company' : scope === 'branch' && transaction.branch === branch))
          && (period === 'all' || (period === 'today' ? date === today : date >= thirtyDaysAgo))
      })
      .sort((a, b) => businessDate(b).localeCompare(businessDate(a)) || b.createdAt.localeCompare(a.createdAt))
  }, [transactions, sourceTab, search, direction, category, branch, account, period, today, thirtyDaysAgo, customCategories, categoryOverrides, accountLabels])

  const reviewingOrder = reviewingOrderNumber
    ? orders.find((order) => order.orderNumber === reviewingOrderNumber) ?? null
    : null
  const selectedTransaction = selectedTransactionId
    ? transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null
    : null
  const selectedLinkedOrder = selectedTransaction?.orderNumber
    ? orders.find((order) => order.orderNumber === selectedTransaction.orderNumber)
    : undefined
  const selectedAccountLabel = selectedTransaction
    ? accountLabels.get(selectedTransaction.accountId ?? 'legacy:unassigned') ?? selectedTransaction.accountId ?? 'Legacy / unassigned'
    : '—'
  const selectedCategoryLabel = selectedTransaction
    ? getFinanceCategoryLabel(selectedTransaction.category, customCategories, categoryOverrides)
    : '—'
  const selectedEditable = selectedTransaction
    ? isEditableManualTransaction(selectedTransaction, canEditManual)
    : false

  if (!isVisible) return null

  return (
    <section className="space-y-5" aria-label="Transaction ledger">
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border pt-1">
        {([['all','All'],['orders','Orders'],['payroll','Payroll'],['refunds','Refunds'],['manual','Manual'],['cashflow','Balance & Transfers']] as const).map(([value,label]) => (
          <button key={value} type="button" onClick={() => setSourceTab(value)} className={`h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${sourceTab === value ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}>{label}</button>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search transactions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, transaction, order, account, branch, or category" className="h-11 w-full rounded-full border border-border bg-background pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        </label>

        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-full bg-surface-track p-1 ring-1 ring-border/60">
            {(['all','income','expense'] as const).map((value) => <button key={value} type="button" onClick={() => { setDirection(value); setCategory('all') }} className={`h-9 rounded-full px-3.5 text-sm ${direction === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{value === 'all' ? 'All' : value === 'income' ? 'In' : 'Out'}</button>)}
          </div>
          <div className="inline-flex rounded-full bg-surface-track p-1 ring-1 ring-border/60">
            {([['all','All'],['today','Today'],['30d','30D']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`h-9 rounded-full px-3.5 text-sm ${period === value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{label}</button>)}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <select value={category} onChange={(event) => setCategory(event.target.value as 'all' | FinanceCategory)} className="h-11 rounded-full border border-border px-3"><option value="all">All categories</option>{availableCategories.map((id) => <option key={id} value={id}>{getFinanceCategoryLabel(id, customCategories, categoryOverrides)}</option>)}</select>
          <select value={account} onChange={(event) => setAccount(event.target.value)} className="h-11 rounded-full border border-border px-3"><option value="All">All accounts</option>{accountIds.map((id) => <option key={id} value={id}>{accountLabels.get(id) ?? id}</option>)}</select>
          <select value={branch} onChange={(event) => setBranch(event.target.value)} className="h-11 rounded-full border border-border px-3"><option value="All">All branches</option><option value="Company-wide">Company-wide</option>{branchNames.map((branchName) => <option key={branchName} value={branchName}>{branchName}</option>)}</select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border"><ReceiptText className="size-5 text-muted-foreground" /><p className="mt-2 font-semibold">No transactions in this view</p></div>
      ) : (
        <div className="space-y-2">
          {visible.map((transaction) => {
            const linkedOrder = transaction.orderNumber
              ? orders.find((order) => order.orderNumber === transaction.orderNumber)
              : undefined
            return (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                canEdit={canEditManual}
                accountLabel={accountLabels.get(transaction.accountId ?? 'legacy:unassigned') ?? transaction.accountId ?? 'Legacy / unassigned'}
                onOpenDetail={() => setSelectedTransactionId(transaction.id)}
                onOpenOrder={linkedOrder ? () => setReviewingOrderNumber(linkedOrder.orderNumber) : undefined}
              />
            )
          })}
        </div>
      )}

      <FinanceTransactionDetailSheet
        transaction={selectedTransaction}
        accountLabel={selectedAccountLabel}
        categoryLabel={selectedCategoryLabel}
        editable={selectedEditable}
        onClose={() => setSelectedTransactionId(null)}
        onEdit={selectedEditable && selectedTransaction ? () => {
          window.dispatchEvent(new CustomEvent('finance-edit-posted-transaction', { detail: selectedTransaction.id }))
          setSelectedTransactionId(null)
        } : undefined}
        onOpenOrder={selectedLinkedOrder ? () => {
          setSelectedTransactionId(null)
          setReviewingOrderNumber(selectedLinkedOrder.orderNumber)
        } : undefined}
      />

      {reviewingOrder && (
        <OrderFinanceReviewSheetContainer
          order={reviewingOrder}
          onClose={() => setReviewingOrderNumber(null)}
          canVerify={canVerifyOrderPayment}
          actorName={actorName}
          userRole={userRole}
        />
      )}
    </section>
  )
}

export default TransactionLedger
