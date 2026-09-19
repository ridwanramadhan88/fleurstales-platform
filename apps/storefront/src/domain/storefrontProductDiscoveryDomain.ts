export const STOREFRONT_INITIAL_PRODUCT_BATCH_SIZE = 24
export const STOREFRONT_PRODUCT_BATCH_SIZE = 24

export const clampStorefrontVisibleCount = (
  requested: number,
  total: number,
): number => {
  if (total <= 0) return 0
  const normalized = Number.isFinite(requested) ? Math.floor(requested) : STOREFRONT_INITIAL_PRODUCT_BATCH_SIZE
  return Math.min(total, Math.max(STOREFRONT_INITIAL_PRODUCT_BATCH_SIZE, normalized))
}

export const getNextStorefrontVisibleCount = (
  current: number,
  total: number,
): number => clampStorefrontVisibleCount(current + STOREFRONT_PRODUCT_BATCH_SIZE, total)
