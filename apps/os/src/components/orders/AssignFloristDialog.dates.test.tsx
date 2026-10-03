import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { AssignFloristDialog } from './AssignFloristDialog'

describe('Process Order dialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T03:00:00.000Z')) // 10:00 in Jakarta
  })
  afterEach(() => vi.useRealTimers())

  it('shows a human date, not an ISO date', () => {
    const order = makeOrder({ fulfillment: 'pickup', scheduleDate: '2026-10-03', scheduleTime: '14:00', paymentStatus: 'paid', paidAmountIdr: 100000, totalIdr: 100000 } as never)
    render(<AssignFloristDialog order={order} onCancel={vi.fn()} onAssigned={vi.fn()} />)

    expect(screen.getByText('Availability for Today · 14:00')).toBeInTheDocument()
    expect(screen.queryByText(/2026-10-03/)).toBeNull()
  })

  it('stacks the florist count above the "Show all" button on phones', () => {
    const order = makeOrder({ scheduleDate: '2026-10-05', scheduleTime: '10:00' } as never)
    render(<AssignFloristDialog order={order} onCancel={vi.fn()} onAssigned={vi.fn()} />)

    const row = screen.getByText(/recommended · \d+ active/).closest('div')?.parentElement
    expect(row).toHaveClass('flex-col', 'sm:flex-row')
  })
})
