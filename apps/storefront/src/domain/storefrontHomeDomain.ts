/**
 * @file storefrontHomeDomain.ts
 * @description Homepage-category routing rules. The poster uses short,
 * customer-friendly labels while the owner-managed catalog may use longer
 * names such as "Wedding Flowers" and "Standing Flowers".
 */

import type { CatalogCategoryFilter } from './catalogDomain'

export type StorefrontHomeCategory =
  | 'Birthday'
  | 'General Gifting'
  | 'Graduation'
  | 'Congratulations'
  | 'Anniversary'
  | 'Wedding'
  | 'Condolence'

const categoryCandidates: Record<StorefrontHomeCategory, string[]> = {
  Birthday: ['Birthday'],
  'General Gifting': ['General Gifting'],
  Graduation: ['Graduation'],
  Congratulations: ['Congratulations'],
  Anniversary: ['Anniversary'],
  Wedding: ['Wedding'],
  Condolence: ['Condolence'],
}

const normalizeCategory = (value: string): string =>
  value.trim().toLocaleLowerCase()

/** Resolves a homepage label to a real configured catalog category. */
export const resolveStorefrontHomeCategory = (
  label: StorefrontHomeCategory,
  availableCategories: string[],
): CatalogCategoryFilter => {
  const normalizedCategories = availableCategories.map((category) => ({
    category,
    normalized: normalizeCategory(category),
  }))

  for (const candidate of categoryCandidates[label]) {
    const normalizedCandidate = normalizeCategory(candidate)
    const exact = normalizedCategories.find(
      (item) => item.normalized === normalizedCandidate,
    )
    if (exact) return exact.category
  }

  for (const candidate of categoryCandidates[label]) {
    const normalizedCandidate = normalizeCategory(candidate)
    const partial = normalizedCategories.find(
      (item) =>
        item.normalized.includes(normalizedCandidate) ||
        normalizedCandidate.includes(item.normalized),
    )
    if (partial) return partial.category
  }

  return 'all'
}
