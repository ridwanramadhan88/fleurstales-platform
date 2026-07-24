import { describe, expect, it } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import { getEmployeeOrderPerformance } from './employeeOrderPerformanceDomain'

const order = (overrides: Partial<OrderTableRow>): OrderTableRow => ({
  orderNumber: 'ORD-1', customerName: 'Customer', source: 'walk_in', fulfillment: 'pickup',
  status: 'confirmed', totalIdr: 100_000, branch: 'Kedamaian', paymentStatus: 'unpaid',
  createdAtLabel: 'Today', ...overrides,
})

describe('employee order performance', () => {
  it('derives florist and admin totals from stable order attribution ids', () => {
    const orders = [
      order({ orderNumber:'A', status:'processing', floristAssignedEmployeeId:'f1', adminHandledEmployeeId:'a1', processingStartedAt:'2026-07-15T01:00:00Z' }),
      order({ orderNumber:'B', status:'delivered', floristAssignedEmployeeId:'f1', adminHandledEmployeeId:'a1', processingStartedAt:'2026-07-15T02:00:00Z' }),
      order({ orderNumber:'C', status:'ready', floristAssignedEmployeeId:'f1' }),
    ]
    expect(getEmployeeOrderPerformance('f1', orders)).toMatchObject({ floristAssigned:3, floristCompleted:1, floristProcessing:1 })
    expect(getEmployeeOrderPerformance('a1', orders).adminStartedProcessing).toBe(2)
  })
})
