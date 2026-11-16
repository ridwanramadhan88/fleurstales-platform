import { useEffect, useState, type FC, type FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFinanceStore } from '../../store/financeStore'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import { useFinanceAccess } from './useFinanceAccess'
import { useFinanceAccounts } from './useFinanceAccounts'
import { useFinanceUiStore } from './financeUiStore'
import { editPostedFinanceTransaction } from '../../data/financeCashFlow'
import {
  canEditFinanceTransaction,
  financeActionCopy,
  financeEditableFields,
  fromJakartaDateTimeInput,
  toJakartaDateTimeInput,
  financeTransactionTitle,
} from '../../domain/financeTransactionActionsDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { toast } from '../../hooks/use-toast'
import { AppDialog } from '../ui/app-dialog'

/** Opened through `useFinanceUiStore().openTransactionEdit(id)`. */
export const FinancePostedTransactionEditor: FC = () => {
  const tr = useBilingualCopy()
  const titleOf = (target: FinanceTransaction) => { const title = financeTransactionTitle(target); return tr(title.en, title.id) }
  const { canEditEntry } = useFinanceAccess()
  const requestedId = useFinanceUiStore((state) => state.editTransactionId)
  const closeEditor = useFinanceUiStore((state) => state.openTransactionEdit)
  const transactions = useFinanceStore((state) => state.transactions)
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const requested = transactions.find((item) => item.id === requestedId)
  const transaction = requested && canEditEntry && canEditFinanceTransaction(requested, true) ? requested : undefined
  const { options: accountOptions } = useFinanceAccounts()

  // Load the form whenever a different row is opened for editing.
  useEffect(() => {
    const target = transactions.find((item) => item.id === requestedId)
    if (!target) return
    setAccountId(target.accountId ?? '')
    setAmount(String(target.amount))
    setTransactionDate(toJakartaDateTimeInput(target.transactionDate ?? target.createdAt))
    setReference(target.reference ?? '')
    setNote(target.note ?? '')
    setReason('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId])

  if (!canEditEntry) return null

  const close = () => {
    if (busy) return
    closeEditor(null)
    setReason('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!transaction || busy) return
    const numericAmount = Number(amount.replace(/\D/g, ''))
    if (!(numericAmount > 0) || !accountId) {
      toast({ title: tr('Complete the transaction', 'Lengkapi transaksi'), description: tr('Account and amount are required.', 'Rekening dan nominal wajib diisi.'), variant: 'destructive' })
      return
    }
    if (reason.trim().length < 3) {
      toast({ title: tr('Reason required', 'Alasan wajib diisi'), description: tr('Explain why this transaction is being corrected.', 'Jelaskan kenapa transaksi ini dikoreksi.'), variant: 'destructive' })
      return
    }

    // Only send what changed: the server keeps everything else (and its audit trail).
    const fields = financeEditableFields(transaction)
    const patch: Parameters<typeof editPostedFinanceTransaction>[0]['patch'] = {}
    if (accountId !== (transaction.accountId ?? '')) {
      patch.accountId = accountId
      if (fields.methodFollowsAccount) patch.method = accountId === 'cash:main' ? 'cash' : 'transfer'
    }
    if (numericAmount !== transaction.amount) patch.amount = numericAmount
    const originalDate = toJakartaDateTimeInput(transaction.transactionDate ?? transaction.createdAt)
    if (transactionDate && transactionDate !== originalDate) patch.transactionDate = fromJakartaDateTimeInput(transactionDate)
    if (reference.trim() !== (transaction.reference ?? '')) patch.reference = reference.trim()
    if (note.trim() !== (transaction.note ?? '')) patch.note = note.trim()
    if (Object.keys(patch).length === 0) {
      toast({ title: tr('Nothing changed', 'Tidak ada perubahan'), description: tr('Change a field before saving.', 'Ubah salah satu kolom sebelum menyimpan.') })
      return
    }

    setBusy(true)
    try {
      await editPostedFinanceTransaction({ transactionId: transaction.id, patch, reason })
      toast({ title: tr('Transaction updated', 'Transaksi diperbarui'), description: tr('The correction and its reason were added to the history.', 'Koreksi dan alasannya tercatat di riwayat.') })
      closeEditor(null)
    } catch (error) {
      toast({ title: tr('Transaction was not updated', 'Transaksi tidak diperbarui'), description: error instanceof Error ? error.message : tr('Please try again.', 'Silakan coba lagi.'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'
  const warning = transaction ? financeActionCopy(transaction).editWarning : undefined
  const knownAccount = accountOptions.some((option) => option.id === accountId)

  return (
    <AppDialog
      open={Boolean(transaction)}
      onOpenChange={(open) => { if (!open) close() }}
      size="standard"
      title={tr('Edit transaction', 'Ubah transaksi')}
      description={transaction ? `${titleOf(transaction)} · ${transaction.orderNumber ?? transaction.transactionCode ?? ''}` : undefined}
    >
      {transaction && (
        <form onSubmit={submit} className="space-y-4" data-testid="finance-edit-transaction-form">
          {warning && (
            <p className="flex gap-2 rounded-xl bg-warning/10 px-3.5 py-3 text-xs font-medium text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {tr(warning.en, warning.id)}
            </p>
          )}
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Account', 'Rekening')}
            <select aria-label={tr('Account', 'Rekening')} value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>
              {!knownAccount && <option value={accountId}>{accountId || tr('Not set', 'Belum diatur')}</option>}
              {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Amount (IDR)', 'Nominal (Rp)')}
            <input aria-label={tr('Amount (IDR)', 'Nominal (Rp)')} value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClass} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Transaction time (WIB)', 'Waktu transaksi (WIB)')}
            <input aria-label={tr('Transaction time (WIB)', 'Waktu transaksi (WIB)')} type="datetime-local" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Reference', 'Referensi')}
            <input aria-label={tr('Reference', 'Referensi')} value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder={tr('e.g. BCA/0106/02', 'mis. BCA/0106/02')} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Note', 'Catatan')}
            <textarea aria-label={tr('Note', 'Catatan')} value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none" />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Reason for the correction', 'Alasan koreksi')} <span className="text-destructive">*</span>
            <textarea aria-label={tr('Reason for the correction', 'Alasan koreksi')} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none" placeholder={tr('Why is this correction needed?', 'Kenapa transaksi ini perlu dikoreksi?')} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" disabled={busy} onClick={close} className="h-11 rounded-full border border-border px-5 text-sm font-medium disabled:opacity-50">{tr('Cancel', 'Batal')}</button>
            <button type="submit" disabled={busy} className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? tr('Saving…', 'Menyimpan…') : tr('Save correction', 'Simpan koreksi')}</button>
          </div>
        </form>
      )}
    </AppDialog>
  )
}
