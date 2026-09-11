import { describe, expect, it } from 'vitest'
import {
  getOrderDetailContextLabel,
  getOrderDetailContextTab,
  shouldShowAdminLifecycle,
} from './orderDetailsContext'

describe('order detail contextual tabs', () => {
  it('keeps one stable Process tab for Admin across active order stages', () => {
    for (const status of ['pending_verification', 'confirmed', 'processing', 'ready', 'delivering'] as const) {
      expect(getOrderDetailContextTab({ order: { status }, role: 'admin', financeActionable: false })).toBe('process')
    }
  })

  it('removes the Admin contextual tab after the operational workflow is finished', () => {
    for (const status of ['delivered', 'picked_up', 'cancelled', 'failed'] as const) {
      expect(getOrderDetailContextTab({ order: { status }, role: 'admin', financeActionable: false })).toBeNull()
    }
  })

  it('shows Production to Florist only while assigned production work is active', () => {
    expect(getOrderDetailContextTab({ order: { status: 'confirmed' }, role: 'florist', financeActionable: false })).toBe('production')
    expect(getOrderDetailContextTab({ order: { status: 'processing' }, role: 'florist', financeActionable: false })).toBe('production')
    expect(getOrderDetailContextTab({ order: { status: 'ready' }, role: 'florist', financeActionable: false })).toBe('production')
    expect(getOrderDetailContextTab({ order: { status: 'delivering' }, role: 'florist', financeActionable: false })).toBeNull()
    expect(getOrderDetailContextTab({ order: { status: 'delivered' }, role: 'florist', financeActionable: false })).toBeNull()
  })

  it('shows Finance only while Finance has an action on the order', () => {
    expect(getOrderDetailContextTab({ order: { status: 'processing' }, role: 'finance', financeActionable: true })).toBe('finance')
    expect(getOrderDetailContextTab({ order: { status: 'delivered' }, role: 'finance', financeActionable: true })).toBe('finance')
    expect(getOrderDetailContextTab({ order: { status: 'processing' }, role: 'finance', financeActionable: false })).toBeNull()
  })

  it('shows the lifecycle stepper only to Admin on active operational orders', () => {
    expect(shouldShowAdminLifecycle('admin', 'processing')).toBe(true)
    expect(shouldShowAdminLifecycle('owner', 'processing')).toBe(false)
    expect(shouldShowAdminLifecycle('florist', 'processing')).toBe(false)
    expect(shouldShowAdminLifecycle('finance', 'processing')).toBe(false)
    expect(shouldShowAdminLifecycle('admin', 'delivered')).toBe(false)
    expect(shouldShowAdminLifecycle('admin', 'cancelled')).toBe(false)
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
