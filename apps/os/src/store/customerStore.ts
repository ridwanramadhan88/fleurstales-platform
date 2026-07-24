/**
 * @file customerStore.ts
 * @description Lightweight CRM customer store with editable profiles.
 * Provides base customer data (name, WhatsApp, email, birthday, preferred branch)
 * that the Customers tab enriches with live metrics from Orders (lifetime spend,
 * order count, recency, behavior).
 *
 * The store holds only raw state + CRUD. All segmentation and metrics logic
 * lives in customerDomain.ts and is surfaced via the event + domain layers.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { apiStorage, subscribeToExternalUpdates } from './persistApiStorage'
import type {
  CustomerCreateInput,
  CustomerIntakeInput,
  CustomerIntakeResult,
  CustomerProfile,
  CustomerProfileSuggestions,
  CustomerSegmentRules,
} from './customerStoreTypes'
import { isSectionEditAuthorized } from '../config/authorization'
import { normalizeWhatsappNumber } from '../lib/formatters'
import {
  emitCustomerCreated,
  emitCustomerUpdated,
} from '../core/events/eventService'
import {
  applyAcceptedProfileSuggestions,
  assertCustomerWhatsappAvailable,
  buildCustomerFromIntake,
  findCustomerByWhatsapp,
  getCustomerProfileSuggestions,
  normalizePersistedCustomers,
} from '../domain/customerIntakeDomain'
import { cleanCustomerBirthday, cleanCustomerEmail, cleanCustomerName } from '../data/shared/customerIdentityDomain'

/**
 * @description Default VIP rule: matches the original hardcoded behavior
 * (lifetime spend > Rp 1,000,000) while adding an order-count option.
 */
export const DEFAULT_SEGMENT_RULES: CustomerSegmentRules = {
  mode: 'either',
  minLifetimeSpend: 1_000_000,
  minOrderCount: 5,
}

/**
 * @description Internal state shape for the customer store.
 */
interface CustomerState {
  /** All customer profiles known to the CRM. */
  customers: CustomerProfile[]
  /**
   * @description Adds a new customer profile and returns it.
   */
  addCustomer: (input: CustomerCreateInput) => CustomerProfile
  /**
   * @description Partially updates a customer profile.
   */
  removeCustomer: (customerId: string) => void
  updateCustomer: (
    customerId: string,
    patch: Partial<Omit<CustomerProfile, 'id' | 'normalizedWhatsappNumber'>>,
  ) => void
  createOrUpdateCustomerFromStorefront: (
    input: CustomerIntakeInput,
  ) => CustomerIntakeResult
  createOrUpdateCustomerFromAdmin: (
    input: CustomerIntakeInput,
  ) => CustomerIntakeResult
  applyCustomerProfileSuggestions: (
    customerId: string,
    suggestions: Partial<CustomerProfileSuggestions>,
  ) => CustomerProfile | null
  /** Owner-configurable VIP segmentation rule. */
  segmentRules: CustomerSegmentRules
  /**
   * @description Partially updates the VIP segmentation rule.
   */
  setSegmentRules: (patch: Partial<CustomerSegmentRules>) => void
}

/**
 * @description Initial demo customers used to showcase CRM features.
 * Names are aligned with existing mocked order rows where possible.
 */
