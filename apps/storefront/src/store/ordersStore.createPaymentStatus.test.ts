import { beforeEach, describe, expect, it } from 'vitest'
import { useOrdersStore } from './ordersStore'
import { useSettingsStore } from './settingsStore'

const actor = {
  employeeId: 'owner-1',
  name: 'Owner',
  role: 'owner' as const,
}

describe('ordersStore createOrder payment status', () => {
  beforeEach(() => {
    useOrdersStore.setState({ orders: [], lastSequence: {} })
    useSettingsStore.setState((state) => ({
      ...state,
      storeProfile: { ...state.storeProfile, inventoryEnabled: false },
    }))
  })

  it('persists an explicitly paid new order as paid with the full amount', () => {
    const order = useOrdersStore.getState().createOrder({
      actor,
      branch: 'Kedamaian',
      customerName: 'Ridwan',
      orderType: 'walk_in',
      fulfillmentType: 'pickup',
      depositAmount: 0,
      totalIdr: 300_000,
      paymentStatus: 'paid',
      notes: null,
      productName: 'Bouquet',
    })

    expect(order.paymentStatus).toBe('paid')
    expect(order.paidAmountIdr).toBe(300_000)
  })

  it('keeps derived behavior when no explicit payment status is provided', () => {
    const order = useOrdersStore.getState().createOrder({
      actor,
      branch: 'Kedamaian',
      customerName: 'Ridwan',
      orderType: 'walk_in',
      fulfillmentType: 'pickup',
      depositAmount: 100_000,
      totalIdr: 300_000,
      notes: null,
      productName: 'Bouquet',
    })

    expect(order.paymentStatus).toBe('partial')
    expect(order.paidAmountIdr).toBe(100_000)
  })
})
