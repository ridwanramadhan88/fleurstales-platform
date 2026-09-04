/**
 * @file OrderFinanceReviewSheet.tsx
 * @description Read-only Finance review surface with a narrow reconciliation-code editor.
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

export interface OrderFinanceReviewSheetProps {
  order: OrderTableRow;
  onClose: () => void;
  canVerify: boolean;
  actorName: string;
  userRole: UserRole;
}

export const OrderFinanceReviewSheet: FC<OrderFinanceReviewSheetViewModel> = ({
  order,
  onClose,
  canVerify,
  productDisplay,
  itemDisplays,
  actionType,
  actionNote,
  financeReferenceDraft,
  financeReferenceBusy,
  financeReferenceDirty,
  isOrderFuture,
  urgency,
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
  onFinanceReferenceChange,
  onSaveFinanceReference,
}) => {
  const paidAmount = order.paidAmountIdr ?? (order.paymentStatus === "paid" ? order.totalIdr : 0);
  const hasPaymentMismatch =
    (order.paymentStatus === "paid" && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === "partial" && (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === "unpaid" && paidAmount > 0);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/32 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.orderNumber} details (read-only)`}
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card p-4 shadow-ios-lg sm:max-h-[92vh] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:rounded-2xl sm:p-5 md:max-w-6xl md:p-6"
      >
        <OrderFinanceReviewSheetHeader
          order={order}
          onClose={onClose}
          urgency={urgency}
          wasRejected={wasRejected}
          isMarkedForReview={isMarkedForReview}
        />

        <OrderFinanceReviewSheetStepper
          isTerminalIssue={isTerminalIssue}
          horizontalOptions={horizontalOptions}
          horizontalCurrentIndex={horizontalCurrentIndex}
        />

        <div className="mt-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-4 pt-1 text-sm text-foreground/90">
          <div className="space-y-6 sm:grid sm:grid-cols-5 sm:items-start sm:gap-6 sm:space-y-0">
            <OrderFinanceReviewSheetDetails
              order={order}
              productDisplay={productDisplay}
              itemDisplays={itemDisplays}
              canVerify={canVerify}
              financeReferenceDraft={financeReferenceDraft}
              financeReferenceBusy={financeReferenceBusy}
              financeReferenceDirty={financeReferenceDirty}
              onFinanceReferenceChange={onFinanceReferenceChange}
              onSaveFinanceReference={onSaveFinanceReference}
            />
            <details className="sm:col-span-2 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
              <summary className="cursor-pointer text-sm font-semibold h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap">Status timeline and activity</summary>
              <div className="mt-3">
                <OrderFinanceReviewSheetTimeline
                  order={order}
                  isOrderFuture={isOrderFuture}
                  timelineRows={timelineRows}
                  lastIndex={lastIndex}
                />
              </div>
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
