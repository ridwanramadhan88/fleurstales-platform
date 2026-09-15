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
  reconciliationStatus: 'awaiting_review',
  paymentAmountIdr: 450_000,
  paymentMethod: 'transfer',
  accountId: 'legacy:unassigned',
  paymentConfirmedAt: '2026-09-05T08:00:00.000Z',
  transactionId: 'txn-test-order-payment',
  transactionStatus: 'verified',
  transactionCode: 'FIN-TEST-001',
  reference: 'BANK-REF-001',
})

describe('OrderVerificationQueueRow', () => {
  it('links the reconciliation row to its order and exact ledger entry', () => {
    const onOpenOrder = vi.fn()
    const onOpenLedger = vi.fn()
    render(
      <OrderVerificationQueueRow
        row={buildRow()}
        onOpenOrder={onOpenOrder}
        onOpenLedger={onOpenLedger}
      />,
    )

    expect(screen.getByText('Awaiting review')).toBeInTheDocument()
    expect(screen.getByText('FIN-TEST-001')).toBeInTheDocument()
    expect(screen.getByText('BANK-REF-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open order/i }))
    fireEvent.click(screen.getByRole('button', { name: /ledger entry/i }))

    expect(onOpenOrder).toHaveBeenCalledTimes(1)
    expect(onOpenLedger).toHaveBeenCalledTimes(1)
  })
})
