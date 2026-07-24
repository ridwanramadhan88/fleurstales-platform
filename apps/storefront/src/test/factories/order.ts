/**
 * @file order.ts
 * @description Shared test factory for OrderTableRow. Centralizing this
 * keeps domain tests focused on the field(s) that matter for each
 * assertion instead of restating the full shape everywhere.
 */
import type { OrderTableRow } from '../../types/orders'

export const makeOrder = (overrides: Partial<OrderTableRow> = {}): OrderTableRow => {
  const totalIdr = overrides.totalIdr ?? 100_000
  return {
    orderNumber: 'ORD-0001',
    customerName: 'Test Customer',
    source: 'walk_in',
    fulfillment: 'delivery',
    status: 'confirmed',
    totalIdr,
    branch: 'Kedamaian',
    paymentStatus: 'unpaid',
    createdAtLabel: '1 Jan 2026, 10:00',
    items: [
      {
        id: 'line_test_0001',
        quantity: 1,
        unitPriceIdr: totalIdr,
      },
    ],
    ...overrides,
  }
}
