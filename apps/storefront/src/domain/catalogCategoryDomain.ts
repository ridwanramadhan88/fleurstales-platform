/** Pure validation for user-managed Catalog categories. */
import type { CatalogCategoryConfig, CatalogProduct } from '../store/catalogStoreTypes'
import { generateCategoryPrefix } from './catalogIdDomain'

const normalizePrefix = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

export type NewCategoryPlan =
  | { ok: true; name: string; prefix: string }
  | { ok: false; reason: string }

export const planNewCategory = (
  name: string,
  existingCategories: CatalogCategoryConfig[],
  requestedPrefix?: string,
): NewCategoryPlan => {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'Occasion name is required.' }
  if (existingCategories.some((category) => category.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, reason: `"${trimmed}" already exists.` }
  }

  const prefix = requestedPrefix?.trim()
    ? normalizePrefix(requestedPrefix)
    : generateCategoryPrefix(trimmed, existingCategories.map((category) => category.prefix))
  if (prefix.length < 3 || prefix.length > 5) {
    return { ok: false, reason: 'SKU prefix must contain 3–5 letters or numbers.' }
  }
  if (existingCategories.some((category) => category.prefix.toUpperCase() === prefix)) {
    return { ok: false, reason: `Prefix "${prefix}" is already used.` }
  }
  return { ok: true, name: trimmed, prefix }
}

export type CategoryUpdatePlan =
  | { ok: true; trimmedName: string; prefix: string; previousName: string }
  | { ok: false; reason: string }

export const planCategoryUpdate = (
  id: string,
  name: string,
  prefixValue: string,
  categories: CatalogCategoryConfig[],
): CategoryUpdatePlan => {
  const target = categories.find((category) => category.id === id)
  if (!target) return { ok: false, reason: 'Occasion not found.' }

  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, reason: 'Occasion name is required.' }
  if (categories.some((category) => category.id !== id && category.name.toLowerCase() === trimmedName.toLowerCase())) {
    return { ok: false, reason: `"${trimmedName}" already exists.` }
  }

  const prefix = normalizePrefix(prefixValue)
  if (prefix.length < 3 || prefix.length > 5) {
    return { ok: false, reason: 'SKU prefix must contain 3–5 letters or numbers.' }
  }
  if (categories.some((category) => category.id !== id && category.prefix.toUpperCase() === prefix)) {
    return { ok: false, reason: `Prefix "${prefix}" is already used.` }
  }

  return { ok: true, trimmedName, prefix, previousName: target.name }
}

/** Compatibility helper retained for callers that only rename a category. */
export const planCategoryRename = (
  id: string,
  name: string,
  categories: CatalogCategoryConfig[],
): CategoryUpdatePlan => {
  const target = categories.find((category) => category.id === id)
  return planCategoryUpdate(id, name, target?.prefix ?? '', categories)
}

export type CategoryDeletionCheck =
  | { ok: true; targetName: string; inactiveProductCount: number; inactivePrimaryProductCount: number }
  | { ok: false; reason: string; activeProductCount?: number }

/** Returns whether a product is routed through the given customer-facing occasion. */
export const productUsesCatalogCategory = (
  product: CatalogProduct,
  categoryName: string,
): boolean =>
  product.category === categoryName ||
  (product.occasionTags ?? []).includes(categoryName)

export const validateCategoryDeletion = (
  id: string,
  categories: CatalogCategoryConfig[],
  products: CatalogProduct[],
): CategoryDeletionCheck => {
  const target = categories.find((category) => category.id === id)
  if (!target) return { ok: false, reason: 'Occasion not found.' }
  if (target.name === 'Uncategorized') {
    return { ok: false, reason: 'Uncategorized is the protected fallback category.' }
  }

  const activeProductCount = products.filter(
    (product) => productUsesCatalogCategory(product, target.name) && product.isActive,
  ).length
  if (activeProductCount > 0) {
    return {
      ok: false,
      activeProductCount,
      reason: `This occasion cannot be removed because it is still used by ${activeProductCount} active product${activeProductCount === 1 ? '' : 's'}.`,
    }
  }

  const inactiveProductCount = products.filter(
    (product) => productUsesCatalogCategory(product, target.name) && !product.isActive,
  ).length
  const inactivePrimaryProductCount = products.filter(
    (product) => product.category === target.name && !product.isActive,
  ).length
  return { ok: true, targetName: target.name, inactiveProductCount, inactivePrimaryProductCount }
}
