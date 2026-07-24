/**
 * @file orderLineItemsDomain.ts
 * @description Pure helpers for the order line-item model. See
 * `docs/business-rules/order-line-items-scoping.md` for the full plan this
 * is step 1-2 of. This file is PURE — no store imports, no side effects.
 */
import type { OrderLineItem } from '../types/orders'

/**
 * @description Builds the `items` array for a single-item order (the
 * internal New Order sheet / legacy intake path, which only ever creates
 * one line today). Kept separate from the multi-line storefront path so
 * each call site stays honest about what it actually knows.
 */
export const buildSingleItemLine = (input: {
  id: string
  productId?: string
  variantId?: string
  productName?: string
  totalIdr: number
}): OrderLineItem[] => [
  {
    id: input.id,
    productId: input.productId,
    variantId: input.variantId,
    productName: input.productName?.trim() || 'Custom order',
    quantity: 1,
    unitPriceIdr: input.totalIdr,
  },
]

/**
 * @description The inverse of the above for `productId`/`variantId`:
 * derives them from `items` for backward compatibility with every existing
 * read site during the migration. Matches the pre-migration behavior for
 * the two cases that existed before `items`: exactly one line (fields come
 * from it) or anything else — zero or multiple lines (both fields
 * `undefined`, same as today's multi-item storefront orders).
 *
 * `productName` is deliberately NOT derived here: the two existing
 * call sites have genuinely different fallback behavior for it (the
 * internal New Order path always defaults to `'Custom order'` regardless
 * of `productId`; the storefront path only sets it — to a multi-item
 * summary string, not any single line's name — when there's more than one
 * line). Folding that into one function would change one path's behavior
 * to match the other's. Each call site keeps computing its own
 * `productName` exactly as before; only `productId`/`variantId` are common
 * enough across both to share.
 */
export const deriveLegacyProductIds = (
  items: OrderLineItem[],
): { productId?: string; variantId?: string } => {
  if (items.length !== 1) {
    return { productId: undefined, variantId: undefined }
  }
  const [line] = items
  return { productId: line.productId, variantId: line.variantId }
}

