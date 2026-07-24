import { describe, expect, it } from 'vitest'
import {
  normalizeNavigationRequest,
  toAppTab,
  toFinanceModule,
  toHrSection,
  toOrders,
} from './appNavigation'

describe('app navigation targets', () => {
  it('normalizes existing top-level route IDs without changing them', () => {
    expect(normalizeNavigationRequest('customers')).toEqual({ tab: 'customers' })
    expect(toAppTab('settings')).toEqual({ tab: 'settings' })
  })

  it('creates deterministic Finance module targets', () => {
    expect(toFinanceModule('collect_orders')).toEqual({
      tab: 'finance',
      financeModule: 'collect_orders',
    })
    expect(toFinanceModule('payroll')).toEqual({
      tab: 'finance',
      financeModule: 'payroll',
    })
  })

  it('keeps existing order and HR deep-link details in one request', () => {
    expect(toOrders({ orderNumber: 'ORD-100', ordersSubTab: 'custom' })).toEqual({
      tab: 'orders',
      orderNumber: 'ORD-100',
      ordersSubTab: 'custom',
    })
    expect(toHrSection('attendance', 'emp-1')).toEqual({
      tab: 'hr',
      hrSection: 'attendance',
      targetId: 'emp-1',
    })
  })
})
