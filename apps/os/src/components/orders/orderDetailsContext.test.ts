import { describe, expect, it } from 'vitest'
import {
  getOrderDetailContextLabel,
  getOrderDetailContextTab,
  shouldShowAdminLifecycle,
} from './orderDetailsContext'

describe('order detail contextual tabs', () => {
  it('keeps active operational orders focused on Details for every role', () => {
    for (const role of ['admin', 'owner', 'florist', 'finance'] as const) {
      expect(getOrderDetailContextTab({ order: { status: 'pending_verification' }, role, financeActionable: true })).toBeNull()
      expect(getOrderDetailContextTab({ order: { status: 'confirmed' }, role, financeActionable: true })).toBeNull()
      expect(getOrderDetailContextTab({ order: { status: 'processing' }, role, financeActionable: true })).toBeNull()
      expect(getOrderDetailContextTab({ order: { status: 'ready' }, role, financeActionable: true })).toBeNull()
      expect(getOrderDetailContextTab({ order: { status: 'delivering' }, role, financeActionable: true })).toBeNull()
    }
  })

  it('shows Finance only for actionable Finance work after an order is finished', () => {
    expect(getOrderDetailContextTab({ order: { status: 'delivered' }, role: 'finance', financeActionable: true })).toBe('finance')
    expect(getOrderDetailContextTab({ order: { status: 'picked_up' }, role: 'finance', financeActionable: true })).toBe('finance')
    expect(getOrderDetailContextTab({ order: { status: 'delivered' }, role: 'finance', financeActionable: false })).toBeNull()
    expect(getOrderDetailContextTab({ order: { status: 'cancelled' }, role: 'finance', financeActionable: true })).toBeNull()
    expect(getOrderDetailContextTab({ order: { status: 'failed' }, role: 'finance', financeActionable: true })).toBeNull()
  })

  it('never shows the contextual Finance tab to non-Finance roles', () => {
    for (const role of ['admin', 'owner', 'florist', 'hr'] as const) {
      expect(getOrderDetailContextTab({ order: { status: 'delivered' }, role, financeActionable: true })).toBeNull()
    }
  })

  it('shows the lifecycle stepper to operational roles until the order is finished', () => {
    for (const role of ['admin', 'owner', 'florist', 'finance'] as const) {
      expect(shouldShowAdminLifecycle(role, 'pending_verification')).toBe(true)
      expect(shouldShowAdminLifecycle(role, 'processing')).toBe(true)
      expect(shouldShowAdminLifecycle(role, 'delivering')).toBe(true)
      expect(shouldShowAdminLifecycle(role, 'delivered')).toBe(false)
      expect(shouldShowAdminLifecycle(role, 'picked_up')).toBe(false)
      expect(shouldShowAdminLifecycle(role, 'cancelled')).toBe(false)
      expect(shouldShowAdminLifecycle(role, 'failed')).toBe(false)
    }
    expect(shouldShowAdminLifecycle('hr', 'processing')).toBe(false)
  })

  it('uses the Finance contextual label in each UI language', () => {
    expect(getOrderDetailContextLabel('finance', 'id')).toBe('Keuangan')
    expect(getOrderDetailContextLabel('finance', 'en')).toBe('Finance')
  })
})
