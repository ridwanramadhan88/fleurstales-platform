import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import App from '../App'
import { useOrdersStore } from '../store/ordersStore'
import { useUserStore } from '../store/userStore'
import { todayIsoDate, useHrStore } from '../store/hrStore'

const initialOrders = useOrdersStore.getState().orders
const initialSequences = useOrdersStore.getState().lastSequence
const originalConsoleError = console.error
const originalConsoleLog = console.log
const originalConsoleWarn = console.warn

const chooseRole = async (role: 'Owner' | 'Admin') => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Username'), role === 'Admin' ? 'akbar' : role.toLowerCase())
  await user.type(screen.getByLabelText('PIN'), '123456')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('critical application workflows', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      if (String(args[0]).includes('not wrapped in act')) return
      originalConsoleError(...args)
    })
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      if (String(args[0]).includes('width(0) and height(0)')) return
      originalConsoleWarn(...args)
    })
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      if (String(args[0]).includes('New order draft')) return
      originalConsoleLog(...args)
    })
  })

  beforeEach(() => {
    window.localStorage.clear()
    useOrdersStore.setState({
      orders: initialOrders,
      lastSequence: initialSequences,
    })
    useUserStore.setState({ role: 'admin', name: 'Employee', branchId: 'Kedamaian' })
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('signs an owner directly into the cross-branch dashboard', async () => {
    render(<App />)
    await chooseRole('Owner')

    expect(screen.getByText(/Good (morning|afternoon|evening)/i)).toBeInTheDocument()
    expect(useUserStore.getState().role).toBe('owner')
    expect(screen.queryByText('Choose a branch')).not.toBeInTheDocument()
  })

  it('signs in a real admin without a permanent employee branch', async () => {
    render(<App />)
    await chooseRole('Admin')

    expect(screen.getByText(/Good (morning|afternoon|evening)/i)).toBeInTheDocument()
    expect(useUserStore.getState()).toMatchObject({
      role: 'admin',
      employeeId: 'emp-akbar',
      name: 'Akbar',
    })
    expect(useHrStore.getState().employees.find((item) => item.id === 'emp-akbar')?.branch).toBe('')
    expect(['Kedamaian', 'Pahoman', undefined]).toContain(useUserStore.getState().branchId)
  })

  it('protects unsaved new-order work before closing the sheet', async () => {
    render(<App />)
    const user = await chooseRole('Owner')

    const allBranchButtons = screen.queryAllByRole('button', { name: /Branch: All/ })
    if (allBranchButtons.length) {
      await user.click(allBranchButtons[0])
      await user.click(screen.getAllByRole('button', { name: 'Kedamaian' })[0])
    }
    await user.click(screen.getAllByRole('button', { name: 'Orders' })[0])
    await user.click(screen.getAllByRole('button', { name: 'New order' })[0])
    const sheet = screen.getByRole('heading', { name: 'New order' }).closest('div.fixed')
    if (!(sheet instanceof HTMLElement)) throw new Error('New order sheet not found')
    const form = within(sheet)
    const customerName = form.getByPlaceholderText('e.g. Dita Anjani')

    await user.type(customerName, 'Protected draft customer')
    await user.click(form.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('heading', { name: 'Keep this order draft?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue editing' }))
    expect(customerName).toHaveValue('Protected draft customer')

    await user.click(form.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('heading', { name: 'New order' })).not.toBeInTheDocument()
  })

  it('adds a storefront product and opens the cart', async () => {
    render(<App />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Visit online store/i }))
    const addButtons = screen.getAllByRole('button', { name: 'Add' })
    expect(addButtons.length).toBeGreaterThan(0)
    await user.click(addButtons[0])

    await user.click(screen.getByRole('button', { name: 'Cart' }))

    expect(screen.getByRole('heading', { name: 'Your cart' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue to checkout/i })).toBeEnabled()
  })

  it('creates a custom pickup order through review and confirmation', async () => {
    render(<App />)
    const user = await chooseRole('Owner')
    const startingCount = useOrdersStore.getState().orders.length

    const branchButton = screen.queryAllByRole('button', { name: /Branch: All/ })[0]
    if (branchButton) {
      await user.click(branchButton)
      await user.click(screen.getAllByRole('button', { name: 'Kedamaian' })[0])
    }

    await user.click(screen.getAllByRole('button', { name: 'Orders' })[0])
    const newOrderButtons = screen.getAllByRole('button', { name: 'New order' })
    await user.click(newOrderButtons[0])
    const sheet = screen.getByRole('heading', { name: 'New order' }).closest('div.fixed')
    if (!(sheet instanceof HTMLElement)) {
      throw new Error('New order sheet not found')
    }
    const form = within(sheet)

    await user.type(
      form.getByPlaceholderText('e.g. Dita Anjani'),
      'Workflow Customer',
    )
    await user.type(
      form.getByPlaceholderText('e.g. 0812 3456 7890'),
      '081234567890',
    )
    await user.click(form.getByRole('button', { name: 'Custom' }))
    await user.type(form.getByLabelText('Item name'), 'Workflow Bouquet')
    await user.type(form.getByLabelText('Price (IDR)'), '250000')
    await user.click(form.getByRole('button', { name: 'Whatsapp' }))
    await user.click(form.getByRole('button', { name: 'Pickup' }))

    await user.click(form.getByRole('button', { name: 'Pickup date' }))
    const calendar = screen.getByRole('grid')
    const availableDay = within(calendar)
      .getAllByRole('gridcell')
      .find((button) => !button.hasAttribute('disabled') && /^\d+$/.test(button.textContent?.trim() ?? ''))
    if (!availableDay) throw new Error('No available pickup date found')
    await user.click(availableDay)

    await user.click(form.getByRole('button', { name: 'Pickup time' }))
    const timeList = screen.getByRole('listbox', { name: 'Time' })
    const firstTime = within(timeList).getAllByRole('option')[0]
    await user.click(firstTime)

    await user.click(form.getByRole('combobox', { name: 'Payment method' }))
    await user.click(screen.getByRole('option', { name: 'Cash' }))
    await user.click(form.getByRole('button', { name: /Review order/i }))

    expect(form.getByText('Workflow Customer')).toBeInTheDocument()
    expect(form.getByText('Workflow Bouquet')).toBeInTheDocument()
    await user.click(form.getByRole('button', { name: 'Confirm & create order' }))

    expect(useOrdersStore.getState().orders).toHaveLength(startingCount + 1)
    expect(
      useOrdersStore.getState().orders.some((order) =>
        order.customerName === 'Workflow Customer' &&
        order.productName === 'Workflow Bouquet'),
    ).toBe(true)
  })

  it('verifies a completed order from the finance queue', async () => {
    const created = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Finance Workflow Customer',
      orderType: 'walk_in',
      fulfillmentType: 'pickup',
      depositAmount: 0,
      notes: null,
      totalIdr: 450_000,
      productName: 'Finance Workflow Bouquet',
    })
    useOrdersStore.getState().updatePayment({
      orderNumber: created.orderNumber,
      expectedRevision: created.revision ?? 1,
      paymentStatus: 'paid',
      paidAmountIdr: 450_000,
      actor: { name: 'Owner', role: 'owner' },
    })
    useOrdersStore.setState((state) => ({
      orders: state.orders.map((order) => order.orderNumber === created.orderNumber
        ? { ...order, florist: 'Test Florist', floristAssignedEmployeeId: 'test-florist' }
        : order),
    }))
    useOrdersStore.getState().updateOrderStatus({
      orderNumber: created.orderNumber,
      expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === created.orderNumber)?.revision ?? 1,
      status: 'processing',
      actor: { name: 'Owner', role: 'owner' },
      source: 'workflow',
    })
    useOrdersStore.getState().updateOrderStatus({
      orderNumber: created.orderNumber,
      expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === created.orderNumber)?.revision ?? 1,
      status: 'ready',
      actor: { name: 'Admin', role: 'admin', branchId: 'Kedamaian' },
      source: 'workflow',
    })
    useOrdersStore.getState().updateOrderStatus({
      orderNumber: created.orderNumber,
      expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === created.orderNumber)?.revision ?? 1,
      status: 'picked_up',
      actor: { name: 'Owner', role: 'owner' },
      source: 'workflow',
    })
    render(<App />)
    const user = await chooseRole('Owner')
    const financeButtons = screen.getAllByRole('button', { name: 'Payment Verification' })
    await user.click(financeButtons[0])

    expect(
      screen.getByRole('heading', { name: 'Payment Verification' }),
    ).toBeInTheDocument()
    const result = useOrdersStore.getState().verifyOrderFinance({
      orderNumber: created.orderNumber,
      expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === created.orderNumber)?.revision ?? 1,
      actor: { name: 'Owner', role: 'owner' },
    })
    expect(result.allowed).toBe(true)

    const verified = useOrdersStore
      .getState()
      .orders.find((order) => order.orderNumber === created.orderNumber)
    expect(verified?.financeVerified).toBe(true)
  })

  it('opens a deterministic Finance module instead of restoring the last-used module', async () => {
    render(<App />)
    const user = await chooseRole('Owner')

    await user.click(screen.getAllByRole('button', { name: 'Payment Verification' })[0])
    await user.click(screen.getByRole('button', { name: /^Payroll/ }))
    expect((await screen.findAllByRole('heading', { name: 'Payroll schedule' })).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: /^(Overview|Business Overview)$/ })[0])
    await user.click(screen.getAllByRole('button', { name: 'Payment Verification' })[0])

    expect(screen.getByRole('heading', { name: 'Payment Verification' })).toBeInTheDocument()
  })

  it('advances an active order from the orders table', async () => {
    const scheduleDate = todayIsoDate()
    const created = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Status Workflow Customer',
      orderType: 'walk_in',
      fulfillmentType: 'delivery',
      depositAmount: 0,
      notes: null,
      totalIdr: 300_000,
      productName: 'Status Workflow Bouquet',
      scheduleLabel: 'Today · 16:00',
      scheduleDate,
      scheduleTime: '16:00',
    })

    useHrStore.setState((state) => ({
      scheduleOverrides: [
        ...state.scheduleOverrides.filter((item) => !(item.employeeId === 'emp-zahra' && item.date === scheduleDate)),
        { id:`test-zahra-${scheduleDate}`, employeeId:'emp-zahra', date:scheduleDate, shift:{ mode:'custom', isWorking:true, branchId:'Kedamaian', startTime:'09:00', endTime:'18:00' }, updatedAt:'2026-07-15T00:00:00.000Z', updatedBy:'Test' },
      ],
    }))

    render(<App />)
    const user = await chooseRole('Owner')
    const orderButtons = screen.getAllByRole('button', { name: 'Orders' })
    await user.click(orderButtons[0])

    const orderNumbers = await screen.findAllByText(created.orderNumber)
    const orderRow = orderNumbers[0].closest('[role="button"]')
    if (!(orderRow instanceof HTMLElement)) {
      throw new Error('Active order row not found')
    }
    await user.click(
      within(orderRow).getByRole('button', {
        name: 'Advance order to Processing',
      }),
    )
    await user.click((await screen.findAllByRole('radio'))[0])
    await user.click(screen.getByRole('button', { name: 'Assign & start Processing' }))
    const advanced = useOrdersStore
      .getState()
      .orders.find((order) => order.orderNumber === created.orderNumber)
    expect(advanced?.status).toBe('processing')
  })

  it('requires bank-transfer settlement before finishing a ready pickup', async () => {
    const created = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerName: 'Payment Gate Customer',
      orderType: 'walk_in',
      fulfillmentType: 'pickup',
      depositAmount: 150_000,
      paymentMethod: 'transfer',
      notes: null,
      totalIdr: 500_000,
      productName: 'Payment Gate Bouquet',
      scheduleLabel: 'Today · 17:00',
    })
    useOrdersStore.setState((state) => ({
      orders: state.orders.map((order) => order.orderNumber === created.orderNumber
        ? { ...order, florist: 'Test Florist', floristAssignedEmployeeId: 'test-florist' }
        : order),
    }))
    useOrdersStore.getState().updateOrderStatus({
      orderNumber: created.orderNumber,
      expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === created.orderNumber)?.revision ?? 1,
      status: 'processing',
      actor: { name: 'Owner', role: 'owner' },
      source: 'workflow',
    })
    useOrdersStore.getState().updateOrderStatus({
      orderNumber: created.orderNumber,
      expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === created.orderNumber)?.revision ?? 1,
      status: 'ready',
      actor: { name: 'Admin', role: 'admin', branchId: 'Kedamaian' },
      source: 'workflow',
    })

    render(<App />)
    const user = await chooseRole('Owner')
    await user.click(screen.getAllByRole('button', { name: 'Orders' })[0])

    const orderNumbers = await screen.findAllByText(created.orderNumber)
    const orderRow = orderNumbers[0].closest('[role="button"]')
    if (!(orderRow instanceof HTMLElement)) {
      throw new Error('Payment-gated order row not found')
    }
    const blockedAction = within(orderRow).getByRole('button', {
      name: 'Complete payment before continuing',
    })
    expect(blockedAction).toBeDisabled()
    expect(
      useOrdersStore
        .getState()
        .orders.find((order) => order.orderNumber === created.orderNumber)?.status,
    ).toBe('ready')

    const payment = useOrdersStore.getState().updatePayment({
      orderNumber: created.orderNumber,
      expectedRevision: useOrdersStore.getState().orders.find((order) => order.orderNumber === created.orderNumber)?.revision ?? 1,
      paymentStatus: 'paid',
      paidAmountIdr: 500_000,
      actor: { name: 'Owner', role: 'owner' },
    })
    expect(payment.allowed).toBe(true)
  })
})
