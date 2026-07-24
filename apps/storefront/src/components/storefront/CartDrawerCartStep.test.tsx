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
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    setStep: vi.fn(),
    ...overrides,
  }) as CartDrawerViewModel

describe('CartStep', () => {
  it('updates quantities and continues to checkout', async () => {
    const user = userEvent.setup()
    const viewModel = makeViewModel()
    render(<CartStep {...viewModel} />)

    await user.click(screen.getByRole('button', { name: 'Add one more Classic Bouquet' }))
    await user.click(screen.getByRole('button', { name: 'Remove one Classic Bouquet' }))
    await user.click(screen.getByRole('button', { name: /^Checkout$/i }))

    expect(viewModel.onIncrement).toHaveBeenCalledWith('line-1')
    expect(viewModel.onDecrement).toHaveBeenCalledWith('line-1')
    expect(viewModel.setStep).toHaveBeenCalledWith('details')
  })

  it('disables checkout when the cart is empty', () => {
    render(
      <CartStep
        {...makeViewModel({ lines: [], itemsTotalIdr: 0, itemCount: 0 })}
      />,
    )

    expect(screen.getByRole('button', { name: /^Checkout$/i })).toBeDisabled()
    expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument()
  })
})
