import type { FC } from 'react'
import { OrderChangeRequestBanner } from './OrderChangeRequestBanner'
import { OrderChangeRequestModal } from './OrderChangeRequestModal'
import { OrderStatusStepper } from './OrderStatusStepper'
import { OrderRefundPanel } from './OrderRefundPanel'
import { OrderRefundDialog } from './OrderRefundDialog'
import { OrderPaymentProofFinanceCard } from './OrderPaymentProofFinanceCard'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsFinanceSectionProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsFinanceSection: FC<OrderDetailsFinanceSectionProps> = ({
  viewModel,
}) => {
  const {
    order,
    currentUserRole,
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
        <OrderChangeRequestBanner
          request={order.pendingChangeRequest}
          canResolveRequest={canResolveRequest}
          onApprove={onApproveRequest}
          onReject={onRejectRequest}
        />

        {currentUserRole === 'finance' && order.paymentMethod === 'transfer' && (
          <OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} />
        )}

        {order.financeVerificationStatus === 'rejected' && (
          <section className="mb-3 space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
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
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onResubmitFinance}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] text-xs font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90"
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
