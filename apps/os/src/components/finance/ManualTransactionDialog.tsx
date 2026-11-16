/**
 * @file ManualTransactionDialog.tsx
 * @description Record one manual Money In / Money Out entry with its proof.
 * Opened from the "Record" menu on Cash & Transactions; the direction is
 * chosen there, so the form starts at the category. Editing a posted entry
 * goes through FinancePostedTransactionEditor instead.
 */

import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react'
import { FileCheck2, Loader2, Upload, X } from 'lucide-react'
import { useFinanceStore } from '../../store/financeStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { BranchId } from '../../types/orders'
import { AppDialog } from '../ui/app-dialog'
import { ActionFooter } from '../ui/action-footer'
import type {
  FinanceCategory,
  FinancePaymentMethod,
  FinanceTransactionScope,
  FinanceTransactionType,
} from '../../store/financeStoreTypes'
import {
  getCategoriesForDirection,
  getFinanceCategoryDefinition,
} from '../../domain/financeTransactionCategoryDomain'
import { financeBusinessDate, jakartaDateKey } from '../../domain/financeDates'
import {
  removeFinanceTransactionProof,
  uploadFinanceTransactionProof,
} from '../../data/financeTransactionProof'
import { saveManualFinanceTransaction } from '../../data/financeManualTransaction'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { formatIdrInput } from '../../lib/formatters'
import { toast } from '../../hooks/use-toast'
import { CASH_ACCOUNT_ID, LEGACY_ACCOUNT_ID, useFinanceAccounts } from './useFinanceAccounts'

interface ManualTransactionDialogProps {
  open: boolean
  direction: FinanceTransactionType
  onClose: () => void
  branches: BranchId[]
  defaultBranch?: BranchId
}

type FieldName = 'category' | 'branch' | 'accountId' | 'method' | 'name' | 'amount' | 'manualEntryReason' | 'proof'
type FieldErrors = Partial<Record<FieldName, string>>

const METHODS: FinancePaymentMethod[] = ['cash', 'transfer', 'card', 'other']
const formatAmount = formatIdrInput
const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

