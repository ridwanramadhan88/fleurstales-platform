/**
 * @file OrderDetailsKeyInfo.tsx
 * @description What staff need for every pickup or delivery, shown at the
 * top of the order without opening a section: customer phone (tap to
 * WhatsApp), pickup/delivery time and, for delivery, the address.
 */

import type { FC } from 'react'
import { Clock, MapPin, MessageCircle } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import { getDisplayScheduleLabel } from './orderTableFormatters'
import { buildWhatsAppLink } from './orderTableWhatsApp'

interface OrderDetailsKeyInfoProps {
  order: OrderTableRow
  customerWhatsappNumber?: string
}

export const OrderDetailsKeyInfo: FC<OrderDetailsKeyInfoProps> = ({ order, customerWhatsappNumber }) => {
  const isDelivery = order.fulfillment === 'delivery'
  const schedule = getDisplayScheduleLabel(order)
  const address = order.deliveryAddress?.trim()

  return (
    <section
      aria-label="Customer and fulfillment"
      className="grid gap-2 pb-4 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <MessageCircle className="size-4 shrink-0 text-success" />
        {customerWhatsappNumber ? (
          <a
            href={buildWhatsAppLink(customerWhatsappNumber, '')}
            target="_blank"
            rel="noreferrer"
            className="truncate font-medium text-foreground underline-offset-2 hover:underline"
          >
            {customerWhatsappNumber}
          </a>
        ) : (
          <span className="text-muted-foreground">No phone number</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-foreground">
          {`${isDelivery ? 'Delivery' : 'Pickup'} · ${schedule ?? 'No schedule'}`}
        </span>
      </div>
      {isDelivery && (
        <div className="flex min-w-0 items-start gap-2 sm:col-span-2 lg:col-span-1">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className={address ? 'text-foreground' : 'text-muted-foreground'}>{address || 'No address yet'}</span>
        </div>
      )}
    </section>
  )
}
