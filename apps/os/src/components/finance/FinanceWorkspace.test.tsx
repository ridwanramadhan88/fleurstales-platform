import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { makeFinanceTransaction } from '../../test/factories/financeTransaction'
import { useOrdersStore } from '../../store/ordersStore'
import { useFinanceStore } from '../../store/financeStore'
import { usePayrollStore } from '../../store/payrollStore'
import { useOrderRuntimeStore } from '../../store/orderRuntimeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { DEFAULT_OWNER_SETTINGS } from '../../domain/settings/defaultOwnerSettings'
import { DEFAULT_ACTION_PERMISSIONS } from '../../config/actionPermissions'
import type { FinanceWorkspaceModule } from '../../domain/financeWorkspaceDomain'
import type { OrderTableRow } from '../../types/orders'
import { FinanceWorkspace } from './FinanceWorkspace'
import { useFinanceUiStore } from './financeUiStore'

vi.mock('../../data/financePeriods', () => ({
  getFinancePeriods: vi.fn(async () => []),
  getFinancePeriodActions: vi.fn(async () => []),
  setFinancePeriodStatus: vi.fn(async () => undefined),
  subscribeFinancePeriodActionsChanged: vi.fn(() => () => undefined),
}))
vi.mock('../../data/financeReport', () => ({
  fetchFinanceReportLedger: vi.fn(async () => ({ transactions: [], customCategories: [], categoryOverrides: [] })),
}))
vi.mock('../../data/inventorySupabase', () => ({
  fetchInventoryPurchases: vi.fn(async () => []),
  decideInventoryPurchase: vi.fn(async () => ({ alreadyDecided: false })),
}))

const toReconcile = makeOrder({ orderNumber: 'KDM-RC-001', customerName: 'Ani', status: 'delivered', paymentStatus: 'paid', paidAmountIdr: 250_000, totalIdr: 250_000 })
const refundOrder = makeOrder({
  orderNumber: 'KDM-REF-001',
  customerName: 'Budi',
  status: 'delivered',
  paymentStatus: 'refund_pending',
  paymentMethod: 'cash',
  paidAmountIdr: 250_000,
  refundAmountIdr: 250_000,
  refundReason: 'Duplicate payment',
  refundInitiatedBy: 'Finance',
  refundInitiatedAt: '2026-11-10T10:00:00.000Z',
})

const Harness = ({ initial = 'tasks', orders }: { initial?: FinanceWorkspaceModule; orders?: OrderTableRow[] }) => {
  const [module, setModule] = useState<FinanceWorkspaceModule>(initial)
  return (
    <FinanceWorkspace
      activeModule={module}
      onChangeModule={setModule}
      orders={orders ?? useOrdersStore.getState().orders}
      branches={['Kedamaian', 'Pahoman']}
      searchQuery=""
      onOpenOrder={vi.fn()}
    />
  )
}

