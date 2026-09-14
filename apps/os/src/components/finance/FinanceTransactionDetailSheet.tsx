import type { FC, ReactNode } from 'react'
import { ExternalLink, FileCheck2, Pencil, ShieldCheck } from 'lucide-react'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import { openFinanceTransactionProof } from '../../data/financeTransactionProof'
import { toast } from '../../hooks/use-toast'
import { AppSheet } from '../ui/app-sheet'
import { StatusChip } from '../ui/chip'

interface FinanceTransactionDetailSheetProps {
  transaction: FinanceTransaction | null
  accountLabel: string
  categoryLabel: string
  editable: boolean
  onClose: () => void
  onEdit?: () => void
  onOpenOrder?: () => void
}

const formatIdr = (value: number): string => `Rp ${Math.round(value).toLocaleString('id-ID')}`

const formatTimestamp = (value?: string): string => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

const sourceLabel = (transaction: FinanceTransaction): string => {
  if (transaction.source === 'order_payment') return 'Order payment'
  if (transaction.source === 'order_refund') return 'Order refund'
  if (transaction.source === 'payroll') return 'Payroll'
  if (transaction.source === 'opening_balance') return 'Opening balance'
  if (transaction.source === 'adjustment') return 'Adjustment'
  if (transaction.source === 'transfer') return 'Account transfer'
  return 'Manual transaction'
}

