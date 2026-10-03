import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleFocusNotice } from './RoleFocusNotice'
import { useOrdersStore } from '../../store/ordersStore'
import { useFinanceStore } from '../../store/financeStore'
import { usePayrollStore } from '../../store/payrollStore'
import { makeOrder } from '../../test/factories/order'

const originalOrders = useOrdersStore.getState().orders
const originalTransactions = useFinanceStore.getState().transactions

describe('Finance home card', () => {
  afterEach(() => {
    useOrdersStore.setState({ orders: originalOrders })
    useFinanceStore.setState({ transactions: originalTransactions })
  })

  it('counts orders waiting for reconciliation, not new orders waiting for admin', () => {
    useOrdersStore.setState({
      orders: [
        makeOrder({ orderNumber: 'NEW-1', status: 'pending_verification', financeVerified: false }),
        makeOrder({ orderNumber: 'NEW-2', status: 'pending_verification', financeVerified: false }),
        makeOrder({ orderNumber: 'PAID-1', status: 'delivered', financeVerified: false }),
      ],
    })
    useFinanceStore.setState({
      transactions: [{ id: 't1', status: 'verified', source: 'order_payment', orderNumber: 'PAID-1', accountId: 'cash:main', type: 'income', amount: 1 } as never],
    })
    usePayrollStore.setState({ payrollProposals: [] })
    const onOpenReconciliation = vi.fn()

    render(<RoleFocusNotice userRole="finance" onOpenReconciliation={onOpenReconciliation} />)

    expect(screen.getByText('orders waiting for reconciliation').previousSibling).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: 'Open reconciliation' }))
    expect(onOpenReconciliation).toHaveBeenCalledTimes(1)
  })
})
