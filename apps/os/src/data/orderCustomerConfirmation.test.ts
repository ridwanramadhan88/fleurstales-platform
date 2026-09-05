import { describe, expect, it } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import {
  buildOrderConfirmedMessage,
  buildOrderTrackingUrl,
  getStorefrontOrigin,
} from './orderCustomerConfirmation'

// Release regression coverage for the post-payment/confirmation hotfix.
describe('customer storefront tracking links', () => {
  it('uses the canonical public Storefront origin', () => {
    expect(getStorefrontOrigin()).toBe('https://fleurstales-storefront.vercel.app')
    expect(getStorefrontOrigin()).not.toContain('-rid5.vercel.app')
  })

  it('builds customer-facing order links on the canonical production alias', () => {
    expect(buildOrderTrackingUrl('KDM-2026-0010', 'd2cf177c-3e6c-44d0-9d07-e28f161bd2f2', 'confirmed')).toBe(
      'https://fleurstales-storefront.vercel.app/track/KDM-2026-0010?key=d2cf177c-3e6c-44d0-9d07-e28f161bd2f2&v=confirmed',
    )
  })

  it('asks for payment and includes product, order number, and tracking link', () => {
    const order = {
      orderNumber: 'KDM-2026-0013',
      customerName: 'Ridwan Ramadhan',
      productName: 'Rose Bouquet',
      items: [
        {
          id: 'item-1',
          productNameSnapshot: 'Rose Bouquet',
          quantity: 1,
          unitPriceIdr: 250000,
        },
      ],
    } as OrderTableRow
    const trackingUrl = buildOrderTrackingUrl(order.orderNumber, 'tracking-id', 'confirmed')

    expect(buildOrderConfirmedMessage(order, trackingUrl)).toBe([
      'Hi kak Ridwan Ramadhan,',
      '',
      'Pesanan: Rose Bouquet',
      'No Pesanan: KDM-2026-0013',
      'sudah kami konfirmasi',
      '',
      'Segera lakukan pembayaran',
      '',
      'Status pesanan bisa dicek di',
      'https://fleurstales-storefront.vercel.app/track/KDM-2026-0013?key=tracking-id&v=confirmed',
    ].join('\n'))
  })

  it('summarizes extra line items in the WhatsApp message', () => {
    const order = {
      orderNumber: 'PHM-2026-0004',
      customerName: 'Ridwan Ramadhan',
      items: [
        { id: 'item-1', productNameSnapshot: 'Rose Bouquet', quantity: 1, unitPriceIdr: 250000 },
        { id: 'item-2', productNameSnapshot: 'Greeting Card', quantity: 1, unitPriceIdr: 25000 },
      ],
    } as OrderTableRow

    expect(buildOrderConfirmedMessage(order, 'https://example.test/track')).toContain('Pesanan: Rose Bouquet +1 item')
  })
})
