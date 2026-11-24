/**
 * @file FinanceTransactionDetailSheet.tsx
 * @description One ledger row: what it is, the money, its actions (proof,
 * order, payroll, edit, void), the details Finance reads, the correction
 * history, and — folded away — the technical ids used for audits.
 */

import type { FC, ReactNode } from 'react'
import { Ban, ExternalLink, FileCheck2, Pencil, ShieldCheck } from 'lucide-react'
import type { FinancePaymentMethod, FinanceTransaction } from '../../store/financeStoreTypes'
import { openFinanceTransactionProof } from '../../data/financeTransactionProof'
import { toast } from '../../hooks/use-toast'
import { AppSheet } from '../ui/app-sheet'
import { StatusChip } from '../ui/chip'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { formatIdrCurrency } from '../../lib/formatters'

interface FinanceTransactionDetailSheetProps {
  transaction: FinanceTransaction | null
  accountLabel: string
  categoryLabel: string
  editable: boolean
  onClose: () => void
  onEdit?: () => void
  onVoid?: () => void
  onOpenOrder?: () => void
  onOpenPayroll?: () => void
}

type Tr = (en: string, id: string) => string

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

const sourceLabel = (transaction: FinanceTransaction, tr: Tr): string => {
  if (transaction.source === 'order_payment') return tr('Order payment', 'Pembayaran pesanan')
  if (transaction.source === 'order_refund') return tr('Order refund', 'Pengembalian dana pesanan')
  if (transaction.source === 'payroll') return tr('Payroll', 'Penggajian')
  if (transaction.source === 'delivery_courier') return tr('Courier cost', 'Biaya kurir')
  if (transaction.source === 'opening_balance') return tr('Opening balance', 'Saldo awal')
  if (transaction.source === 'adjustment') return tr('Adjustment', 'Penyesuaian')
  if (transaction.source === 'transfer') return tr('Account transfer', 'Transfer antar rekening')
  return tr('Manual transaction', 'Transaksi manual')
}

const methodLabel = (method: FinancePaymentMethod | string, tr: Tr): string => {
  if (method === 'cash') return tr('Cash', 'Tunai')
  if (method === 'transfer') return tr('Bank transfer', 'Transfer bank')
  if (method === 'card') return tr('Card', 'Kartu')
  if (method === 'qris') return 'QRIS'
  return tr('Other', 'Lainnya')
}

