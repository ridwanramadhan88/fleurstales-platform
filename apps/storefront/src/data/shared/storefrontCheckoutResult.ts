import type { CreateStorefrontOrderResult } from './contracts'
import type { StorefrontCheckoutRepository } from './repositoryContracts'
import { requestStorefrontNavigation } from '../../lib/storefrontNavigation'

let latestCreatedOrder: CreateStorefrontOrderResult | null = null

export const rememberStorefrontCheckoutResult = (
  repository: StorefrontCheckoutRepository,
): StorefrontCheckoutRepository => ({
  quoteOrder: (input) => repository.quoteOrder(input),
  async createOrder(input) {
    const result = await repository.createOrder(input)
    latestCreatedOrder = result
    if (result.publicTrackingId) {
      queueMicrotask(() => requestStorefrontNavigation({
        path: `/order/${encodeURIComponent(result.publicTrackingId)}`,
      }))
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
