/**
 * @file catalogDomain.ts
 * @description Pure business logic for the Catalog: category/material
 * filtering, search, and featured-product selection. Kept out of components
 * so CatalogTabContent stays presentational, matching the Store → Domain →
 * UI pattern used across the app.
 */

import type {
  CatalogCategory,
  CatalogMaterial,
  CatalogProduct,
} from '../store/catalogStoreTypes'

export type CatalogCategoryFilter = 'all' | CatalogCategory
export type CatalogSubCategoryFilter = 'all' | CatalogMaterial
/**
 * @description Lifecycle filter for products: 'active' is the default
 * working set, 'archived' shows only deactivated products (bulk-archived
 * or manually turned off), 'all' shows both.
 */
export type CatalogStatusFilter = 'active' | 'archived' | 'all'

/**
 * @description Sort order applied to the filtered product list. Kept as a
 * pure, explicit list (rather than inferring from column taps) so the sort
 * control can be a single dropdown that works the same on mobile and desktop.
 */
export type CatalogSortOption =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'featured_first'

export const CATALOG_SORT_LABELS: Record<CatalogSortOption, string> = {
  name_asc: 'Name (A–Z)',
  name_desc: 'Name (Z–A)',
  price_asc: 'Price (low to high)',
  price_desc: 'Price (high to low)',
  featured_first: 'Featured first',
}

/**
 * @description All SKUs for a product, used for search matching and
 * uniqueness checks.
 */
const productSkus = (product: CatalogProduct): string[] =>
  product.variants.map((variant) => variant.sku)

/**
 * @description Returns products, optionally scoped by occasion tags,
 * material, lifecycle status, and a free-text search on name/SKU/description.
 */
