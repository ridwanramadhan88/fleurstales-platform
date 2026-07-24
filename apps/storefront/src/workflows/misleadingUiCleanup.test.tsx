import { render, screen, fireEvent } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: /finished/i })).toBeDisabled()
    expect(screen.getByText(/complete payment before marking this order as picked up/i)).toBeInTheDocument()
  })

  it('does not render low-stock UI while inventory is disabled', () => {
    render(<OverviewCards ordersToday="0" ordersHelper="0 vs yesterday" ordersTone="success" revenueToday="Rp 0" revenueHelper="No data" revenueTone="success" atRiskCount="0" atRiskHelper="All on track" atRiskTone="success" lowStockCount="9" lowStockHelper="Review inventory" lowStockTone="danger" inventoryEnabled={false} />)
    expect(screen.queryByText('Low stock alerts')).not.toBeInTheDocument()
  })

  it('expands assigned florist orders in place instead of navigating to a blocked workspace', () => {
    useUserStore.setState({ employeeId: 'florist-1', role: 'florist', name: 'Florist' })
    useOrdersStore.setState({
      orders: Array.from({ length: 5 }, (_, index) => ({
        ...baseOrder,
        id: `order-${index}`,
        orderNumber: `ORD-${index}`,
        floristAssignedEmployeeId: 'florist-1',
        status: 'processing',
      })) as OrderTableRow[],
    })

    render(<FloristAssignedOrders onGoToOrders={() => { throw new Error('must not navigate') }} />)
    expect(screen.queryByText('ORD-4')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /view all/i }))
    expect(screen.getByText('ORD-4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument()
  })
})
