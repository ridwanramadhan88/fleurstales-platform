import { describe, expect, it } from 'vitest'
import {
  getOrderDetailContextLabel,
  getOrderDetailContextTab,
  shouldShowAdminLifecycle,
} from './orderDetailsContext'

describe('order detail contextual tabs', () => {
  it('keeps Order Details primary before confirmation for every role', () => {
    for (const role of ['admin', 'owner', 'florist'] as const) {
      expect(getOrderDetailContextTab({ order: { status: 'pending_verification' }, role, financeActionable: false })).toBeNull()
    }
    expect(getOrderDetailContextTab({ order: { status: 'pending_verification' }, role: 'finance', financeActionable: true })).toBeNull()
  })

  it('keeps one stable Process tab for Admin and Owner after confirmation while the order is active', () => {
    for (const role of ['admin', 'owner'] as const) {
      for (const status of ['confirmed', 'processing', 'ready', 'delivering'] as const) {
        expect(getOrderDetailContextTab({ order: { status }, role, financeActionable: false })).toBe('process')
      }
    }
  })

  it('removes the Admin contextual tab after the operational workflow is finished', () => {
    for (const status of ['delivered', 'picked_up', 'cancelled', 'failed'] as const) {
      expect(getOrderDetailContextTab({ order: { status }, role: 'admin', financeActionable: false })).toBeNull()
    }
  })

  it('shows Production to Florist only while production work is active', () => {
    expect(getOrderDetailContextTab({ order: { status: 'confirmed' }, role: 'florist', financeActionable: false })).toBe('production')
    expect(getOrderDetailContextTab({ order: { status: 'processing' }, role: 'florist', financeActionable: false })).toBe('production')
    expect(getOrderDetailContextTab({ order: { status: 'ready' }, role: 'florist', financeActionable: false })).toBe('production')
    expect(getOrderDetailContextTab({ order: { status: 'delivering' }, role: 'florist', financeActionable: false })).toBeNull()
    expect(getOrderDetailContextTab({ order: { status: 'delivered' }, role: 'florist', financeActionable: false })).toBeNull()
  })

  it('shows Finance only after confirmation and while Finance has an action on the order', () => {
    expect(getOrderDetailContextTab({ order: { status: 'processing' }, role: 'finance', financeActionable: true })).toBe('finance')
    expect(getOrderDetailContextTab({ order: { status: 'delivered' }, role: 'finance', financeActionable: true })).toBe('finance')
    expect(getOrderDetailContextTab({ order: { status: 'processing' }, role: 'finance', financeActionable: false })).toBeNull()
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

  it('uses the requested contextual tab labels in each UI language', () => {
    expect(getOrderDetailContextLabel('process', 'id')).toBe('Proses')
    expect(getOrderDetailContextLabel('production', 'id')).toBe('Produksi')
    expect(getOrderDetailContextLabel('finance', 'id')).toBe('Keuangan')
    expect(getOrderDetailContextLabel('process', 'en')).toBe('Process')
    expect(getOrderDetailContextLabel('production', 'en')).toBe('Production')
    expect(getOrderDetailContextLabel('finance', 'en')).toBe('Finance')
  })
})
