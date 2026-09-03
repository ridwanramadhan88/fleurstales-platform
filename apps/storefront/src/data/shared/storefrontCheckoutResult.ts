import type { CreateStorefrontOrderResult } from './contracts'
import type { StorefrontCheckoutRepository } from './repositoryContracts'

let latestCreatedOrder: CreateStorefrontOrderResult | null = null

export const rememberStorefrontCheckoutResult = (
  repository: StorefrontCheckoutRepository,
): StorefrontCheckoutRepository => ({
  quoteOrder: (input) => repository.quoteOrder(input),
  async createOrder(input) {
    const result = await repository.createOrder(input)
    latestCreatedOrder = result
    return result
  },
})

export const consumeLatestStorefrontCheckoutResult = (orderNumber: string): CreateStorefrontOrderResult | null => {
  if (!latestCreatedOrder || latestCreatedOrder.orderNumber !== orderNumber) return null
  const result = latestCreatedOrder
  latestCreatedOrder = null
  return result
}
