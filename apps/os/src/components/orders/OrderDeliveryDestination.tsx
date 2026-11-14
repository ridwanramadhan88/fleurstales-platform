import { useState, type FC } from 'react'
import { ExternalLink, MapPinOff, MessageCircle, Pencil } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { googleMapsUrlForPin, toDeliveryPin } from '../../domain/deliveryDetailsDomain'
import { buildWhatsAppLink } from './orderTableWhatsApp'
import { OrderDeliveryDetailsDialog } from './OrderDeliveryDetailsDialog'

export const getOrderDeliveryPin = (order: OrderTableRow) =>
  typeof order.deliveryLatitude === 'number' && typeof order.deliveryLongitude === 'number'
    ? toDeliveryPin(order.deliveryLatitude, order.deliveryLongitude)
    : null

const isFinished = (order: OrderTableRow): boolean =>
  ['delivered', 'picked_up', 'cancelled', 'failed'].includes(order.status)

interface Props {
  order: OrderTableRow
  /** Owner/Admin may correct the details until the order is finished. */
  canEdit: boolean
}

/**
 * Who receives a delivery and where: recipient (tap to WhatsApp), address,
 * landmark, courier note, "Open in Maps" and, for Owner/Admin, "Edit".
 */
export const OrderDeliveryDestination: FC<Props> = ({ order, canEdit }) => {
  const copy = useBilingualCopy()
  const [editing, setEditing] = useState(false)
  const pin = getOrderDeliveryPin(order)
  const recipientName = order.recipientName?.trim() || order.customerName
  const recipientPhone = order.recipientPhone?.trim() || order.customerSnapshot?.whatsappNumber || ''
  const editable = canEdit && !isFinished(order)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">{copy('Recipient', 'Penerima')}</p>
        <p className="mt-0.5 text-[15px] font-semibold text-foreground">{recipientName}</p>
        {recipientPhone ? (
          <a
            href={buildWhatsAppLink(recipientPhone, '')}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <MessageCircle className="size-3.5" />
            {recipientPhone}
          </a>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{copy('Deliver to', 'Alamat antar')}</p>
        <p className="mt-0.5 text-[15px] leading-relaxed text-foreground">
          {order.deliveryAddress?.trim() || copy('No address yet', 'Belum ada alamat')}
        </p>
        {order.deliveryLandmark?.trim() && (
          <p className="mt-1 text-sm text-foreground/80">{copy('Landmark', 'Patokan')}: {order.deliveryLandmark.trim()}</p>
        )}
        {order.deliveryInstructions?.trim() && (
          <p className="mt-1 text-sm text-foreground/80">{copy('For the courier', 'Untuk kurir')}: {order.deliveryInstructions.trim()}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {pin ? (
          <a
            href={googleMapsUrlForPin(pin)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-background px-3.5 text-sm font-semibold text-primary ring-1 ring-border/80 hover:bg-primary/5"
          >
            {copy('Open in Google Maps', 'Buka di Google Maps')} <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <span className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground">
            <MapPinOff className="size-4" /> {copy('No map pin yet', 'Belum ada pin lokasi')}
          </span>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            <Pencil className="size-3.5" /> {copy('Edit delivery', 'Ubah pengiriman')}
          </button>
        )}
      </div>
      {editing && (
        <OrderDeliveryDetailsDialog order={order} open={editing} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}
