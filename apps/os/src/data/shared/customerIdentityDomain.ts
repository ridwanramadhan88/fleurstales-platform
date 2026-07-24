/**
 * Canonical customer identity/intake rules shared by Business OS and Storefront.
 * This module deliberately has no React/Zustand/Supabase dependency so the same
 * rules can run locally now and inside future repository/RPC adapters later.
 */

export interface CanonicalCustomerIdentity {
  id: string
  name: string
  whatsappNumber: string
  normalizedWhatsappNumber: string
  email?: string
  birthday?: string
  preferredBranchId?: string
}

export interface CanonicalCustomerIntakeInput {
  name: string
  whatsappNumber: string
  email?: string
  birthday?: string
  preferredBranchId?: string
}

export interface CanonicalCustomerSuggestions {
  birthday?: string
  email?: string
  preferredBranchId?: string
}

export interface CanonicalOrderCustomerSnapshot {
  customerId: string
  /** Exact submitted order-time name. CRM identity may intentionally differ. */
  name: string
  /** Exact submitted order-time WhatsApp formatting. */
  whatsappNumber: string
  /** Submitted email when present, otherwise the established CRM email. */
  email?: string
}

const digitsOnly = (raw: string): string => raw.replace(/[^\d]/g, '')

/**
 * Canonical Indonesian WhatsApp matching key.
 * 0812…, 812…, +62 812…, 0062 812… and the common malformed 620812… form
 * all resolve to the same 62-prefixed digit key.
 */
export const normalizeCustomerWhatsappNumber = (raw: string): string => {
  let digits = digitsOnly(raw)
  if (!digits) return ''
  if (digits.startsWith('0062')) digits = digits.slice(2)
  if (digits.startsWith('620')) digits = `62${digits.slice(3)}`
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

export const isValidCustomerWhatsappNumber = (raw: string): boolean => {
  const normalized = normalizeCustomerWhatsappNumber(raw)
  return normalized.length >= 8 && normalized.length <= 15
}

export const cleanCustomerName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ')

export const cleanCustomerEmail = (value: string | undefined): string | undefined => {
  const cleaned = value?.trim().toLowerCase()
  return cleaned || undefined
}

export const cleanCustomerBirthday = (value: string | undefined): string | undefined => {
  const cleaned = value?.trim()
  if (!cleaned) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return undefined
  const [year, month, day] = cleaned.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return undefined
  return cleaned
}

export const assertValidCustomerIntake = (
  input: CanonicalCustomerIntakeInput,
): void => {
  if (!cleanCustomerName(input.name)) throw new Error('Customer name is required.')
  if (!isValidCustomerWhatsappNumber(input.whatsappNumber)) {
    throw new Error('A valid WhatsApp number is required.')
  }
  if (input.birthday?.trim() && !cleanCustomerBirthday(input.birthday)) {
    throw new Error('Customer birthday must be a valid YYYY-MM-DD date.')
  }
}

/** Missing CRM values are suggestions only; established CRM values are never overwritten. */
export const getCanonicalCustomerSuggestions = (
  customer: CanonicalCustomerIdentity,
  input: Pick<CanonicalCustomerIntakeInput, 'birthday' | 'email' | 'preferredBranchId'>,
): CanonicalCustomerSuggestions => {
  const birthday = cleanCustomerBirthday(input.birthday)
  const email = cleanCustomerEmail(input.email)
  const preferredBranchId = input.preferredBranchId?.trim() || undefined
  return {
    ...(!customer.birthday && birthday ? { birthday } : {}),
    ...(!customer.email && email ? { email } : {}),
    ...(!customer.preferredBranchId && preferredBranchId ? { preferredBranchId } : {}),
  }
}

/**
 * Builds the immutable order-time contact snapshot. It intentionally captures
 * what the customer/admin submitted, while using established CRM email only as
 * a fallback when the order form leaves email blank.
 */
export const buildCanonicalOrderCustomerSnapshot = (
  customer: CanonicalCustomerIdentity,
  input: CanonicalCustomerIntakeInput,
): CanonicalOrderCustomerSnapshot => ({
  customerId: customer.id,
  name: cleanCustomerName(input.name) || customer.name,
  whatsappNumber: input.whatsappNumber.trim() || customer.whatsappNumber,
  email: cleanCustomerEmail(input.email) ?? customer.email,
})
