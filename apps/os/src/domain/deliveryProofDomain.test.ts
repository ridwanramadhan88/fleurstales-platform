import { describe, expect, it } from 'vitest'
import type { OrderTableRow } from '../types/orders'
import { buildDeliveryProofStoragePath, getCourierTasks, toDialDigits } from './deliveryProofDomain'

const order = (overrides: Partial<OrderTableRow>): OrderTableRow =>
  ({ orderNumber: 'X', status: 'ready', ...overrides }) as OrderTableRow

describe('getCourierTasks', () => {
  it('lists only this courier\'s ready/delivering orders, on-the-way first then by schedule', () => {
    const tasks = getCourierTasks([
      order({ orderNumber: 'A', deliveryCourierEmployeeId: 'c1', status: 'ready', scheduleDate: '2026-11-10', scheduleTime: '14:00' }),
      order({ orderNumber: 'B', deliveryCourierEmployeeId: 'c1', status: 'ready', scheduleDate: '2026-11-10', scheduleTime: '09:00' }),
      order({ orderNumber: 'C', deliveryCourierEmployeeId: 'c1', status: 'delivering', scheduleDate: '2026-11-10', scheduleTime: '16:00' }),
      order({ orderNumber: 'D', deliveryCourierEmployeeId: 'c2', status: 'ready' }),
      order({ orderNumber: 'E', deliveryCourierEmployeeId: 'c1', status: 'delivered' }),
      order({ orderNumber: 'F', status: 'ready' }),
    ], 'c1')
    expect(tasks.map((task) => task.order.orderNumber)).toEqual(['C', 'B', 'A'])
    expect(tasks.map((task) => task.stage)).toEqual(['delivering', 'ready', 'ready'])
  })

  it('returns nothing without an employee id', () => {
    expect(getCourierTasks([order({ deliveryCourierEmployeeId: '' })], '')).toEqual([])
  })
})

describe('toDialDigits', () => {
  it('normalises Indonesian numbers', () => {
    expect(toDialDigits('0812-3456-789')).toBe('628123456789')
    expect(toDialDigits('+62 812 3456 789')).toBe('628123456789')
    expect(toDialDigits(undefined)).toBe('')
  })
})

describe('buildDeliveryProofStoragePath', () => {
  it('uses the <orderId>/proof- shape the database expects', () => {
    expect(buildDeliveryProofStoragePath('ord-123')).toMatch(/^ord-123\/proof-[\w-]+\.jpg$/)
  })
})
