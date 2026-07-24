/**
 * @file catalogIdDomain.ts
 * @description Pure, store-independent logic for generating the two
 * system-managed identifiers described in the Product Catalog System
 * Specification v2.0:
 *  - Product ID: one per master product, generated once, read-only, never
 *    reused even after the product is deleted.
 *  - SKU: one per variant, generated on save from Category + Material +
 *    Product + Size, read-only, never changes after creation.
 * Kept pure (no store/UUID side effects beyond string formatting) so the
 * generation rules can be unit tested in isolation.
 */

import type { CatalogMaterial } from '../store/catalogStoreTypes'

const MATERIAL_CODE: Record<CatalogMaterial, string> = {
  fresh: 'FRE',
  artificial: 'ART',
}

/**
 * @description Derives a short, uppercase, alphanumeric code from free text
 * (e.g. "Hand Bouquet Classic" -> "HBC"). Shared by category-prefix
 * generation and SKU product-name codes.
 */
const codeFromName = (name: string, length = 3): string => {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
  if (!cleaned) return 'GEN'
  const words = cleaned.split(/\s+/)
  if (words.length === 1) {
    return words[0].slice(0, length).padEnd(length, 'X')
  }
  // Multi-word name: take the leading letters of each word until `length`.
  const code = words.map((word) => word[0]).join('').slice(0, length)
  return code.padEnd(length, 'X')
}

/**
 * @description Generates a unique 3-letter Product ID prefix for a new
 * category, derived from its name (e.g. "Gift Hampers" -> "GIF"). Assigned
 * once at category-creation time and stored permanently on the category
 * record — never recomputed later, so existing Product IDs/SKUs stay valid
 * even if the category is renamed or other categories are added/removed
 * afterward. Falls back to a numbered variant on collision (e.g. "GI2").
 */
export const generateCategoryPrefix = (
  name: string,
  existingPrefixes: string[],
): string => {
  const used = new Set(existingPrefixes.map((prefix) => prefix.toUpperCase()))
  const base = codeFromName(name)
  if (!used.has(base)) return base

  for (let n = 2; n <= 9; n += 1) {
    const candidate = `${base.slice(0, 2)}${n}`
    if (!used.has(candidate)) return candidate
  }
  // Extremely unlikely fallback: pad with a running number.
  let suffix = 1
  let candidate = `${base.slice(0, 1)}${String(suffix).padStart(2, '0')}`
  while (used.has(candidate)) {
    suffix += 1
    candidate = `${base.slice(0, 1)}${String(suffix).padStart(2, '0')}`
  }
  return candidate
}

/**
 * @description Generates the next Product ID for a category, e.g.
 * "BOQ-000001", given that category's permanent prefix. Scans existing IDs
 * (including ones belonging to deleted products, if the caller retains a
 * tombstone list) so a number is never reused. Sequence is per-category,
 * 6 digits, zero-padded.
 */
export const generateProductId = (
  categoryPrefix: string,
  existingProductIds: string[],
): string => {
  const prefix = categoryPrefix
  let maxSeq = 0
  for (const id of existingProductIds) {
    if (!id.startsWith(`${prefix}-`)) continue
    const seq = Number.parseInt(id.slice(prefix.length + 1), 10)
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  const next = maxSeq + 1
  return `${prefix}-${String(next).padStart(6, '0')}`
}

const codeFromSize = (size: string): string =>
  size
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4) || 'STD'

/**
 * @description Generates a unique SKU for a variant from
 * Category + Material + Product + Size, per spec (e.g.
 * "BOQ-FRE-RSB-05R-001"), given that category's permanent prefix. Appends a
 * numeric disambiguator if the base combination collides with an existing SKU.
 */
export const generateSku = (
  categoryPrefix: string,
  material: CatalogMaterial,
  productName: string,
  size: string,
  existingSkus: string[],
): string => {
  const base = [
    categoryPrefix,
    MATERIAL_CODE[material],
    codeFromName(productName),
    codeFromSize(size),
  ].join('-')

  const existing = new Set(existingSkus)
  let suffix = 1
  let sku = `${base}-${String(suffix).padStart(3, '0')}`
  while (existing.has(sku)) {
    suffix += 1
    sku = `${base}-${String(suffix).padStart(3, '0')}`
  }
  return sku
}
