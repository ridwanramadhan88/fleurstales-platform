import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FinanceQueueRow } from './OrderVerificationQueueController'
import { OrderVerificationQueueRow } from './OrderVerificationQueueRow'

const buildRow = (): FinanceQueueRow => ({
  order: {
    orderNumber: 'FT-TEST-001',
    customerName: 'Test Customer',
    branch: 'Pahoman',
    paymentStatus: 'paid',
    status: 'processing',
  } as FinanceQueueRow['order'],
  status: 'in_progress',
  paymentAmountIdr: 450_000,
  paymentMethod: 'transfer',
  accountId: 'legacy:unassigned',
  paymentConfirmedAt: '2026-09-05T08:00:00.000Z',
  transactionId: 'txn-test-order-payment',
  transactionStatus: 'verified',
})

describe('OrderVerificationQueueRow', () => {
  it('opens the linked Finance evidence sheet from the reconciliation row', () => {
    const onOpen = vi.fn()
    render(<OrderVerificationQueueRow row={buildRow()} onOpen={onOpen} />)

    const row = screen.getByRole('button', { name: 'Open finance evidence for FT-TEST-001' })
    fireEvent.click(row)

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('View evidence')).toBeInTheDocument()
  })
})
