/**
 * @file OrderFinanceReviewSheet.tsx
 * @description Finance reconciliation surface using the same sheet language as Order Details.
 */

import { useEffect, useState, type FC } from "react";
import type { OrderTableRow } from "../../types/orders";
import type { UserRole } from "../../store/userStore";
import type { OrderFinanceReviewSheetViewModel } from "./OrderFinanceReviewSheetController";
import { OrderFinanceReviewSheetHeader } from "./OrderFinanceReviewSheetHeader";
import { OrderFinanceReviewSheetStepper } from "./OrderFinanceReviewSheetStepper";
import { OrderFinanceReviewSheetDetails } from "./OrderFinanceReviewSheetDetails";
import { OrderFinanceReviewSheetTimeline } from "./OrderFinanceReviewSheetTimeline";
import { OrderFinanceReviewSheetFooter } from "./OrderFinanceReviewSheetFooter";
import { AppSheet } from "../ui/app-sheet";

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
  decisionBusy,
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
  const [tab, setTab] = useState<"details" | "activity">("details");
  useEffect(() => setTab("details"), [order.orderNumber]);

  const paidAmount = order.paidAmountIdr ?? (order.paymentStatus === "paid" ? order.totalIdr : 0);
  const hasPaymentMismatch =
    (order.paymentStatus === "paid" && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === "partial" && (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === "unpaid" && paidAmount > 0);
  const hasMissingProof = order.paymentMethod === "transfer" && !order.paymentProofUrl;

  return (
    <AppSheet
      open
      onOpenChange={(nextOpen) => { if (!nextOpen && !decisionBusy) onClose(); }}
      title={<span className="sr-only">Order {order.orderNumber} finance reconciliation</span>}
      side="bottom"
      size="standard"
      hideCloseButton
      headerClassName="sr-only"
      contentClassName="gap-0 overflow-hidden rounded-t-2xl bg-card px-5 pb-4 pt-5 shadow-ios-lg ring-1 ring-border/60 sm:right-auto sm:h-[92vh] sm:max-h-[92vh] sm:px-6 sm:pb-5 sm:pt-5 md:max-w-3xl lg:h-[90vh] lg:max-h-[90vh] lg:max-w-5xl"
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

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-px pb-10 pt-1 text-sm text-foreground/90">
        <div role="tablist" aria-label="Finance order sections" className="no-scrollbar flex gap-6 overflow-x-auto border-b border-border/60">
          {([[
            "details",
            "Details",
          ], [
            "activity",
            "Activity",
          ]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`h-11 shrink-0 border-b-2 px-0 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${
                tab === id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="space-y-8 pt-5">
          {tab === "details" && (
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
          )}

          {tab === "activity" && (
            <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
              <OrderFinanceReviewSheetTimeline
                order={order}
                isOrderFuture={isOrderFuture}
                timelineRows={timelineRows}
                lastIndex={lastIndex}
              />
            </section>
          )}
        </div>
      </div>

      <OrderFinanceReviewSheetFooter
        canVerify={canVerify}
        isPending={isPending}
        actionType={actionType}
        actionNote={actionNote}
        decisionBusy={decisionBusy}
        onActionNoteChange={onActionNoteChange}
        onCloseAction={onCloseAction}
        onStartAction={onStartAction}
        onConfirmAction={onConfirmAction}
        onVerifyOrder={onVerifyOrder}
        hasPaymentMismatch={hasPaymentMismatch}
        hasMissingProof={hasMissingProof}
        paymentFullyPaid={order.paymentStatus === "paid"}
      />
    </AppSheet>
  );
};

export default OrderFinanceReviewSheet;
