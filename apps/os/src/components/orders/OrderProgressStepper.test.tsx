import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderProgressStepper } from './OrderProgressStepper'

const options = [
  { id: 'pending_verification' as const, label: 'Pending' },
  { id: 'confirmed' as const, label: 'Confirmed' },
  { id: 'processing' as const, label: 'Processing' },
  { id: 'ready' as const, label: 'Ready' },
  { id: 'delivered' as const, label: 'Delivered' },
]

describe('OrderProgressStepper', () => {
  it('prevents manual horizontal scrolling and centers the current mobile stage', () => {
    const { rerender } = render(
      <OrderProgressStepper options={options} currentIndex={0} />,
    )
    const viewport = screen.getByLabelText('Order progress')
    const stages = viewport.querySelectorAll<HTMLElement>('[data-stage-index]')

    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 320 },
      scrollWidth: { configurable: true, value: 480 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    Object.defineProperties(stages[2], {
      offsetLeft: { configurable: true, value: 192 },
      offsetWidth: { configurable: true, value: 96 },
    })

    rerender(<OrderProgressStepper options={options} currentIndex={2} />)

    expect(viewport).toHaveClass('overflow-x-hidden', 'touch-pan-y')
    expect(viewport).not.toHaveClass('overflow-x-auto')
    expect(viewport.scrollLeft).toBe(80)
    expect(screen.getByText('Processing').closest('[data-stage-index]')).toHaveAttribute(
      'aria-current',
      'step',
    )
  })
})
