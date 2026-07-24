import type {
  CustomerCreateInput,
  CustomerIntakeInput,
  CustomerProfile,
  CustomerProfileSuggestions,
} from '../store/customerStoreTypes'
import {
  assertValidCustomerIntake,
  buildCanonicalOrderCustomerSnapshot,
  cleanCustomerBirthday,
  cleanCustomerEmail,
  cleanCustomerName,
  getCanonicalCustomerSuggestions,
  isValidCustomerWhatsappNumber,
  normalizeCustomerWhatsappNumber,
} from '../data/shared/customerIdentityDomain'

export const findCustomerByWhatsapp = (
  customers: CustomerProfile[],
  whatsappNumber: string,
): CustomerProfile | null => {
  const normalized = normalizeCustomerWhatsappNumber(whatsappNumber)
  if (normalized.length < 8) return null
  return (
    customers.find(
      (customer) =>
        customer.normalizedWhatsappNumber === normalized ||
        normalizeCustomerWhatsappNumber(customer.whatsappNumber || customer.phone || '') === normalized,
    ) ?? null
  )
}

const toCanonicalCustomer = (customer: CustomerProfile) => ({
  id: customer.id,
  name: customer.name,
  whatsappNumber: customer.whatsappNumber || customer.phone || '',
  normalizedWhatsappNumber:
    customer.normalizedWhatsappNumber ||
    normalizeCustomerWhatsappNumber(customer.whatsappNumber || customer.phone || ''),
  email: customer.email,
  birthday: customer.birthday,
  preferredBranchId: customer.preferredBranch,
})

const toCanonicalSuggestionInput = (input: Pick<CustomerIntakeInput, 'birthday' | 'email' | 'preferredBranch'>) => ({
  birthday: input.birthday,
  email: input.email,
  preferredBranchId: input.preferredBranch,
})

const toCanonicalInput = (input: Pick<CustomerIntakeInput, 'name' | 'whatsappNumber' | 'birthday' | 'email' | 'preferredBranch'>) => ({
  name: input.name,
  whatsappNumber: input.whatsappNumber,
  birthday: input.birthday,
  email: input.email,
  preferredBranchId: input.preferredBranch,
})

export const getCustomerProfileSuggestions = (
  customer: CustomerProfile,
  input: Pick<CustomerIntakeInput, 'birthday' | 'email' | 'preferredBranch'>,
): CustomerProfileSuggestions =>
  getCanonicalCustomerSuggestions(toCanonicalCustomer(customer), toCanonicalSuggestionInput(input))

export const buildCustomerFromIntake = (
  id: string,
  input: CustomerCreateInput,
): CustomerProfile => {
  assertValidCustomerIntake(input)
  const whatsappNumber = input.whatsappNumber.trim()
  const now = new Date().toISOString()
  return {
    id,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    name: cleanCustomerName(input.name),
    whatsappNumber,
    normalizedWhatsappNumber: normalizeCustomerWhatsappNumber(whatsappNumber),
    email: cleanCustomerEmail(input.email),
    birthday: cleanCustomerBirthday(input.birthday),
    preferredBranch: input.preferredBranch?.trim() || undefined,
    tags: input.tags,
    notes: input.notes?.trim() || undefined,
    promoCode: input.promoCode?.trim() || undefined,
    createdSource: input.createdSource,
  }
}

export const applyAcceptedProfileSuggestions = (
  customer: CustomerProfile,
  accepted: Partial<CustomerProfileSuggestions> | undefined,
): CustomerProfile => {
  const birthday = !customer.birthday ? cleanCustomerBirthday(accepted?.birthday) : undefined
  const email = !customer.email ? cleanCustomerEmail(accepted?.email) : undefined
  const preferredBranch = !customer.preferredBranch
    ? accepted?.preferredBranchId?.trim() || undefined
    : undefined
  if (!birthday && !email && !preferredBranch) return customer
  return {
    ...customer,
    ...(birthday ? { birthday } : {}),
    ...(email ? { email } : {}),
    ...(preferredBranch ? { preferredBranch } : {}),
    revision: (customer.revision ?? 1) + 1,
    updatedAt: new Date().toISOString(),
  }
}

