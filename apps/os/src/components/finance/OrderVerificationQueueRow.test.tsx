import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrderVerificationQueueRow } from './OrderVerificationQueueRow'
import { makeOrder } from '../../test/factories/order'
import type { FinanceQueueRow } from './OrderVerificationQueueController'

const row = (overrides: Partial<FinanceQueueRow> = {}): FinanceQueueRow => ({
  order: makeOrder({ orderNumber: 'KDM-1', customerName: 'Maya', totalIdr: 525_000, paymentStatus: 'partial' } as never),
  status: 'in_progress',
  reconciliationStatus: 'awaiting_review',
  paymentAmountIdr: 250_000,
  paymentMethod: 'transfer',
  accountId: 'cash:main',
  paymentConfirmedAt: '2026-10-03T10:00:00Z',
  transactionId: 'tx-1',
  transactionStatus: 'verified',
  ...overrides,
} as FinanceQueueRow)

describe('reconciliation card (UX audit)', () => {
  it('the main button opens the payment review; the ledger is a quiet link', () => {
    const onOpenOrder = vi.fn()
    const onOpenLedger = vi.fn()
    render(<OrderVerificationQueueRow row={row()} onOpenOrder={onOpenOrder} onOpenLedger={onOpenLedger} />)
    const review = screen.getByRole('button', { name: /Review payment/ })
    expect(review.className).toContain('bg-primary')
    fireEvent.click(review)
    expect(onOpenOrder).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /View in Transactions/ }))
    expect(onOpenLedger).toHaveBeenCalled()
  })

  it('a part-paid order says how much is still open', () => {
    render(<OrderVerificationQueueRow row={row()} onOpenOrder={vi.fn()} onOpenLedger={vi.fn()} />)
    expect(screen.getByText('Received Rp 250.000 of Rp 525.000 · Remaining Rp 275.000')).toBeInTheDocument()
  })

  it('a reconciled payment offers to view, not review', () => {
    render(<OrderVerificationQueueRow row={row({ reconciliationStatus: 'reconciled', paymentAmountIdr: 525_000 })} onOpenOrder={vi.fn()} onOpenLedger={vi.fn()} />)
    expect(screen.getByRole('button', { name: /View review/ }).className).not.toContain('bg-primary')
    expect(screen.queryByText(/Remaining/)).not.toBeInTheDocument()
  })
})
