/**
 * Customers may type an order number without dashes or in lowercase
 * ("kdm261126001"). Rebuilds the canonical form for both formats:
 * daily (25 Nov 2026) KDM-26-11-26-001 and legacy yearly KDM-2026-0026.
 */
export const normalizeOrderNumberInput = (input: string): string => {
  const trimmed = input.trim()
  const compact = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const match = /^([A-Z]{2,6})(\d+)$/.exec(compact)
  if (!match) return trimmed
  const [, code, digits] = match
  if (digits.length === 8) return `${code}-${digits.slice(0, 4)}-${digits.slice(4)}`
  if (digits.length >= 9) return `${code}-${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
  return trimmed
}
