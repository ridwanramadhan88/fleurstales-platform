/**
 * @file CashFlowEntryDialog.tsx
 * @description Balance moves that are not income or expense: an account's
 * opening balance, a correction with a reason, or a transfer between
 * company accounts (with an optional fee).
 */

import { useEffect, useState, type FC, type FormEvent } from 'react'
import { createFinanceCashFlowEntry, type CashFlowEntryKind } from '../../data/financeCashFlow'
import { toast } from '../../hooks/use-toast'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { formatIdrInput } from '../../lib/formatters'
import { AppDialog } from '../ui/app-dialog'
import { useFinanceAccounts } from './useFinanceAccounts'

const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'
const formatDigits = formatIdrInput

export const CashFlowEntryDialog: FC<{ mode: CashFlowEntryKind | null; onClose: () => void }> = ({ mode, onClose }) => {
  const tr = useBilingualCopy()
  const { options } = useFinanceAccounts()
  const [accountId, setAccountId] = useState('')
  const [counterpartyAccountId, setCounterpartyAccountId] = useState('')
  const [direction, setDirection] = useState<'income' | 'expense'>('income')
  const [amount, setAmount] = useState('')
  const [transferFee, setTransferFee] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!mode) return
    setAccountId(options[0]?.id ?? '')
    setCounterpartyAccountId(options[1]?.id ?? '')
    setDirection('income')
    setAmount('')
    setTransferFee('')
    setNote('')
    // Reset only when a new entry opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const reasonRequired = mode === 'opening_balance' || mode === 'adjustment'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!mode || busy) return
    const numericAmount = Number(amount) || 0
    if (!accountId || !(numericAmount > 0)) {
      toast({ title: tr('Choose an account and amount', 'Pilih rekening dan nominal'), variant: 'destructive' })
      return
    }
    if (reasonRequired && note.trim().length < 3) {
      toast({ title: tr('Reason required', 'Alasan wajib diisi'), variant: 'destructive' })
      return
    }
    if (mode === 'transfer' && (!counterpartyAccountId || counterpartyAccountId === accountId)) {
      toast({ title: tr('Choose a different destination', 'Pilih rekening tujuan yang berbeda'), variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await createFinanceCashFlowEntry({
        kind: mode,
        accountId,
        amount: numericAmount,
        direction: mode === 'adjustment' ? direction : undefined,
        counterpartyAccountId: mode === 'transfer' ? counterpartyAccountId : undefined,
        transactionDate: new Date().toISOString(),
        note,
        transferFee: mode === 'transfer' ? Number(transferFee) || 0 : undefined,
      })
      toast({ title: mode === 'transfer' ? tr('Transfer recorded', 'Transfer tercatat') : mode === 'adjustment' ? tr('Balance adjusted', 'Saldo disesuaikan') : tr('Opening balance recorded', 'Saldo awal tercatat') })
      onClose()
    } catch (error) {
      toast({ title: tr('Not saved', 'Gagal disimpan'), description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'opening_balance'
    ? tr('Opening balance', 'Saldo awal')
    : mode === 'adjustment'
      ? tr('Adjust balance', 'Sesuaikan saldo')
      : tr('Transfer between accounts', 'Transfer antar rekening')

  return (
    <AppDialog open={mode !== null} onOpenChange={(open) => { if (!open && !busy) onClose() }} size="standard" title={title}>
      <form onSubmit={(event) => { void submit(event) }} className="space-y-4" aria-label={title}>
        <label className="block space-y-1.5 text-xs font-medium">
          {mode === 'transfer' ? tr('From', 'Dari rekening') : tr('Account', 'Rekening')}
          <select aria-label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>
            <option value="">{tr('Select account', 'Pilih rekening')}</option>
            {options.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
        </label>
        {mode === 'transfer' && (
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('To', 'Ke rekening')}
            <select aria-label="Destination account" value={counterpartyAccountId} onChange={(event) => setCounterpartyAccountId(event.target.value)} className={inputClass}>
              <option value="">{tr('Select account', 'Pilih rekening')}</option>
              {options.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
          </label>
        )}
        {mode === 'adjustment' && (
          <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-track p-1 ring-1 ring-border/60" role="radiogroup" aria-label={tr('Direction', 'Arah')}>
            <button type="button" role="radio" aria-checked={direction === 'income'} onClick={() => setDirection('income')} className={`h-10 rounded-full text-sm font-semibold ${direction === 'income' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{tr('Increase +', 'Tambah +')}</button>
            <button type="button" role="radio" aria-checked={direction === 'expense'} onClick={() => setDirection('expense')} className={`h-10 rounded-full text-sm font-semibold ${direction === 'expense' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{tr('Decrease −', 'Kurangi −')}</button>
          </div>
        )}
        <label className="block space-y-1.5 text-xs font-medium">
          {tr('Amount (IDR)', 'Nominal (Rp)')}
          <input aria-label="Amount" value={formatDigits(amount)} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClass} />
        </label>
        {mode === 'transfer' && (
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Transfer fee · optional', 'Biaya transfer · opsional')}
            <input aria-label="Transfer fee" value={formatDigits(transferFee)} onChange={(event) => setTransferFee(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" className={inputClass} />
          </label>
        )}
        <label className="block space-y-1.5 text-xs font-medium">
          {reasonRequired ? tr('Reason', 'Alasan') : tr('Note · optional', 'Catatan · opsional')}
          <textarea aria-label={reasonRequired ? 'Reason' : 'Note'} value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground/40" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-11 rounded-full border border-border px-5 text-sm font-medium disabled:opacity-50">{tr('Cancel', 'Batal')}</button>
          <button type="submit" disabled={busy} className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? tr('Saving…', 'Menyimpan…') : tr('Save', 'Simpan')}</button>
        </div>
      </form>
    </AppDialog>
  )
}
