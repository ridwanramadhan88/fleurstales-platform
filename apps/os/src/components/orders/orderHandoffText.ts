import type { OrderTableRow } from '../../types/orders'

const itemSummary = (order: OrderTableRow): string => {
  const items = order.items ?? []
  if (items.length === 0) return order.productName ?? 'Custom order'
  return items
    .map((item) => `${item.productNameSnapshot ?? item.productName ?? 'Custom order'} x${item.quantity}`)
    .join(', ')
}

export const formatOrderHandoffText = (order: OrderTableRow): string => {
  const scheduleDate = order.fulfillment === 'pickup'
    ? order.requestedPickupDate ?? order.scheduleDate
    : order.scheduleDate
  const scheduleTime = order.fulfillment === 'pickup'
    ? order.requestedPickupTime ?? order.scheduleTime
    : order.scheduleTime
  const schedule = [scheduleDate, scheduleTime].filter(Boolean).join(' · ') || 'Belum dijadwalkan'

  const fulfillmentLines = order.fulfillment === 'delivery'
    ? [
        `Pengiriman: ${schedule}`,
        `Alamat: ${order.deliveryAddress ?? '-'}`,
        ...(order.deliveryInstructions ? [`Catatan kurir: ${order.deliveryInstructions}`] : []),
      ]
    : [
        `Pickup: ${schedule}`,
        `Cabang: ${order.branch}`,
      ]

  return [
    `Order: ${order.orderNumber}`,
    `Customer: ${order.customerName}`,
    `Items: ${itemSummary(order)}`,
    ...fulfillmentLines,
  ].join('\n')
}
