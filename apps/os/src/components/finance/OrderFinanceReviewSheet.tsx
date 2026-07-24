/**
 * @file OrderFinanceReviewSheet.tsx
 * @description Read-only order detail view opened from Finance's
 * verification queues (OrderTransactionVerificationQueue) when a queue row
 * is clicked. Visually mirrors OrderDetailsPanel (the same critical
 * summary, status stepper, product/fulfillment info, notes, and activity
 * timeline) but every field is display-only — no edit controls, no way to
 * change status/payment/notes/etc. The only mutations available are the
 * Verify / Needs correction actions in the footer, which call the
 * exact same store mutators as the queue row's own buttons, so Finance can
 * inspect the full order and decide without closing the sheet first.
 *
 * Composed from five focused sub-sections (each independently readable and
 * testable), previously all inline in this one file:
 * - `OrderFinanceReviewSheetHeader`   — critical summary + verification banner.
 * - `OrderFinanceReviewSheetStepper`  — horizontal fulfillment-pipeline stepper.
 * - `OrderFinanceReviewSheetDetails`  — status/payment, product, source/schedule, notes.
 * - `OrderFinanceReviewSheetTimeline` — vertical activity timeline.
 * - `OrderFinanceReviewSheetFooter`   — Close / Needs correction / Verify.
 */

import type { FC } from "react";
import type { OrderTableRow } from "../../types/orders";
import type { UserRole } from "../../store/userStore";
import type { OrderFinanceReviewSheetViewModel } from "./OrderFinanceReviewSheetController";
import { OrderFinanceReviewSheetHeader } from "./OrderFinanceReviewSheetHeader";
import { OrderFinanceReviewSheetStepper } from "./OrderFinanceReviewSheetStepper";
import { OrderFinanceReviewSheetDetails } from "./OrderFinanceReviewSheetDetails";
import { OrderFinanceReviewSheetTimeline } from "./OrderFinanceReviewSheetTimeline";
import { OrderFinanceReviewSheetFooter } from "./OrderFinanceReviewSheetFooter";

/**
 * @description Read-only detail sheet for a single order, shown when a
 * Finance verification queue row is clicked. Every field is display-only —
 * the only mutations available are the Verify / Needs correction
 * actions surfaced in the footer, identical in effect to the queue row's
 * own buttons, so Finance can decide right after reviewing the full order
 * without closing the sheet first.
 */
export interface OrderFinanceReviewSheetProps {
  order: OrderTableRow;
  onClose: () => void;
  /** Whether the current user can verify/reject/mark-for-review directly (Finance/Owner). */
  canVerify: boolean;
  /** Display name of the current user, used as the verifying actor. */
  actorName: string;
  /** Role of the current user — passed through to the authoritative
   * `canVerifyOrderFinance` gate. */
  userRole: UserRole;
}

export const OrderFinanceReviewSheet: FC<OrderFinanceReviewSheetViewModel> = ({
  order,
  onClose,
  canVerify,
  productName,
  actionType,
  actionNote,
  isOrderFuture,
  urgency,
  StatusIcon,
  wasRejected,
  isMarkedForReview,
  isPending,
  isTerminalIssue,
  horizontalOptions,
  horizontalCurrentIndex,
  timelineRows,
  lastIndex,
  onActionNoteChange,
  onCloseAction,
  onStartAction,
  onConfirmAction,
  onVerifyOrder,
}) => {
  const paidAmount =
    order.paidAmountIdr ??
    (order.paymentStatus === "paid" ? order.totalIdr : 0);
  const hasPaymentMismatch =
    (order.paymentStatus === "paid" && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === "partial" &&
      (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === "unpaid" && paidAmount > 0);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/32 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.orderNumber} details (read-only)`}
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-card p-4 shadow-lg ring-1 ring-border/60 sm:max-h-[90vh] sm:rounded-xl sm:p-5"
      >
        <OrderFinanceReviewSheetHeader
          order={order}
          onClose={onClose}
          productName={productName}
          urgency={urgency}
          wasRejected={wasRejected}
          isMarkedForReview={isMarkedForReview}
        />

        <OrderFinanceReviewSheetStepper
          isTerminalIssue={isTerminalIssue}
          horizontalOptions={horizontalOptions}
          horizontalCurrentIndex={horizontalCurrentIndex}
        />

        <div className="mt-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 pt-0.5 text-sm text-foreground/90">
          <div className="space-y-6 sm:grid sm:grid-cols-5 sm:items-start sm:gap-6 sm:space-y-0">
            <OrderFinanceReviewSheetDetails
              order={order}
              productName={productName}
              StatusIcon={StatusIcon}
            />
            <details className="sm:col-span-2 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
              <summary className="cursor-pointer text-sm font-semibold h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap">Status timeline and activity</summary>
              <div className="mt-3"><OrderFinanceReviewSheetTimeline
                order={order}
                isOrderFuture={isOrderFuture}
                timelineRows={timelineRows}
                lastIndex={lastIndex}
              /></div>
            </details>
          </div>
        </div>

        <OrderFinanceReviewSheetFooter
          canVerify={canVerify}
          isPending={isPending}
          actionType={actionType}
          actionNote={actionNote}
          onActionNoteChange={onActionNoteChange}
          onCloseAction={onCloseAction}
          onStartAction={onStartAction}
          onConfirmAction={onConfirmAction}
          onVerifyOrder={onVerifyOrder}
          hasPaymentMismatch={hasPaymentMismatch}
        />
      </div>
    </div>
  );
};

export default OrderFinanceReviewSheet;
