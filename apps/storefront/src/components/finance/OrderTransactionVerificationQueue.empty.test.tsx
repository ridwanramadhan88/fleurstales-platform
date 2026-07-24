import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderTransactionVerificationQueueContainer } from './OrderTransactionVerificationQueueContainer'

describe('Payment Verification empty states', () => {
  it('keeps the page visible for an Admin with read-only access and no orders', () => {
    render(
      <OrderTransactionVerificationQueueContainer
        orders={[]}
        canVerify={false}
        canResolveRequest={false}
        actorName="Admin"
        userRole="admin"
        searchQuery=""
        onSearchQueryChange={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Payment Verification' })).toBeInTheDocument()
    expect(screen.getByText('No completed orders in this view')).toBeInTheDocument()
    expect(screen.getByText(/Finance or Owner handles verification/)).toBeInTheDocument()
  })
})