const INITIAL_CUSTOMERS: CustomerProfile[] = [
  {
    id: 'cust-sari',
    name: 'Ibu Sari Wulandari',
    whatsappNumber: '0812 1111 2222',
    normalizedWhatsappNumber: '6281211112222',
    createdSource: 'admin',
    email: 'sari@example.com',
    birthday: '1985-04-12',
    preferredBranch: 'Kedamaian',
    tags: ['VIP'],
    notes: 'Loves white roses and simple bouquets.',
    promoCode: 'VIP10',
  },
  {
    id: 'cust-andra',
    name: 'Bpk. Andra Yusuf',
    whatsappNumber: '0813 3333 4444',
    normalizedWhatsappNumber: '6281333334444',
    createdSource: 'admin',
    email: 'andra@example.com',
    birthday: '1978-09-20',
    preferredBranch: 'Pahoman',
    tags: ['Corporate'],
    notes: 'Often orders for office events.',
  },
  {
    id: 'cust-nadia',
    name: 'Nadia Kusuma',
    whatsappNumber: '0817 5555 6666',
    normalizedWhatsappNumber: '6281755556666',
    createdSource: 'admin',
    email: 'nadia@example.com',
    birthday: '1992-02-05',
    preferredBranch: 'Kedamaian',
    tags: ['VIP'],
    notes: 'Prefers premium arrangements and evening delivery.',
  },
  {
    id: 'cust-melati',
    name: 'Ibu Melati',
    whatsappNumber: '0819 7777 8888',
    normalizedWhatsappNumber: '6281977778888',
    createdSource: 'admin',
    preferredBranch: 'Pahoman',
    tags: ['Discount sensitive'],
    notes: 'Responds well to promo codes.',
    promoCode: 'SAVE15',
  },
  {
    id: 'cust-citra',
    name: 'Citra Ayu',
    whatsappNumber: '0812 9999 0000',
    normalizedWhatsappNumber: '6281299990000',
    createdSource: 'admin',
    preferredBranch: 'Pahoman',
  },
]

/**
 * @description Customer CRM store with add and edit operations.
 * Emits customer lifecycle events after each mutation via the event service.
 */
