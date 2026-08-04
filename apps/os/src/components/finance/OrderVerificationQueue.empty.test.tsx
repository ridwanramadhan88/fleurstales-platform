import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderVerificationQueueContainer } from './OrderVerificationQueueContainer'

describe('Order Reconciliation empty states', () => {
  it('keeps the page visible for an Admin with read-only access and no orders', () => {
    render(
      <OrderVerificationQueueContainer
        orders={[]}
        canVerify={false}
        canResolveRequest={false}
        actorName="Admin"
        userRole="admin"
        searchQuery=""
        onSearchQueryChange={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Order Reconciliation' })).toBeInTheDocument()
    expect(screen.getByText('No completed orders in this view')).toBeInTheDocument()
    expect(screen.getByText(/Finance or Owner handles reconciliation/)).toBeInTheDocument()
  })
})
