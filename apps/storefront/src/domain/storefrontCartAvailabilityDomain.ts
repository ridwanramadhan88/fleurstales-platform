import type { CatalogProduct, CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from '../store/catalogStoreTypes'
import { resolveCatalogSizeGuide } from '../store/catalogStoreSizeGuideActions'

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

  const activeVariants = product.variants.filter((variant) => variant.status === 'active')
  const variant = line.variantId
    ? product.variants.find((item) => item.id === line.variantId)
    : activeVariants.length === 1 ? activeVariants[0] : undefined

  if (!variant) {
    return [{
      lineId: line.lineId,
      code: line.variantId ? 'variant_unavailable' : 'variant_selection_required',
      message: line.variantId
        ? 'This product option is no longer available.'
        : 'Please choose a product option again before checkout.',
    }]
  }
  if (variant.status !== 'active') {
    return [{ lineId: line.lineId, code: 'variant_unavailable', message: 'This product option is no longer available.' }]
  }

  // Legacy variants without a stable Size Template child ID remain purchasable
  // until they are explicitly linked. Never infer a link from the display label.
  if (!variant.sizeOptionId) return []

  const template = resolveCatalogSizeGuide(
    { id: product.id, productType: product.productType },
    templates,
    targets,
    { includeLogical: true },
  )
  if (!template) {
    return [{
      lineId: line.lineId,
      code: 'size_assignment_missing',
      message: 'This product option needs an update before checkout. Please remove it and choose it again.',
    }]
  }

  const size = template.sizes.find((item) => item.id === variant.sizeOptionId)
  if (!size) {
    return [{
      lineId: line.lineId,
      code: 'size_needs_review',
      message: 'This product option has changed and needs review before it can be ordered.',
    }]
  }
  if (size.isActive === false) {
    return [{
      lineId: line.lineId,
      code: 'size_archived',
      message: 'This size is no longer available.',
    }]
  }

  return []
})

export const firstStorefrontCartIssueMessage = (issues: StorefrontCartIssue[]): string | null =>
  issues[0]?.message ?? null
