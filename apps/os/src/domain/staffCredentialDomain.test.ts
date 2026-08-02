import { describe, expect, it } from 'vitest'
import { isStrongStaffPassword, STAFF_PASSWORD_HELP, STAFF_PASSWORD_MIN_LENGTH } from './staffCredentialDomain'

describe('staff password requirements', () => {
  it('requires at least six characters', () => {
    expect(STAFF_PASSWORD_MIN_LENGTH).toBe(6)
    expect(isStrongStaffPassword('12345')).toBe(false)
    expect(isStrongStaffPassword('123456')).toBe(true)
  })

  it('does not impose character-class requirements', () => {
    expect(isStrongStaffPassword('abcdef')).toBe(true)
    expect(isStrongStaffPassword('ABCDEF')).toBe(true)
    expect(isStrongStaffPassword('123456')).toBe(true)
    expect(isStrongStaffPassword('!@#$%^')).toBe(true)
    expect(STAFF_PASSWORD_HELP).toBe('Use at least 6 characters.')
  })
})
