import { normalizeCustomerWhatsappNumber } from '../data/shared/customerIdentityDomain'
/**
 * @file formatters.ts
 * @description Shared, pure string-formatting helpers for currency-like and
 * phone-number inputs. Extracted because the same digit-stripping / IDR
 * formatting logic had been independently re-implemented (under different
 * names) in NewOrderSheet.tsx, OrderDetailsPanel.tsx, and
 * the focused orderTable* helper modules — a classic sign the logic belongs in one place
 * rather than in whichever component happened to need it first.
 *
 * These are pure functions with no React/store dependencies, so any form
 * or display surface across the app (order intake, order editing, the
 * storefront cart, etc.) can import from here instead of re-deriving the
 * same regex.
 */

/** Strips everything except digits from a string (spaces, dashes, "Rp", +, etc). */
export const digitsOnly = (raw: string): string => raw.replace(/[^\d]/g, '')

/**
 * @description Normalizes an IDR currency-like input string into a numeric
 * value. Returns `fallback` (default 0) if the input has no digits or
 * doesn't parse cleanly.
 */
export const sanitizeCurrency = (raw: string, fallback = 0): number => {
  const numeric = digitsOnly(raw)
  if (!numeric) return fallback
  const parsed = Number.parseInt(numeric, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

/**
 * @description Formats a numeric-like string into IDR-style grouped text
 * (e.g. "350000" -> "350.000"), for live-formatting an input as the user
 * types. Returns '' if there are no digits to format.
 */
export const formatIdrInput = (raw: string): string => {
  const numeric = digitsOnly(raw)
  if (!numeric) return ''
  return new Intl.NumberFormat('id-ID').format(Number.parseInt(numeric, 10))
}

/**
 * @description Canonical rounding rule for IDR amounts. Indonesian Rupiah
 * has no subunit in everyday use, so every derived financial figure
 * (averages, percentages-of-total, etc.) is rounded to the nearest whole
 * Rupiah through this single function rather than each call site picking
 * its own `Math.round` — this is what "consistent rounding" means in
 * practice: one rule, applied everywhere money is derived rather than
 * merely summed.
 */
export const roundIdr = (value: number): number => Math.round(value)

const idrGroupingFormatter = new Intl.NumberFormat('id-ID')

/**
 * @description Canonical display formatting for an IDR amount, e.g.
 * `formatIdrCurrency(350000)` -> `"Rp 350.000"`. This had been independently
 * re-implemented (under the same local name `formatIdr`, with the same
 * `Math.round` + grouping behavior) in TvDashboard.tsx, RevenueDashboard.tsx,
 * OverviewCardsController.ts, OrderFinanceReviewSheet.tsx, and
 * OrderTransactionVerificationQueue.tsx — all five now import this instead,
 * so a future change to how currency is displayed only has one place to
 * happen.
 */
export const formatIdrCurrency = (value: number): string =>
  `Rp ${idrGroupingFormatter.format(roundIdr(value))}`

/**
 * @description Normalizes a WhatsApp number for matching purposes by
 * stripping everything except digits (spaces, dashes, parentheses, leading
 * +). Distinct from `toWhatsAppPhoneDigits` in the focused orderTable* helper modules, which
 * additionally applies Indonesia's local-to-country-code prefix rule for
 * building wa.me links — this one is just for comparing two WhatsApp numbers
 * for equality.
 */
export const normalizeWhatsappNumber = (raw: string): string =>
  normalizeCustomerWhatsappNumber(raw)

/** @deprecated Use normalizeWhatsappNumber for customer contact matching. */
export const normalizePhone = (phone: string): string =>
  normalizeWhatsappNumber(phone)
