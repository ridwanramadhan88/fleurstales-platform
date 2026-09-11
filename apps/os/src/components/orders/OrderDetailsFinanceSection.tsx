import type { FC } from 'react'
import { OrderChangeRequestBanner } from './OrderChangeRequestBanner'
import { OrderChangeRequestModal } from './OrderChangeRequestModal'
import { OrderRefundPanel } from './OrderRefundPanel'
import { OrderRefundDialog } from './OrderRefundDialog'
import { OrderPaymentProofSummary } from './OrderPaymentProofSummary'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsFinanceSectionProps {
  viewModel: OrderDetailsViewModel
  mode?: 'all' | 'content' | 'dialogs'
}

export const OrderDetailsFinanceSection: FC<OrderDetailsFinanceSectionProps> = ({
  viewModel,
  mode = 'all',
}) => {
  const {
    order,
    currentUserRole,
    canResolveRequest,
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
    canVerifyThisOrder,
    onVerifyOrder,
  } = viewModel

  const showContent = mode !== 'dialogs'
  const showDialogs = mode !== 'content'

  return (
    <>
      {showContent && (
        <div className="space-y-3">
          <OrderChangeRequestBanner
            request={order.pendingChangeRequest}
            canResolveRequest={canResolveRequest}
            onApprove={onApproveRequest}
            onReject={onRejectRequest}
          />

          {['finance', 'owner', 'admin'].includes(currentUserRole) && (
            <OrderPaymentProofSummary order={order} />
          )}

          {canVerifyThisOrder && (
            <section className="flex items-center justify-between gap-3 rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
              <div>
                <p className="text-sm font-semibold text-foreground">Finance decision</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Payment evidence is ready for reconciliation.</p>
              </div>
              <button
                type="button"
                onClick={onVerifyOrder}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-success px-[18px] text-sm font-semibold text-white shadow-ios-sm transition hover:brightness-95"
              >
                Reconcile payment
              </button>
            </section>
          )}

          {order.financeVerificationStatus === 'rejected' && (
            <section className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
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

          <OrderRefundPanel viewModel={viewModel} />
        </div>
      )}

      {showDialogs && (
        <>
          <OrderChangeRequestModal
            mode={isRequestModalOpen}
            reason={requestReason}
            onReasonChange={setRequestReason}
            onCancel={onCloseRequestModal}
            onSubmit={onSubmitChangeRequest}
          />

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
      )}
    </>
  )
}
