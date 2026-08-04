import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceWorkspaceTabs } from './FinanceWorkspaceTabs'

afterEach(cleanup)

describe('FinanceWorkspaceTabs', () => {
  it('renders a single Order Reconciliation header without sensitive module navigation', () => {
    render(
      <FinanceWorkspaceTabs
        modules={['order_verification']}
        activeModule="order_verification"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Order Reconciliation' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Finance modules' })).not.toBeInTheDocument()
    expect(screen.queryByText('Payroll')).not.toBeInTheDocument()
    expect(screen.queryByText('Refunds')).not.toBeInTheDocument()
    expect(screen.queryByText('Transactions')).not.toBeInTheDocument()
  })

  it('lets Finance switch between separate modules', () => {
    const onChange = vi.fn()
    render(
      <FinanceWorkspaceTabs
        modules={['order_verification', 'payroll', 'refunds', 'ledger']}
        activeModule="order_verification"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Payroll/ }))
    expect(onChange).toHaveBeenCalledWith('payroll')
  })
})
