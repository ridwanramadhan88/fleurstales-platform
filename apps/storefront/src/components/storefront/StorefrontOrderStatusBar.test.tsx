import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StorefrontOrderStatusBar } from './StorefrontOrderStatusBar'

describe('StorefrontOrderStatusBar', () => {
  it('fits the full delivery lifecycle without a horizontal scroller and slowly pulses the current step', () => {
    render(<StorefrontOrderStatusBar status="processing" fulfillment="delivery" />)

    const statusBar = screen.getByRole('list', { name: 'Status pesanan' })
    expect(statusBar).toHaveClass('grid', 'w-full')
    expect(statusBar).not.toHaveClass('overflow-x-auto', 'overflow-hidden')
    expect(screen.getAllByRole('listitem')).toHaveLength(6)

    const current = screen.getByText('Diproses').closest('li')
    expect(current).toHaveAttribute('aria-current', 'step')
    const currentNode = current?.children[1]
    expect(currentNode?.className).toContain('animate-[pulse_6s_ease-in-out_infinite]')
  })

  it('uses the shorter pickup lifecycle', () => {
    render(<StorefrontOrderStatusBar status="ready" fulfillment="pickup" />)

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('Dikirim')).not.toBeInTheDocument()
  })

  it('shows a compact issue state instead of a misleading progress track', () => {
    render(<StorefrontOrderStatusBar status="cancelled" fulfillment="delivery" />)

    expect(screen.getByText('Pesanan dibatalkan')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Status pesanan' })).not.toBeInTheDocument()
  })
})
