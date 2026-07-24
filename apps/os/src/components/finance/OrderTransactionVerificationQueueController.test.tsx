import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { useOrderTransactionVerificationQueueController } from './OrderTransactionVerificationQueueController'

const completedAt = new Date().toISOString()
const orders = [
  makeOrder({
    orderNumber: 'KDM-SEARCH-1',
    customerName: 'Alya Putri',
    branch: 'Kedamaian',
    status: 'picked_up',
    completedAt,
    financeVerified: false,
  }),
  makeOrder({
    orderNumber: 'KDM-SEARCH-2',
    customerName: 'Bima Santoso',
    branch: 'Kedamaian',
    status: 'picked_up',
    completedAt,
    financeVerified: false,
  }),
]

describe('Payment Verification shared search', () => {
  it('filters the queue using the query owned by the app shell', () => {
    const { result } = renderHook(() => useOrderTransactionVerificationQueueController({
      orders,
      canVerify: true,
      canResolveRequest: true,
      actorName: 'Finance',
      userRole: 'finance',
      searchQuery: 'Alya',
      onSearchQueryChange: () => undefined,
    }))

    expect(result.current.queueRows.map((row) => row.order.orderNumber)).toEqual(['KDM-SEARCH-1'])
    expect(result.current.filteredCount).toBe(1)
  })
})
