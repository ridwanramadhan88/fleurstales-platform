import type { FC } from 'react'
import { ArrowRight, Check, Copy, X } from 'lucide-react'
import { OrderPostActionModal } from './OrderPostActionModal'
import { OrderFinishPhotoDialog } from './OrderFinishPhotoDialog'
import { getQuickActionLabel, getQuickActionButtonClassName } from './orderTableLabels'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { OrderPaymentGateDialog } from './OrderPaymentGateDialog'
import { AppDialog } from '../ui/app-dialog'

interface OrderDetailsActionsSectionProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsActionsSection: FC<OrderDetailsActionsSectionProps> = ({ viewModel }) => {
  const {
    order,
    onClose,
    customerWhatsappNumber,
    nextStatus,
    readyMessage,
    whatsAppLink,
    canEdit,
    isEditing,
    actionModal,
    addressCopied,
    detailsCopied,
    showPaymentGate,
    showFinishPhotoDialog,
    isPendingStorefrontConfirmation,
    storefrontDecisionBusy,
    storefrontPreviewLoading,
    storefrontCancelOpen,
    storefrontCancelReason,
    storefrontPreviewModal,
    storefrontPreviewMessage,
    setStorefrontCancelReason,
    onCancelEdit,
    onSaveChanges,
    onMoveToNextStatus,
    onCancelPaymentGate,
    onMarkPaidAndContinue,
    onFinishPhotoUploaded,
    onCancelFinishPhotoDialog,
    onCloseActionModal,
    onCopyAddress,
    onCopyOrderDetails,
    onOpenStorefrontCancel,
    onCloseStorefrontCancel,
    onOpenStorefrontConfirmPreview,
    onCloseStorefrontPreview,
    onSendConfirmWhatsApp,
    onSendRejectWhatsApp,
    onSubmitStorefrontCancel,
  } = viewModel

  const paymentBlocked = Boolean(
    nextStatus === 'processing'
    && (order.paymentStatus !== 'paid' || (order.paidAmountIdr ?? 0) < order.totalIdr),
  )
  const nextActionLabel = paymentBlocked ? 'Konfirmasi Pembayaran' : nextStatus ? getQuickActionLabel(nextStatus) : ''
  const decisionBusy = storefrontDecisionBusy !== null || storefrontPreviewLoading

  return (
    <>
      <section className="safe-area-bottom z-20 isolate -mx-5 -mb-4 flex shrink-0 items-center justify-between gap-2 border-t border-border/45 bg-surface-footer px-5 pt-3 shadow-[0_-1px_0_rgba(0,0,0,0.02)] sm:-mx-5 sm:-mb-5 sm:rounded-b-3xl sm:px-5">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <button type="button" onClick={onCancelEdit} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted sm:text-xs">Cancel edit</button>
          ) : (
            <button type="button" onClick={onCopyOrderDetails} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:text-xs">
              {detailsCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {detailsCopied ? 'Copied' : 'Copy details'}
            </button>
          )}
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {!isEditing && (
            <button type="button" onClick={onClose} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:text-xs">Close</button>
          )}

          {isEditing && (
            <button type="button" onClick={onSaveChanges} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-[18px] text-sm font-medium text-primary-foreground shadow-ios-sm transition hover:bg-foreground/90 sm:text-xs">Save changes</button>
          )}

          {!isEditing && isPendingStorefrontConfirmation && (
            <>
              <button type="button" onClick={onOpenStorefrontCancel} disabled={decisionBusy} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-destructive/25 px-[18px] text-sm font-medium text-destructive transition hover:bg-destructive/8 disabled:opacity-50 sm:text-xs">
                <X className="size-3.5" /> Reject
              </button>
              <button type="button" onClick={() => { void onOpenStorefrontConfirmPreview() }} disabled={decisionBusy} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#16834b] px-[18px] text-sm font-medium text-white shadow-ios-sm transition hover:brightness-95 disabled:opacity-60 sm:text-xs">
                <Check className="size-3.5" /> {storefrontPreviewLoading ? 'Preparing…' : 'Confirm & WhatsApp'}
              </button>
            </>
          )}

          {!isEditing && !isPendingStorefrontConfirmation && nextStatus && canEdit && (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onMoveToNextStatus}
                title={paymentBlocked ? 'Confirm payment before production starts.' : `Advance to ${nextActionLabel}`}
                className={`inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-[18px] whitespace-nowrap text-sm font-medium shadow-ios-sm transition hover:brightness-95 sm:min-h-10 sm:text-xs ${getQuickActionButtonClassName(order.fulfillment, nextStatus)}`}
              >
                {nextActionLabel}
                <ArrowRight className="size-3.5 shrink-0" />
              </button>
            </div>
          )}
        </div>
      </section>

      <AppDialog
        open={storefrontCancelOpen}
        onOpenChange={(open) => { if (!open) onCloseStorefrontCancel() }}
        size="compact"
        title={`Reject ${order.orderNumber}?`}
        description="The reason will be saved on the order and included in the WhatsApp message to the customer."
      >
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Cancellation reason</span>
            <textarea
              value={storefrontCancelReason}
              onChange={(event) => setStorefrontCancelReason(event.target.value)}
              maxLength={500}
              rows={4}
              autoFocus
              placeholder="e.g. Requested delivery slot is unavailable"
              className="w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-3 text-sm outline-none transition focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCloseStorefrontCancel} disabled={decisionBusy} className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">Back</button>
            <button type="button" onClick={() => { void onSubmitStorefrontCancel() }} disabled={decisionBusy || !storefrontCancelReason.trim()} className="inline-flex h-10 items-center justify-center rounded-full bg-destructive px-4 text-sm font-medium text-destructive-foreground disabled:opacity-50">
              {storefrontPreviewLoading ? 'Preparing…' : 'Continue'}
            </button>
          </div>
        </div>
      </AppDialog>

      {showPaymentGate && nextStatus && (
        <OrderPaymentGateDialog
          order={order}
          nextStatus={nextStatus}
          formatter={viewModel.formatter}
          onCancel={onCancelPaymentGate}
          onMarkPaidAndContinue={onMarkPaidAndContinue}
        />
      )}

      {showFinishPhotoDialog && (
        <OrderFinishPhotoDialog open orderId={order.id ?? order.orderNumber} onCancel={onCancelFinishPhotoDialog} onUploaded={onFinishPhotoUploaded} />
      )}

      <OrderPostActionModal
        kind={actionModal}
        onClose={onCloseActionModal}
        customerWhatsappNumber={customerWhatsappNumber}
        readyMessage={readyMessage}
        whatsAppLink={whatsAppLink}
        finishPhotoUrl={order.finishPhotoUrl}
        deliveryAddress={order.deliveryAddress}
        addressCopied={addressCopied}
        onCopyAddress={onCopyAddress}
      />

      <OrderPostActionModal
        kind={storefrontPreviewModal}
        onClose={onCloseStorefrontPreview}
        customerWhatsappNumber={customerWhatsappNumber}
        readyMessage=""
        whatsAppLink=""
        deliveryAddress={undefined}
        addressCopied={false}
        onCopyAddress={() => undefined}
        previewMessage={storefrontPreviewMessage}
        previewSending={storefrontDecisionBusy !== null}
        onSendPreviewWhatsApp={() => {
          if (storefrontPreviewModal === 'confirm') void onSendConfirmWhatsApp()
          else if (storefrontPreviewModal === 'reject') void onSendRejectWhatsApp()
        }}
      />
    </>
  )
}
