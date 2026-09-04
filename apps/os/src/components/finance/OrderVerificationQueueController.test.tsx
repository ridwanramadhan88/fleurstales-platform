import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { useFinanceStore } from '../../store/financeStore'
import { useOrderVerificationQueueController } from './OrderVerificationQueueController'

const paymentConfirmedAt = new Date().toISOString()
const orders = [
  makeOrder({
    orderNumber: 'KDM-SEARCH-1',
    customerName: 'Alya Putri',
    branch: 'Kedamaian',
    status: 'processing',
    paymentStatus: 'paid',
    paidAmountIdr: 200_000,
  }),
  makeOrder({
    orderNumber: 'KDM-SEARCH-2',
    customerName: 'Bima Santoso',
    branch: 'Kedamaian',
    status: 'picked_up',
    paymentStatus: 'paid',
    paidAmountIdr: 300_000,
  }),
]

describe('Order Reconciliation shared search', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      transactions: [
        {
          id: 'txn-search-1', type: 'income', category: 'order_payment', branch: 'Kedamaian',
          amount: 200_000, method: 'transfer', status: 'verified', source: 'order_payment',
          orderNumber: 'KDM-SEARCH-1', accountId: 'bank:bca', transactionDate: paymentConfirmedAt,
          description: 'Order payment · KDM-SEARCH-1', actor: 'Admin', createdAt: paymentConfirmedAt, updatedAt: paymentConfirmedAt,
        },
        {
          id: 'txn-search-2', type: 'income', category: 'order_payment', branch: 'Kedamaian',
          amount: 300_000, method: 'transfer', status: 'verified', source: 'order_payment',
          orderNumber: 'KDM-SEARCH-2', accountId: 'bank:bca', transactionDate: paymentConfirmedAt,
          description: 'Order payment · KDM-SEARCH-2', actor: 'Admin', createdAt: paymentConfirmedAt, updatedAt: paymentConfirmedAt,
        },
      ],
    })
  })

  it('filters already-posted payment rows using the query owned by the app shell', () => {
    const { result } = renderHook(() => useOrderVerificationQueueController({
      orders,
      canVerify: false,
      canResolveRequest: true,
      actorName: 'Finance',
      userRole: 'finance',
      searchQuery: 'Alya',
      onSearchQueryChange: () => undefined,
    }))

    expect(result.current.queueRows.map((row) => row.order.orderNumber)).toEqual(['KDM-SEARCH-1'])
    expect(result.current.queueRows[0]?.status).toBe('in_progress')
    expect(result.current.filteredCount).toBe(1)
  })
})