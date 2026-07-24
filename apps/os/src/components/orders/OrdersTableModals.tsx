import type { FC } from 'react'
import { CheckCheck, Copy, MessageCircle, Truck } from 'lucide-react'
import { OrderDetailsPanelController } from './OrderDetailsPanelController'
import type { OrdersTableViewModel } from './OrdersTableViewController'
import { OrderPaymentGateDialog } from './OrderPaymentGateDialog'
import { AssignFloristDialog } from './AssignFloristDialog'

interface OrdersTableModalsProps {
  viewModel: OrdersTableViewModel
}

export const OrdersTableModals: FC<OrdersTableModalsProps> = ({ viewModel }) => {
  const {
    selectedOrder,
    formatter,
    paymentGate,
    actionModalData,
    processingAssignment,
    addressCopied,
    onCloseDetails,
    onCancelPaymentGate,
    onMarkPaidAndContinue,
    onCloseActionModal,
    onCancelProcessingAssignment,
    onProcessingAssigned,
    onCopyAddress,
  } = viewModel

  return (
    <>
      {selectedOrder && (
        <OrderDetailsPanelController
          order={selectedOrder}
          onClose={onCloseDetails}
          formatter={formatter}
        />
      )}

      {/* Quick-advance follow-up modal: same "Ready" (WhatsApp pickup notice)
          / "Delivering" (copy delivery address) behavior as the details
          panel, but reachable straight from the table/card quick-advance
          button. Stops propagation so a click inside it doesn't bubble up
          and open the row's details panel underneath. */}

      {processingAssignment && <AssignFloristDialog order={processingAssignment} onCancel={onCancelProcessingAssignment} onAssigned={onProcessingAssigned} />}

      {paymentGate && (
        <OrderPaymentGateDialog
          order={paymentGate.order}
          nextStatus={paymentGate.nextStatus}
          formatter={formatter}
          onCancel={onCancelPaymentGate}
          onMarkPaidAndContinue={onMarkPaidAndContinue}
        />
      )}

      {actionModalData && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
          onClick={(event) => {
            event.stopPropagation()
            onCloseActionModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            className="animate-sheet-up w-full max-w-md rounded-t-2xl bg-card p-5 shadow-lg ring-1 ring-border/60 sm:rounded-xl"
          >
            {actionModalData.kind === 'ready' ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                    <MessageCircle className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold leading-6 text-foreground">
                      Order ready — notify customer
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Send the pickup notice on WhatsApp
                      {actionModalData.customerWhatsappNumber
                        ? ` · ${actionModalData.customerWhatsappNumber}`
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">
                  {actionModalData.readyMessage}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onCloseActionModal}
                    className="inline-flex cursor-pointer items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                  >
                    Close
                  </button>
                  <a
                    href={actionModalData.whatsAppLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={onCloseActionModal}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-success px-5 text-sm font-medium text-white shadow-ios-sm transition hover:bg-success"
                  >
                    <MessageCircle className="size-3.5" />
                    Send WhatsApp
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                    <Truck className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold leading-6 text-foreground">
                      Out for delivery — courier address
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Copy the address for the courier
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">
                  {actionModalData.order.deliveryAddress ??
                    'No delivery address on file for this order.'}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onCloseActionModal}
                    className="inline-flex cursor-pointer items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={!actionModalData.order.deliveryAddress}
                    onClick={onCopyAddress}
                    className="inline-flex cursor-pointer items-center justify-center rounded-full bg-success text-sm font-medium text-white shadow-ios-sm transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                  >
                    {addressCopied ? (
                      <>
                        <CheckCheck className="size-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Copy address
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
