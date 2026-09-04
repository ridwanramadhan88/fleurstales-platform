import { useMemo, useState, type FC, type FormEvent } from 'react'
import { ArrowLeftRight, Landmark, PlusCircle, SlidersHorizontal } from 'lucide-react'
import { useFinanceStore } from '../../store/financeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { createFinanceCashFlowEntry, type CashFlowEntryKind } from '../../data/financeCashFlow'
import { toast } from '../../hooks/use-toast'
import { AppDialog } from '../ui/app-dialog'

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
  const configuredAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [accountId, setAccountId] = useState('')
  const [counterpartyAccountId, setCounterpartyAccountId] = useState('')
  const [direction, setDirection] = useState<'income' | 'expense'>('income')
  const [amount, setAmount] = useState('')
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

  if (role !== 'finance') return null

  const resetForm = () => {
    setAccountId(accountOptions[0]?.id ?? '')
    setCounterpartyAccountId(accountOptions[1]?.id ?? '')
    setDirection('income')
    setAmount('')
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
    <section className="space-y-5" aria-label="Cash Flow">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cash Flow</h2>
          <p className="text-sm text-muted-foreground">Ledger-derived company balance and current-month operating cash flow.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => open('opening_balance')} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold"><PlusCircle className="size-4" />Opening Balance</button>
          <button type="button" onClick={() => open('adjustment')} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold"><SlidersHorizontal className="size-4" />Adjust</button>
          <button type="button" onClick={() => open('transfer')} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"><ArrowLeftRight className="size-4" />Transfer</button>
        </div>
      </header>

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
              {account.id === LEGACY_ACCOUNT_ID && <p className="mt-1 text-2xs text-warning">Assign these legacy rows to a real account from Transactions.</p>}
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
            : 'Move money between company accounts without changing company Total.'}
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
              <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-track p-1">
                <button type="button" onClick={() => setDirection('income')} className={`h-10 rounded-full text-sm font-semibold ${direction === 'income' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Increase +</button>
                <button type="button" onClick={() => setDirection('expense')} className={`h-10 rounded-full text-sm font-semibold ${direction === 'expense' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Decrease −</button>
              </div>
            </fieldset>
          )}

          <label className="block space-y-1.5 text-xs font-medium">
            Amount (IDR)
            <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="e.g. 5000000" className={inputClass} />
          </label>

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
