import { render, screen, waitFor } from '@testing-library/react'
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
  it('centers the current mobile stage without creating a scroll container', async () => {
    const { rerender } = render(
      <OrderProgressStepper options={options} currentIndex={0} />,
    )
    const viewport = screen.getByLabelText('Order progress')
    const track = viewport.querySelector<HTMLElement>('[data-progress-track]')
    const stages = viewport.querySelectorAll<HTMLElement>('[data-stage-index]')

    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 320 },
    })
    Object.defineProperties(track, {
      offsetWidth: { configurable: true, value: 480 },
    })
    Object.defineProperties(stages[2], {
      offsetLeft: { configurable: true, value: 192 },
      offsetWidth: { configurable: true, value: 96 },
    })

    rerender(<OrderProgressStepper options={options} currentIndex={2} />)

    expect(viewport).toHaveClass('touch-pan-y')
    expect(viewport).not.toHaveClass('overflow-x-hidden', 'overflow-x-auto')
    await waitFor(() => {
      expect(track).toHaveStyle({ transform: 'translate3d(-80px, 0, 0)' })
    })
    expect(track?.parentElement).toHaveClass('[clip-path:inset(-0.75rem_0_-2rem_0)]')
    expect(screen.getByText('Processing').closest('[data-stage-index]')).toHaveAttribute(
      'aria-current',
      'step',
    )

    Object.defineProperties(stages[4], {
      offsetLeft: { configurable: true, value: 384 },
      offsetWidth: { configurable: true, value: 96 },
    })
    rerender(<OrderProgressStepper options={options} currentIndex={4} />)

    await waitFor(() => {
      expect(track).toHaveStyle({ transform: 'translate3d(-160px, 0, 0)' })
    })
    expect(screen.getByText('Delivered').closest('[data-stage-index]')).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('fits the complete lifecycle in compact mode without clipping or masking stages', () => {
    render(
      <OrderProgressStepper options={options} currentIndex={2} compact />,
    )

    const viewport = screen.getByLabelText('Order progress')
    const track = viewport.querySelector<HTMLElement>('[data-progress-track]')
    const mask = viewport.querySelector<HTMLElement>('[data-progress-mask]')

    expect(viewport).toHaveAttribute('data-progress-mode', 'full-track-fit')
    expect(viewport).not.toHaveClass('overflow-hidden')
    expect(viewport).toHaveAttribute('data-progress-mask-before', 'false')
    expect(viewport).toHaveAttribute('data-progress-mask-after', 'false')
    expect(track).toHaveClass('w-full')
    expect(track).toHaveStyle({ transform: 'translate3d(0, 0, 0)' })
    expect(mask).toHaveClass('overflow-visible')
    expect(mask?.style.maskImage).toBe('')

    for (const option of options) {
      expect(screen.getByText(option.label)).toBeInTheDocument()
    }
    const current = screen.getByText('Processing').closest('[data-stage-index]')
    expect(current).toHaveAttribute('aria-current', 'step')
    const currentNode = current?.children[1]
    expect(currentNode?.className).toContain('animate-[pulse_6s_ease-in-out_infinite]')
  })
})