const CUSTOMERS_PERSIST_NAME = 'customers'
const CUSTOMERS_PERSIST_VERSION = 3

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set, get) => ({
  customers: INITIAL_CUSTOMERS,

  addCustomer: (input) => {
    if (!isSectionEditAuthorized('customers')) throw new Error('This account cannot edit customers.')
    assertCustomerWhatsappAvailable(get().customers, input.whatsappNumber)
    const id = `cust-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`
    const customer = buildCustomerFromIntake(id, {
      ...input,
      createdSource: input.createdSource ?? 'admin',
    })

    set((state) => ({
      customers: [customer, ...state.customers],
    }))

    emitCustomerCreated(customer)

    return customer
  },

  createOrUpdateCustomerFromStorefront: (input) => {
    const existing = findCustomerByWhatsapp(get().customers, input.whatsappNumber)
    if (existing) {
      return {
        customer: existing,
        isNew: false,
        suggestions: getCustomerProfileSuggestions(existing, input),
      }
    }

    const id = `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const customer = buildCustomerFromIntake(id, {
      ...input,
      createdSource: 'storefront',
    })
    set((state) => ({ customers: [customer, ...state.customers] }))
    emitCustomerCreated(customer)
    return { customer, isNew: true, suggestions: {} }
  },

  createOrUpdateCustomerFromAdmin: (input) => {
    if (!isSectionEditAuthorized('customers')) {
      throw new Error('This account cannot edit customers.')
    }
    const existing = findCustomerByWhatsapp(get().customers, input.whatsappNumber)
    if (existing) {
      const suggestions = getCustomerProfileSuggestions(existing, input)
      const customer = applyAcceptedProfileSuggestions(existing, input.acceptedSuggestions)
      if (customer !== existing) {
        set((state) => ({
          customers: state.customers.map((item) =>
            item.id === existing.id ? customer : item,
          ),
        }))
        emitCustomerUpdated(customer)
      }
      return { customer, isNew: false, suggestions }
    }

    const id = `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const customer = buildCustomerFromIntake(id, {
      ...input,
      createdSource: 'admin',
    })
    set((state) => ({ customers: [customer, ...state.customers] }))
    emitCustomerCreated(customer)
    return { customer, isNew: true, suggestions: {} }
  },

  applyCustomerProfileSuggestions: (customerId, suggestions) => {
    if (!isSectionEditAuthorized('customers')) return null
    const existing = get().customers.find((customer) => customer.id === customerId)
    if (!existing) return null
    const customer = applyAcceptedProfileSuggestions(existing, suggestions)
    if (customer === existing) return existing
    set((state) => ({
      customers: state.customers.map((item) =>
        item.id === customerId ? customer : item,
      ),
    }))
    emitCustomerUpdated(customer)
    return customer
  },


  removeCustomer: (customerId) => {
    if (!isSectionEditAuthorized('customers')) throw new Error('This account cannot remove customers.')
    set((state) => ({ customers: state.customers.filter((customer) => customer.id !== customerId) }))
  },

  updateCustomer: (customerId, patch) => {
    if (!isSectionEditAuthorized('customers')) return
    const current = get().customers.find((customer) => customer.id === customerId)
    if (!current) return
    const nextWhatsapp = patch.whatsappNumber?.trim() ?? current.whatsappNumber
    if (patch.name !== undefined && !cleanCustomerName(patch.name)) {
      throw new Error('Customer name is required.')
    }
    assertCustomerWhatsappAvailable(get().customers, nextWhatsapp, customerId)

    const normalizedPatch: Partial<Omit<CustomerProfile, 'id' | 'normalizedWhatsappNumber'>> = {
      ...patch,
      ...(patch.name !== undefined ? { name: cleanCustomerName(patch.name) } : {}),
      ...(patch.whatsappNumber !== undefined ? { whatsappNumber: nextWhatsapp } : {}),
      ...(patch.email !== undefined ? { email: cleanCustomerEmail(patch.email) } : {}),
      ...(patch.birthday !== undefined ? { birthday: cleanCustomerBirthday(patch.birthday) } : {}),
      ...(patch.preferredBranch !== undefined ? { preferredBranch: patch.preferredBranch?.trim() || undefined } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || undefined } : {}),
      ...(patch.promoCode !== undefined ? { promoCode: patch.promoCode?.trim() || undefined } : {}),
    }

    set((state) => ({
      customers: state.customers.map((customer) =>
        customer.id === customerId
          ? {
              ...customer,
              ...normalizedPatch,
              whatsappNumber: nextWhatsapp,
              normalizedWhatsappNumber: normalizeWhatsappNumber(nextWhatsapp),
              revision: (customer.revision ?? 1) + 1,
              updatedAt: new Date().toISOString(),
            }
          : customer,
      ),
    }))

    const updated = get().customers.find(
      (customer) => customer.id === customerId,
    )
    if (updated) {
      emitCustomerUpdated(updated)
    }
  },

  segmentRules: DEFAULT_SEGMENT_RULES,

  setSegmentRules: (patch) => {
    if (!isSectionEditAuthorized('customers')) return
    set((state) => ({
      segmentRules: { ...state.segmentRules, ...patch },
    }))
  },
    }),
    {
      name: CUSTOMERS_PERSIST_NAME,
      version: CUSTOMERS_PERSIST_VERSION,
      storage: createJSONStorage(() => apiStorage),
      migrate: (persisted) => {
        const state = persisted as Partial<CustomerState>
        const customers = normalizePersistedCustomers(state.customers ?? INITIAL_CUSTOMERS)
        return { ...state, customers } as CustomerState
      },
      merge: (persisted, current) => {
        const state = persisted as Partial<CustomerState>
        const customers = normalizePersistedCustomers(state.customers ?? current.customers)
        return { ...current, ...state, customers }
      },
      partialize: (state) => ({
        customers: state.customers,
        segmentRules: state.segmentRules,
      }) as CustomerState,
    },
  ),
)

// Keeps this store in sync across tabs/windows (e.g. a customer created via
// the storefront checkout shows up in the admin CRM without a refresh).
// See persistApiStorage.ts for how this works.
subscribeToExternalUpdates(CUSTOMERS_PERSIST_NAME, useCustomerStore)
