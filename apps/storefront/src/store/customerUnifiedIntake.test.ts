import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findCustomerByWhatsapp } from '../domain/customerIntakeDomain'
import { normalizeWhatsappNumber } from '../lib/formatters'
import { useCustomerStore } from './customerStore'
import { useOrdersStore } from './ordersStore'
import { useSettingsStore } from './settingsStore'
import { useUserStore } from './userStore'

const originalCustomers = useCustomerStore.getState().customers
const originalOrders = useOrdersStore.getState().orders
const originalSequences = useOrdersStore.getState().lastSequence
const originalUser = useUserStore.getState()

describe('shared Storefront and Admin customer intake', () => {
  beforeEach(() => {
    useCustomerStore.setState({ customers: [] })
    useOrdersStore.setState({ orders: [], lastSequence: {} })
    useSettingsStore.setState((state) => ({
      ...state,
      storeProfile: { ...state.storeProfile, inventoryEnabled: false },
    }))
  })

  afterEach(() => {
    useCustomerStore.setState({ customers: originalCustomers })
    useOrdersStore.setState({ orders: originalOrders, lastSequence: originalSequences })
    useUserStore.setState({
      employeeId: originalUser.employeeId,
      name: originalUser.name,
      username: originalUser.username,
      role: originalUser.role,
      branchId: originalUser.branchId,
      scheduledBranchId: originalUser.scheduledBranchId,
      branchOverrideActive: originalUser.branchOverrideActive,
      lastBranchOverride: originalUser.lastBranchOverride,
    })
  })

  it('normalizes Indonesian WhatsApp formats to one customer key', () => {
    expect(normalizeWhatsappNumber('0812 3456 7890')).toBe('6281234567890')
    expect(normalizeWhatsappNumber('+62 812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsappNumber('6281234567890')).toBe('6281234567890')
    expect(normalizeWhatsappNumber('81234567890')).toBe('6281234567890')
    expect(normalizeWhatsappNumber('0062 812 3456 7890')).toBe('6281234567890')
    expect(normalizeWhatsappNumber('62081234567890')).toBe('6281234567890')
  })

  it('allows public Storefront intake without staff customer-edit permission', () => {
    useUserStore.getState().setRole('florist')

    const result = useCustomerStore.getState().createOrUpdateCustomerFromStorefront({
      name: 'Storefront Customer',
      whatsappNumber: '0812 3456 7890',
      email: 'storefront@example.com',
      preferredBranch: 'Kedamaian',
    })

    expect(result.isNew).toBe(true)
    expect(result.customer).toMatchObject({
      name: 'Storefront Customer',
      whatsappNumber: '0812 3456 7890',
      normalizedWhatsappNumber: '6281234567890',
      createdSource: 'storefront',
    })
  })

  it('matches the same CRM customer and preserves populated profile data', () => {
    useUserStore.getState().setRole('owner')
    const initial = useCustomerStore.getState().createOrUpdateCustomerFromAdmin({
      name: 'Existing CRM Name',
      whatsappNumber: '+62 812-3456-7890',
      email: 'existing@example.com',
      preferredBranch: 'Pahoman',
    }).customer

    const storefront = useCustomerStore.getState().createOrUpdateCustomerFromStorefront({
      name: 'Different Checkout Name',
      whatsappNumber: '081234567890',
      email: 'new@example.com',
      birthday: '1990-05-12',
      preferredBranch: 'Kedamaian',
    })

    expect(storefront.customer.id).toBe(initial.id)
    expect(storefront.customer.name).toBe('Existing CRM Name')
    expect(storefront.customer.email).toBe('existing@example.com')
    expect(storefront.customer.preferredBranch).toBe('Pahoman')
    expect(storefront.suggestions).toEqual({ birthday: '1990-05-12' })
    expect(findCustomerByWhatsapp(useCustomerStore.getState().customers, '6281234567890')?.id).toBe(initial.id)
  })

  it('rejects an Admin edit that would duplicate another WhatsApp identity', () => {
    useUserStore.getState().setRole('owner')
    const first = useCustomerStore.getState().createOrUpdateCustomerFromAdmin({
      name: 'First Customer',
      whatsappNumber: '081211112222',
    }).customer
    const second = useCustomerStore.getState().createOrUpdateCustomerFromAdmin({
      name: 'Second Customer',
      whatsappNumber: '081233334444',
    }).customer

    expect(() => useCustomerStore.getState().updateCustomer(second.id, {
      whatsappNumber: '+62 812-1111-2222',
    })).toThrow('already exists')
    expect(useCustomerStore.getState().customers.find((item) => item.id === first.id)?.normalizedWhatsappNumber)
      .toBe('6281211112222')
  })

  it('lets Admin accept only selected missing-profile suggestions', () => {
    useUserStore.getState().setRole('owner')
    const existing = useCustomerStore.getState().createOrUpdateCustomerFromAdmin({
      name: 'CRM Name',
      whatsappNumber: '081311112222',
    }).customer

    const result = useCustomerStore.getState().createOrUpdateCustomerFromAdmin({
      name: 'Submitted Name',
      whatsappNumber: '+62 813-1111-2222',
      email: 'new@example.com',
      birthday: '1992-02-02',
      preferredBranch: 'Kedamaian',
      acceptedSuggestions: { email: 'new@example.com' },
    })

    expect(result.customer.id).toBe(existing.id)
    expect(result.customer.name).toBe('CRM Name')
    expect(result.customer.email).toBe('new@example.com')
    expect(result.customer.birthday).toBeUndefined()
    expect(result.customer.preferredBranch).toBeUndefined()
  })

  it('forces Storefront orders to unpaid while preserving snapshot and CRM suggestions', () => {
    useUserStore.getState().setRole('owner')
    const customer = useCustomerStore.getState().createOrUpdateCustomerFromAdmin({
      name: 'Existing Customer',
      whatsappNumber: '081455566677',
    }).customer

    const order = useOrdersStore.getState().createOrder({
      branch: 'Kedamaian',
      customerId: customer.id,
      customerSnapshot: {
        customerId: customer.id,
        name: 'Submitted Checkout Name',
        whatsappNumber: '0814 555 666 77',
        email: 'snapshot@example.com',
      },
      customerProfileSuggestions: {
        email: 'snapshot@example.com',
        preferredBranchId: 'Kedamaian',
      },
      customerName: 'Submitted Checkout Name',
      orderType: 'customer_created',
      fulfillmentType: 'pickup',
      depositAmount: 100_000,
      paymentStatus: 'paid',
      totalIdr: 250_000,
      itemsSubtotalIdr: 250_000,
      orderNote: 'Use pastel flowers',
      greetingMessage: 'Happy birthday\nHave a lovely day',
      greetingCardName: 'From Rina',
      productName: 'Bouquet',
    })

    expect(order.paymentStatus).toBe('unpaid')
    expect(order.paidAmountIdr).toBe(0)
    expect(order.customerSnapshot).toEqual({
      customerId: customer.id,
      name: 'Submitted Checkout Name',
      whatsappNumber: '0814 555 666 77',
      email: 'snapshot@example.com',
    })
    expect(order.customerProfileSuggestions).toEqual({
      email: 'snapshot@example.com',
      preferredBranchId: 'Kedamaian',
    })
    expect(order.orderNote).toBe('Use pastel flowers')
    expect(order.greetingMessage).toContain('\n')
    expect(order.greetingCardName).toBe('From Rina')
  })
})
