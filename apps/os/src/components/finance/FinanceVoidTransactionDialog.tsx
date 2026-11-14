import { useEffect, useState, type FC, type FormEvent } from 'react'
import { Ban } from 'lucide-react'
import { useFinanceStore } from '../../store/financeStore'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import { useUserStore } from '../../store/userStore'
import { voidFinanceTransaction } from '../../data/financeCashFlow'
import { canVoidFinanceTransaction, financeActionCopy, financeTransactionTitle } from '../../domain/financeTransactionActionsDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { toast } from '../../hooks/use-toast'
import { AppDialog } from '../ui/app-dialog'

const formatIdr = (value: number): string => `Rp ${Math.round(value).toLocaleString('id-ID')}`

/** Opened with `window.dispatchEvent(new CustomEvent('finance-void-transaction', { detail: id }))`. */
export const FinanceVoidTransactionDialog: FC = () => {
  const tr = useBilingualCopy()
  const titleOf = (target: FinanceTransaction) => { const title = financeTransactionTitle(target); return tr(title.en, title.id) }
  const role = useUserStore((state) => state.role)
  const transactions = useFinanceStore((state) => state.transactions)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const transaction = transactions.find((item) => item.id === transactionId)

  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const target = transactions.find((item) => item.id === id)
      if (!target || !canVoidFinanceTransaction(target, true)) return
      setTransactionId(id)
      setReason('')
    }
    window.addEventListener('finance-void-transaction', open)
    return () => window.removeEventListener('finance-void-transaction', open)
  }, [transactions])

  if (role !== 'finance') return null

  const close = () => {
    if (busy) return
    setTransactionId(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!transaction || busy) return
    if (reason.trim().length < 3) {
      toast({ title: tr('Reason required', 'Alasan wajib diisi'), description: tr('Explain why this transaction is voided.', 'Jelaskan kenapa transaksi ini dibatalkan.'), variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await voidFinanceTransaction({ transactionId: transaction.id, reason })
      toast({ title: tr('Transaction voided', 'Transaksi dibatalkan'), description: tr('It stays in the ledger for the audit trail and no longer counts.', 'Transaksi tetap tercatat untuk jejak audit dan tidak lagi dihitung.') })
      setTransactionId(null)
    } catch (error) {
      toast({ title: tr('Transaction was not voided', 'Transaksi tidak dibatalkan'), description: error instanceof Error ? error.message : tr('Please try again.', 'Silakan coba lagi.'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const consequence = transaction ? financeActionCopy(transaction).voidConsequence : undefined

  return (
    <AppDialog
      open={Boolean(transaction)}
      onOpenChange={(open) => { if (!open) close() }}
      size="standard"
      title={tr('Void transaction', 'Void transaksi')}
      description={transaction ? `${titleOf(transaction)} · ${formatIdr(transaction.amount)}${transaction.orderNumber ? ` · ${transaction.orderNumber}` : ''}` : undefined}
    >
      {transaction && consequence && (
        <form onSubmit={submit} className="space-y-4" data-testid="finance-void-transaction-form">
          <p className="flex gap-2 rounded-xl bg-destructive/10 px-3.5 py-3 text-xs font-medium text-destructive">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {tr(consequence.en, consequence.id)}{' '}
              {tr('A void cannot be undone.', 'Void tidak bisa dibatalkan.')}
            </span>
          </p>
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Reason for the void', 'Alasan void')} <span className="text-destructive">*</span>
            <textarea aria-label={tr('Reason for the void', 'Alasan void')} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none" placeholder={tr('e.g. duplicate entry, fake transfer proof', 'mis. input dobel, bukti transfer palsu')} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" disabled={busy} onClick={close} className="h-11 rounded-full border border-border px-5 text-sm font-medium disabled:opacity-50">{tr('Cancel', 'Batal')}</button>
            <button type="submit" disabled={busy} className="h-11 rounded-full bg-destructive px-5 text-sm font-semibold text-destructive-foreground disabled:opacity-50">{busy ? tr('Voiding…', 'Memproses…') : tr('Void transaction', 'Void transaksi')}</button>
          </div>
        </form>
      )}
    </AppDialog>
  )
}
