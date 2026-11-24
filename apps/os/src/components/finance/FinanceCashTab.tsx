/**
 * @file FinanceCashTab.tsx
 * @description Cash & Transactions: where the money is (account balances),
 * how the selected month went (in / out / net), one "Record" entry point for
 * every kind of money movement, and the ledger for the month.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Ban, ChevronDown, FileCheck2, Plus, ReceiptText, SlidersHorizontal, X } from 'lucide-react'
import type { FinanceTransaction, FinanceTransactionType } from '../../store/financeStoreTypes'
import type { BranchId } from '../../types/orders'
import type { CashFlowEntryKind } from '../../data/financeCashFlow'
import { useFinanceStore } from '../../store/financeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { getFinanceCategoryLabel } from '../../domain/financeTransactionCategoryDomain'
import {
  DEFAULT_LEDGER_FILTERS,
  LEGACY_ACCOUNT_ID,
  accountBalances,
  filterLedger,
  isLedgerRow,
  ledgerSourceOf,
  monthCashFlow,
  transactionScope,
  type LedgerFilters,
  type LedgerSourceFilter,
} from '../../domain/financeLedgerDomain'
import { formatFinanceDay, formatMonthKey } from '../../domain/financeDates'
import { formatIdrCurrency } from '../../lib/formatters'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { cn } from '../../lib/utils'
import { ChipRow, FilterChip } from '../ui/chip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { CashFlowEntryDialog } from './CashFlowEntryDialog'
import { ManualTransactionDialog } from './ManualTransactionDialog'
import { useFinanceUiStore } from './financeUiStore'
import type { FinanceAccess } from './useFinanceAccess'
import { useFinanceAccounts } from './useFinanceAccounts'

interface FinanceCashTabProps {
  transactions: FinanceTransaction[]
  access: FinanceAccess
  branches: BranchId[]
  defaultBranch?: BranchId
  searchQuery: string
}

const SOURCE_FILTERS: Array<{ id: LedgerSourceFilter; en: string; id_: string }> = [
  { id: 'all', en: 'All', id_: 'Semua' },
  { id: 'orders', en: 'Orders', id_: 'Pesanan' },
  { id: 'manual', en: 'Manual', id_: 'Manual' },
  { id: 'payroll', en: 'Payroll', id_: 'Penggajian' },
  { id: 'refunds', en: 'Refunds', id_: 'Pengembalian dana' },
  { id: 'transfers', en: 'Balance & transfers', id_: 'Saldo & transfer' },
]

const selectClass = 'h-10 w-full rounded-full border border-border bg-background px-3 text-sm'

export const FinanceCashTab: FC<FinanceCashTabProps> = ({ transactions, access, branches, defaultBranch, searchQuery }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const month = useFinanceUiStore((state) => state.month)
  const focusVersion = useFinanceUiStore((state) => state.focusVersion)
  const consumeFocus = useFinanceUiStore((state) => state.consumeFocus)
  const openTransactionDetail = useFinanceUiStore((state) => state.openTransactionDetail)
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const { options: accountOptions, labelOf } = useFinanceAccounts()
  const orders = useOrdersStore((state) => state.orders)
  const reconciledOrders = useMemo(
    () => new Set(orders.filter((order) => order.financeVerified).map((order) => order.orderNumber)),
    [orders],
  )

  const [filters, setFilters] = useState<Omit<LedgerFilters, 'month' | 'query'>>(DEFAULT_LEDGER_FILTERS)
  const [moreOpen, setMoreOpen] = useState(false)
  const [manualDirection, setManualDirection] = useState<FinanceTransactionType | null>(null)
  const [cashFlowMode, setCashFlowMode] = useState<CashFlowEntryKind | null>(null)

  // Deep link from Tasks ("accounts to tidy") or elsewhere: filter by account.
  useEffect(() => {
    const focus = consumeFocus('cash')
    if (focus?.accountId) setFilters({ ...DEFAULT_LEDGER_FILTERS, accountId: focus.accountId })
  }, [consumeFocus, focusVersion])

  const categoryLabel = (transaction: FinanceTransaction) =>
    getFinanceCategoryLabel(transaction.category, customCategories, categoryOverrides)

  const balances = useMemo(() => accountBalances(transactions), [transactions])
  const accountCards = useMemo(() => {
    const ids = [...new Set([...accountOptions.map((account) => account.id), ...balances.keys()])]
      .filter((id) => id !== LEGACY_ACCOUNT_ID || (balances.get(id) ?? 0) !== 0)
    return ids.map((id) => ({ id, label: labelOf(id), balance: balances.get(id) ?? 0 }))
  }, [accountOptions, balances, labelOf])
  const totalBalance = accountCards.reduce((sum, account) => sum + account.balance, 0)
  const flow = useMemo(() => monthCashFlow(transactions, month), [month, transactions])

  // Search looks in every month (people search for an order, not a month), and
  // untidy old rows can sit in any month, so the legacy bucket ignores it too.
  const searching = searchQuery.trim().length > 0
  const effectiveMonth = filters.accountId === LEGACY_ACCOUNT_ID || searching ? null : month
  const rows = useMemo(
    () => filterLedger(
      transactions,
      { ...filters, month: effectiveMonth, query: searchQuery },
      (transaction) => [
        transaction.name,
        transaction.description,
        transaction.orderNumber,
        transaction.reference,
        transaction.transactionCode,
        transaction.branch,
        labelOf(transaction.accountId),
        categoryLabel(transaction),
      ].filter(Boolean).join(' '),
    ),
    // categoryLabel depends on the category stores listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, filters, effectiveMonth, searchQuery, labelOf, customCategories, categoryOverrides],
  )

  const ledgerRows = useMemo(() => transactions.filter(isLedgerRow), [transactions])
  const categoryOptions = useMemo(
    () => [...new Set(ledgerRows.filter((item) => filters.direction === 'all' || item.type === filters.direction).map((item) => item.category))],
    [filters.direction, ledgerRows],
  )
  const branchOptions = useMemo(
    () => [...new Set(ledgerRows.filter((item) => transactionScope(item) === 'branch').map((item) => item.branch))].sort(),
    [ledgerRows],
  )
  const extraFilterCount = [filters.direction !== 'all', filters.category !== 'all', filters.branch !== 'All'].filter(Boolean).length
  const update = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }))

  // Orders, payroll, refunds, and balance moves are named by their source;
  // only hand-entered rows need their category to say what they were.
  const showsCategory = (transaction: FinanceTransaction): boolean =>
    ['manual', 'other'].includes(ledgerSourceOf(transaction))

  const sourceLabel = (transaction: FinanceTransaction): string => {
    const source = ledgerSourceOf(transaction)
    if (source === 'orders') return tr('Order', 'Pesanan')
    if (source === 'payroll') return tr('Payroll', 'Penggajian')
    if (source === 'refunds') return tr('Refund', 'Pengembalian dana')
    if (source === 'transfers') {
      if (transaction.source === 'opening_balance') return tr('Opening balance', 'Saldo awal')
      if (transaction.source === 'adjustment') return tr('Adjustment', 'Penyesuaian')
      return 'Transfer'
    }
    if (source === 'manual') return 'Manual'
    return tr('Automatic', 'Otomatis')
  }

  return (
    <div className="space-y-5">
      <section aria-label={tr('Account balances', 'Saldo rekening')} className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {/* Balances are all-time; the month picker only scopes the list below. */}
            <p className="text-xs font-medium text-muted-foreground">{tr('Current balance', 'Saldo saat ini')}</p>
            <p className={cn('text-2xl font-semibold tabular-nums', totalBalance < 0 && 'text-destructive')}>{formatIdrCurrency(totalBalance)}</p>
          </div>
          {access.canCreateEntry && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
                  <Plus className="size-4" aria-hidden="true" /> {tr('Record', 'Catat')} <ChevronDown className="size-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={() => setManualDirection('income')}><ArrowDownToLine className="mr-2 size-4" />{tr('Money In', 'Uang masuk')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setManualDirection('expense')}><ArrowUpFromLine className="mr-2 size-4" />{tr('Money Out', 'Uang keluar')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCashFlowMode('transfer')}><ArrowLeftRight className="mr-2 size-4" />{tr('Transfer between accounts', 'Transfer antar rekening')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCashFlowMode('opening_balance')}>{tr('Opening balance', 'Saldo awal')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCashFlowMode('adjustment')}>{tr('Adjust balance', 'Sesuaikan saldo')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <ChipRow edge="page" activeKey={filters.accountId} aria-label={tr('Accounts', 'Rekening')}>
          {accountCards.map((account) => {
            const active = filters.accountId === account.id
            return (
              <button
                key={account.id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ accountId: active ? 'All' : account.id })}
                className={cn(
                  'shrink-0 rounded-xl px-3.5 py-2 text-left ring-1 transition',
                  active ? 'bg-primary/10 ring-primary/40' : 'bg-card ring-border/60 hover:bg-surface-panel',
                  account.id === LEGACY_ACCOUNT_ID && !active && 'ring-warning/40',
                )}
              >
                <span className="block max-w-44 truncate text-xs text-muted-foreground">{account.label}</span>
                <span className={cn('block text-sm font-semibold tabular-nums', account.balance < 0 && 'text-destructive')}>{formatIdrCurrency(account.balance)}</span>
              </button>
            )
          })}
        </ChipRow>
      </section>

      <section aria-label={tr('Transactions', 'Transaksi')} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold">
            {formatMonthKey(month, language)}
            {searching && <span className="ml-2 font-normal text-muted-foreground">{tr(`· search shows all months (${rows.length})`, `· pencarian di semua bulan (${rows.length})`)}</span>}
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="text-success">+{formatIdrCurrency(flow.moneyIn)}</span>
            {' · '}
            <span className="text-destructive">−{formatIdrCurrency(flow.moneyOut)}</span>
            {' · '}
            <span className="font-semibold text-foreground">{tr('Net', 'Bersih')} {formatIdrCurrency(flow.net)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ChipRow edge="none" activeKey={filters.source} className="min-w-0 flex-1" aria-label={tr('Source', 'Sumber')}>
            {SOURCE_FILTERS.map((item) => (
              <FilterChip key={item.id} active={filters.source === item.id} onClick={() => update({ source: item.id })}>
                {tr(item.en, item.id_)}
              </FilterChip>
            ))}
          </ChipRow>
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
            className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium', extraFilterCount > 0 ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" /> {tr('Filter', 'Filter')}{extraFilterCount > 0 ? ` · ${extraFilterCount}` : ''}
          </button>
        </div>

        {moreOpen && (
          <div className="grid gap-2 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60 sm:grid-cols-3">
            <select aria-label={tr('Direction', 'Arah')} value={filters.direction} onChange={(event) => update({ direction: event.target.value as LedgerFilters['direction'], category: 'all' })} className={selectClass}>
              <option value="all">{tr('In and out', 'Masuk & keluar')}</option>
              <option value="income">{tr('Money In', 'Uang masuk')}</option>
              <option value="expense">{tr('Money Out', 'Uang keluar')}</option>
            </select>
            <select aria-label={tr('Category', 'Kategori')} value={filters.category} onChange={(event) => update({ category: event.target.value })} className={selectClass}>
              <option value="all">{tr('All categories', 'Semua kategori')}</option>
              {categoryOptions.map((id) => <option key={id} value={id}>{getFinanceCategoryLabel(id, customCategories, categoryOverrides)}</option>)}
            </select>
            <select aria-label={tr('Branch', 'Cabang')} value={filters.branch} onChange={(event) => update({ branch: event.target.value })} className={selectClass}>
              <option value="All">{tr('All branches', 'Semua cabang')}</option>
              <option value="Company-wide">{tr('Company-wide', 'Seluruh perusahaan')}</option>
              {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </select>
          </div>
        )}

        {filters.accountId !== 'All' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/10 pl-3 pr-1 font-medium text-primary">
              {labelOf(filters.accountId)}
              <button type="button" aria-label={tr('Clear account filter', 'Hapus filter rekening')} onClick={() => update({ accountId: 'All' })} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-primary/15">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
            {effectiveMonth === null && !searching && <span className="text-muted-foreground">{tr('All months', 'Semua bulan')}</span>}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <ReceiptText className="size-4" aria-hidden="true" /> {tr('No transactions in this view.', 'Belum ada transaksi di tampilan ini.')}
          </p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card ring-1 ring-border/60" aria-label={tr('Ledger', 'Buku kas')}>
            {rows.map((transaction) => {
              const voided = transaction.status === 'void'
              const pending = transaction.status !== 'verified' && !voided
              const scope = transactionScope(transaction)
              const editCount = transaction.editHistory?.filter((record) => record.kind !== 'void').length ?? 0
              // Order payments say whether Finance has matched them (Tasks holds the open ones).
              const matchState = transaction.source === 'order_payment' && transaction.orderNumber && !voided
                ? reconciledOrders.has(transaction.orderNumber) ? 'matched' : 'open'
                : null
              return (
                <li key={transaction.id}>
                  <button
                    type="button"
                    onClick={() => openTransactionDetail(transaction.id)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3.5 py-3 text-left transition hover:bg-surface-panel sm:grid-cols-[6.5rem_1fr_12rem_auto]"
                  >
                    <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{formatFinanceDay(transaction.transactionDate ?? transaction.createdAt, language)}</span>
                    <span className="min-w-0">
                      <span className={cn('block truncate text-sm font-medium', voided && 'text-muted-foreground line-through')}>
                        {transaction.name ?? transaction.description}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="sm:hidden">{formatFinanceDay(transaction.transactionDate ?? transaction.createdAt, language)} · </span>
                        {/* Separate text nodes so each label translates on its own. */}
                        {[transaction.orderNumber, sourceLabel(transaction), showsCategory(transaction) ? categoryLabel(transaction) : undefined, scope === 'company' ? tr('Company-wide', 'Seluruh perusahaan') : transaction.branch]
                          .filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index)
                          .map((part, index) => <span key={`${index}-${part}`}>{index > 0 ? ' · ' : ''}<span>{part}</span></span>)}
                      </span>
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">{labelOf(transaction.accountId)}</span>
                    <span className="flex flex-col items-end gap-0.5">
                      <span className={cn(
                        'whitespace-nowrap text-sm font-semibold tabular-nums',
                        voided ? 'text-muted-foreground line-through' : transaction.type === 'income' ? 'text-success' : 'text-destructive',
                      )}>
                        {transaction.type === 'income' ? '+' : '−'}{formatIdrCurrency(transaction.amount)}
                      </span>
                      {(voided || pending || transaction.proofPath || editCount > 0 || matchState) && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {voided && <><Ban className="size-3" aria-hidden="true" />Void</>}
                          {pending && <span className="text-warning">{tr('Pending', 'Menunggu')}</span>}
                          {!voided && matchState === 'matched' && <span className="text-success">{tr('Matched', 'Cocok')}</span>}
                          {!voided && matchState === 'open' && <span className="text-warning">{tr('Not matched', 'Belum dicocokkan')}</span>}
                          {!voided && editCount > 0 && <span>{tr(`Edited ${editCount}×`, `Diedit ${editCount}×`)}</span>}
                          {!voided && !pending && editCount === 0 && transaction.proofPath && <span className="inline-flex items-center gap-1"><FileCheck2 className="size-3" aria-hidden="true" />{tr('Proof', 'Bukti')}</span>}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ManualTransactionDialog
        open={manualDirection !== null}
        direction={manualDirection ?? 'income'}
        onClose={() => setManualDirection(null)}
        branches={branches}
        defaultBranch={defaultBranch}
      />
      <CashFlowEntryDialog mode={cashFlowMode} onClose={() => setCashFlowMode(null)} />
    </div>
  )
}

