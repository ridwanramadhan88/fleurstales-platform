import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderVerificationQueueContainer } from './OrderVerificationQueueContainer'

describe('Order Reconciliation empty states', () => {
  it('keeps the Finance page visible with no posted order payments', () => {
    render(
      <OrderVerificationQueueContainer
        orders={[]}
        canVerify={false}
        canResolveRequest={true}
        actorName="Finance"
        userRole="finance"
        searchQuery=""
        onSearchQueryChange={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Order Reconciliation' })).toBeInTheDocument()
    expect(screen.getByText('No payments to reconcile yet')).toBeInTheDocument()
    expect(screen.getByText(/Orders appear here after Admin confirms full payment/)).toBeInTheDocument()
    expect(screen.getByText(/money is already posted at that point/)).toBeInTheDocument()
    expect(screen.queryByText('How reconciliation works')).not.toBeInTheDocument()
  })
})
