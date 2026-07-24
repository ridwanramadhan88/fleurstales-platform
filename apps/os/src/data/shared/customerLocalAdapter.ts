/**
 * Local Phase 7 adapter for exercising the future shared CRM contract without
 * requiring a live Supabase project. It mirrors Storefront/Admin intake rules.
 */
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type {
  SharedCustomer,
  SharedCustomerIntakeInput,
  SharedCustomerIntakeResult,
} from './contracts'
import {
  assertValidCustomerIntake,
  cleanCustomerBirthday,
  cleanCustomerEmail,
  cleanCustomerName,
  getCanonicalCustomerSuggestions,
  normalizeCustomerWhatsappNumber,
} from './customerIdentityDomain'

const nowIso = (): string => new Date().toISOString()

export const customerProfileToSharedCustomer = (
  profile: CustomerProfile,
): SharedCustomer => ({
  id: profile.id,
  revision: profile.revision ?? 1,
  name: profile.name,
  whatsappNumber: profile.whatsappNumber || profile.phone || '',
  normalizedWhatsappNumber:
    profile.normalizedWhatsappNumber ||
    normalizeCustomerWhatsappNumber(profile.whatsappNumber || profile.phone || ''),
  email: profile.email,
  birthday: profile.birthday,
  preferredBranchId: profile.preferredBranch,
  tags: profile.tags ?? [],
  notes: profile.notes,
  promoCode: profile.promoCode,
  createdSource: profile.createdSource ?? 'admin',
  createdAt: profile.createdAt ?? '1970-01-01T00:00:00.000Z',
  updatedAt: profile.updatedAt ?? profile.createdAt ?? '1970-01-01T00:00:00.000Z',
})

export const sharedCustomerToCustomerProfile = (
  customer: SharedCustomer,
): CustomerProfile => ({
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
})

export const resolveLocalCustomerIntake = (
  customers: SharedCustomer[],
  input: SharedCustomerIntakeInput,
  createdSource: SharedCustomer['createdSource'],
  idFactory: () => string = () => `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
): { customers: SharedCustomer[]; result: SharedCustomerIntakeResult } => {
  assertValidCustomerIntake(input)
  const normalized = normalizeCustomerWhatsappNumber(input.whatsappNumber)
  const existing = customers.find((customer) => customer.normalizedWhatsappNumber === normalized)

  if (existing) {
    const suggestions = getCanonicalCustomerSuggestions(existing, input)
    return {
      customers,
      result: { customer: existing, isNew: false, suggestions },
    }
  }

  const timestamp = nowIso()
  const customer: SharedCustomer = {
    id: idFactory(),
    revision: 1,
    name: cleanCustomerName(input.name),
    whatsappNumber: input.whatsappNumber.trim(),
    normalizedWhatsappNumber: normalized,
    email: cleanCustomerEmail(input.email),
    birthday: cleanCustomerBirthday(input.birthday),
    preferredBranchId: input.preferredBranchId?.trim() || undefined,
    tags: [],
    createdSource,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return {
    customers: [customer, ...customers],
    result: { customer, isNew: true, suggestions: {} },
  }
}
