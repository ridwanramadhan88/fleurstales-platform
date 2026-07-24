import { useEffect, useState, type FC } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { OrderFinanceReviewSheetViewModel } from "./OrderFinanceReviewSheetController";

type OrderFinanceReviewSheetFooterProps = Pick<
  OrderFinanceReviewSheetViewModel,
  | "canVerify"
  | "isPending"
  | "actionType"
  | "actionNote"
  | "onActionNoteChange"
  | "onCloseAction"
  | "onStartAction"
  | "onConfirmAction"
  | "onVerifyOrder"
> & { hasPaymentMismatch?: boolean };

export const OrderFinanceReviewSheetFooter: FC<
  OrderFinanceReviewSheetFooterProps
> = ({
  canVerify,
  isPending,
  actionType,
  actionNote,
  onActionNoteChange,
  onCloseAction,
  onStartAction,
  onConfirmAction,
  onVerifyOrder,
  hasPaymentMismatch = false,
}) => {
  const [mismatchReviewed, setMismatchReviewed] = useState(false);
  useEffect(() => setMismatchReviewed(false), [hasPaymentMismatch]);

  if (!canVerify || !isPending) return null;

  return (
    <section className="z-20 -mx-4 -mb-4 shrink-0 border-t border-border bg-surface-footer px-4 py-3 shadow-[0_-1px_0_rgba(0,0,0,0.02)] sm:-mx-5 sm:-mb-5 sm:rounded-b-3xl sm:px-5">
      {actionType ? (
        <div className="space-y-3">
          <textarea value={actionNote} onChange={(event) => onActionNoteChange(event.target.value)} placeholder="Explain what needs to be corrected" autoFocus className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="flex justify-end gap-2"><button type="button" onClick={onCloseAction} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium">Back</button><button type="button" onClick={onConfirmAction} disabled={actionNote.trim().length < 5} className="h-11 rounded-full bg-warning px-[18px] text-sm font-semibold text-warning-foreground disabled:opacity-40">Send correction request</button></div>
        </div>
      ) : (
        <>
          {hasPaymentMismatch && <label className="mb-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"><input type="checkbox" checked={mismatchReviewed} onChange={(event) => setMismatchReviewed(event.target.checked)} className="mt-0.5"/><span>I reviewed the payment mismatch and still want to verify this order.</span></label>}
          <div className="flex items-center justify-end gap-2"><button type="button" onClick={() => onStartAction("correction")} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-warning/30 bg-warning/5 px-[18px] text-sm font-semibold text-warning"><AlertTriangle className="size-4"/>Needs correction</button><button type="button" onClick={onVerifyOrder} disabled={hasPaymentMismatch && !mismatchReviewed} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-success px-[18px] text-sm font-semibold text-white disabled:opacity-40"><ShieldCheck className="size-4"/>Verify</button></div>
        </>
      )}
    </section>
  );
};
