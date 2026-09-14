import { useMemo, useState, type FC, type FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardCheck,
  Landmark,
  PlusCircle,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { useFinanceStore } from '../../store/financeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { usePayrollStore } from '../../store/payrollStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { createFinanceCashFlowEntry, type CashFlowEntryKind } from '../../data/financeCashFlow'
import { toast } from '../../hooks/use-toast'
import { AppDialog } from '../ui/app-dialog'
import { FinanceModuleHeader } from './FinanceModuleHeader'
import { requestFinanceWorkspaceNavigation } from './financeWorkspaceNavigation'

const formatIdr = (value: number): string => `Rp ${Math.round(value).toLocaleString('id-ID')}`
const CASH_ACCOUNT_ID = 'cash:main'
const LEGACY_ACCOUNT_ID = 'legacy:unassigned'

const jakartaMonthKey = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  return `${year}-${month}`
}

const excludedFromOperatingCashFlow = new Set(['opening_balance', 'adjustment', 'transfer'])

type DialogMode = CashFlowEntryKind | null

export const FinanceCashFlowOverview: FC = () => {
  const role = useUserStore((state) => state.role)
  const transactions = useFinanceStore((state) => state.transactions)
  const orders = useOrdersStore((state) => state.orders)
  const payrollProposals = usePayrollStore((state) => state.payrollProposals)
  const configuredAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [accountId, setAccountId] = useState('')
  const [counterpartyAccountId, setCounterpartyAccountId] = useState('')
  const [direction, setDirection] = useState<'income' | 'expense'>('income')
  const [amount, setAmount] = useState('')
  const [transferFee, setTransferFee] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const accountOptions = useMemo(() => {
    const active = configuredAccounts
      .filter((account) => account.isActive !== false)
      .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((account) => ({ id: account.id, label: `${account.bankName} · ${account.accountNumber}` }))
    return [...active, { id: CASH_ACCOUNT_ID, label: 'Cash' }]
  }, [configuredAccounts])

  const accountLabels = useMemo(
    () => new Map([...accountOptions, { id: LEGACY_ACCOUNT_ID, label: 'Legacy / unassigned' }].map((account) => [account.id, account.label])),
    [accountOptions],
  )

  const balances = useMemo(() => {
    const byAccount = new Map<string, number>()
    for (const transaction of transactions) {
      if (transaction.status !== 'verified') continue
      const id = transaction.accountId || LEGACY_ACCOUNT_ID
      const signed = transaction.type === 'income' ? transaction.amount : -transaction.amount
      byAccount.set(id, (byAccount.get(id) ?? 0) + signed)
    }
    for (const account of accountOptions) {
      if (!byAccount.has(account.id)) byAccount.set(account.id, 0)
    }
    return [...byAccount.entries()]
      .map(([id, balance]) => ({ id, label: accountLabels.get(id) ?? id, balance }))
      .sort((a, b) => {
        if (a.id === LEGACY_ACCOUNT_ID) return 1
        if (b.id === LEGACY_ACCOUNT_ID) return -1
        return a.label.localeCompare(b.label)
      })
  }, [accountLabels, accountOptions, transactions])

  const metrics = useMemo(() => {
    const currentMonth = jakartaMonthKey(new Date())
    let moneyIn = 0
    let moneyOut = 0
    for (const transaction of transactions) {
      if (transaction.status !== 'verified') continue
      if (excludedFromOperatingCashFlow.has(transaction.source ?? 'manual')) continue
      if (jakartaMonthKey(transaction.transactionDate ?? transaction.createdAt) !== currentMonth) continue
      if (transaction.type === 'income') moneyIn += transaction.amount
      else moneyOut += transaction.amount
    }
    const total = balances.reduce((sum, account) => sum + account.balance, 0)
    return { total, moneyIn, moneyOut, net: moneyIn - moneyOut }
  }, [balances, transactions])

  const attention = useMemo(() => {
    const postedOrderNumbers = new Set(
      transactions
        .filter((transaction) => transaction.status === 'verified' && transaction.source === 'order_payment' && transaction.orderNumber)
        .map((transaction) => transaction.orderNumber as string),
    )
    const reconciliationOrders = orders.filter(
      (order) => postedOrderNumbers.has(order.orderNumber) && !order.financeVerified,
    )
    const correction = reconciliationOrders.filter((order) => order.financeVerificationStatus === 'rejected').length
    const awaiting = Math.max(0, reconciliationOrders.length - correction)
    const refunds = orders.filter((order) => order.paymentStatus === 'refund_pending').length
    const payrollReview = payrollProposals.filter((proposal) => ['submitted_to_finance', 'returned_to_hr'].includes(proposal.status)).length
    const payrollReady = payrollProposals.filter((proposal) => proposal.status === 'finance_approved').length
    const legacyRows = transactions.filter(
      (transaction) => transaction.status === 'verified' && (!transaction.accountId || transaction.accountId === LEGACY_ACCOUNT_ID),
    ).length
    const total = awaiting + correction + refunds + payrollReview + payrollReady + legacyRows
    return { awaiting, correction, refunds, payrollReview, payrollReady, legacyRows, total }
  }, [orders, payrollProposals, transactions])

  if (role !== 'finance') return null

  const resetForm = () => {
    setAccountId(accountOptions[0]?.id ?? '')
    setCounterpartyAccountId(accountOptions[1]?.id ?? '')
    setDirection('income')
    setAmount('')
    setTransferFee('')
    setNote('')
  }

  const open = (mode: CashFlowEntryKind) => {
    resetForm()
    setDialogMode(mode)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!dialogMode || busy) return
    const numericAmount = Number(amount.replace(/\D/g, ''))
    const numericTransferFee = Number(transferFee.replace(/\D/g, '')) || 0
    if (!accountId || !(numericAmount > 0)) {
      toast({ title: 'Complete the cash-flow entry', description: 'Select an account and enter an amount greater than zero.', variant: 'destructive' })
      return
    }
    if ((dialogMode === 'opening_balance' || dialogMode === 'adjustment') && note.trim().length < 3) {
      toast({ title: 'Reason required', description: 'Opening balances and adjustments must include a reason.', variant: 'destructive' })
      return
    }
    if (dialogMode === 'transfer' && (!counterpartyAccountId || counterpartyAccountId === accountId)) {
      toast({ title: 'Choose another destination', description: 'Transfer source and destination must be different.', variant: 'destructive' })
      return
    }

    setBusy(true)
    try {
      await createFinanceCashFlowEntry({
        kind: dialogMode,
        accountId,
        amount: numericAmount,
        direction: dialogMode === 'adjustment' ? direction : undefined,
        counterpartyAccountId: dialogMode === 'transfer' ? counterpartyAccountId : undefined,
        transactionDate: new Date().toISOString(),
        note,
        transferFee: dialogMode === 'transfer' ? numericTransferFee : undefined,
      })
      toast({ title: dialogMode === 'transfer' ? 'Transfer recorded' : dialogMode === 'adjustment' ? 'Balance adjusted' : 'Opening balance recorded' })
      setDialogMode(null)
    } catch (error) {
      toast({ title: 'Finance entry was not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

  return (
    <section className="space-y-5" aria-label="Finance overview">
      <FinanceModuleHeader
        title="Overview"
        description="Cash position, current-month movement, and Finance work that needs attention."
        actions={<><button type="button" onClick={() => open('opening_balance')} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold"><PlusCircle className="size-4" />Opening Balance</button><button type="button" onClick={() => open('adjustment')} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold"><SlidersHorizontal className="size-4" />Adjust</button><button type="button" onClick={() => open('transfer')} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"><ArrowLeftRight className="size-4" />Transfer</button></>}
      />

      <div className="rounded-xl bg-card p-4 ring-1 ring-border/70 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Needs Attention</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Work queues and data-quality items that still need a Finance action.</p>
          </div>
          {attention.total > 0 && (
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">{attention.total} open</span>
          )}
        </div>

        {attention.total === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-success/5 px-4 py-3 ring-1 ring-success/15">
            <CheckCircle2 className="size-5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold">All caught up</p>
              <p className="text-xs text-muted-foreground">No reconciliation, refund, payroll, or account-cleanup items are waiting.</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <AttentionCard
              icon={ClipboardCheck}
              label="Reconciliation"
              value={attention.awaiting + attention.correction}
              helper={`${attention.awaiting} awaiting review · ${attention.correction} needs correction`}
              actions={[
                { label: 'Open orders', onClick: () => requestFinanceWorkspaceNavigation({ module: 'order_verification', view: 'all' }) },
                ...(attention.correction > 0 ? [{ label: 'Needs correction', onClick: () => requestFinanceWorkspaceNavigation({ module: 'order_verification' as const, view: 'needs_correction' as const }) }] : []),
              ]}
            />
            <AttentionCard
              icon={RotateCcw}
              label="Refunds"
              value={attention.refunds}
              helper="Pending refunds waiting for completion"
              actions={[{ label: 'Pending refunds', onClick: () => requestFinanceWorkspaceNavigation({ module: 'refunds', view: 'pending' }) }]}
            />
            <AttentionCard
              icon={BadgeDollarSign}
              label="Payroll"
              value={attention.payrollReview + attention.payrollReady}
              helper={`${attention.payrollReview} to review · ${attention.payrollReady} ready to pay`}
              actions={[
                { label: 'Review', onClick: () => requestFinanceWorkspaceNavigation({ module: 'payroll', view: 'review' }) },
                { label: 'Ready to Pay', onClick: () => requestFinanceWorkspaceNavigation({ module: 'payroll', view: 'ready' }) },
              ]}
            />
            <AttentionCard
              icon={AlertCircle}
              label="Account cleanup"
              value={attention.legacyRows}
              helper="Legacy / unassigned ledger rows"
              actions={[{ label: 'Open legacy rows', onClick: () => requestFinanceWorkspaceNavigation({ module: 'ledger', view: 'legacy' }) }]}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Balance" value={metrics.total} />
        <MetricCard label="Money In · This Month" value={metrics.moneyIn} />
        <MetricCard label="Money Out · This Month" value={metrics.moneyOut} />
        <MetricCard label="Net Cash Flow" value={metrics.net} />
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="mb-3 flex items-center gap-2"><Landmark className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Account balances</h3></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {balances.map((account) => (
            <div key={account.id} className="rounded-xl bg-surface-panel px-4 py-3 ring-1 ring-border/60">
              <p className="truncate text-xs font-medium text-muted-foreground">{account.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${account.balance < 0 ? 'text-destructive' : ''}`}>{formatIdr(account.balance)}</p>
              {account.id === LEGACY_ACCOUNT_ID && <p className="mt-1 text-2xs text-warning">Historical transactions without a confirmed account stay here until controlled cleanup; automatic source-owned entries stay immutable.</p>}
            </div>
          ))}
        </div>
      </div>

      <AppDialog
        open={dialogMode !== null}
        onOpenChange={(next) => { if (!next && !busy) setDialogMode(null) }}
        size="standard"
        title={dialogMode === 'opening_balance' ? 'Opening Balance' : dialogMode === 'adjustment' ? 'Adjust Balance' : 'Transfer Balance'}
        description={dialogMode === 'opening_balance'
          ? 'Set the starting balance for an account as a ledger entry.'
          : dialogMode === 'adjustment'
            ? 'Correct an account discrepancy with a visible audit reason.'
            : 'Move principal between company accounts. An optional transfer fee reduces the source account and company Total.'}
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            {dialogMode === 'transfer' ? 'From account' : 'Account'}
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>
              <option value="">Select account</option>
              {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
          </label>

          {dialogMode === 'transfer' && (
            <label className="block space-y-1.5 text-xs font-medium">
              To account
              <select value={counterpartyAccountId} onChange={(event) => setCounterpartyAccountId(event.target.value)} className={inputClass}>
                <option value="">Select destination</option>
                {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
              </select>
            </label>
          )}

          {dialogMode === 'adjustment' && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">Direction</legend>
              <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-track p-1 ring-1 ring-border/60">
                <button type="button" onClick={() => setDirection('income')} className={`h-10 rounded-full text-sm font-semibold ${direction === 'income' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Increase +</button>
                <button type="button" onClick={() => setDirection('expense')} className={`h-10 rounded-full text-sm font-semibold ${direction === 'expense' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Decrease −</button>
              </div>
            </fieldset>
          )}

          <label className="block space-y-1.5 text-xs font-medium">
            Amount (IDR)
            <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="e.g. 5000000" className={inputClass} />
          </label>

          {dialogMode === 'transfer' && (
            <label className="block space-y-1.5 text-xs font-medium">
              Transfer fee · Optional (IDR)
              <input value={transferFee} onChange={(event) => setTransferFee(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" className={inputClass} />
              <span className="block text-[11px] font-normal text-muted-foreground">Recorded as a separate Bank / Transfer Fee expense from the source account.</span>
            </label>
          )}

          <label className="block space-y-1.5 text-xs font-medium">
            {dialogMode === 'transfer' ? 'Note' : 'Reason'} {dialogMode === 'transfer' ? '(optional)' : ''}
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground/40" placeholder={dialogMode === 'transfer' ? 'Optional transfer note' : 'Required reason'} />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" disabled={busy} onClick={() => setDialogMode(null)} className="h-11 rounded-full border border-border px-5 text-sm font-medium disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy} className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </AppDialog>
    </section>
  )
}

const MetricCard: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-xl bg-card p-4 ring-1 ring-border/70">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className={`mt-2 text-xl font-semibold tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>{formatIdr(value)}</p>
  </div>
)

const AttentionCard: FC<{
  icon: typeof AlertCircle
  label: string
  value: number
  helper: string
  actions: Array<{ label: string; onClick: () => void }>
}> = ({ icon: Icon, label, value, helper, actions }) => (
  <div className={`rounded-xl px-4 py-3 ring-1 ${value > 0 ? 'bg-warning/5 ring-warning/20' : 'bg-surface-panel ring-border/60'}`}>
    <div className="flex items-center justify-between gap-3">
      <span className="flex size-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground ring-1 ring-border/60">
        <Icon className="size-4" />
      </span>
      <span className={`text-lg font-semibold tabular-nums ${value > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{value}</span>
    </div>
    <p className="mt-3 text-xs font-semibold text-foreground">{label}</p>
    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{helper}</p>
    <div className="mt-3 flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-background px-2.5 text-[11px] font-semibold text-foreground ring-1 ring-border/60 transition hover:bg-card"
        >
          {action.label}<ArrowUpRight className="size-3" />
        </button>
      ))}
    </div>
  </div>
)
