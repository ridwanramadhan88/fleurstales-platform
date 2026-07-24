/**
 * Pure Phase 8 order contract helpers. These functions deliberately read
 * authoritative Catalog/Branch state instead of trusting cart display prices.
 */
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import type { BranchSettings } from '../../types/settings'
import type { CreateStorefrontOrderInput } from './contracts'
import { getBranchHoursForDate, isTimeWithinBranchOpeningHours } from '../../domain/branchOpeningHoursDomain'

export interface ResolvedStorefrontOrderItem {
  productId: string
  variantId: string
  productCodeSnapshot: string
  productNameSnapshot: string
  variantSkuSnapshot: string
  variantSizeSnapshot: string
  quantity: number
  unitPriceIdr: number
}

export interface ResolvedStorefrontOrderPricing {
  branchId: string
  items: ResolvedStorefrontOrderItem[]
  itemsSubtotalIdr: number
  discountIdr: number
  deliveryFeeIdr: number
  totalIdr: number
}

const money = (value: number): number => Math.max(0, Math.round(Number.isFinite(value) ? value : 0))

const localJakartaDate = (now: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export const resolveStorefrontOrderPricing = ({
  request,
  products,
  branches,
  trustedDiscountIdr = 0,
  now = new Date(),
}: {
  request: CreateStorefrontOrderInput
  products: CatalogProduct[]
  branches: BranchSettings[]
  /** Discount that has already passed the internal voucher domain. Never sent as an anonymous RPC amount. */
  trustedDiscountIdr?: number
  now?: Date
}): ResolvedStorefrontOrderPricing => {
  if (!request.idempotencyKey.trim() || request.idempotencyKey.trim().length < 16 || request.idempotencyKey.trim().length > 128) {
    throw new Error('A valid checkout idempotency key is required.')
  }

  const branch = branches.find((item) => item.id === request.branchId && item.isActive)
  if (!branch) throw new Error('Selected branch is unavailable.')
  if (!request.scheduleDate || !request.scheduleTime) throw new Error('Schedule date and time are required.')
  if (request.scheduleDate < localJakartaDate(now)) throw new Error('Schedule date cannot be in the past.')
  const hours = getBranchHoursForDate(branch, request.scheduleDate)
  if (!hours?.isOpen) throw new Error('Selected branch is closed on this date.')
  if (!isTimeWithinBranchOpeningHours(branch, request.scheduleDate, request.scheduleTime)) {
    throw new Error('Selected time is outside branch opening hours.')
  }
  if (request.fulfillment === 'delivery' && !request.deliveryAddress?.trim()) {
    throw new Error('Delivery address is required.')
  }
  if (request.fulfillment === 'delivery' && request.paymentMethod === 'cash') {
    throw new Error('Cash payment is only available for pickup orders.')
  }
  if (request.items.length < 1 || request.items.length > 20) {
    throw new Error('Order must contain between 1 and 20 items.')
  }

  const productById = new Map(products.map((product) => [product.id, product]))
  const items = request.items.map((requested): ResolvedStorefrontOrderItem => {
    if (!Number.isInteger(requested.quantity) || requested.quantity < 1 || requested.quantity > 99) {
      throw new Error('Item quantity must be between 1 and 99.')
    }
    const product = productById.get(requested.productId)
    if (!product?.isActive) throw new Error('A selected product is unavailable.')
    const variant = product.variants.find((item) => item.id === requested.variantId && item.status === 'active')
    if (!variant) throw new Error('A selected product variant is unavailable.')
    return {
      productId: product.id,
      variantId: variant.id,
      productCodeSnapshot: product.productId,
      productNameSnapshot: product.name,
      variantSkuSnapshot: variant.sku,
      variantSizeSnapshot: variant.size,
      quantity: requested.quantity,
      unitPriceIdr: money(variant.price),
    }
  })

  const itemsSubtotalIdr = items.reduce((sum, item) => sum + item.unitPriceIdr * item.quantity, 0)
  const discountIdr = Math.min(itemsSubtotalIdr, money(trustedDiscountIdr))
  const deliveryFeeIdr = request.fulfillment === 'delivery' ? money(branch.deliveryFeeIdr ?? 0) : 0
  return {
    branchId: branch.id,
    items,
    itemsSubtotalIdr,
    discountIdr,
    deliveryFeeIdr,
    totalIdr: Math.max(0, itemsSubtotalIdr - discountIdr + deliveryFeeIdr),
  }
}
