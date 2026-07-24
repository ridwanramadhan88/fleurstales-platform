import { describe, expect, it } from 'vitest'
import { makeCatalogProduct, makeVariant } from '../../test/factories/catalogProduct'
import { initialNewOrderValues } from './useNewOrderForm'
import { useNewOrderPricing } from './useNewOrderPricing'

describe('useNewOrderPricing', () => {
  it('prices a catalog item at the selected product\'s display price, with no delivery fee for pickup', () => {
    const product = makeCatalogProduct({
      id: 'p1',
      variants: [makeVariant({ price: 200_000 })],
    })

    const result = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'p1',
        fulfillmentType: 'pickup',
      },
      catalogProducts: [product],
    })

    expect(result.selectedCatalogProduct?.id).toBe('p1')
    expect(result.estimatedOrderTotalIdr).toBe(200_000)
    expect(result.depositValueForReview).toBe(0)
  })

  it('adds the delivery fee on top of the item price for delivery orders', () => {
    const product = makeCatalogProduct({
      id: 'p1',
      variants: [makeVariant({ price: 200_000 })],
    })

    const result = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'p1',
        fulfillmentType: 'delivery',
        deliveryFee: '25.000',
      },
      catalogProducts: [product],
    })

    expect(result.estimatedOrderTotalIdr).toBe(225_000)
  })

  it('ignores any delivery fee value when fulfillment is pickup', () => {
    const product = makeCatalogProduct({ id: 'p1', variants: [makeVariant({ price: 200_000 })] })

    const result = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'p1',
        fulfillmentType: 'pickup',
        deliveryFee: '25.000',
      },
      catalogProducts: [product],
    })

    expect(result.estimatedOrderTotalIdr).toBe(200_000)
  })

  it('prices a custom item from the sanitized custom price field', () => {
    const result = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'custom',
        orderItemCustomPrice: '350.000',
        fulfillmentType: 'pickup',
      },
      catalogProducts: [],
    })

    expect(result.selectedCatalogProduct).toBeNull()
    expect(result.estimatedOrderTotalIdr).toBe(350_000)
  })

  it('falls back to a 0 item price when no catalog product matches the selected id', () => {
    const result = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'does_not_exist',
        fulfillmentType: 'pickup',
      },
      catalogProducts: [makeCatalogProduct({ id: 'p1' })],
    })

    expect(result.selectedCatalogProduct).toBeNull()
    expect(result.estimatedOrderTotalIdr).toBe(0)
  })

  it('uses the lowest active variant price when multiple variants exist', () => {
    const product = makeCatalogProduct({
      id: 'p1',
      variants: [
        makeVariant({ id: 'v1', price: 300_000, status: 'active' }),
        makeVariant({ id: 'v2', price: 150_000, status: 'active' }),
        makeVariant({ id: 'v3', price: 50_000, status: 'inactive' }),
      ],
    })

    const result = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'p1',
        fulfillmentType: 'pickup',
      },
      catalogProducts: [product],
    })

    // Inactive variant (50,000) is excluded; cheapest active variant wins.
    expect(result.estimatedOrderTotalIdr).toBe(150_000)
  })

  it('computes the deposit only when payment status is partial', () => {
    const product = makeCatalogProduct({ id: 'p1', variants: [makeVariant({ price: 200_000 })] })

    const partial = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'p1',
        fulfillmentType: 'pickup',
        paymentStatus: 'partial',
        depositAmount: '75.000',
      },
      catalogProducts: [product],
    })
    expect(partial.depositValueForReview).toBe(75_000)

    const paid = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'p1',
        fulfillmentType: 'pickup',
        paymentStatus: 'paid',
        depositAmount: '75.000',
      },
      catalogProducts: [product],
    })
    expect(paid.depositValueForReview).toBe(0)
  })

  it('builds catalog product options labelled with formatted IDR price', () => {
    const product = makeCatalogProduct({
      id: 'p1',
      name: 'Rose Bouquet',
      variants: [makeVariant({ price: 150_000 })],
    })

    const result = useNewOrderPricing({
      values: initialNewOrderValues,
      catalogProducts: [product],
    })

    expect(result.catalogProductOptions).toEqual([
      { id: 'p1', label: 'Rose Bouquet · Rp 150.000' },
    ])
  })
  it('applies a valid VIP voucher to the order total', () => {
    const product = makeCatalogProduct({ id: 'p1', variants: [makeVariant({ price: 200_000 })] })

    const result = useNewOrderPricing({
      values: {
        ...initialNewOrderValues,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'p1',
        fulfillmentType: 'pickup',
        promoCode: 'VIP10',
      },
      catalogProducts: [product],
      vouchers: [{
        id: 'voucher-vip10',
        code: 'VIP10',
        percentOff: 10,
        eligibility: 'vip',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
      voucherCustomer: { id: 'customer-vip', tags: ['VIP'] },
    })

    expect(result.voucherDiscountIdr).toBe(20_000)
    expect(result.estimatedOrderTotalIdr).toBe(180_000)
  })

})
