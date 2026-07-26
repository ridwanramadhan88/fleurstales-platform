import { describe, expect, it } from 'vitest'
import { isStrongStaffPassword, STAFF_PASSWORD_HELP, STAFF_PASSWORD_MIN_LENGTH } from './staffCredentialDomain'

describe('staff password requirements', () => {
  it('requires at least six characters', () => {
    expect(STAFF_PASSWORD_MIN_LENGTH).toBe(6)
    expect(isStrongStaffPassword('Abc12')).toBe(false)
    expect(isStrongStaffPassword('Abc123')).toBe(true)
  })

  it('requires uppercase, lowercase, and a number without requiring a symbol', () => {
    expect(isStrongStaffPassword('abcdef1')).toBe(false)
    expect(isStrongStaffPassword('ABCDEF1')).toBe(false)
    expect(isStrongStaffPassword('Abcdef')).toBe(false)
    expect(isStrongStaffPassword('Abcdef1')).toBe(true)
    expect(STAFF_PASSWORD_HELP).toBe('Use at least 6 characters with uppercase, lowercase, and a number.')
  })
})
