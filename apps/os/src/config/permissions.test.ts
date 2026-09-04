import { describe, expect, it } from 'vitest'
import { canAccessSection, canEditSection } from './permissions'
import type { UserRole } from '../store/userStore'

describe('section access', () => {
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

  it.each(['owner', 'admin', 'finance', 'hr'] as UserRole[])(
    '%s can read Orders and Customers',
    (role) => {
      expect(canAccessSection(role, 'orders')).toBe(true)
      expect(canAccessSection(role, 'customers')).toBe(true)
    },
  )

  it('gives HR read-only access to Orders and Customers', () => {
    expect(canAccessSection('hr', 'orders')).toBe(true)
    expect(canEditSection('hr', 'orders')).toBe(false)
    expect(canAccessSection('hr', 'customers')).toBe(true)
    expect(canEditSection('hr', 'customers')).toBe(false)
  })

  it('keeps Finance Orders and Customers read-only', () => {
    expect(canAccessSection('finance', 'orders')).toBe(true)
    expect(canEditSection('finance', 'orders')).toBe(false)
    expect(canAccessSection('finance', 'customers')).toBe(true)
    expect(canEditSection('finance', 'customers')).toBe(false)
  })
})
