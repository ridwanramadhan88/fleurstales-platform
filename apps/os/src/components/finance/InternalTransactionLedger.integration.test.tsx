import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from '../../store/financeStore'
import { TransactionLedgerContainer } from './TransactionLedgerContainer'

const actor = { name: 'Dewi', role: 'finance' as const }

const completionIso = () => {
  const date = new Date()
  date.setDate(date.getDate() - 2)
  date.setHours(16, 30, 0, 0)
  return date.toISOString()
}

describe('completed order transaction flow', () => {
  beforeEach(() => {
    useFinanceStore.setState({ transactions: [], customCategories: [], categoryOverrides: [] })
  })

  it('keeps a confirmed order transaction visible in the read-only Orders ledger', () => {
    const completedAt = completionIso()
    const finance = useFinanceStore.getState()
    const first = finance.recordOrderPayment({
      orderNumber: 'KDM-2026-9001',
      branch: 'Kedamaian',
      amount: 350_000,
      method: 'transfer',
      sourceEventId: 'payment-event-9001',
      idempotencyKey: 'order-payment:KDM-2026-9001',
      actor: 'Admin Sari',
      occurredAt: new Date().toISOString(),
    })
    expect(first.allowed).toBe(true)

    const verified = useFinanceStore.getState().verifyOrderTransactions({
      orderNumber: 'KDM-2026-9001',
      actor,
      completedAt,
    })
    expect(verified).toMatchObject({ allowed: true, verifiedCount: 1 })

    const transaction = useFinanceStore.getState().transactions[0]
    expect(transaction).toMatchObject({
      source: 'order_payment',
      status: 'verified',
      transactionDate: completedAt,
      groupType: 'order_day',
      groupKey: completedAt.slice(0, 10),
    })
    expect(transaction.createdAt).not.toBe(completedAt)

    render(
      <TransactionLedgerContainer
        transactions={useFinanceStore.getState().transactions}
        canEditManual
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
    const row = screen.getByText('Order payment · KDM-2026-9001').closest('article')
    expect(row).toBeInTheDocument()
    expect(row).toHaveTextContent('Managed by Order Verification')
    expect(row).toHaveTextContent(new Date(completedAt).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    }))
  })

  it('does not duplicate an order transaction when the same command is replayed', () => {
    const params = {
      orderNumber: 'KDM-2026-9002',
      branch: 'Kedamaian' as const,
      amount: 220_000,
      method: 'cash' as const,
      sourceEventId: 'payment-event-9002',
      idempotencyKey: 'order-payment:KDM-2026-9002',
      actor: 'Admin Sari',
      occurredAt: new Date().toISOString(),
    }
    expect(useFinanceStore.getState().recordOrderPayment(params).allowed).toBe(true)
    expect(useFinanceStore.getState().recordOrderPayment(params)).toMatchObject({ allowed: true, duplicate: true })
    expect(useFinanceStore.getState().transactions).toHaveLength(1)
  })
})
