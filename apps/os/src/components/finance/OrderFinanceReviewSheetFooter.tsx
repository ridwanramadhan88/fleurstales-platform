import { useEffect, useState, type FC } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import type { OrderFinanceReviewSheetViewModel } from "./OrderFinanceReviewSheetController";

type OrderFinanceReviewSheetFooterProps = Pick<
  OrderFinanceReviewSheetViewModel,
  | "canVerify"
  | "isPending"
  | "actionType"
  | "actionNote"
  | "decisionBusy"
  | "onActionNoteChange"
  | "onCloseAction"
  | "onStartAction"
  | "onConfirmAction"
  | "onVerifyOrder"
> & {
  hasPaymentMismatch?: boolean;
  hasMissingProof?: boolean;
  paymentFullyPaid?: boolean;
};

export const OrderFinanceReviewSheetFooter: FC<
  OrderFinanceReviewSheetFooterProps
> = ({
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
  const [mismatchReviewed, setMismatchReviewed] = useState(false);
  useEffect(() => setMismatchReviewed(false), [hasPaymentMismatch, hasMissingProof, paymentFullyPaid]);

  if (!canVerify || !isPending) return null;

  return (
    <section className="z-20 -mx-4 -mb-4 shrink-0 border-t border-border bg-surface-footer px-4 py-3 shadow-[0_-1px_0_rgba(0,0,0,0.02)] sm:-mx-5 sm:-mb-5 sm:rounded-b-3xl sm:px-5">
      {actionType ? (
        <div className="space-y-3">
          <textarea value={actionNote} onChange={(event) => onActionNoteChange(event.target.value)} placeholder="Explain what needs to be corrected" autoFocus disabled={decisionBusy} className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60" />
          <div className="flex justify-end gap-2"><button type="button" onClick={onCloseAction} disabled={decisionBusy} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium disabled:opacity-40">Back</button><button type="button" onClick={onConfirmAction} disabled={decisionBusy || actionNote.trim().length < 5} className="inline-flex h-11 items-center gap-2 rounded-full bg-warning px-[18px] text-sm font-semibold text-warning-foreground disabled:opacity-40">{decisionBusy && <Loader2 className="size-4 animate-spin" />}Send correction request</button></div>
        </div>
      ) : (
        <>
          {!paymentFullyPaid && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Full payment must be recorded before this order can be reconciled.</span>
            </div>
          )}
          {hasMissingProof && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Bukti transfer is required before this transfer can be reconciled.</span>
            </div>
          )}
          {hasPaymentMismatch && paymentFullyPaid && !hasMissingProof && (
            <label className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              <input type="checkbox" checked={mismatchReviewed} onChange={(event) => setMismatchReviewed(event.target.checked)} disabled={decisionBusy} className="mt-0.5"/>
              <span>I reviewed the payment mismatch and still want to reconcile this order.</span>
            </label>
          )}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => onStartAction("correction")} disabled={decisionBusy} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-warning/30 bg-warning/5 px-[18px] text-sm font-semibold text-warning disabled:opacity-40"><AlertTriangle className="size-4"/>Needs correction</button>
            <button
              type="button"
              onClick={onVerifyOrder}
              disabled={decisionBusy || !paymentFullyPaid || hasMissingProof || (hasPaymentMismatch && !mismatchReviewed)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-success px-[18px] text-sm font-semibold text-white disabled:opacity-40"
            >
              {decisionBusy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4"/>}
              Reconcile order
            </button>
          </div>
        </>
      )}
    </section>
  );
};
