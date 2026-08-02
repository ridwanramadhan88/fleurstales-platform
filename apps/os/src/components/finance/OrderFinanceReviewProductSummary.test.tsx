import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { OrderFinanceReviewProductSummary } from './OrderFinanceReviewProductSummary'

describe('OrderFinanceReviewProductSummary', () => {
  it('shows each ordered product with its photo, variant, SKU, and price totals', () => {
    const order = makeOrder({
      totalIdr: 125_000,
      itemsSubtotalIdr: 110_000,
      deliveryFeeIdr: 15_000,
      items: [{
        id: 'line-pink-lily',
        productId: 'product-pink-lily',
        variantId: 'variant-small',
        productName: 'Pink Lily',
        quantity: 1,
        unitPriceIdr: 110_000,
      }],
    })
    const display = {
      name: 'Pink Lily – Small',
      imageUrl: '/images/pink-lily.jpg',
      variantLabel: 'Small',
      sku: 'BDY-ART-PINK_LIL-SMALL-001',
      isLinkedToCatalog: true,
    }

    render(
      <OrderFinanceReviewProductSummary
        order={order}
        productDisplay={display}
        itemDisplays={{ 'line-pink-lily': display }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Order summary' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Pink Lily' })).toHaveAttribute(
      'src',
      '/images/pink-lily.jpg',
    )
    expect(screen.getByText('Pink Lily')).toBeInTheDocument()
    expect(screen.getByText(/Small · SKU BDY-ART-PINK_LIL-SMALL-001/)).toBeInTheDocument()
    expect(screen.getByText('Delivery fee')).toBeInTheDocument()
    expect(screen.getAllByText('Rp 125.000')).toHaveLength(2)
  })

  it('does not repeat a subtotal and total when there are no adjustments', () => {
    const order = makeOrder({
      totalIdr: 110_000,
      itemsSubtotalIdr: 110_000,
      discountIdr: 0,
      deliveryFeeIdr: 0,
      items: [{
        id: 'line-pink-lily',
        productName: 'Pink Lily',
        quantity: 1,
        unitPriceIdr: 110_000,
      }],
    })
    const display = {
      name: 'Pink Lily',
      imageUrl: '/images/pink-lily.jpg',
      isLinkedToCatalog: true,
    }

    render(
      <OrderFinanceReviewProductSummary
        order={order}
        productDisplay={display}
        itemDisplays={{ 'line-pink-lily': display }}
      />,
    )

    expect(screen.queryByText('Items subtotal')).not.toBeInTheDocument()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
    expect(screen.getAllByText('Rp 110.000')).toHaveLength(2)
  })
})
