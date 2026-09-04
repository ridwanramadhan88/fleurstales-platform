import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from '../../store/financeStore'
import { TransactionLedgerContainer } from './TransactionLedgerContainer'

describe('posted order transaction flow', () => {
  beforeEach(() => {
    useFinanceStore.setState({ transactions: [], customCategories: [], categoryOverrides: [] })
  })

  it('keeps an authoritative posted order transaction visible in the Orders ledger', () => {
    const confirmedAt = new Date().toISOString()
    const first = useFinanceStore.getState().recordOrderPayment({
      orderNumber: 'KDM-2026-9001',
      branch: 'Kedamaian',
      amount: 350_000,
      method: 'transfer',
      sourceEventId: 'payment-event-9001',
      idempotencyKey: 'order-payment:KDM-2026-9001',
      actor: 'Admin Sari',
      occurredAt: confirmedAt,
    })
    expect(first.allowed).toBe(true)

    useFinanceStore.setState((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === first.transactionId
          ? { ...transaction, status: 'verified' as const, transactionDate: confirmedAt, accountId: 'legacy:unassigned' }
          : transaction,
      ),
    }))

    const transaction = useFinanceStore.getState().transactions[0]
    expect(transaction).toMatchObject({
      source: 'order_payment',
      status: 'verified',
      transactionDate: confirmedAt,
    })

    render(
      <TransactionLedgerContainer
        transactions={useFinanceStore.getState().transactions}
        canEditManual
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
    const row = screen.getByText('Order payment · KDM-2026-9001').closest('article')
    expect(row).toBeInTheDocument()
    expect(row).toHaveTextContent('Order')
    expect(row).toHaveTextContent('Legacy / unassigned')
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