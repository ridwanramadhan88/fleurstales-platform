import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react'
import { useFinanceStore } from '../../store/financeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { editPostedFinanceTransaction } from '../../data/financeCashFlow'
import { toast } from '../../hooks/use-toast'
import { AppDialog } from '../ui/app-dialog'

export const FinancePostedTransactionEditor: FC = () => {
  const role = useUserStore((state) => state.role)
  const transactions = useFinanceStore((state) => state.transactions)
  const paymentAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const transaction = transactions.find((item) => item.id === transactionId)
  const accountOptions = useMemo(
    () => [
      ...paymentAccounts
        .filter((account) => account.isActive !== false)
        .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((account) => ({ id: account.id, label: `${account.bankName} · ${account.accountNumber}` })),
      { id: 'cash:main', label: 'Cash' },
      { id: 'legacy:unassigned', label: 'Legacy / unassigned' },
    ],
    [paymentAccounts],
  )

  useEffect(() => {
    const openEditor = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const target = transactions.find((item) => item.id === id)
      if (!target || target.source === 'transfer') return
      setTransactionId(id)
      setAccountId(target.accountId ?? 'legacy:unassigned')
      setAmount(String(target.amount))
      setTransactionDate((target.transactionDate ?? target.createdAt).slice(0, 16))
      setNote(target.note ?? target.description ?? '')
      setReason('')
    }
    window.addEventListener('finance-edit-posted-transaction', openEditor)
    return () => window.removeEventListener('finance-edit-posted-transaction', openEditor)
  }, [transactions])

  if (role !== 'finance') return null

  const close = () => {
    if (busy) return
    setTransactionId(null)
    setReason('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!transaction || busy) return
    const numericAmount = Number(amount.replace(/\D/g, ''))
    if (!(numericAmount > 0) || !accountId) {
      toast({ title: 'Complete the transaction', description: 'Account and amount are required.', variant: 'destructive' })
      return
    }
    if (reason.trim().length < 3) {
      toast({ title: 'Edit reason required', description: 'Explain why this posted transaction is being corrected.', variant: 'destructive' })
      return
    }

    setBusy(true)
    try {
      await editPostedFinanceTransaction({
        transactionId: transaction.id,
        patch: {
          accountId,
          amount: numericAmount,
          transactionDate: transactionDate ? new Date(transactionDate).toISOString() : transaction.transactionDate,
          note,
          description: note,
        },
        reason,
      })
      toast({ title: 'Transaction updated', description: 'The correction and its reason were added to Finance history.' })
      setTransactionId(null)
    } catch (error) {
      toast({ title: 'Transaction was not updated', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

  return (
    <AppDialog
      open={Boolean(transaction)}
      onOpenChange={(open) => { if (!open) close() }}
      size="standard"
      title="Edit posted transaction"
      description={transaction ? `${transaction.name ?? transaction.description} · ${transaction.orderNumber ?? transaction.source ?? 'Finance'}` : undefined}
    >
      {transaction && (
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            Account
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>
              {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Amount (IDR)
            <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClass} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Transaction time
            <input type="datetime-local" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none" />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Edit reason <span className="text-destructive">*</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none" placeholder="Why is this correction needed?" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" disabled={busy} onClick={close} className="h-11 rounded-full border border-border px-5 text-sm font-medium disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy} className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save correction'}</button>
          </div>
        </form>
      )}
    </AppDialog>
  )
}
