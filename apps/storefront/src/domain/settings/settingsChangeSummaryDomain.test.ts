import { describe, expect, it } from 'vitest'
import { summarizeActionPermissions, summarizeSectionChanges } from './settingsChangeSummaryDomain'
import { DEFAULT_OWNER_SETTINGS as defaultOwnerSettings } from './defaultOwnerSettings'
import { DEFAULT_ACTION_PERMISSIONS } from '../../config/actionPermissions'

describe('summarizeSectionChanges', () => {
  it('returns nothing when a section is unchanged', () => {
    expect(summarizeSectionChanges('store-profile', defaultOwnerSettings.storeProfile, defaultOwnerSettings.storeProfile)).toEqual([])
  })

  it('describes store profile field changes with before/after values', () => {
    const before = defaultOwnerSettings.storeProfile
    const after = { ...before, storeName: 'New Name', phone: '0800' }
    const summary = summarizeSectionChanges('store-profile', before, after)
    expect(summary).toContain(`Store name: ${before.storeName} → New Name`)
    expect(summary).toContain(`WhatsApp: ${before.phone} → 0800`)
  })

  it('reports added, removed, and edited branches distinctly', () => {
    const before = defaultOwnerSettings.branches
    const firstBranch = before[0]
    const after = [
      { ...firstBranch, isActive: false },
      { id: 'branch-new', name: 'New Outlet', code: 'NEW', address: '', phone: '', isActive: true },
    ]
    const summary = summarizeSectionChanges('branches', before, after)
    expect(summary.some((line) => line.startsWith('Added branch "New Outlet"'))).toBe(true)
    expect(summary.some((line) => line.startsWith('Removed branch') && before.length > 1)).toBe(before.length > 1)
    expect(summary.some((line) => line.includes(`Branch "${firstBranch.name}"`) && line.includes('status'))).toBe(true)
  })

  it('summarizes permission matrix cell changes with role and section labels', () => {
    const before = defaultOwnerSettings.permissions
    const after = {
      ...before,
      finance: { ...before.finance, hr: before.finance.hr === 'edit' ? 'view' : 'edit' } as typeof before.finance,
    }
    const summary = summarizeSectionChanges('permissions', before, after)
    expect(summary.some((line) => line.startsWith('Finance — HR:'))).toBe(true)
  })
})

describe('summarizeActionPermissions', () => {
  it('returns nothing when nothing changed', () => {
    expect(summarizeActionPermissions(DEFAULT_ACTION_PERMISSIONS, DEFAULT_ACTION_PERMISSIONS)).toEqual([])
  })

  it('reports capability toggles by role and label', () => {
    const after = {
      ...DEFAULT_ACTION_PERMISSIONS,
      admin: { ...DEFAULT_ACTION_PERMISSIONS.admin, 'finance.verify_order': true },
    }
    const summary = summarizeActionPermissions(DEFAULT_ACTION_PERMISSIONS, after)
    expect(summary).toContain('Admin — Verify Orders: Enabled')
  })
})
