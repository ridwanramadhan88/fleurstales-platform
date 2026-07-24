import { useCustomerStore } from '../../store/customerStore'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type { SharedCustomer } from './contracts'
import { bootstrapSharedData } from './bootstrap'
import { browserSupabaseTokenProvider } from './supabaseSession'

let stopCustomerSync: (() => void) | undefined

export const stopBusinessOsCustomerBridge = (): void => {
  stopCustomerSync?.()
  stopCustomerSync = undefined
}

const toSharedCustomer = (customer: CustomerProfile): SharedCustomer => ({
  id: customer.id,
  revision: customer.revision ?? 1,
  name: customer.name,
  whatsappNumber: customer.whatsappNumber,
  normalizedWhatsappNumber: customer.normalizedWhatsappNumber,
  email: customer.email,
  birthday: customer.birthday,
  preferredBranchId: customer.preferredBranch,
  tags: customer.tags ?? [],
  notes: customer.notes,
  promoCode: customer.promoCode,
  createdSource: customer.createdSource ?? 'admin',
  createdAt: customer.createdAt ?? new Date().toISOString(),
  updatedAt: customer.updatedAt ?? new Date().toISOString(),
})

/** Hydrates CRM from Supabase so OS does not show its local demo customers. */
export const refreshBusinessOsCustomersFromRemote = async (): Promise<boolean> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return false

  try {
    const customers = await shared.repositories.customersAdmin.listCustomers()
    const mapped: CustomerProfile[] = customers.map((customer) => ({
      id: customer.id,
      revision: customer.revision,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      name: customer.name,
      whatsappNumber: customer.whatsappNumber,
      normalizedWhatsappNumber: customer.normalizedWhatsappNumber,
      email: customer.email,
      birthday: customer.birthday,
      preferredBranch: customer.preferredBranchId,
      tags: customer.tags,
      notes: customer.notes,
      promoCode: customer.promoCode,
      createdSource: customer.createdSource,
    }))
    useCustomerStore.setState({ customers: mapped })
    stopBusinessOsCustomerBridge()
    const knownRevisions = new Map(mapped.map((customer) => [customer.id, customer.revision ?? 1]))
    stopCustomerSync = useCustomerStore.subscribe((state) => {
      const currentIds = new Set(state.customers.map((customer) => customer.id))
      for (const [customerId, revision] of knownRevisions) {
        if (currentIds.has(customerId)) continue
        knownRevisions.delete(customerId)
        void shared.repositories.customersAdmin.deleteCustomer(customerId, revision).catch(() => undefined)
      }
      for (const customer of state.customers) {
        const knownRevision = knownRevisions.get(customer.id)
        const revision = customer.revision ?? 1
        if (knownRevision !== undefined && revision <= knownRevision) continue
        knownRevisions.set(customer.id, revision)
        void shared.repositories.customersAdmin
          .saveCustomer(toSharedCustomer(customer), knownRevision)
          .then((saved) => {
            knownRevisions.set(saved.id, saved.revision)
          })
          .catch(() => undefined)
      }
    })
    return true
  } catch {
    return false
  }
}
