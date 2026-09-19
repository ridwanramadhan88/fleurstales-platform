import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CartDrawerViewModel } from './CartDrawerController'
import { CartStep } from './CartDrawerCartStep'

const makeViewModel = (
  overrides: Partial<CartDrawerViewModel> = {},
): CartDrawerViewModel =>
  ({
    lines: [
      {
        lineId: 'line-1',
        productId: 'product-1',
        name: 'Classic Bouquet',
        unitPriceIdr: 150_000,
        quantity: 2,
      },
    ],
    formatter: new Intl.NumberFormat('id-ID'),
    itemsTotalIdr: 300_000,
    itemCount: 2,
    cartIssues: [],
    cartHasUnavailableItems: false,
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    setStep: vi.fn(),
    onStartShopping: vi.fn(),
    ...overrides,
  }) as CartDrawerViewModel

describe('CartStep', () => {
  it('updates quantities and continues to checkout', async () => {
    const user = userEvent.setup()
    const viewModel = makeViewModel()
    render(<CartStep {...viewModel} />)

    await user.click(screen.getByRole('button', { name: 'Increase quantity for Classic Bouquet' }))
    await user.click(screen.getByRole('button', { name: 'Decrease quantity for Classic Bouquet' }))
    await user.click(screen.getByRole('button', { name: /^Continue$/i }))

    expect(viewModel.onIncrement).toHaveBeenCalledWith('line-1')
    expect(viewModel.onDecrement).toHaveBeenCalledWith('line-1')
    expect(viewModel.setStep).toHaveBeenCalledWith('details')
  })

  it('blocks checkout and explains a stale Catalog item', () => {
    render(
      <CartStep
        {...makeViewModel({
          cartIssues: [{ lineId: 'line-1', code: 'variant_unavailable', message: 'This product option is no longer available.' }],
          cartHasUnavailableItems: true,
        })}
      />,
    )

    expect(screen.getByText('This product option is no longer available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Continue$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase quantity for Classic Bouquet' })).toBeDisabled()
  })

  it('shows a clean shopping action when the cart is empty', async () => {
    const user = userEvent.setup()
    const viewModel = makeViewModel({ lines: [], itemsTotalIdr: 0, itemCount: 0 })
    render(<CartStep {...viewModel} />)

    expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument()
    expect(screen.queryByText('Subtotal')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Continue$/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Start shopping$/i }))
    expect(viewModel.onStartShopping).toHaveBeenCalledOnce()
  })

  it('labels quantity one as removal for screen readers', () => {
    render(<CartStep {...makeViewModel({
      lines: [{ lineId: 'line-1', productId: 'product-1', name: 'Classic Bouquet', unitPriceIdr: 150_000, quantity: 1 }],
      itemsTotalIdr: 150_000,
      itemCount: 1,
    })} />)

    expect(screen.getByRole('button', { name: 'Remove Classic Bouquet from cart' })).toBeInTheDocument()
  })
})
