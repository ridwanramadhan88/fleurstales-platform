/**
 * @file id.ts
 * @description Shared helper for generating non-cryptographic, unique-enough
 * client-side ids (e.g. for transient store records like transfers, audit
 * events, or draft items). Not for system-managed identifiers like Catalog's
 * Product ID / SKU, which follow their own spec-driven rules — see
 * domain/catalogIdDomain.ts for those.
 */

/**
 * @description Generates an id as `${prefix}-${timestamp}-${random}`, using
 * crypto.randomUUID() when available for stronger uniqueness, falling back
 * to Math.random() otherwise.
 */
export const generateId = (prefix: string): string => {
  const unique =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 7)

  return `${prefix}-${Date.now()}-${unique}`
}
