import type { CreateStorefrontOrderResult } from './contracts'
import type { StorefrontCheckoutRepository } from './repositoryContracts'

const STOREFRONT_NAVIGATION_EVENT = 'fleurstales:storefront-navigation'

let latestCreatedOrder: CreateStorefrontOrderResult | null = null

export const rememberStorefrontCheckoutResult = (
  repository: StorefrontCheckoutRepository,
): StorefrontCheckoutRepository => ({
  quoteOrder: (input) => repository.quoteOrder(input),
  async createOrder(input) {
    const result = await repository.createOrder(input)
    latestCreatedOrder = result
    if (result.publicTrackingId && typeof window !== 'undefined') {
      const path = `/order/${encodeURIComponent(result.publicTrackingId)}`
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent(STOREFRONT_NAVIGATION_EVENT, { detail: { path } }))
      })
    }
    return result
  },
})

export const consumeLatestStorefrontCheckoutResult = (orderNumber: string): CreateStorefrontOrderResult | null => {
  if (!latestCreatedOrder || latestCreatedOrder.orderNumber !== orderNumber) return null
  const result = latestCreatedOrder
  latestCreatedOrder = null
  return result
}