const DetailField: FC<{ label: string; children: ReactNode; mono?: boolean }> = ({ label, children, mono = false }) => (
  <div className="min-w-0 rounded-xl bg-surface-panel px-3.5 py-3 ring-1 ring-border/50">
    <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
    <dd className={`mt-1 break-words text-sm font-medium text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
  </div>
)

export const FinanceTransactionDetailSheet: FC<FinanceTransactionDetailSheetProps> = ({
  transaction,
  accountLabel,
  categoryLabel,
  editable,
  onClose,
  onEdit,
  onOpenOrder,
}) => {
  if (!transaction) return null

  const scope = transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')
  const entryMode = transaction.entryMode ?? (transaction.isSystemGenerated ? 'automatic' : 'manual')

  const openProof = async () => {
    try {
      await openFinanceTransactionProof(transaction)
    } catch (error) {
      toast({
        title: 'Bukti transaksi tidak dapat dibuka',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <AppSheet
      open
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}
      side="responsiveRight"
      size="compact"
      title="Transaction details"
      description="Ledger detail and audit context for this Finance entry."
      contentClassName="gap-0"
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">
        <section className="rounded-xl bg-card p-4 ring-1 ring-border/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={transaction.type === 'income' ? 'success' : 'danger'}>
                  {transaction.type === 'income' ? 'Money in' : 'Money out'}
                </StatusChip>
                <StatusChip tone="neutral">{sourceLabel(transaction)}</StatusChip>
                <StatusChip tone={editable ? 'info' : 'neutral'}>{editable ? 'Editable manual entry' : 'Read only'}</StatusChip>
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">{transaction.name ?? transaction.description}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{transaction.description}</p>
            </div>
            <p className={`shrink-0 text-xl font-semibold tabular-nums ${transaction.type === 'income' ? 'text-success' : 'text-destructive'}`}>
              {transaction.type === 'income' ? '+' : '−'}{formatIdr(transaction.amount)}
            </p>
          </div>

          {!editable && (
            <div className="mt-4 flex gap-2 rounded-xl bg-muted/55 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>{entryMode === 'automatic' || transaction.isSystemGenerated ? 'This entry is owned by its source workflow. Corrections must happen from that workflow instead of editing the ledger row.' : 'This ledger row is read only in its current state.'}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {transaction.proofPath && (
              <button type="button" onClick={() => { void openProof() }} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold">
                <FileCheck2 className="size-4" /> View evidence
              </button>
            )}
            {onOpenOrder && transaction.orderNumber && (
              <button type="button" onClick={onOpenOrder} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold">
                <ExternalLink className="size-4" /> Open order
              </button>
            )}
            {editable && onEdit && (
              <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">
                <Pencil className="size-4" /> Edit manual entry
              </button>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ledger</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Transaction code" mono>{transaction.transactionCode?.trim() || '—'}</DetailField>
            <DetailField label="Status">{transaction.status === 'verified' ? 'Posted' : transaction.status}</DetailField>
            <DetailField label="Account">{accountLabel}</DetailField>
            <DetailField label="Category">{categoryLabel}</DetailField>
            <DetailField label="Method">{transaction.method}</DetailField>
            <DetailField label="Scope">{scope === 'company' ? 'Company-wide' : transaction.branch}</DetailField>
            <DetailField label="Transaction date">{formatTimestamp(transaction.transactionDate ?? transaction.createdAt)}</DetailField>
            <DetailField label="Recorded by">{transaction.actor || '—'}</DetailField>
            <DetailField label="Created">{formatTimestamp(transaction.createdAt)}</DetailField>
            <DetailField label="Last updated">{formatTimestamp(transaction.updatedAt)}</DetailField>
          </dl>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source & references</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Source">{sourceLabel(transaction)}</DetailField>
            <DetailField label="Entry mode">{entryMode === 'automatic' ? 'Automatic / source-owned' : 'Manual'}</DetailField>
            {transaction.orderNumber && <DetailField label="Order">{transaction.orderNumber}</DetailField>}
            {transaction.payrollProposalId && <DetailField label="Payroll proposal" mono>{transaction.payrollProposalId}</DetailField>}
            {transaction.payrollPeriodId && <DetailField label="Payroll period" mono>{transaction.payrollPeriodId}</DetailField>}
            {transaction.reference && <DetailField label="Payment reference">{transaction.reference}</DetailField>}
            {transaction.transferId && <DetailField label="Transfer group" mono>{transaction.transferId}</DetailField>}
            {transaction.transferDirection && <DetailField label="Transfer direction">{transaction.transferDirection === 'out' ? 'Source / out' : 'Destination / in'}</DetailField>}
            {transaction.groupLabel && <DetailField label="Batch / group">{transaction.groupLabel}</DetailField>}
            {transaction.sourceEventId && <DetailField label="Source event" mono>{transaction.sourceEventId}</DetailField>}
            {transaction.reversalOfTransactionId && <DetailField label="Reversal of" mono>{transaction.reversalOfTransactionId}</DetailField>}
          </dl>
          {transaction.dataWarning && <p className="rounded-xl bg-warning/10 px-3.5 py-3 text-xs font-medium text-warning">{transaction.dataWarning}</p>}
          {transaction.manualEntryReason && <p className="rounded-xl bg-muted/55 px-3.5 py-3 text-xs"><span className="font-semibold">Manual entry reason:</span> {transaction.manualEntryReason}</p>}
          {transaction.adjustmentReason && <p className="rounded-xl bg-muted/55 px-3.5 py-3 text-xs"><span className="font-semibold">Adjustment reason:</span> {transaction.adjustmentReason}</p>}
          {transaction.note && <p className="rounded-xl bg-muted/55 px-3.5 py-3 text-xs"><span className="font-semibold">Note:</span> {transaction.note}</p>}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correction history</h4>
            <span className="text-xs text-muted-foreground">{transaction.editHistory?.length ?? 0} edit(s)</span>
          </div>
          {transaction.editHistory?.length ? (
            <div className="space-y-2">
              {[...transaction.editHistory].reverse().map((edit) => (
                <article key={`${edit.revision}-${edit.editedAt}`} className="rounded-xl bg-surface-panel p-3 ring-1 ring-border/50">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <p className="font-semibold">Revision {edit.revision} · {edit.editedBy}</p>
                    <p className="text-muted-foreground">{formatTimestamp(edit.editedAt)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{edit.reason?.trim() || 'No correction reason recorded.'}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">Previous amount {formatIdr(edit.previous.amount)} · {edit.previous.method} · {edit.previous.transactionCode || 'no code'}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">No ledger edits recorded.</p>
          )}
        </section>
      </div>
    </AppSheet>
  )
}

export default FinanceTransactionDetailSheet
