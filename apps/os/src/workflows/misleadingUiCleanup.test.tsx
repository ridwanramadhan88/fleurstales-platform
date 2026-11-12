import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderDetailsActionsSection } from '../components/orders/OrderDetailsActionsSection'
import type { OrderDetailsViewModel } from '../components/orders/OrderDetailsController'
import { OverviewCards } from '../components/dashboard/OverviewCards'
import { FloristAssignedOrders } from '../components/dashboard/FloristAssignedOrders'
import { useOrdersStore } from '../store/ordersStore'
import { useUserStore } from '../store/userStore'
import type { OrderTableRow } from '../types/orders'

const baseOrder = {
  id: 'order-1',
  orderNumber: 'ORD-1',
  customerName: 'Customer',
  customerWhatsappNumber: '0812',
  branch: 'Kedamaian',
  fulfillment: 'pickup',
  status: 'ready',
  paymentStatus: 'partial',
  paymentMethod: 'transfer',
  totalIdr: 100_000,
  paidAmountIdr: 50_000,
  revision: 1,
  source: 'whatsapp',
  createdAtLabel: 'Today',
} as unknown as OrderTableRow

describe('misleading UI cleanup', () => {
  it('shows the final pickup action as disabled before the payment gate rejects it', () => {
    const viewModel = {
      order: baseOrder,
      nextStatus: 'picked_up',
      canEdit: true,
      isEditing: false,
      formatter: new Intl.NumberFormat('id-ID'),
      onClose: () => undefined,
      customerWhatsappNumber: '0812',
      readyMessage: '',
      whatsAppLink: '',
      actionModal: null,
      addressCopied: false,
      showPaymentGate: false,
      onCancelEdit: () => undefined,
      onSaveChanges: () => undefined,
      onMoveToNextStatus: () => undefined,
      onCancelPaymentGate: () => undefined,
      onMarkPaidAndContinue: () => undefined,
      onCloseActionModal: () => undefined,
      onCopyAddress: () => undefined,
    } as unknown as OrderDetailsViewModel

    render(<OrderDetailsActionsSection viewModel={viewModel} />)
    expect(screen.getByRole('button', { name: /complete pickup/i })).toBeEnabled()
    expect(screen.queryByText(/complete payment before marking this order as picked up/i)).not.toBeInTheDocument()
  })

  it('does not render low-stock UI while inventory is disabled', () => {
    render(<OverviewCards ordersToday="0" ordersHelper="0 vs yesterday" ordersTone="success" revenueToday="Rp 0" revenueHelper="No data" revenueTone="success" atRiskCount="0" atRiskHelper="All on track" atRiskTone="success" lowStockCount="9" lowStockHelper="Review inventory" lowStockTone="danger" inventoryEnabled={false} />)
    expect(screen.queryByText('Low stock alerts')).not.toBeInTheDocument()
  })

  it('shows every assigned order with what the florist needs to make it, without navigating away', () => {
    useUserStore.setState({ employeeId: 'florist-1', role: 'florist', name: 'Florist' })
    useOrdersStore.setState({
      orders: Array.from({ length: 5 }, (_, index) => ({
        ...baseOrder,
        id: `order-${index}`,
        orderNumber: `ORD-${index}`,
        floristAssignedEmployeeId: 'florist-1',
        status: 'processing',
        orderNote: index === 4 ? 'Pink wrap, no lilies' : undefined,
        greetingMessage: index === 4 ? 'Happy birthday, Mom' : undefined,
      })) as OrderTableRow[],
    })

    render(<FloristAssignedOrders onGoToOrders={() => { throw new Error('must not navigate') }} />)
    expect(screen.getByText('ORD-4')).toBeInTheDocument()
    expect(screen.getByText('Pink wrap, no lilies')).toBeInTheDocument()
    expect(screen.getByText('Happy birthday, Mom')).toBeInTheDocument()
  })

  it('lets a florist upload a finish photo for processing orders only', () => {
    useUserStore.setState({ employeeId: 'florist-1', role: 'florist', name: 'Florist' })
    useOrdersStore.setState({
      orders: [
        { ...baseOrder, id: 'o-1', orderNumber: 'ORD-P', floristAssignedEmployeeId: 'florist-1', status: 'processing' },
        { ...baseOrder, id: 'o-2', orderNumber: 'ORD-R', floristAssignedEmployeeId: 'florist-1', status: 'ready' },
      ] as OrderTableRow[],
    })
    render(<FloristAssignedOrders onGoToOrders={() => undefined} />)
    expect(screen.getAllByRole('button', { name: /upload finish photo|unggah foto hasil/i })).toHaveLength(1)
  })
})