const DetailField: FC<{ label: string; children: ReactNode; mono?: boolean }> = ({ label, children, mono = false }) => (
  <div className="min-w-0 rounded-xl bg-surface-panel px-3.5 py-3 ring-1 ring-border/50">
    <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
    <dd className={`mt-1 break-words text-sm font-medium text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
  </div>
)

const Note: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <p className="rounded-xl bg-muted/55 px-3.5 py-3 text-xs"><span className="font-semibold">{label}:</span> {children}</p>
)

export const FinanceTransactionDetailSheet: FC<FinanceTransactionDetailSheetProps> = ({
  transaction,
  accountLabel,
  categoryLabel,
  editable,
  onClose,
  onEdit,
  onVoid,
  onOpenOrder,
  onOpenPayroll,
}) => {
  const tr = useBilingualCopy()
  if (!transaction) return null

  const voided = transaction.status === 'void'
  const scope = transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')
  const entryMode = transaction.entryMode ?? (transaction.isSystemGenerated ? 'automatic' : 'manual')
  const edits = transaction.editHistory ?? []
  const hasTechnical = Boolean(
    transaction.payrollProposalId || transaction.payrollPeriodId || transaction.transferId
    || transaction.sourceEventId || transaction.reversalOfTransactionId || transaction.groupLabel,
  )

  const openProof = async () => {
    try {
      await openFinanceTransactionProof(transaction)
    } catch (error) {
      toast({
        title: tr('The proof could not be opened', 'Bukti transaksi tidak dapat dibuka'),
        description: error instanceof Error ? error.message : tr('Please try again.', 'Silakan coba lagi.'),
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
      title={tr('Transaction details', 'Detail transaksi')}
      contentClassName="gap-0"
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">
        <section className="rounded-xl bg-card p-4 ring-1 ring-border/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={transaction.type === 'income' ? 'success' : 'danger'}>
                  {transaction.type === 'income' ? tr('Money in', 'Uang masuk') : tr('Money out', 'Uang keluar')}
                </StatusChip>
                <StatusChip tone="neutral">{sourceLabel(transaction, tr)}</StatusChip>
                {voided && <StatusChip tone="danger">Void</StatusChip>}
                {!voided && transaction.status !== 'verified' && <StatusChip tone="warning">{tr('Pending', 'Menunggu')}</StatusChip>}
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">{transaction.name ?? transaction.description}</h3>
              {transaction.name && transaction.description && transaction.description !== transaction.name && (
                <p className="mt-1 text-xs text-muted-foreground">{transaction.description}</p>
              )}
            </div>
            <p className={`shrink-0 text-xl font-semibold tabular-nums ${voided ? 'text-muted-foreground line-through' : transaction.type === 'income' ? 'text-success' : 'text-destructive'}`}>
              {transaction.type === 'income' ? '+' : '−'}{formatIdrCurrency(transaction.amount)}
            </p>
          </div>

          {voided ? (
            <div className="mt-4 flex gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              <Ban className="mt-0.5 size-4 shrink-0" />
              <p>
                {tr('Voided by', 'Di-void oleh')} {transaction.voidedBy ?? '—'} · {formatTimestamp(transaction.voidedAt)}
                <br />{tr('Reason', 'Alasan')}: {transaction.voidReason ?? '—'}
                <br />{tr('Kept for the audit trail; not counted in balances or reports.', 'Tetap tercatat untuk jejak audit; tidak dihitung di saldo maupun laporan.')}
              </p>
            </div>
          ) : !editable && (
            <div className="mt-4 flex gap-2 rounded-xl bg-muted/55 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>{tr('Only Finance can correct or void posted transactions.', 'Hanya Keuangan yang bisa mengoreksi atau membatalkan transaksi.')}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {transaction.proofPath && (
              <button type="button" onClick={() => { void openProof() }} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold">
                <FileCheck2 className="size-4" /> {tr('View evidence', 'Lihat bukti')}
              </button>
            )}
            {onOpenOrder && transaction.orderNumber && (
              <button type="button" onClick={onOpenOrder} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold">
                <ExternalLink className="size-4" /> {tr('Open order', 'Buka pesanan')}
              </button>
            )}
            {onOpenPayroll && transaction.payrollProposalId && (
              <button type="button" onClick={onOpenPayroll} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold">
                <ExternalLink className="size-4" /> {tr('Open payroll', 'Buka penggajian')}
              </button>
            )}
            {editable && onEdit && (
              <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">
                <Pencil className="size-4" /> {tr('Edit transaction', 'Ubah transaksi')}
              </button>
            )}
            {onVoid && (
              <button type="button" onClick={onVoid} className="inline-flex h-10 items-center gap-2 rounded-full border border-destructive/40 px-4 text-xs font-semibold text-destructive">
                <Ban className="size-4" /> Void
              </button>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Details', 'Rincian')}</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            <DetailField label={tr('Transaction date', 'Tanggal transaksi')}>{formatTimestamp(transaction.transactionDate ?? transaction.createdAt)}</DetailField>
            <DetailField label={tr('Account', 'Rekening')}>{accountLabel}</DetailField>
            <DetailField label={tr('Category', 'Kategori')}>{categoryLabel}</DetailField>
            <DetailField label={tr('Method', 'Metode')}>{methodLabel(transaction.method, tr)}</DetailField>
            <DetailField label={tr('Applies to', 'Berlaku untuk')}>{scope === 'company' ? tr('Company-wide', 'Seluruh perusahaan') : transaction.branch}</DetailField>
            {transaction.orderNumber && <DetailField label={tr('Order', 'Pesanan')}>{transaction.orderNumber}</DetailField>}
            <DetailField label={tr('Transaction code', 'Kode transaksi')} mono>{transaction.transactionCode?.trim() || '—'}</DetailField>
            {transaction.reference && <DetailField label={tr('Payment reference', 'Referensi pembayaran')}>{transaction.reference}</DetailField>}
            <DetailField label={tr('Recorded by', 'Dicatat oleh')}>{transaction.actor || '—'}</DetailField>
          </dl>
          {transaction.dataWarning && <p className="rounded-xl bg-warning/10 px-3.5 py-3 text-xs font-medium text-warning">{transaction.dataWarning}</p>}
          {transaction.manualEntryReason && <Note label={tr('Why manual', 'Alasan dicatat manual')}>{transaction.manualEntryReason}</Note>}
          {transaction.adjustmentReason && <Note label={tr('Adjustment reason', 'Alasan penyesuaian')}>{transaction.adjustmentReason}</Note>}
          {transaction.note && <Note label={tr('Note', 'Catatan')}>{transaction.note}</Note>}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Correction history', 'Riwayat koreksi')}</h4>
            {edits.length > 0 && <span className="text-xs text-muted-foreground">{tr(`${edits.length} change(s)`, `${edits.length} perubahan`)}</span>}
          </div>
          {edits.length ? (
            <div className="space-y-2">
              {[...edits].reverse().map((edit) => (
                <article key={`${edit.revision}-${edit.editedAt}`} className="rounded-xl bg-surface-panel p-3 ring-1 ring-border/50">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <p className="font-semibold">{edit.kind === 'void' ? 'Void' : tr(`Revision ${edit.revision}`, `Revisi ${edit.revision}`)} · {edit.editedBy}</p>
                    <p className="text-muted-foreground">{formatTimestamp(edit.editedAt)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{edit.reason?.trim() || tr('No reason recorded.', 'Tidak ada alasan tercatat.')}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {tr('Before', 'Sebelumnya')}: {formatIdrCurrency(edit.previous.amount)} · {methodLabel(edit.previous.method, tr)}
                    {edit.previous.transactionCode ? ` · ${edit.previous.transactionCode}` : ''}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{tr('Never corrected.', 'Belum pernah dikoreksi.')}</p>
          )}
        </section>

        {/* Ids and timestamps auditors need, folded away from daily reading. */}
        <details className="group rounded-xl ring-1 ring-border/60">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-xs font-semibold text-muted-foreground">
            {tr('Technical details', 'Detail teknis')}
          </summary>
          <dl className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
            <DetailField label={tr('Entry mode', 'Cara dicatat')}>{entryMode === 'automatic' ? tr('Automatic', 'Otomatis') : 'Manual'}</DetailField>
            <DetailField label={tr('Created', 'Dibuat')}>{formatTimestamp(transaction.createdAt)}</DetailField>
            <DetailField label={tr('Last updated', 'Terakhir diubah')}>{formatTimestamp(transaction.updatedAt)}</DetailField>
            {hasTechnical && transaction.payrollProposalId && <DetailField label={tr('Payroll proposal', 'Proposal penggajian')} mono>{transaction.payrollProposalId}</DetailField>}
            {transaction.payrollPeriodId && <DetailField label={tr('Payroll period', 'Periode penggajian')} mono>{transaction.payrollPeriodId}</DetailField>}
            {transaction.transferId && <DetailField label={tr('Transfer group', 'Grup transfer')} mono>{transaction.transferId}</DetailField>}
            {transaction.transferDirection && <DetailField label={tr('Transfer side', 'Sisi transfer')}>{transaction.transferDirection === 'out' ? tr('From (out)', 'Asal (keluar)') : tr('To (in)', 'Tujuan (masuk)')}</DetailField>}
            {transaction.groupLabel && <DetailField label={tr('Batch', 'Kelompok')}>{transaction.groupLabel}</DetailField>}
            {transaction.sourceEventId && <DetailField label={tr('Source event', 'Event sumber')} mono>{transaction.sourceEventId}</DetailField>}
            {transaction.reversalOfTransactionId && <DetailField label={tr('Reverses', 'Membalik transaksi')} mono>{transaction.reversalOfTransactionId}</DetailField>}
          </dl>
        </details>
      </div>
    </AppSheet>
  )
}

export default FinanceTransactionDetailSheet
