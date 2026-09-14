import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileCheck2,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react'
import { useFinanceStore } from '../../store/financeStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { UserRole } from '../../store/userStore'
import type { BranchId } from '../../types/orders'
import { AppDialog } from '../ui/app-dialog'
import { ActionFooter } from '../ui/action-footer'
import { InfoHint } from '../ui/info-hint'
import { FinanceModuleHeader } from './FinanceModuleHeader'
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
import {
  removeFinanceTransactionProof,
  uploadFinanceTransactionProof,
} from '../../data/financeTransactionProof'
import { saveManualFinanceTransaction } from '../../data/financeManualTransaction'

interface AddInternalTransactionProps {
  branches: BranchId[]
  defaultBranch?: BranchId
  actorName: string
  actorRole: UserRole
}

type FieldName =
  | 'direction'
  | 'category'
  | 'branch'
  | 'accountId'
  | 'method'
  | 'name'
  | 'amount'
  | 'manualEntryReason'
  | 'proof'

type FieldErrors = Partial<Record<FieldName, string>>

const methods: FinancePaymentMethod[] = ['cash', 'transfer', 'card', 'other']
const methodLabel: Record<FinancePaymentMethod, string> = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  card: 'Card',
  other: 'Other',
}
const formatAmount = (digits: string) => digits ? Number(digits).toLocaleString('id-ID') : ''

