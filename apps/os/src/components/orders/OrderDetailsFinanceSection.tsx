import type { FC } from 'react'
import { AlertTriangle, Clock3, FileImage } from 'lucide-react'
import { OrderChangeRequestBanner } from './OrderChangeRequestBanner'
import { OrderChangeRequestModal } from './OrderChangeRequestModal'
import { OrderStatusStepper } from './OrderStatusStepper'
import { OrderRefundPanel } from './OrderRefundPanel'
import { OrderRefundDialog } from './OrderRefundDialog'
import { OrderPaymentProofSummary } from './OrderPaymentProofSummary'
import { getOrderFinancePresentation } from './orderUxPresentation'
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

  const finance = getOrderFinancePresentation(order)

  return (
    <>
      <OrderChangeRequestBanner
        request={order.pendingChangeRequest}
        canResolveRequest={canResolveRequest}
        onApprove={onApproveRequest}
        onReject={onRejectRequest}
      />

      {finance.needsAttention ? (
        <section className="mb-3 rounded-xl border border-warning/30 bg-warning/7 px-3.5 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/12 text-warning">
              <AlertTriangle className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-warning">Finance needs attention</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{finance.attentionReason ?? 'Review the payment before reconciliation.'}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Expected Rp {viewModel.formatter.format(order.totalIdr)}</span>
                <span>Recorded Rp {viewModel.formatter.format(finance.paidAmountIdr)}</span>
                {order.paymentMethod === 'transfer' ? (
                  <span className="inline-flex items-center gap-1">
                    <FileImage className="size-3.5" /> {order.paymentProofUrl ? 'Proof attached' : 'Proof missing'}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Use the dedicated Finance Review workspace for the reconciliation decision.</p>
            </div>
          </div>

          {order.financeVerificationStatus === 'rejected' && canResubmitFinance ? (
            <div className="mt-3 border-t border-warning/20 pt-3">
              <textarea
                value={resubmissionNote}
                onChange={(event) => setResubmissionNote(event.target.value)}
                rows={2}
                placeholder="Describe what was corrected before resubmitting"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onResubmitFinance}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90"
                >
                  Resubmit to Finance
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : finance.resolved ? (
        <OrderPaymentProofSummary order={order} />
      ) : order.paymentStatus === 'paid' ? (
        <section className="mb-3 flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
            <Clock3 className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold text-info">Awaiting Finance reconciliation</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Payment is recorded. Finance review remains pending, but Operations can continue according to the existing workflow.</p>
          </div>
        </section>
      ) : null}

      <OrderChangeRequestModal
        mode={isRequestModalOpen}
        reason={requestReason}
        onReasonChange={setRequestReason}
        onCancel={onCloseRequestModal}
        onSubmit={onSubmitChangeRequest}
      />

      {!isTerminalIssue && (
        <div className="mb-1 opacity-80">
          <OrderStatusStepper
            fulfillment={order.fulfillment}
            isOrderFuture={isOrderFuture}
            status={order.status}
          />
        </div>
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
