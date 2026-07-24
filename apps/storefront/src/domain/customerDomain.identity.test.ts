import { describe, expect, it } from 'vitest'
import { getCustomerContactForOrder, getOrdersForCustomer } from './customerDomain'
import { makeOrder } from '../test/factories/order'
import type { CustomerProfile } from '../store/customerStoreTypes'

const first: CustomerProfile = { id: 'cust-a', name: 'Same Name', whatsappNumber: '081111', normalizedWhatsappNumber: '6281111' }
const second: CustomerProfile = { id: 'cust-b', name: 'Same Name', whatsappNumber: '082222', normalizedWhatsappNumber: '6282222' }

describe('customer identity linkage', () => {
  it('uses customerId instead of merging two customers with the same display name', () => {
    const orders = [
      makeOrder({ orderNumber: 'A', customerId: 'cust-a', customerName: 'Same Name' }),
      makeOrder({ orderNumber: 'B', customerId: 'cust-b', customerName: 'Same Name' }),
    ]

    expect(getOrdersForCustomer(first, orders).map((order) => order.orderNumber)).toEqual(['A'])
    expect(getOrdersForCustomer(second, orders).map((order) => order.orderNumber)).toEqual(['B'])
  })

  it('falls back to the captured contact snapshot when the CRM profile is unavailable', () => {
    const order = makeOrder({
      customerId: 'deleted-customer',
      customerSnapshot: { name: 'Archived Customer', phone: '083333' },
    })

    expect(getCustomerContactForOrder([], order)?.whatsappNumber).toBe('083333')
  })
})
