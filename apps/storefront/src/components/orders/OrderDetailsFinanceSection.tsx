import type { FC } from 'react'
import { OrderChangeRequestBanner } from './OrderChangeRequestBanner'
import { OrderChangeRequestModal } from './OrderChangeRequestModal'
import { OrderStatusStepper } from './OrderStatusStepper'
import { OrderRefundPanel } from './OrderRefundPanel'
import { OrderRefundDialog } from './OrderRefundDialog'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsFinanceSectionProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsFinanceSection: FC<OrderDetailsFinanceSectionProps> = ({
  viewModel,
}) => {
  const {
    order,
    isOrderFuture,
    canResolveRequest,
    isTerminalIssue,
    isRequestModalOpen,
    requestReason,
    setRequestReason,
    onApproveRequest,
    onRejectRequest,
    onCloseRequestModal,
    onSubmitChangeRequest,
    refundDialogMode,
    refundReason,
    setRefundReason,
    onCloseRefundDialog,
    onSubmitRefundAction,
    canResubmitFinance,
    resubmissionNote,
    setResubmissionNote,
    onResubmitFinance,
  } = viewModel

  return (
    <>
        {/* Pending change request banner: shown to Finance/Owner when Admin
            has submitted an edit or cancellation request on this
            (already-verified) order, awaiting approve/reject. Also shows a
            plain read-only notice to everyone else while it's pending. */}
        <OrderChangeRequestBanner
          request={order.pendingChangeRequest}
          canResolveRequest={canResolveRequest}
          onApprove={onApproveRequest}
          onReject={onRejectRequest}
        />

        {order.financeVerificationStatus === 'rejected' && (
          <section className="mb-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
            <div>
              <p className="text-xs font-semibold text-destructive">Rejected by Finance</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {order.financeVerificationNote || 'Finance did not provide a correction note.'}
              </p>
            </div>
            {canResubmitFinance ? (
              <div className="space-y-2">
                <textarea
                  value={resubmissionNote}
                  onChange={(event) => setResubmissionNote(event.target.value)}
                  rows={2}
                  placeholder="Describe what was corrected before resubmitting"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onResubmitFinance}
                    className="rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-ios-sm hover:bg-foreground/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                  >
                    Resubmit to Finance
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Admin or Owner must correct and resubmit this order.
              </p>
            )}
          </section>
        )}

        {/* Request-reason modal: Admin fills a required reason before
            submitting an edit/cancellation request on a finished order. */}
        <OrderChangeRequestModal
          mode={isRequestModalOpen}
          reason={requestReason}
          onReasonChange={setRequestReason}
          onCancel={onCloseRequestModal}
          onSubmit={onSubmitChangeRequest}
        />

        {!isTerminalIssue && (
          <OrderStatusStepper
            fulfillment={order.fulfillment}
            isOrderFuture={isOrderFuture}
            status={order.status}
          />
        )}

        <OrderRefundPanel viewModel={viewModel} />

        <OrderRefundDialog
          mode={refundDialogMode}
          order={order}
          formatter={viewModel.formatter}
          reason={refundReason}
          onReasonChange={setRefundReason}
          onCancel={onCloseRefundDialog}
          onConfirm={onSubmitRefundAction}
        />

    </>
  )
}
