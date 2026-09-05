import type { FC } from 'react'
import { CheckCheck, Copy, MessageCircle, Star, Truck } from 'lucide-react'
import { OrderDetailsPanelController } from './OrderDetailsPanelController'
import type { OrdersTableViewModel } from './OrdersTableViewController'
import { OrderPaymentGateDialog } from './OrderPaymentGateDialog'
import { OrderFinishPhotoDialog } from './OrderFinishPhotoDialog'
import { AssignFloristDialog } from './AssignFloristDialog'

interface OrdersTableModalsProps {
  viewModel: OrdersTableViewModel
}

export const OrdersTableModals: FC<OrdersTableModalsProps> = ({ viewModel }) => {
  const {
    selectedOrder,
    formatter,
    paymentGate,
    finishPhotoGate,
    actionModalData,
    processingAssignment,
    addressCopied,
    onCloseDetails,
    onCancelPaymentGate,
    onMarkPaidAndContinue,
    onCancelFinishPhotoDialog,
    onFinishPhotoUploaded,
    onCloseActionModal,
    onCancelProcessingAssignment,
    onProcessingAssigned,
    onCopyAddress,
  } = viewModel

  return (
    <>
      {selectedOrder && (
        <OrderDetailsPanelController order={selectedOrder} onClose={onCloseDetails} formatter={formatter} />
      )}

      {processingAssignment && (
        <AssignFloristDialog order={processingAssignment} onCancel={onCancelProcessingAssignment} onAssigned={onProcessingAssigned} />
      )}

      {paymentGate && (
        <OrderPaymentGateDialog
          order={paymentGate.order}
          nextStatus={paymentGate.nextStatus}
          formatter={formatter}
          onCancel={onCancelPaymentGate}
          onMarkPaidAndContinue={onMarkPaidAndContinue}
        />
      )}

      {finishPhotoGate && (
        <OrderFinishPhotoDialog
          open
          orderId={finishPhotoGate.order.id ?? finishPhotoGate.order.orderNumber}
          onCancel={onCancelFinishPhotoDialog}
          onUploaded={onFinishPhotoUploaded}
        />
      )}

      {actionModalData && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => { event.stopPropagation(); onCloseActionModal() }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            className="animate-sheet-up w-full rounded-t-2xl bg-card p-5 shadow-ios-lg ring-1 ring-border/60 sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:rounded-2xl sm:p-6"
          >
            {actionModalData.kind === 'ready' ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><MessageCircle className="size-4" /></span>
                  <div>
                    <h3 className="text-base font-semibold leading-6 text-foreground">Order ready — notify customer</h3>
                    <p className="text-xs text-muted-foreground">
                      Send the ready notice on WhatsApp{actionModalData.customerWhatsappNumber ? ` · ${actionModalData.customerWhatsappNumber}` : ''}
                    </p>
                  </div>
                </div>
                {actionModalData.order.finishPhotoUrl && (
                  <div className="mb-3 aspect-[4/5] w-full max-w-[160px] overflow-hidden rounded-xl bg-muted ring-1 ring-border/70">
                    <img src={actionModalData.order.finishPhotoUrl} alt="Finished product" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">{actionModalData.readyMessage}</div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={onCloseActionModal} className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Close</button>
                  <a href={actionModalData.whatsAppLink} target="_blank" rel="noreferrer" onClick={onCloseActionModal} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-success px-5 text-sm font-medium text-white shadow-ios-sm">
                    <MessageCircle className="size-3.5" /> Send WhatsApp
                  </a>
                </div>
              </>
            ) : actionModalData.kind === 'review' ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Star className="size-4" /></span>
                  <div>
                    <h3 className="text-base font-semibold leading-6 text-foreground">Order complete — request a review</h3>
                    <p className="text-xs text-muted-foreground">
                      Send the customer directly to the completed tracking page{actionModalData.customerWhatsappNumber ? ` · ${actionModalData.customerWhatsappNumber}` : ''}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">{actionModalData.readyMessage}</div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={onCloseActionModal} className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Close</button>
                  <a href={actionModalData.whatsAppLink} target="_blank" rel="noreferrer" onClick={onCloseActionModal} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-success px-5 text-sm font-medium text-white shadow-ios-sm">
                    <MessageCircle className="size-3.5" /> Send review request
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><Truck className="size-4" /></span>
                  <div>
                    <h3 className="text-base font-semibold leading-6 text-foreground">Out for delivery — courier address</h3>
                    <p className="text-xs text-muted-foreground">Copy the address for the courier</p>
                  </div>
                </div>
                <div className="rounded-lg bg-surface-panel px-3 py-2.5 text-sm text-foreground/90">
                  {actionModalData.order.deliveryAddress ?? 'No delivery address on file for this order.'}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={onCloseActionModal} className="inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Close</button>
                  <button type="button" disabled={!actionModalData.order.deliveryAddress} onClick={onCopyAddress} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-success px-[18px] text-sm font-medium text-white shadow-ios-sm disabled:opacity-50">
                    {addressCopied ? <><CheckCheck className="size-3.5" />Copied</> : <><Copy className="size-3.5" />Copy address</>}
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
