import { describe, expect, it } from 'vitest'
import { canAccessSection, canEditSection } from './permissions'
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
})
