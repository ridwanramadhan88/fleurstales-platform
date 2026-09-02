import { describe, expect, it } from 'vitest'
import { canAccessSection, canEditSection, DEFAULT_ROLE_SECTION_ACCESS } from './permissions'
import type { UserRole } from '../store/userStore'

describe('settings section access', () => {
  it('grants Owner full access to Settings', () => {
    expect(canAccessSection('owner', 'settings')).toBe(true)
    expect(canEditSection('owner', 'settings')).toBe(true)
  })

  it.each(['admin', 'finance', 'hr', 'florist'] as UserRole[])(
    '%s cannot see or edit Settings',
    (role) => {
      expect(canAccessSection(role, 'settings')).toBe(false)
      expect(canEditSection(role, 'settings')).toBe(false)
    },
  )

  it('keeps the hard role floor even when runtime settings try to grant extra access', () => {
    const permissions = structuredClone(DEFAULT_ROLE_SECTION_ACCESS)
    permissions.hr.orders = 'edit'
    permissions.florist.orders = 'edit'

    expect(canAccessSection('hr', 'orders', permissions)).toBe(false)
    expect(canEditSection('hr', 'orders', permissions)).toBe(false)
    expect(canAccessSection('florist', 'orders', permissions)).toBe(false)
    expect(canEditSection('florist', 'orders', permissions)).toBe(false)
    expect(canEditSection('admin', 'orders', permissions)).toBe(true)
  })
})