/** Canonical immutable order-time snapshot used by both Storefront and Admin intake. */
export const buildOrderCustomerSnapshot = (
  customer: CustomerProfile,
  input: Pick<CustomerIntakeInput, 'name' | 'whatsappNumber' | 'email' | 'birthday' | 'preferredBranch'>,
) =>
  buildCanonicalOrderCustomerSnapshot(toCanonicalCustomer(customer), toCanonicalInput(input))

/** Throws when another CRM record already owns the same normalized WhatsApp identity. */
export const assertCustomerWhatsappAvailable = (
  customers: CustomerProfile[],
  whatsappNumber: string,
  excludeCustomerId?: string,
): void => {
  const normalized = normalizeCustomerWhatsappNumber(whatsappNumber)
  if (!isValidCustomerWhatsappNumber(whatsappNumber)) throw new Error('A valid WhatsApp number is required.')
  const duplicate = customers.find(
    (customer) =>
      customer.id !== excludeCustomerId &&
      (customer.normalizedWhatsappNumber === normalized ||
        normalizeCustomerWhatsappNumber(customer.whatsappNumber || customer.phone || '') === normalized),
  )
  if (duplicate) throw new Error('A customer with this WhatsApp number already exists.')
}

/**
 * Normalizes persisted legacy CRM data and collapses duplicate WhatsApp identities.
 * The first established profile wins; later duplicates may only fill missing fields.
 */
export const normalizePersistedCustomers = (
  customers: CustomerProfile[],
): CustomerProfile[] => {
  const byWhatsapp = new Map<string, CustomerProfile>()
  const withoutValidWhatsapp: CustomerProfile[] = []

  for (const raw of customers) {
    const whatsappNumber = (raw.whatsappNumber ?? raw.phone ?? '').trim()
    const normalizedWhatsappNumber = normalizeCustomerWhatsappNumber(whatsappNumber)
    const normalized: CustomerProfile = {
      ...raw,
      name: cleanCustomerName(raw.name),
      whatsappNumber,
      normalizedWhatsappNumber,
      email: cleanCustomerEmail(raw.email),
      birthday: cleanCustomerBirthday(raw.birthday),
      preferredBranch: raw.preferredBranch?.trim() || undefined,
      tags: raw.tags ? [...new Set(raw.tags.filter(Boolean))] : undefined,
      notes: raw.notes?.trim() || undefined,
      promoCode: raw.promoCode?.trim() || undefined,
      createdSource: raw.createdSource ?? 'admin',
      revision: Math.max(1, raw.revision ?? 1),
      createdAt: raw.createdAt ?? raw.updatedAt ?? '1970-01-01T00:00:00.000Z',
      updatedAt: raw.updatedAt ?? raw.createdAt ?? '1970-01-01T00:00:00.000Z',
    }

    if (normalizedWhatsappNumber.length < 8) {
      withoutValidWhatsapp.push(normalized)
      continue
    }

    const established = byWhatsapp.get(normalizedWhatsappNumber)
    if (!established) {
      byWhatsapp.set(normalizedWhatsappNumber, normalized)
      continue
    }

    byWhatsapp.set(normalizedWhatsappNumber, {
      ...established,
      email: established.email ?? normalized.email,
      birthday: established.birthday ?? normalized.birthday,
      preferredBranch: established.preferredBranch ?? normalized.preferredBranch,
      tags: [...new Set([...(established.tags ?? []), ...(normalized.tags ?? [])])],
      promoCode: established.promoCode ?? normalized.promoCode,
    })
  }

  return [...byWhatsapp.values(), ...withoutValidWhatsapp]
}
