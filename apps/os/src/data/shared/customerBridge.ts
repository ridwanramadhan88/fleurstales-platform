import { useCustomerStore } from '../../store/customerStore'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import { bootstrapSharedData } from './bootstrap'
import { browserSupabaseTokenProvider } from './supabaseSession'

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
    return true
  } catch {
    return false
  }
}
