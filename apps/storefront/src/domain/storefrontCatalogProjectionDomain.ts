import type {
  CatalogProduct,
  CatalogSizeGuideSize,
  CatalogSizeGuideTarget,
  CatalogSizeGuideTemplate,
  CatalogVariant,
} from '../store/catalogStoreTypes'
import { resolveCatalogSizeGuide } from '../store/catalogStoreSizeGuideActions'

export type StorefrontVariantAvailabilityCode =
  | 'sellable'
  | 'inactive'
  | 'size_template_missing'
  | 'size_needs_review'
  | 'size_archived'

export interface StorefrontVariantAvailability {
  sellable: boolean
  code: StorefrontVariantAvailabilityCode
  size?: CatalogSizeGuideSize
}

export const getStorefrontVariantAvailability = (
  product: Pick<CatalogProduct, 'id' | 'productType'>,
  variant: CatalogVariant,
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): StorefrontVariantAvailability => {
  if (variant.status !== 'active') return { sellable: false, code: 'inactive' }

  // Legacy variants remain sellable until staff explicitly links them. Never
  // infer a stable child identity from the customer-facing size label.
  if (!variant.sizeOptionId) return { sellable: true, code: 'sellable' }

  const template = resolveCatalogSizeGuide(product, templates, targets, { includeLogical: true })
  if (!template) return { sellable: false, code: 'size_template_missing' }

  const size = template.sizes.find((item) => item.id === variant.sizeOptionId)
  if (!size) return { sellable: false, code: 'size_needs_review' }
  if (size.isActive === false) return { sellable: false, code: 'size_archived', size }

  return { sellable: true, code: 'sellable', size }
}

export const getStorefrontSellableVariants = (
  product: CatalogProduct,
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): CatalogVariant[] => product.variants.filter(
  (variant) => getStorefrontVariantAvailability(product, variant, templates, targets).sellable,
)

const asPublicVariant = (variant: CatalogVariant): CatalogVariant => {
  const {
    cost: _cost,
    flowerRecipe: _flowerRecipe,
    ...publicVariant
  } = variant
  return publicVariant
}

/**
 * Customer-facing Catalog projection.
 *
 * Business OS may intentionally retain inactive and "needs review" variants,
 * but Storefront only receives sellable variants. Internal Cost and recipe
 * data are stripped defensively even when a local/demo source happens to
 * contain them.
 */
export const projectStorefrontProduct = (
  product: CatalogProduct,
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): CatalogProduct | null => {
  if (!product.isActive) return null

  const variants = getStorefrontSellableVariants(product, templates, targets).map(asPublicVariant)
  if (variants.length === 0) return null

  return { ...product, variants }
}

export const projectStorefrontCatalog = (
  products: CatalogProduct[],
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): CatalogProduct[] => products.flatMap((product) => {
  const projected = projectStorefrontProduct(product, templates, targets)
  return projected ? [projected] : []
})

export const getStorefrontDisplayPriceIdr = (product: CatalogProduct): number => {
  if (product.variants.length === 0) return 0
  return Math.min(...product.variants.map((variant) => variant.price))
}

/**
 * Strict child guide resolution for customer UI. Stable ID only: no label
 * matching and no parent-level fallback.
 */
export const getStorefrontVariantSizeGuide = (
  product: Pick<CatalogProduct, 'id' | 'productType'>,
  variant: CatalogVariant | undefined,
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): { template: CatalogSizeGuideTemplate; size: CatalogSizeGuideSize } | null => {
  if (!variant?.sizeOptionId) return null
  const template = resolveCatalogSizeGuide(product, templates, targets, { includeLogical: true })
  if (!template) return null
  const size = template.sizes.find((item) => item.id === variant.sizeOptionId)
  if (!size || size.isActive === false) return null
  return { template, size }
}
