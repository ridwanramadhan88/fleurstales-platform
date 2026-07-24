import { afterEach, describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { useOrdersStore } from './ordersStore'

const originalState = useOrdersStore.getState()

afterEach(() => {
  useOrdersStore.setState({
    orders: originalState.orders,
    lastSequence: originalState.lastSequence,
  })
})

describe('updateOrderDetails — authoritative persistence', () => {
  it('keeps item price separate from discount and delivery fee on creation', () => {
    const order = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Pricing Customer',
      orderType: 'admin_created',
      fulfillmentType: 'delivery',
      depositAmount: 0,
      notes: null,
      items: [
        {
          id: 'line-pricing',
          productName: 'Premium Bouquet',
          quantity: 1,
          unitPriceIdr: 300_000,
        },
      ],
      itemsSubtotalIdr: 300_000,
      discountIdr: 30_000,
      deliveryFeeIdr: 20_000,
      totalIdr: 290_000,
      paymentMethod: 'transfer',
      scheduleDate: '2026-07-20',
      scheduleTime: '16:30',
      scheduleLabel: '20 Jul · 16:30',
      deliveryAddress: 'Jl. Mawar 1',
      deliveryInstructions: 'Call on arrival',
      greetingCardName: 'Untuk Ibu',
    })

    expect(order.items?.[0].unitPriceIdr).toBe(300_000)
    expect(order).toMatchObject({
      itemsSubtotalIdr: 300_000,
      discountIdr: 30_000,
      deliveryFeeIdr: 20_000,
      totalIdr: 290_000,
      paymentMethod: 'transfer',
      scheduleTime: '16:30',
      deliveryAddress: 'Jl. Mawar 1',
      deliveryInstructions: 'Call on arrival',
      greetingCardName: 'Untuk Ibu',
    })
  })

  it('writes every editable detail into ordersStore and keeps a custom line in sync', () => {
    useOrdersStore.setState({
      orders: [
        makeOrder({
          orderNumber: 'A',
          productName: 'Old custom bouquet',
          productId: undefined,
          items: [
            {
              id: 'line-a',
              productName: 'Old custom bouquet',
              quantity: 1,
              unitPriceIdr: 100_000,
            },
          ],
        }),
      ],
    })

    const result = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: { name: 'Admin A', role: 'admin' },
      patch: {
        customerName: 'Updated Customer',
        productName: 'Updated custom bouquet',
        source: 'whatsapp',
        fulfillment: 'pickup',
        paymentStatus: 'partial',
        totalIdr: 250_000,
        paidAmountIdr: 50_000,
        scheduleDate: '2026-07-20',
        scheduleLabel: '20 Jul 2026 · 14.00',
        orderNote: 'Call before pickup',
        greetingMessage: 'Congratulations',
      },
    })

    expect(result.allowed).toBe(true)
    expect(useOrdersStore.getState().orders[0]).toMatchObject({
      customerName: 'Updated Customer',
      productName: 'Updated custom bouquet',
      source: 'whatsapp',
      fulfillment: 'pickup',
      paymentStatus: 'partial',
      totalIdr: 250_000,
      paidAmountIdr: 50_000,
      scheduleDate: '2026-07-20',
      scheduleLabel: '20 Jul 2026 · 14.00',
      orderNote: 'Call before pickup',
      greetingMessage: 'Congratulations',
    })
    expect(useOrdersStore.getState().orders[0].items?.[0].productName).toBe(
      'Updated custom bouquet',
    )
    expect(useOrdersStore.getState().orders[0].items?.[0].unitPriceIdr).toBe(
      250_000,
    )
  })

  it('round-trips contact, delivery, payment method, and schedule time edits', () => {
    useOrdersStore.setState({
      orders: [
        makeOrder({
          orderNumber: 'CONTACT',
          fulfillment: 'delivery',
          customerSnapshot: { name: 'Old Name', phone: '0800' },
        }),
      ],
    })

    const result = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'CONTACT',
      expectedRevision: 1,
      actor: { name: 'Admin A', role: 'admin' },
      patch: {
        customerName: 'New Name',
        customerSnapshot: {
          name: 'New Name',
          phone: '08123456789',
          email: 'new@example.com',
        },
        paymentMethod: 'transfer',
        scheduleDate: '2026-07-21',
        scheduleTime: '14:45',
        scheduleLabel: '21 Jul · 14:45',
        deliveryAddress: 'Jl. Melati 2',
        deliveryInstructions: 'Leave at reception',
      },
    })

    expect(result.allowed).toBe(true)
    expect(useOrdersStore.getState().orders[0]).toMatchObject({
      customerName: 'New Name',
      customerSnapshot: {
        name: 'New Name',
        phone: '08123456789',
        email: 'new@example.com',
      },
      paymentMethod: 'transfer',
      scheduleDate: '2026-07-21',
      scheduleTime: '14:45',
      deliveryAddress: 'Jl. Melati 2',
      deliveryInstructions: 'Leave at reception',
    })
  })

  it('atomically finalizes an approved edit and sends verified data back to Finance', () => {
    useOrdersStore.setState({
      orders: [
        makeOrder({
          orderNumber: 'A',
          status: 'delivered',
          editUnlocked: true,
          financeVerified: true,
          financeVerifiedBy: 'Finance A',
          financeVerifiedAt: '2026-07-11T10:00:00.000Z',
        }),
      ],
    })

    const result = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: { name: 'Admin A', role: 'admin' },
      patch: { orderNote: 'Corrected note' },
    })

    expect(result).toMatchObject({
      allowed: true,
      sentBackForReverification: true,
    })
    expect(useOrdersStore.getState().orders[0]).toMatchObject({
      orderNote: 'Corrected note',
      editUnlocked: false,
      financeVerified: false,
    })
  })

  it('rejects a direct Admin edit on a finished locked order', () => {
    useOrdersStore.setState({
      orders: [makeOrder({ orderNumber: 'A', status: 'delivered' })],
    })

    const result = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: { name: 'Admin A', role: 'admin' },
      patch: { internalNote: 'Should not save' },
    })

    expect(result.allowed).toBe(false)
    expect(useOrdersStore.getState().orders[0].internalNote).toBeUndefined()
  })

  it('stores a stable customer id and immutable contact snapshot on creation', () => {
    const order = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerId: 'cust-123',
      customerSnapshot: {
        name: 'Customer One',
        phone: '08123456789',
        email: 'one@example.com',
      },
      customerName: 'Customer One',
      orderType: 'admin_created',
      fulfillmentType: 'pickup',
      depositAmount: 0,
      notes: null,
      totalIdr: 100_000,
    })

    expect(order).toMatchObject({
      customerId: 'cust-123',
      customerSnapshot: {
        name: 'Customer One',
        phone: '08123456789',
        email: 'one@example.com',
      },
    })
  })
})
