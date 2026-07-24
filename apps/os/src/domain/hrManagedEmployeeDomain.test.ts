import { describe, expect, it } from 'vitest'
import { isHrManagedEmployeeRole } from './hrManagedEmployeeDomain'

describe('HR managed employee scope', () => {
  it('allows Admin and Florist records', () => {
    expect(isHrManagedEmployeeRole('admin')).toBe(true)
    expect(isHrManagedEmployeeRole('florist')).toBe(true)
  })

  it('protects Owner, HR, and Finance records', () => {
    expect(isHrManagedEmployeeRole('owner')).toBe(false)
    expect(isHrManagedEmployeeRole('hr')).toBe(false)
    expect(isHrManagedEmployeeRole('finance')).toBe(false)
  })
})
