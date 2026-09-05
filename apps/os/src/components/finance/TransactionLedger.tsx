import { useMemo, useState, type FC, type KeyboardEvent } from 'react'
import { ExternalLink, Pencil, ReceiptText, Search } from 'lucide-react'
import type {
  FinanceCategory,
  FinanceTransaction,
  FinanceTransactionType,
} from '../../store/financeStoreTypes'
import { useFinanceStore } from '../../store/financeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import {
  getFinanceCategoryLabel,
} from '../../domain/financeTransactionCategoryDomain'
import type { TransactionLedgerViewModel } from './TransactionLedgerController'
import { StatusChip } from '../ui/chip'
import { OrderFinanceReviewSheetContainer } from './OrderFinanceReviewSheetContainer'

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
  if (transaction.status === 'pending') return 'Pending data correction'
  if (transaction.status === 'rejected') return 'Rejected'
  return 'Posted'
}

const TransactionRow: FC<{
  transaction: FinanceTransaction
  canEdit: boolean
  accountLabel: string
  onOpenOrder?: () => void
}> = ({ transaction, canEdit, accountLabel, onOpenOrder }) => {
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const scope = transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')
  const editable = canEdit && transaction.status === 'verified' && transaction.source !== 'transfer'

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.currentTarget !== event.target) return
    if (!onOpenOrder || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onOpenOrder()
  }

  return (
    <article
      role={onOpenOrder ? 'button' : undefined}
      tabIndex={onOpenOrder ? 0 : undefined}
      aria-label={onOpenOrder ? `Open order ${transaction.orderNumber} finance evidence` : undefined}
      onClick={onOpenOrder}
      onKeyDown={handleKeyDown}
      className={`rounded-xl border border-border/60 bg-card px-4 py-3 ${onOpenOrder ? 'cursor-pointer transition hover:bg-surface-panel hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30' : ''}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{transaction.name ?? transaction.description}</p>
            <StatusChip tone="neutral">{sourceLabel(transaction)}</StatusChip>
            {transaction.status !== 'verified' && <StatusChip tone="warning">{transaction.status}</StatusChip>}
            {onOpenOrder && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold text-primary">
                View order evidence <ExternalLink className="size-3" />
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {getFinanceCategoryLabel(transaction.category, customCategories, categoryOverrides)} · {accountLabel} · {scope === 'company' ? 'Company-wide' : transaction.branch} · {transaction.method}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(transaction.transactionDate ?? transaction.createdAt).toLocaleString('id-ID', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
            })} · {statusLabel(transaction)}
          </p>
          {transaction.orderNumber && <p className="mt-1 text-xs font-medium text-foreground/80">Order {transaction.orderNumber}</p>}
          {transaction.adjustmentReason && <p className="mt-1 text-xs text-muted-foreground">Reason: {transaction.adjustmentReason}</p>}
          {transaction.editHistory?.length ? <p className="mt-1 text-2xs text-muted-foreground">Edited {transaction.editHistory.length}× · latest correction retained in audit history</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={`whitespace-nowrap text-sm font-semibold sm:text-base ${transaction.type === 'income' ? 'text-success' : 'text-destructive'}`}>
            {transaction.type === 'income' ? '+' : '−'}{formatIdr(transaction.amount)}
          </p>
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
  const [sourceTab, setSourceTab] = useState<SourceTab>('all')
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'all' | FinanceTransactionType>('all')
  const [category, setCategory] = useState<'all' | FinanceCategory>('all')
  const [branch, setBranch] = useState<string>(defaultBranch ?? 'All')
  const [account, setAccount] = useState<string>('All')
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const [reviewingOrderNumber, setReviewingOrderNumber] = useState<string | null>(null)

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
        const searchable = [transaction.name, transaction.description, transaction.orderNumber, transaction.reference, transaction.branch, accountLabels.get(accountId), getFinanceCategoryLabel(transaction.category, customCategories, categoryOverrides)].filter(Boolean).join(' ').toLowerCase()
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

  if (!isVisible) return null

  return (
    <section className="space-y-5" aria-label="Transaction ledger">
      <header>
        <h2 className="text-lg font-semibold">Transactions</h2>
        <p className="text-sm text-muted-foreground">Money In/Out history by account. Click linked order transactions to inspect payment proof and supporting order evidence.</p>
      </header>

      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border pt-1">
        {([['all','All'],['orders','Orders'],['payroll','Payroll'],['refunds','Refunds'],['manual','Manual'],['cashflow','Balance & Transfers']] as const).map(([value,label]) => (
          <button key={value} type="button" onClick={() => setSourceTab(value)} className={`h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${sourceTab === value ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}>{label}</button>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search transactions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transaction, order, account, branch, or category" className="h-11 w-full rounded-full border border-border bg-background pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        </label>

        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-full bg-surface-track p-1">
            {(['all','income','expense'] as const).map((value) => <button key={value} type="button" onClick={() => { setDirection(value); setCategory('all') }} className={`h-9 rounded-full px-3.5 text-sm ${direction === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{value === 'all' ? 'All' : value === 'income' ? 'In' : 'Out'}</button>)}
          </div>
          <div className="inline-flex rounded-full bg-surface-track p-1">
            {([['all','All'],['today','Today'],['30d','30D']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`h-9 rounded-full px-3.5 text-sm ${period === value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{label}</button>)}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <select value={category} onChange={(event) => setCategory(event.target.value as 'all' | FinanceCategory)} className="h-11 rounded-full border border-border px-3"><option value="all">All categories</option>{availableCategories.map((id) => <option key={id} value={id}>{getFinanceCategoryLabel(id, customCategories, categoryOverrides)}</option>)}</select>
          <select value={account} onChange={(event) => setAccount(event.target.value)} className="h-11 rounded-full border border-border px-3"><option value="All">All accounts</option>{accountIds.map((id) => <option key={id} value={id}>{accountLabels.get(id) ?? id}</option>)}</select>
          <select value={branch} onChange={(event) => setBranch(event.target.value)} className="h-11 rounded-full border border-border px-3"><option value="All">All branches</option><option value="Company-wide">Company-wide</option>{branchNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
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
                onOpenOrder={linkedOrder ? () => setReviewingOrderNumber(linkedOrder.orderNumber) : undefined}
              />
            )
          })}
        </div>
      )}

      {reviewingOrder && (
        <OrderFinanceReviewSheetContainer
          order={reviewingOrder}
          onClose={() => setReviewingOrderNumber(null)}
          canVerify={false}
          actorName={actorName}
          userRole={userRole}
        />
      )}
    </section>
  )
}