export const AddInternalTransaction: FC<AddInternalTransactionProps> = ({
  branches,
  defaultBranch,
  actorName,
  actorRole,
}) => {
  const transactions = useFinanceStore((state) => state.transactions)
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const paymentAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)

  const activePaymentAccounts = useMemo(
    () => paymentAccounts.filter((account) => account.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [paymentAccounts],
  )
  const defaultTransferAccountId = activePaymentAccounts.find((account) => account.isDefault)?.id
    ?? activePaymentAccounts[0]?.id
    ?? ''
  const initialBranch = useMemo(
    () => defaultBranch && defaultBranch !== 'All' ? defaultBranch : '',
    [defaultBranch],
  )

  const [open, setOpen] = useState(false)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [editReason, setEditReason] = useState('')
  const [direction, setDirection] = useState<FinanceTransactionType | null>(null)
  const [category, setCategory] = useState<FinanceCategory | ''>('')
  const [scope, setScope] = useState<FinanceTransactionScope>('company')
  const [branch, setBranch] = useState<BranchId | ''>(initialBranch as BranchId | '')
  const [accountId, setAccountId] = useState(defaultTransferAccountId)
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10))
  const [amountDigits, setAmountDigits] = useState('')
  const [transferFeeDigits, setTransferFeeDigits] = useState('')
  const [name, setName] = useState('')
  const [method, setMethod] = useState<FinancePaymentMethod>('transfer')
  const [note, setNote] = useState('')
  const [manualEntryReason, setManualEntryReason] = useState('')
  const [transactionCode, setTransactionCode] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [existingProofPath, setExistingProofPath] = useState<string | undefined>()
  const [existingProofFileName, setExistingProofFileName] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const directionCategories = direction
    ? getCategoriesForDirection(direction, customCategories, categoryOverrides)
    : []
  const selectedDefinition = category
    ? getFinanceCategoryDefinition(category, customCategories, categoryOverrides)
    : undefined

  const duplicateCandidates = useMemo(() => {
    if (!selectedDefinition?.linkedWorkflow || !category || !amountDigits) return []
    const amount = Number(amountDigits)
    const date = transactionDate
    return transactions.filter((item) =>
      item.entryMode === 'automatic'
      && item.category === category
      && item.amount === amount
      && (item.transactionDate ?? item.createdAt).slice(0, 10) === date
      && (scope === 'company'
        ? (item.scope ?? (item.branch === 'All' ? 'company' : 'branch')) === 'company'
        : (item.scope ?? (item.branch === 'All' ? 'company' : 'branch')) === 'branch' && item.branch === branch),
    )
  }, [transactions, selectedDefinition, category, amountDigits, transactionDate, scope, branch])

  useEffect(() => {
    const openManualEditor = (event: Event) => {
      const transactionId = (event as CustomEvent<string>).detail
      const transaction = transactions.find((item) => item.id === transactionId)
      const entryMode = transaction?.entryMode ?? (transaction?.isSystemGenerated ? 'automatic' : 'manual')
      if (!transaction || entryMode !== 'manual' || (transaction.source ?? 'manual') !== 'manual' || transaction.isSystemGenerated) return

      setEditingTransactionId(transaction.id)
      setDirection(transaction.type)
      setCategory(transaction.category)
      setScope(transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch'))
      setBranch(transaction.branch)
      setAccountId(transaction.accountId ?? '')
      setTransactionDate((transaction.transactionDate ?? transaction.createdAt).slice(0, 10))
      setAmountDigits(String(transaction.amount))
      setTransferFeeDigits('')
      setName(transaction.name ?? transaction.description)
      setMethod(transaction.method)
      setNote(transaction.note ?? transaction.description ?? '')
      setManualEntryReason(transaction.manualEntryReason ?? '')
      setTransactionCode(transaction.transactionCode === '-' ? '' : transaction.transactionCode ?? '')
      setExistingProofPath(transaction.proofPath)
      setExistingProofFileName(transaction.proofFileName)
      setProofFile(null)
      setEditReason('')
      setErrors({})
      setFormError(null)
      setSuccess(null)
      setOpen(true)
    }

    window.addEventListener('finance-edit-manual-transaction', openManualEditor)
    return () => window.removeEventListener('finance-edit-manual-transaction', openManualEditor)
  }, [transactions])

  if (actorRole !== 'finance') return null

  const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

  const reset = () => {
    setDirection(null)
    setCategory('')
    setScope('company')
    setBranch(initialBranch as BranchId | '')
    setAccountId(defaultTransferAccountId)
    setTransactionDate(new Date().toISOString().slice(0, 10))
    setAmountDigits('')
    setTransferFeeDigits('')
    setName('')
    setMethod('transfer')
    setNote('')
    setManualEntryReason('')
    setTransactionCode('')
    setProofFile(null)
    setExistingProofPath(undefined)
    setExistingProofFileName(undefined)
    setEditReason('')
    setErrors({})
    setFormError(null)
    setSaving(false)
  }

  const selectDirection = (value: FinanceTransactionType) => {
    setDirection(value)
    setCategory('')
    setErrors({})
    setName('')
    setManualEntryReason('')
    if (value !== 'expense') setTransferFeeDigits('')
  }

  const selectCategory = (value: FinanceCategory | '') => {
    setCategory(value)
    const definition = value
      ? getFinanceCategoryDefinition(value, customCategories, categoryOverrides)
      : undefined
    const policy = definition?.scopePolicy ?? (definition?.branchRequired ? 'branch' : 'company')
    setScope(policy === 'branch' ? 'branch' : 'company')
    if (policy !== 'branch') setBranch('All')
    else if (branch === 'All') setBranch(initialBranch as BranchId | '')
    setErrors((current) => ({ ...current, category: undefined }))
  }

  const changeMethod = (value: FinancePaymentMethod) => {
    setMethod(value)
    if (value === 'cash') setAccountId('cash:main')
    else if (accountId === 'cash:main' || !accountId) setAccountId(defaultTransferAccountId)
    setErrors((current) => ({ ...current, accountId: undefined, method: undefined }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return

    const amount = Number(amountDigits)
    const transferFee = Number(transferFeeDigits) || 0
    const next: FieldErrors = {}
    if (!direction) next.direction = 'Choose Money In or Money Out.'
    if (!category) next.category = 'Select a transaction category.'
    if (!accountId || accountId === 'legacy:unassigned') next.accountId = 'Select the account or cash source affected by this transaction.'
    if (method === 'cash' && accountId !== 'cash:main') next.accountId = 'Cash transactions must use the Cash account.'
    if (method !== 'cash' && accountId === 'cash:main') next.accountId = 'Select a bank/e-wallet account for this payment method.'
    if (transferFee > 0 && method === 'cash') next.method = 'Transfer fee requires a bank or other non-cash payment method.'
    if (!name.trim()) next.name = 'Transaction is required.'
    if (!(amount > 0)) next.amount = 'Amount must be greater than zero.'
    if (scope === 'branch' && (!branch || branch === 'All')) next.branch = 'Select a Branch.'
    if (selectedDefinition?.linkedWorkflow && manualEntryReason.trim().length < 6) next.manualEntryReason = 'Explain why this automatic category is being entered manually.'
    if (!proofFile && !existingProofPath) next.proof = 'Upload bukti transaksi sebelum menyimpan.'
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }
    if (!direction || !category) return

    setSaving(true)
    setFormError(null)
    let uploadedProofPath: string | undefined

    try {
      let proofPath = existingProofPath
      let proofFileName = existingProofFileName
      if (proofFile) {
        const uploaded = await uploadFinanceTransactionProof(proofFile)
        uploadedProofPath = uploaded.path
        proofPath = uploaded.path
        proofFileName = uploaded.fileName
      }
      if (!proofPath) throw new Error('Transaction proof is required.')

      await saveManualFinanceTransaction({
        transactionId: editingTransactionId ?? undefined,
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
        proofPath,
        proofFileName,
        transferFee: !editingTransactionId && direction === 'expense' ? transferFee : 0,
        editReason: editingTransactionId ? editReason : undefined,
      })

      if (uploadedProofPath && existingProofPath && uploadedProofPath !== existingProofPath) {
        await removeFinanceTransactionProof(existingProofPath)
      }

      setSuccess(editingTransactionId ? 'Manual transaction updated.' : 'Manual transaction recorded.')
      reset()
      setEditingTransactionId(null)
      setEditReason('')
      setOpen(false)
    } catch (error) {
      if (uploadedProofPath) await removeFinanceTransactionProof(uploadedProofPath)
      setFormError(error instanceof Error ? error.message : 'Unable to save transaction.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label="Transactions" className="space-y-3">
      <FinanceModuleHeader
        title="Transactions"
        hint={
          <InfoHint label="About transactions">
            Record company-wide or branch Money In and Money Out to a real account or cash source. Every manual entry keeps a transaction code and private proof. Category configuration lives in Settings → Finance.
          </InfoHint>
        }
        actions={(
          <button type="button" onClick={() => { reset(); setEditingTransactionId(null); setOpen(true); setSuccess(null) }} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground">
            <Plus className="size-4" /> Add transaction
          </button>
        )}
      />

      {success && <p role="status" className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{success}</p>}

      <AppDialog
        open={open}
        onOpenChange={(value) => { if (!saving) { setOpen(value); if (!value) reset() } }}
        size="standard"
        title={editingTransactionId ? 'Edit manual transaction' : 'Add transaction'}
        description={editingTransactionId ? 'Update this posted manual ledger entry.' : 'Record a manual Money In or Money Out entry.'}
        contentClassName="max-w-3xl"
      >
        <form onSubmit={(event) => { void submit(event) }} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold">Direction</legend>
            <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-track p-1">
              {([['income','Money In',ArrowDownToLine],['expense','Money Out',ArrowUpFromLine]] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" onClick={() => selectDirection(value)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold ${direction === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </fieldset>

          {direction && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-medium">
                  Category
                  <select aria-label="Transaction category" value={category} onChange={(event) => selectCategory(event.target.value as FinanceCategory)} className={inputClass}>
                    <option value="">Select category</option>
                    {directionCategories.map((definition) => <option key={definition.id} value={definition.id}>{definition.label}{definition.linkedWorkflow ? ' · automatic' : ''}</option>)}
                  </select>
                  {errors.category && <span className="text-xs text-destructive">{errors.category}</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium">
                  Transaction date
                  <input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className={inputClass} />
                </label>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold">Applies to</legend>
                <div className="grid grid-cols-2 gap-2 rounded-full bg-surface-track p-1">
                  <button type="button" disabled={selectedDefinition?.allowScopeOverride === false && selectedDefinition.scopePolicy !== 'company'} onClick={() => { setScope('company'); setBranch('All') }} className={`h-10 rounded-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${scope === 'company' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Company-wide</button>
                  <button type="button" disabled={selectedDefinition?.allowScopeOverride === false && selectedDefinition.scopePolicy !== 'branch'} onClick={() => { setScope('branch'); if (branch === 'All') setBranch(initialBranch as BranchId | '') }} className={`h-10 rounded-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${scope === 'branch' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Specific branch</button>
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                {scope === 'branch' && (
                  <label className="space-y-1.5 text-xs font-medium">
                    Branch
                    <select aria-label="Transaction branch" value={branch} onChange={(event) => setBranch(event.target.value as BranchId)} className={inputClass}>
                      <option value="">Select Branch</option>
                      {branches.filter((item) => item !== 'All').map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    {errors.branch && <span className="text-xs text-destructive">{errors.branch}</span>}
                  </label>
                )}
                <label className="space-y-1.5 text-xs font-medium">
                  Account / cash source
                  <select aria-label="Finance account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setErrors((current) => ({ ...current, accountId: undefined })) }} className={inputClass}>
                    <option value="">Select account</option>
                    <option value="cash:main">Cash</option>
                    {activePaymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.bankName} · {account.accountNumber}</option>)}
                  </select>
                  {errors.accountId && <span className="text-xs text-destructive">{errors.accountId}</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium">
                  Payment method
                  <select value={method} onChange={(event) => changeMethod(event.target.value as FinancePaymentMethod)} className={inputClass}>
                    {methods.map((value) => <option key={value} value={value}>{methodLabel[value]}</option>)}
                  </select>
                  {errors.method && <span className="text-xs text-destructive">{errors.method}</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
                  Transaction
                  <input aria-label="Transaction" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder={selectedDefinition?.placeholder} />
                  {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
                </label>
                <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
                  Amount (IDR)
                  <input aria-label="Amount IDR" inputMode="numeric" value={formatAmount(amountDigits)} onChange={(event) => setAmountDigits(event.target.value.replace(/\D/g, ''))} className={inputClass} />
                  {errors.amount && <span className="text-xs text-destructive">{errors.amount}</span>}
                </label>
                {direction === 'expense' && !editingTransactionId && (
                  <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
                    Transfer fee · Optional (IDR)
                    <input aria-label="Transfer fee IDR" inputMode="numeric" value={formatAmount(transferFeeDigits)} onChange={(event) => setTransferFeeDigits(event.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="0" />
                    <span className="block text-[11px] font-normal text-muted-foreground">Recorded as a separate Bank / Transfer Fee expense from the same account.</span>
                  </label>
                )}
                <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
                  Transaction Code · Optional
                  <input
                    aria-label="Transaction Code"
                    value={transactionCode}
                    onChange={(event) => setTransactionCode(event.target.value.toUpperCase())}
                    maxLength={64}
                    autoComplete="off"
                    placeholder="Kosong = -"
                    className={inputClass}
                  />
                  <span className="block text-[11px] font-normal text-muted-foreground">Jika kosong, Transaction Code otomatis disimpan sebagai “-”.</span>
                </label>
              </div>

              <div className="rounded-xl border border-border/70 bg-surface-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Bukti transaksi</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">JPG, PNG, WEBP, atau PDF · maksimal 5 MB.</p>
                  </div>
                  {(proofFile || existingProofPath) && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                      <FileCheck2 className="size-3.5" /> Ada bukti
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground">
                    <Upload className="size-3.5" /> {proofFile || existingProofPath ? 'Ganti bukti' : 'Upload bukti'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        setProofFile(file)
                        setErrors((current) => ({ ...current, proof: undefined }))
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  {(proofFile || existingProofPath) && (
                    <button
                      type="button"
                      onClick={() => {
                        setProofFile(null)
                        setExistingProofPath(undefined)
                        setExistingProofFileName(undefined)
                      }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-3.5" /> Hapus
                    </button>
                  )}
                </div>
                {(proofFile || existingProofFileName) && (
                  <p className="mt-2 truncate text-xs font-medium text-foreground/80">{proofFile?.name ?? existingProofFileName}</p>
                )}
                {errors.proof && <p className="mt-2 text-xs text-destructive">{errors.proof}</p>}
              </div>

              {editingTransactionId && (
                <label className="block space-y-1.5 text-xs font-medium">
                  Edit reason · Optional
                  <textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="Why is this transaction being changed?" />
                </label>
              )}

              {selectedDefinition?.linkedWorkflow && (
                <>
                  <p className="rounded-xl bg-warning/10 px-4 py-3 text-xs text-warning">
                    {duplicateCandidates.length
                      ? `${duplicateCandidates.length} matching automatic transaction${duplicateCandidates.length === 1 ? '' : 's'} already exist for this date, amount, and scope. Check before saving.`
                      : 'This category is normally created automatically. Check that it has not already been recorded.'}
                  </p>
                  <label className="block space-y-1.5 text-xs font-medium">
                    Manual entry note · Required
                    <textarea value={manualEntryReason} onChange={(event) => setManualEntryReason(event.target.value)} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="Explain why this automatic category is being entered manually." />
                    {errors.manualEntryReason && <span className="text-xs text-destructive">{errors.manualEntryReason}</span>}
                  </label>
                </>
              )}

              <label className="block space-y-1.5 text-xs font-medium">
                Note · Optional
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" />
              </label>
            </>
          )}

          {formError && <p role="alert" className="text-xs text-destructive">{formError}</p>}
          <ActionFooter className="sticky bottom-0 bg-card/95">
            <button type="button" disabled={saving} onClick={() => setOpen(false)} className="h-11 rounded-full px-[18px] disabled:opacity-40">Cancel</button>
            {direction && (
              <button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] font-semibold text-primary-foreground disabled:opacity-50">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? 'Menyimpan…' : editingTransactionId ? 'Save changes' : 'Save transaction'}
              </button>
            )}
          </ActionFooter>
        </form>
      </AppDialog>
    </section>
  )
}