export const ManualTransactionDialog: FC<ManualTransactionDialogProps> = ({
  open,
  direction,
  onClose,
  branches,
  defaultBranch,
}) => {
  const tr = useBilingualCopy()
  const transactions = useFinanceStore((state) => state.transactions)
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const settingsBankAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const { bankAccounts } = useFinanceAccounts()
  const defaultBankAccountId = settingsBankAccounts.find((account) => account.isActive !== false && account.isDefault)?.id
    ?? bankAccounts[0]?.id
    ?? ''
  const initialBranch: BranchId | '' = defaultBranch && defaultBranch !== 'All' ? defaultBranch : ''

  const [category, setCategory] = useState<FinanceCategory | ''>('')
  const [scope, setScope] = useState<FinanceTransactionScope>('company')
  const [branch, setBranch] = useState<BranchId | ''>(initialBranch)
  const [accountId, setAccountId] = useState(defaultBankAccountId)
  const [transactionDate, setTransactionDate] = useState(jakartaDateKey())
  const [amountDigits, setAmountDigits] = useState('')
  const [transferFeeDigits, setTransferFeeDigits] = useState('')
  const [name, setName] = useState('')
  const [method, setMethod] = useState<FinancePaymentMethod>('transfer')
  const [note, setNote] = useState('')
  const [manualEntryReason, setManualEntryReason] = useState('')
  const [transactionCode, setTransactionCode] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Every open starts from a clean form for the chosen direction.
  useEffect(() => {
    if (!open) return
    setCategory('')
    setScope('company')
    setBranch(initialBranch)
    setAccountId(defaultBankAccountId)
    setTransactionDate(jakartaDateKey())
    setAmountDigits('')
    setTransferFeeDigits('')
    setName('')
    setMethod('transfer')
    setNote('')
    setManualEntryReason('')
    setTransactionCode('')
    setProofFile(null)
    setErrors({})
    setFormError(null)
    setSaving(false)
    // Reset only when the dialog opens or the direction changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direction])

  const directionCategories = getCategoriesForDirection(direction, customCategories, categoryOverrides)
  const selectedDefinition = category
    ? getFinanceCategoryDefinition(category, customCategories, categoryOverrides)
    : undefined

  const duplicateCandidates = useMemo(() => {
    if (!selectedDefinition?.linkedWorkflow || !category || !amountDigits) return []
    const amount = Number(amountDigits)
    return transactions.filter((item) => {
      const itemScope = item.scope ?? (item.branch === 'All' ? 'company' : 'branch')
      return item.entryMode === 'automatic'
        && item.category === category
        && item.amount === amount
        && financeBusinessDate(item) === transactionDate
        && (scope === 'company' ? itemScope === 'company' : itemScope === 'branch' && item.branch === branch)
    })
  }, [transactions, selectedDefinition, category, amountDigits, transactionDate, scope, branch])

  const selectCategory = (value: FinanceCategory | '') => {
    setCategory(value)
    const definition = value ? getFinanceCategoryDefinition(value, customCategories, categoryOverrides) : undefined
    const policy = definition?.scopePolicy ?? (definition?.branchRequired ? 'branch' : 'company')
    setScope(policy === 'branch' ? 'branch' : 'company')
    if (policy !== 'branch') setBranch('All')
    else if (branch === 'All') setBranch(initialBranch)
    setErrors((current) => ({ ...current, category: undefined }))
  }

  const changeMethod = (value: FinancePaymentMethod) => {
    setMethod(value)
    if (value === 'cash') setAccountId(CASH_ACCOUNT_ID)
    else if (accountId === CASH_ACCOUNT_ID || !accountId) setAccountId(defaultBankAccountId)
    setErrors((current) => ({ ...current, accountId: undefined, method: undefined }))
  }

  const close = () => {
    if (saving) return
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return

    const amount = Number(amountDigits)
    const transferFee = Number(transferFeeDigits) || 0
    const next: FieldErrors = {}
    if (!category) next.category = tr('Select a category.', 'Pilih kategori.')
    if (!accountId || accountId === LEGACY_ACCOUNT_ID) next.accountId = tr('Select the account the money moved through.', 'Pilih rekening tempat uang bergerak.')
    if (method === 'cash' && accountId !== CASH_ACCOUNT_ID) next.accountId = tr('Cash payments use the Cash account.', 'Pembayaran tunai memakai rekening Kas.')
    if (method !== 'cash' && accountId === CASH_ACCOUNT_ID) next.accountId = tr('Select a bank account for this payment method.', 'Pilih rekening bank untuk metode ini.')
    if (transferFee > 0 && method === 'cash') next.method = tr('A transfer fee needs a non-cash method.', 'Biaya transfer perlu metode non-tunai.')
    if (!name.trim()) next.name = tr('Describe the transaction.', 'Isi nama transaksi.')
    if (!(amount > 0)) next.amount = tr('Amount must be more than zero.', 'Nominal harus lebih dari nol.')
    if (scope === 'branch' && (!branch || branch === 'All')) next.branch = tr('Select a branch.', 'Pilih cabang.')
    if (selectedDefinition?.linkedWorkflow && manualEntryReason.trim().length < 6) next.manualEntryReason = tr('Explain why this is entered manually.', 'Jelaskan kenapa dicatat manual.')
    if (!proofFile) next.proof = tr('Upload the proof before saving.', 'Unggah bukti sebelum menyimpan.')
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }
    if (!category || !proofFile) return

    setSaving(true)
    setFormError(null)
    let uploadedProofPath: string | undefined
    try {
      const uploaded = await uploadFinanceTransactionProof(proofFile)
      uploadedProofPath = uploaded.path
      await saveManualFinanceTransaction({
        type: direction,
        category,
        scope,
        branch,
        accountId,
        amount,
        method,
        name,
        note,
        manualEntryReason,
        transactionDate: `${transactionDate}T12:00:00+07:00`,
        transactionCode,
        proofPath: uploaded.path,
        proofFileName: uploaded.fileName,
        transferFee: direction === 'expense' ? transferFee : 0,
      })
      toast({ title: direction === 'income' ? tr('Money In recorded', 'Uang masuk tercatat') : tr('Money Out recorded', 'Uang keluar tercatat') })
      onClose()
    } catch (error) {
      if (uploadedProofPath) await removeFinanceTransactionProof(uploadedProofPath)
      setFormError(error instanceof Error ? error.message : tr('The transaction was not saved.', 'Transaksi gagal disimpan.'))
    } finally {
      setSaving(false)
    }
  }

  const methodLabel: Record<FinancePaymentMethod, string> = {
    cash: tr('Cash', 'Tunai'),
    transfer: tr('Bank transfer', 'Transfer bank'),
    card: tr('Card', 'Kartu'),
    other: tr('Other', 'Lainnya'),
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(value) => { if (!value) close() }}
      size="standard"
      title={direction === 'income' ? tr('Record Money In', 'Catat uang masuk') : tr('Record Money Out', 'Catat uang keluar')}
      contentClassName="max-w-3xl"
    >
      <form onSubmit={(event) => { void submit(event) }} className="space-y-5" aria-label={tr('Manual transaction', 'Transaksi manual')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium">
            {tr('Category', 'Kategori')}
            <select aria-label="Transaction category" value={category} onChange={(event) => selectCategory(event.target.value as FinanceCategory)} className={inputClass}>
              <option value="">{tr('Select category', 'Pilih kategori')}</option>
              {directionCategories.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.label}{definition.linkedWorkflow ? tr(' · automatic', ' · otomatis') : ''}
                </option>
              ))}
            </select>
            {errors.category && <span className="text-xs text-destructive">{errors.category}</span>}
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            {tr('Date', 'Tanggal')}
            <input type="date" aria-label="Transaction date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className={inputClass} />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">{tr('Applies to', 'Berlaku untuk')}</legend>
          <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-track p-1">
            <button type="button" disabled={selectedDefinition?.allowScopeOverride === false && selectedDefinition.scopePolicy !== 'company'} onClick={() => { setScope('company'); setBranch('All') }} className={`h-10 rounded-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${scope === 'company' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{tr('Company-wide', 'Seluruh perusahaan')}</button>
            <button type="button" disabled={selectedDefinition?.allowScopeOverride === false && selectedDefinition.scopePolicy !== 'branch'} onClick={() => { setScope('branch'); if (branch === 'All') setBranch(initialBranch) }} className={`h-10 rounded-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${scope === 'branch' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{tr('One branch', 'Satu cabang')}</button>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          {scope === 'branch' && (
            <label className="space-y-1.5 text-xs font-medium">
              {tr('Branch', 'Cabang')}
              <select aria-label="Transaction branch" value={branch} onChange={(event) => setBranch(event.target.value as BranchId)} className={inputClass}>
                <option value="">{tr('Select branch', 'Pilih cabang')}</option>
                {branches.filter((item) => item !== 'All').map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              {errors.branch && <span className="text-xs text-destructive">{errors.branch}</span>}
            </label>
          )}
          <label className="space-y-1.5 text-xs font-medium">
            {tr('Account', 'Rekening')}
            <select aria-label="Finance account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setErrors((current) => ({ ...current, accountId: undefined })) }} className={inputClass}>
              <option value="">{tr('Select account', 'Pilih rekening')}</option>
              <option value={CASH_ACCOUNT_ID}>{tr('Cash', 'Kas tunai')}</option>
              {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
            {errors.accountId && <span className="text-xs text-destructive">{errors.accountId}</span>}
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            {tr('Payment method', 'Metode pembayaran')}
            <select aria-label="Payment method" value={method} onChange={(event) => changeMethod(event.target.value as FinancePaymentMethod)} className={inputClass}>
              {METHODS.map((value) => <option key={value} value={value}>{methodLabel[value]}</option>)}
            </select>
            {errors.method && <span className="text-xs text-destructive">{errors.method}</span>}
          </label>
          <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
            {tr('Transaction', 'Transaksi')}
            <input aria-label="Transaction" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder={selectedDefinition?.placeholder} />
            {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            {tr('Amount (IDR)', 'Nominal (Rp)')}
            <input aria-label="Amount IDR" inputMode="numeric" value={formatAmount(amountDigits)} onChange={(event) => setAmountDigits(event.target.value.replace(/\D/g, ''))} className={inputClass} />
            {errors.amount && <span className="text-xs text-destructive">{errors.amount}</span>}
          </label>
          {direction === 'expense' && (
            <label className="space-y-1.5 text-xs font-medium">
              {tr('Transfer fee · optional', 'Biaya transfer · opsional')}
              <input aria-label="Transfer fee IDR" inputMode="numeric" value={formatAmount(transferFeeDigits)} onChange={(event) => setTransferFeeDigits(event.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="0" />
            </label>
          )}
          <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
            {tr('Transaction code · optional', 'Kode transaksi · opsional')}
            <input aria-label="Transaction Code" value={transactionCode} onChange={(event) => setTransactionCode(event.target.value.toUpperCase())} maxLength={64} autoComplete="off" placeholder="-" className={inputClass} />
          </label>
        </div>

        <div className="rounded-xl border border-border/70 bg-surface-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground">{tr('Proof', 'Bukti transaksi')}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG, WEBP, PDF · maks. 5 MB</p>
            </div>
            {proofFile && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                <FileCheck2 className="size-3.5" /> {tr('Attached', 'Terlampir')}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground">
              <Upload className="size-3.5" /> {proofFile ? tr('Replace', 'Ganti bukti') : tr('Upload', 'Unggah bukti')}
              <input
                type="file"
                aria-label="Transaction proof"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  setProofFile(event.target.files?.[0] ?? null)
                  setErrors((current) => ({ ...current, proof: undefined }))
                  event.currentTarget.value = ''
                }}
              />
            </label>
            {proofFile && (
              <button type="button" onClick={() => setProofFile(null)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted">
                <X className="size-3.5" /> {tr('Remove', 'Hapus')}
              </button>
            )}
          </div>
          {proofFile && <p className="mt-2 truncate text-xs font-medium text-foreground/80">{proofFile.name}</p>}
          {errors.proof && <p className="mt-2 text-xs text-destructive">{errors.proof}</p>}
        </div>

        {selectedDefinition?.linkedWorkflow && (
          <>
            <p className="rounded-xl bg-warning/10 px-4 py-3 text-xs text-warning">
              {duplicateCandidates.length
                ? tr(
                    `${duplicateCandidates.length} automatic entr${duplicateCandidates.length === 1 ? 'y' : 'ies'} with this date, amount, and scope already exist. Check before saving.`,
                    `Sudah ada ${duplicateCandidates.length} catatan otomatis dengan tanggal, nominal, dan cakupan ini. Cek dulu sebelum menyimpan.`,
                  )
                : tr('This category is normally recorded automatically. Check it is not already recorded.', 'Kategori ini biasanya tercatat otomatis. Pastikan belum tercatat.')}
            </p>
            <label className="block space-y-1.5 text-xs font-medium">
              {tr('Why manual · required', 'Alasan dicatat manual · wajib')}
              <textarea aria-label="Manual entry reason" value={manualEntryReason} onChange={(event) => setManualEntryReason(event.target.value)} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" />
              {errors.manualEntryReason && <span className="text-xs text-destructive">{errors.manualEntryReason}</span>}
            </label>
          </>
        )}

        <label className="block space-y-1.5 text-xs font-medium">
          {tr('Note · optional', 'Catatan · opsional')}
          <textarea aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" />
        </label>

        {formError && <p role="alert" className="text-xs text-destructive">{formError}</p>}
        <ActionFooter className="sticky bottom-0 bg-card/95">
          <button type="button" disabled={saving} onClick={close} className="h-11 rounded-full px-[18px] disabled:opacity-40">{tr('Cancel', 'Batal')}</button>
          <button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] font-semibold text-primary-foreground disabled:opacity-50">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? tr('Saving…', 'Menyimpan…') : tr('Save', 'Simpan')}
          </button>
        </ActionFooter>
      </form>
    </AppDialog>
  )
}