export const filterCatalogProducts = (
  products: CatalogProduct[],
  options: {
    category: CatalogCategoryFilter
    subCategory: CatalogSubCategoryFilter
    query: string
    status?: CatalogStatusFilter
  },
): CatalogProduct[] => {
  const query = options.query.trim().toLowerCase()
  const status = options.status ?? 'active'

  return products.filter((product) => {
    if (status === 'active' && !product.isActive) return false
    if (status === 'archived' && product.isActive) return false
    if (
      options.category !== 'all' &&
      !(product.occasionTags ?? []).includes(options.category)
    ) {
      return false
    }
    if (
      options.subCategory !== 'all' &&
      product.material !== options.subCategory
    ) {
      return false
    }
    if (query.length > 0) {
      const haystack = [
        product.name,
        product.productId,
        ...productSkus(product),
        product.description ?? '',
        product.productType ?? '',
        ...(product.occasionTags ?? []),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

/**
 * @description Featured products for the top carousel/section.
 */
export const getFeaturedProducts = (
  products: CatalogProduct[],
): CatalogProduct[] => products.filter((product) => product.isActive && product.isFeatured)

/**
 * @description Products currently on promo (has a promo label), used for a
 * "Promo" section similar to the reference screenshots.
 */
export const getPromoProducts = (
  products: CatalogProduct[],
): CatalogProduct[] =>
  products.filter((product) => product.isActive && Boolean(product.promoLabel))

/**
 * @description Configured occasions in their Business OS display order.
 * Occasion routing reads only `occasionTags`; arrangement type and collection
 * are intentionally handled by their own independent filters.
 */
export const getAvailableCategories = (
  products: CatalogProduct[],
  allCategoryNamesInOrder: string[],
): CatalogCategory[] => {
  // The category list is configuration-driven; keep the product argument in
  // the public selector signature for callers that already provide it.
  void products
  // Keep every configured occasion routable, including intentionally empty
  // categories such as Anniversary. The product grid will simply show its
  // empty state until Business OS assigns products to that occasion.
  return allCategoryNamesInOrder
}

/**
 * @description Distinct materials (fresh/artificial) present for the
 * currently selected category.
 */
export const getAvailableSubCategories = (
  products: CatalogProduct[],
  category: CatalogCategoryFilter,
): CatalogMaterial[] => {
  const scoped =
    category === 'all'
      ? products
      : products.filter(
          (product) => (product.occasionTags ?? []).includes(category),
        )
  const present = new Set(scoped.map((product) => product.material))
  return (['fresh', 'artificial'] as CatalogMaterial[]).filter((material) =>
    present.has(material),
  )
}

/**
 * @description Effective display price for a product: its lowest active
 * variant price (falls back to the lowest variant price overall if none
 * are active).
 */
export const getDisplayPriceIdr = (product: CatalogProduct): number => {
  const active = product.variants.filter((variant) => variant.status === 'active')
  const pool = active.length > 0 ? active : product.variants
  if (pool.length === 0) return 0
  return Math.min(...pool.map((variant) => variant.price))
}


/**
 * @description Customer-facing promotion label. Prefer a discount calculated
 * from the original and current price, then fall back to any numeric percent
 * stored in the legacy promo label. Always returns the customer-facing `number% off` presentation.
 */
export const getPromoPercentLabel = (
  product: CatalogProduct,
  currentPriceIdr: number = getDisplayPriceIdr(product),
): string | null => {
  if (
    product.originalPriceIdr &&
    product.originalPriceIdr > currentPriceIdr &&
    currentPriceIdr > 0
  ) {
    const percent = Math.round(
      ((product.originalPriceIdr - currentPriceIdr) /
        product.originalPriceIdr) *
        100,
    )
    return `${percent}% off`
  }

  const match = product.promoLabel?.match(/(\d+(?:\.\d+)?)/)
  return match ? `${Math.round(Number(match[1]))}% off` : null
}

/**
 * @description Display info for an order's item, resolved live from Catalog
 * when the order references a real catalog product/variant. This is the one
 * place Orders UI should go for "what is this order's item" — it always
 * reflects the current Catalog name/price/category, so a rename or price
 * change in Catalog shows up everywhere immediately without touching Orders.
 */
export interface OrderProductDisplay {
  /** Resolved display name (includes variant label when applicable). */
  name: string
  sku?: string
  category?: CatalogCategory
  imageUrl?: string
  /** Current Catalog selling price — may differ from the order's historical totalIdr. */
  currentPriceIdr?: number
  /** False for legacy/custom line items with no catalog product behind them. */
  isLinkedToCatalog: boolean
}

/**
 * @description Resolves an order's product/variant reference against the
 * live Catalog product list. Falls back to the order's own free-text
 * `productName` (custom / legacy items) when there is no catalog link, or
 * when the linked product no longer exists.
 */
export const resolveOrderProductDisplay = (
  products: CatalogProduct[],
  order: { productId?: string; variantId?: string; productName?: string },
): OrderProductDisplay => {
  if (order.productId) {
    const product = products.find(
      (item) => item.id === order.productId || item.productId === order.productId,
    )
    if (product) {
      const variant = order.variantId
        ? product.variants.find((item) => item.id === order.variantId)
        : undefined

      return {
        name: variant ? `${product.name} – ${variant.size}` : product.name,
        sku: variant?.sku ?? product.variants[0]?.sku,
        category: product.category,
        imageUrl: product.thumbnail,
        currentPriceIdr: variant ? variant.price : getDisplayPriceIdr(product),
        isLinkedToCatalog: true,
      }
    }
  }

  return {
    name: order.productName?.trim() || 'Order',
    isLinkedToCatalog: false,
  }
}

 /**
 * Applied after filtering; always returns a new array.
 */
export const sortCatalogProducts = (
  products: CatalogProduct[],
  sort: CatalogSortOption,
): CatalogProduct[] => {
  const sorted = [...products]
  switch (sort) {
    case 'name_asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'name_desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case 'price_asc':
      return sorted.sort((a, b) => getDisplayPriceIdr(a) - getDisplayPriceIdr(b))
    case 'price_desc':
      return sorted.sort((a, b) => getDisplayPriceIdr(b) - getDisplayPriceIdr(a))
    case 'featured_first':
      return sorted.sort((a, b) => {
        const featuredDiff =
          Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))
        if (featuredDiff !== 0) return featuredDiff
        return a.name.localeCompare(b.name)
      })
    default:
      return sorted
  }
}

/**
 * @description Aggregated counts for the Catalog Overview section.
 */
export const getCatalogOverviewStats = (
  products: CatalogProduct[],
): {
  totalProducts: number
  activeCount: number
  archivedCount: number
  featuredCount: number
  promoCount: number
} => {
  const activeCount = products.filter((product) => product.isActive).length
  return {
    totalProducts: products.length,
    activeCount,
    archivedCount: products.length - activeCount,
    featuredCount: products.filter(
      (product) => product.isActive && product.isFeatured,
    ).length,
    promoCount: products.filter(
      (product) => product.isActive && Boolean(product.promoLabel),
    ).length,
  }
}
