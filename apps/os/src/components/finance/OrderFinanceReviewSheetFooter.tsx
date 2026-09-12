import { useEffect, useState, type FC } from 'react'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'

type OrderFinanceReviewSheetFooterProps = Pick<
  OrderFinanceReviewSheetViewModel,
  | 'canVerify'
  | 'isPending'
  | 'actionType'
  | 'actionNote'
  | 'decisionBusy'
  | 'onActionNoteChange'
  | 'onCloseAction'
  | 'onStartAction'
> & {
  onConfirmAction: () => void
  onVerifyOrder: () => void
  hasPaymentMismatch?: boolean
  hasMissingProof?: boolean
  paymentFullyPaid?: boolean
}

export const OrderFinanceReviewSheetFooter: FC<OrderFinanceReviewSheetFooterProps> = ({
  canVerify,
  isPending,
  actionType,
  actionNote,
  decisionBusy,
  onActionNoteChange,
  onCloseAction,
  onStartAction,
  onConfirmAction,
  onVerifyOrder,
  hasPaymentMismatch = false,
  hasMissingProof = false,
  paymentFullyPaid = true,
}) => {
  const [mismatchReviewed, setMismatchReviewed] = useState(false)
  useEffect(() => setMismatchReviewed(false), [hasPaymentMismatch, hasMissingProof, paymentFullyPaid])

  if (!canVerify || !isPending) return null

  return (
    <section className="safe-area-bottom z-20 isolate -mx-5 -mb-4 shrink-0 border-t border-border/70 bg-surface-footer px-5 pb-3 pt-3 shadow-[0_-8px_18px_-18px_rgba(0,0,0,0.45)] sm:-mx-6 sm:-mb-5 sm:rounded-b-2xl sm:px-6 sm:pb-3.5 sm:pt-3.5">
      {actionType ? (
        <div className="space-y-3">
          <textarea
            value={actionNote}
            onChange={(event) => onActionNoteChange(event.target.value)}
            placeholder="Jelaskan apa yang perlu dikoreksi"
            autoFocus
            disabled={decisionBusy}
            className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 sm:text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCloseAction} disabled={decisionBusy} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium disabled:opacity-40">
              Kembali
            </button>
            <button type="button" onClick={onConfirmAction} disabled={decisionBusy || actionNote.trim().length < 5} className="inline-flex h-11 items-center gap-2 rounded-full bg-warning px-[18px] text-sm font-semibold text-warning-foreground disabled:opacity-40">
              {decisionBusy && <Loader2 className="size-4 animate-spin" />}
              Send correction request
            </button>
          </div>
        </div>
      ) : (
        <>
          {!paymentFullyPaid && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Pembayaran penuh harus tercatat sebelum pesanan dapat direkonsiliasi.</span>
            </div>
          )}
          {hasMissingProof && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Bukti transfer diperlukan sebelum pembayaran dapat direkonsiliasi.</span>
            </div>
          )}
          {hasPaymentMismatch && paymentFullyPaid && !hasMissingProof && (
            <label className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <input type="checkbox" checked={mismatchReviewed} onChange={(event) => setMismatchReviewed(event.target.checked)} disabled={decisionBusy} className="mt-0.5" />
              <span>Saya sudah memeriksa selisih pembayaran dan tetap ingin merekonsiliasi pesanan ini.</span>
            </label>
          )}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => onStartAction('correction')} disabled={decisionBusy} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-warning/30 bg-warning/5 px-[18px] text-sm font-semibold text-warning disabled:opacity-40">
              <AlertTriangle className="size-4" /> Needs correction
            </button>
            <button
              type="button"
              onClick={onVerifyOrder}
              disabled={decisionBusy || !paymentFullyPaid || hasMissingProof || (hasPaymentMismatch && !mismatchReviewed)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-success px-[18px] text-sm font-semibold text-white disabled:opacity-40"
            >
              {decisionBusy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Rekonsiliasi Pesanan
            </button>
          </div>
        </>
      )}
    </section>
  )
}