import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderVerificationQueueContainer } from './OrderVerificationQueueContainer'

describe('Order Reconciliation empty states', () => {
  it('keeps the Finance page visible with no paid orders', () => {
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
    expect(screen.getByText('No paid orders in this view')).toBeInTheDocument()
    expect(screen.getByText(/Orders appear after Admin confirms full payment/)).toBeInTheDocument()
  })
})