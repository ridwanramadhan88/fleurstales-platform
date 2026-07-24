import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceWorkspaceTabs } from './FinanceWorkspaceTabs'

afterEach(cleanup)

describe('FinanceWorkspaceTabs', () => {
  it('renders a single Payment Verification header without sensitive module navigation', () => {
    render(
      <FinanceWorkspaceTabs
        modules={['collect_orders']}
        activeModule="collect_orders"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Payment Verification' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Finance modules' })).not.toBeInTheDocument()
    expect(screen.queryByText('Payroll')).not.toBeInTheDocument()
    expect(screen.queryByText('Refunds')).not.toBeInTheDocument()
    expect(screen.queryByText('Transactions')).not.toBeInTheDocument()
  })

  it('lets Finance switch between separate modules', () => {
    const onChange = vi.fn()
    render(
      <FinanceWorkspaceTabs
        modules={['collect_orders', 'payroll', 'refunds', 'ledger']}
        activeModule="collect_orders"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Payroll/ }))
    expect(onChange).toHaveBeenCalledWith('payroll')
  })
})
