import type { FC } from 'react'
import { OrderPostActionModal } from './OrderPostActionModal'
import { OrderDetailsPanelController } from './OrderDetailsPanelController'
import type { OrdersTableViewModel } from './OrdersTableViewController'
import { OrderPaymentGateDialog } from './OrderPaymentGateDialog'
import { OrderFinishPhotoDialog } from './OrderFinishPhotoDialog'
import { OrderShipmentDialog } from './OrderShipmentDialog'
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
    shipmentGate,
    onCancelShipment,
    onShipmentSaved,
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

      {shipmentGate && (
        <OrderShipmentDialog open order={shipmentGate} mode="start" onClose={onCancelShipment} onSaved={onShipmentSaved} />
      )}

      <OrderPostActionModal
        kind={actionModalData?.kind ?? null}
        onClose={onCloseActionModal}
        customerWhatsappNumber={actionModalData?.customerWhatsappNumber}
        readyMessage={actionModalData?.readyMessage ?? ''}
        whatsAppLink={actionModalData?.whatsAppLink ?? ''}
        finishPhotoUrl={actionModalData?.order.finishPhotoUrl}
        deliveryAddress={actionModalData?.order.deliveryAddress}
        addressCopied={addressCopied}
        onCopyAddress={onCopyAddress}
      />
    </>
  )
}
