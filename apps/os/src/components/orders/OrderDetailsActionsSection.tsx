import type { FC } from 'react'
import { ArrowRight } from 'lucide-react'
import { OrderPostActionModal } from './OrderPostActionModal'
import {
  QUICK_ACTION_BUTTON_STYLE,
  getQuickActionLabel,
} from './orderTableLabels'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { OrderPaymentGateDialog } from './OrderPaymentGateDialog'
import { shouldGateOrderAdvanceForPayment } from '../../domain/orderPaymentGateDomain'

interface OrderDetailsActionsSectionProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsActionsSection: FC<OrderDetailsActionsSectionProps> = ({
  viewModel,
}) => {
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
    showPaymentGate,
    onCancelEdit,
    onSaveChanges,
    onMoveToNextStatus,
    onCancelPaymentGate,
    onMarkPaidAndContinue,
    onCloseActionModal,
    onCopyAddress,
  } = viewModel

  const paymentBlocked = Boolean(nextStatus && shouldGateOrderAdvanceForPayment(order, nextStatus))

  return (
    <>
        {/* Actions: kept outside the scrollable body (not sticky-within-scroll)
            so it always sits below all content as a fixed dialog footer and
            can never overlap the last row of content while scrolling. */}
        <section className="safe-area-bottom z-20 isolate -mx-5 -mb-4 flex shrink-0 items-center justify-between gap-2 border-t border-border/45 bg-surface-footer px-5 pt-3 shadow-[0_-1px_0_rgba(0,0,0,0.02)] sm:-mx-5 sm:-mb-5 sm:rounded-b-3xl sm:px-5">
            <div className="flex items-center gap-2">
              {isEditing && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted sm:text-xs"
                >
                  Cancel edit
                </button>
              )}
            </div>
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              {!isEditing && (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:text-xs"
                >
                  Close
                </button>
              )}
              {isEditing && (
                <button
                  type="button"
                  onClick={onSaveChanges}
                  className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-[18px] text-sm font-medium text-primary-foreground shadow-ios-sm transition hover:bg-foreground/90 sm:text-xs"
                >
                  Save changes
                </button>
              )}
              {!isEditing && nextStatus && canEdit && (
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onMoveToNextStatus}
                    title={paymentBlocked ? 'Payment confirmation required.' : `Advance to ${getQuickActionLabel(nextStatus)}`}
                    className={`inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-[18px] whitespace-nowrap text-sm font-medium shadow-ios-sm transition hover:brightness-95 sm:min-h-10 sm:text-xs ${QUICK_ACTION_BUTTON_STYLE[nextStatus].className}`}
                  >
                    {getQuickActionLabel(nextStatus)}
                    <ArrowRight className="size-3.5 shrink-0" />
                  </button>
                </div>
              )}
            </div>
          </section>

      {showPaymentGate && nextStatus && (
        <OrderPaymentGateDialog
          order={order}
          nextStatus={nextStatus}
          formatter={viewModel.formatter}
          onCancel={onCancelPaymentGate}
          onMarkPaidAndContinue={onMarkPaidAndContinue}
        />
      )}

      {/* Follow-up action modal shown right after advancing to "Ready" (send
          the WhatsApp pickup notice) or "Delivering" (copy the delivery
          address for the courier). */}
      <OrderPostActionModal
        kind={actionModal}
        onClose={onCloseActionModal}
        customerWhatsappNumber={customerWhatsappNumber}
        readyMessage={readyMessage}
        whatsAppLink={whatsAppLink}
        deliveryAddress={order.deliveryAddress}
        addressCopied={addressCopied}
        onCopyAddress={onCopyAddress}
      />
    </>
  )
}
