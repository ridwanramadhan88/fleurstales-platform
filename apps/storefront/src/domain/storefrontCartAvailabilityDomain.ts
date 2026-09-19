import type { CatalogProduct, CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from '../store/catalogStoreTypes'
import {
  getStorefrontSellableVariants,
  getStorefrontVariantAvailability,
} from './storefrontCatalogProjectionDomain'

export type StorefrontCartIssueCode =
  | 'product_unavailable'
  | 'variant_unavailable'
  | 'variant_selection_required'
  | 'size_assignment_missing'
  | 'size_needs_review'
  | 'size_archived'

export interface StorefrontCartAvailabilityLine {
  lineId: string
  productId: string
  variantId?: string
}

export interface StorefrontCartIssue {
  lineId: string
  code: StorefrontCartIssueCode
  message: string
}

export const getStorefrontCartIssues = (
  lines: StorefrontCartAvailabilityLine[],
  products: CatalogProduct[],
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): StorefrontCartIssue[] => lines.flatMap((line): StorefrontCartIssue[] => {
  const product = products.find((item) => item.id === line.productId)
  if (!product || !product.isActive) {
    return [{ lineId: line.lineId, code: 'product_unavailable', message: 'This product is no longer available.' }]
  }

  const sellableVariants = getStorefrontSellableVariants(product, templates, targets)
  const variant = line.variantId
    ? product.variants.find((item) => item.id === line.variantId)
    : sellableVariants.length === 1 ? sellableVariants[0] : undefined

  if (!variant) {
    return [{
      lineId: line.lineId,
      code: line.variantId ? 'variant_unavailable' : 'variant_selection_required',
      message: line.variantId
        ? 'This product option is no longer available.'
        : 'Please choose a product option again before checkout.',
    }]
  }

  const availability = getStorefrontVariantAvailability(product, variant, templates, targets)
  switch (availability.code) {
    case 'sellable':
      return []
    case 'inactive':
      return [{ lineId: line.lineId, code: 'variant_unavailable', message: 'This product option is no longer available.' }]
    case 'size_template_missing':
      return [{
        lineId: line.lineId,
        code: 'size_assignment_missing',
        message: 'This product option needs an update before checkout. Please remove it and choose it again.',
      }]
    case 'size_needs_review':
      return [{
        lineId: line.lineId,
        code: 'size_needs_review',
        message: 'This product option has changed and needs review before it can be ordered.',
      }]
    case 'size_archived':
      return [{
        lineId: line.lineId,
        code: 'size_archived',
        message: 'This size is no longer available.',
      }]
  }
})

export const firstStorefrontCartIssueMessage = (issues: StorefrontCartIssue[]): string | null =>
  issues[0]?.message ?? null