describe('FinanceWorkspace', () => {
  beforeEach(() => {
    useUiLanguage.setState({ language: 'id' })
    useSettingsStore.setState({
      ...structuredClone(DEFAULT_OWNER_SETTINGS),
      actionPermissions: structuredClone(DEFAULT_ACTION_PERMISSIONS),
      settingsHasUnsavedChanges: false,
    })
    useUserStore.setState({ role: 'finance', name: 'Finance', employeeId: 'emp-dewi' })
    useOrdersStore.setState({ orders: [toReconcile, refundOrder] })
    useOrderRuntimeStore.setState({ activities: {} })
    useFinanceStore.setState({
      transactions: [makeFinanceTransaction({
        id: 'pay-rc-001', source: 'order_payment', entryMode: 'automatic', orderNumber: 'KDM-RC-001', amount: 250_000,
        transactionDate: new Date().toISOString(),
      })],
      customCategories: [],
      categoryOverrides: [],
    })
    usePayrollStore.setState({ payrollProposals: [] })
    useFinanceUiStore.getState().reset()
  })

  it('shows four tabs with the open work counted on Tasks', () => {
    render(<Harness />)
    const tabs = screen.getByRole('tablist', { name: 'Keuangan' })
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Tugas 2', 'Kas & Transaksi', 'Penggajian', 'Laporan',
    ])
    expect(screen.getByRole('region', { name: 'Pembayaran untuk dicocokkan' })).toHaveTextContent('KDM-RC-001 · Ani')
    expect(screen.getByRole('region', { name: 'Pengembalian dana untuk dibayar' })).toHaveTextContent('Duplicate payment')
  })

  it('reconciles a payment with one tap', async () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByRole('region', { name: 'Pembayaran untuk dicocokkan' })).getByRole('button', { name: 'Cocok' }))
    await waitFor(() => expect(useOrdersStore.getState().orders.find((order) => order.orderNumber === 'KDM-RC-001')?.financeVerified).toBe(true))
  })

  it('completes a refund from the chosen account', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Selesaikan' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Uang sudah dikembalikan?' })
    expect(within(dialog).getByLabelText('Refund account')).toHaveValue('cash:main')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Selesaikan pengembalian dana' }))
    await waitFor(() => expect(useOrdersStore.getState().orders.find((order) => order.orderNumber === 'KDM-REF-001')).toMatchObject({
      paymentStatus: 'refunded',
      refundCompletedBy: 'Finance',
    }))
    expect(useOrderRuntimeStore.getState().activities['KDM-REF-001']?.[0]?.description).toBe('Refund completed by Finance')
  })

  it('cancels a refund from inside the refund dialog', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Selesaikan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Batalkan pengembalian dana ini' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Batalkan pengembalian dana ini?' })
    fireEvent.change(within(dialog).getByLabelText('Cancel refund reason'), { target: { value: 'Pelanggan jadi ambil pesanan' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Batalkan pengembalian dana' }))
    await waitFor(() => expect(useOrdersStore.getState().orders.find((order) => order.orderNumber === 'KDM-REF-001')?.paymentStatus).not.toBe('refund_pending'))
  })

  it('keeps the refund dialog open with the reason when the refund is stale', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Selesaikan' }))
    useOrdersStore.setState({ orders: [toReconcile, { ...refundOrder, paymentStatus: 'refunded' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Selesaikan pengembalian dana' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a pending refund can be completed.')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('lists refunds read-only when managing refunds is switched off', () => {
    useSettingsStore.setState((state) => ({
      actionPermissions: { ...state.actionPermissions, finance: { ...state.actionPermissions.finance, 'finance.approve_refund': false } },
    }))
    render(<Harness />)
    expect(screen.getByText(/Duplicate payment/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Selesaikan' })).not.toBeInTheDocument()
  })

  it('says so when nothing is waiting', () => {
    useOrdersStore.setState({ orders: [] })
    useFinanceStore.setState({ transactions: [] })
    render(<Harness orders={[]} />)
    expect(screen.getByText('Semua beres.')).toBeInTheDocument()
  })

  it('shows posted order payments in the month ledger with their account', () => {
    useFinanceStore.setState((state) => ({
      transactions: [
        ...state.transactions,
        makeFinanceTransaction({ id: 'old', name: 'Order payment · KDM-OLD', source: 'order_payment', entryMode: 'automatic', accountId: 'legacy:unassigned', transactionDate: new Date().toISOString() }),
      ],
    }))
    render(<Harness initial="cash" />)
    expect(screen.getByRole('button', { name: 'Catat' })).toBeInTheDocument()
    const ledger = screen.getByRole('list', { name: 'Buku kas' })
    expect(within(ledger).getByText('Order payment · KDM-OLD')).toBeInTheDocument()
    expect(ledger).toHaveTextContent('Belum ada rekening (lama)')
  })

  it('opens the ledger filtered to unassigned rows from Tasks', () => {
    useFinanceStore.setState((state) => ({
      transactions: [...state.transactions, makeFinanceTransaction({ id: 'legacy', name: 'Sewa lama', accountId: undefined, transactionDate: '2025-01-05T12:00:00+07:00' })],
    }))
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /1 transaksi lama belum ada rekening/ }))
    expect(screen.getByRole('button', { name: 'Hapus filter rekening' })).toBeInTheDocument()
    expect(screen.getByText('Semua bulan')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Buku kas' })).getByText('Sewa lama')).toBeInTheDocument()
  })

  it('hides recording and settings without the create capability', () => {
    useSettingsStore.setState((state) => ({
      actionPermissions: { ...state.actionPermissions, finance: { ...state.actionPermissions.finance, 'finance.create_ledger_entry': false } },
    }))
    render(<Harness initial="cash" />)
    expect(screen.queryByRole('button', { name: /^Catat/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pengaturan keuangan' })).not.toBeInTheDocument()
  })
})
