import { afterEach, describe, expect, it } from 'vitest'
import { useOrdersStore } from './ordersStore'

const originalState = useOrdersStore.getState()

afterEach(() => {
  useOrdersStore.setState({
    orders: originalState.orders,
    lastSequence: originalState.lastSequence,
  })
})

describe('createOrder — items + legacy field derivation', () => {
  it('single-item internal order: items has one line, legacy fields match it exactly as before', () => {
    const order = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Test Customer',
      orderType: 'walk_in',
      fulfillmentType: 'pickup',
      depositAmount: 0,
      notes: null,
      totalIdr: 200_000,
      productId: 'prod_rose',
      variantId: 'var_large',
      productName: 'Rose Bouquet',
    })

    expect(order.items).toHaveLength(1)
    expect(order.items?.[0]).toMatchObject({
      productId: 'prod_rose',
      variantId: 'var_large',
      productName: 'Rose Bouquet',
      quantity: 1,
      unitPriceIdr: 200_000,
    })
    expect(order.productId).toBe('prod_rose')
    expect(order.variantId).toBe('var_large')
    expect(order.productName).toBe('Rose Bouquet')
  })

  it('custom item with no productName falls back to "Custom order", same as before', () => {
    const order = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Test Customer',
      orderType: 'walk_in',
      fulfillmentType: 'pickup',
      depositAmount: 0,
      notes: null,
      totalIdr: 90_000,
    })

    expect(order.productName).toBe('Custom order')
    expect(order.items?.[0].productName).toBe('Custom order')
    expect(order.productId).toBeUndefined()
  })

  it('pre-built multi-line items (storefront path): productId/productName follow the multi-line rule', () => {
    const order = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Storefront Customer',
      orderType: 'admin_created',
      fulfillmentType: 'delivery',
      depositAmount: 0,
      notes: null,
      totalIdr: 300_000,
      source: 'customer_app',
      items: [
        { id: 'line_a', productId: 'prod_a', productName: 'Tulips', quantity: 2, unitPriceIdr: 100_000 },
        { id: 'line_b', productId: 'prod_b', productName: 'Vase', quantity: 1, unitPriceIdr: 100_000 },
      ],
      productId: undefined,
      productName: 'Tulips +1 more',
    })

    expect(order.items).toHaveLength(2)
    expect(order.items?.[1].quantity).toBe(1)
    // Multi-line: legacy productId is undefined (matches pre-migration behavior).
    expect(order.productId).toBeUndefined()
    // productName is the caller-supplied summary string, not derived from items.
    expect(order.productName).toBe('Tulips +1 more')
  })

  it('pre-built single-line items (storefront path): productId derives from that one line', () => {
    const order = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Storefront Customer',
      orderType: 'admin_created',
      fulfillmentType: 'pickup',
      depositAmount: 0,
      notes: null,
      totalIdr: 120_000,
      source: 'customer_app',
      items: [
        { id: 'line_a', productId: 'prod_a', productName: 'Tulips', quantity: 3, unitPriceIdr: 40_000 },
      ],
      productId: 'prod_a',
      productName: undefined,
    })

    expect(order.productId).toBe('prod_a')
    expect(order.productName).toBeUndefined()
    expect(order.items?.[0].quantity).toBe(3)
  })
})
