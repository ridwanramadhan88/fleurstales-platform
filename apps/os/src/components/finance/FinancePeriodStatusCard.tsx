/**
 * @file FinancePeriodStatusCard.tsx
 * @description Status of the selected accounting month and the one next step:
 * start review, return to open, close (after the month ends and every
 * blocker is cleared), or reopen with an audit reason.
 */

import { useState, type FC } from 'react'
import { CheckCircle2, LockKeyhole, RotateCcw, ShieldAlert } from 'lucide-react'
import type { FinancePeriodStatus, FinancePeriodSummary } from '../../data/financePeriods'
import { formatMonthKey, jakartaMonthKey } from '../../domain/financeDates'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { AppDialog } from '../ui/app-dialog'
import { StatusChip } from '../ui/chip'

interface FinancePeriodStatusCardProps {
  period: FinancePeriodSummary | null
  loading: boolean
  canClose: boolean
  canReopen: boolean
  busy: boolean
  onChangeStatus: (status: FinancePeriodStatus, reason?: string) => Promise<void>
}

export const FinancePeriodStatusCard: FC<FinancePeriodStatusCardProps> = ({ period, loading, canClose, canReopen, busy, onChangeStatus }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const [pending, setPending] = useState<'closed' | 'open' | null>(null)
  const [reason, setReason] = useState('')

  if (loading && !period) return <p className="text-sm text-muted-foreground">{tr('Loading period…', 'Memuat periode…')}</p>
  if (!period) return null

  const monthKey = period.periodMonth.slice(0, 7)
  const isCurrent = monthKey === jakartaMonthKey()
  const statusLabel: Record<FinancePeriodStatus, string> = {
    open: tr('Open', 'Terbuka'),
    review: tr('Review', 'Review'),
    closed: tr('Closed', 'Ditutup'),
  }
  const blockers = ([
    [tr('Reconciliation', 'Rekonsiliasi'), period.blockers.reconciliation],
    [tr('Refunds', 'Pengembalian dana'), period.blockers.refunds],
    [tr('Payroll', 'Penggajian'), period.blockers.payroll],
    [tr('Accounts', 'Rekening'), period.blockers.legacyAccounts],
    [tr('Pending entries', 'Transaksi menunggu'), period.blockers.pendingTransactions],
  ] as const).filter(([, count]) => count > 0)

  const confirm = async () => {
    if (!pending || reason.trim().length < 3) return
    const target = pending
    setPending(null)
    await onChangeStatus(target, reason.trim())
    setReason('')
  }

  return (
    <section aria-label={tr('Accounting period', 'Periode rekeningtansi')} className="rounded-xl bg-card p-4 ring-1 ring-border/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{tr('Period', 'Periode')} {formatMonthKey(monthKey, language)}</h2>
            <StatusChip tone={period.status === 'closed' ? 'success' : period.status === 'review' ? 'warning' : 'neutral'}>{statusLabel[period.status]}</StatusChip>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {period.status === 'closed'
              ? tr(`Closed${period.closedBy ? ` by ${period.closedBy}` : ''}. The ledger for this month is locked.`, `Ditutup${period.closedBy ? ` oleh ${period.closedBy}` : ''}. Buku kas bulan ini terkunci.`)
              : blockers.length === 0
                ? tr('Nothing blocks closing.', 'Tidak ada yang menghalangi tutup buku.')
                : tr('Clear these before closing:', 'Selesaikan dulu sebelum tutup buku:')}
          </p>
          {period.status !== 'closed' && blockers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {blockers.map(([label, count]) => (
                <span key={label} className="rounded-md bg-warning/10 px-2 py-1 text-2xs font-medium text-warning">{label} {count}</span>
              ))}
            </div>
          )}
          {period.status === 'review' && isCurrent && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" /> {tr('The current month can be closed after it ends.', 'Bulan berjalan bisa ditutup setelah bulannya selesai.')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {period.status === 'open' && canClose && (
            <button type="button" disabled={busy} onClick={() => void onChangeStatus('review')} className="h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50">
              {tr('Start review', 'Mulai review')}
            </button>
          )}
          {period.status === 'review' && canClose && (
            <>
              <button type="button" disabled={busy} onClick={() => void onChangeStatus('open')} className="h-10 rounded-full px-3 text-sm font-semibold text-muted-foreground disabled:opacity-50">
                {tr('Back to open', 'Buka lagi')}
              </button>
              {!isCurrent && (
                <button type="button" disabled={busy || period.blockerTotal > 0} onClick={() => { setReason(''); setPending('closed') }} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">
                  <LockKeyhole className="size-4" aria-hidden="true" /> {tr('Close month', 'Tutup buku')}
                </button>
              )}
            </>
          )}
          {period.status === 'closed' && canReopen && (
            <button type="button" disabled={busy} onClick={() => { setReason(''); setPending('open') }} className="inline-flex h-10 items-center gap-2 rounded-full border border-warning/40 px-4 text-sm font-semibold text-warning disabled:opacity-50">
              <RotateCcw className="size-4" aria-hidden="true" /> {tr('Reopen', 'Buka ulang')}
            </button>
          )}
          {period.status === 'closed' && <CheckCircle2 className="size-5 text-success" aria-hidden="true" />}
        </div>
      </div>

      <AppDialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open && !busy) { setPending(null); setReason('') } }}
        size="standard"
        title={pending === 'closed' ? tr('Close this month?', 'Tutup buku bulan ini?') : tr('Reopen this month?', 'Buka ulang bulan ini?')}
        description={pending === 'open'
          ? tr('The month becomes editable again; balances and reports can change. The reason is kept in the audit history.', 'Bulan ini bisa diubah lagi; saldo dan laporan bisa berubah. Alasannya tersimpan di riwayat audit.')
          : tr('The ledger for this month is locked until an authorized reopen.', 'Buku kas bulan ini terkunci sampai dibuka ulang oleh yang berwenang.')}
      >
        <div className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            {tr('Reason', 'Alasan')}
            <textarea aria-label="Accounting period reason" value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-foreground/40" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setPending(null); setReason('') }} className="h-10 rounded-full px-4 text-sm font-semibold">{tr('Cancel', 'Batal')}</button>
            <button type="button" disabled={reason.trim().length < 3 || busy} onClick={() => void confirm()} className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">
              {pending === 'closed' ? tr('Close month', 'Tutup buku') : tr('Reopen', 'Buka ulang')}
            </button>
          </div>
        </div>
      </AppDialog>
    </section>
  )
}
