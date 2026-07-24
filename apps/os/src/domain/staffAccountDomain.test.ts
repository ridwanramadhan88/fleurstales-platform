import { describe, expect, it } from 'vitest'
import { canChangeEmployeeRole, canCreateStaffAccount } from './staffAccountDomain'
import type { Employee } from '../store/hrStoreTypes'

const owner: Employee = { id:'o', name:'Owner', position:'Owner', branch:'Kedamaian', systemRole:'owner', status:'active', phone:'', hireDate:'2024-01-01', username:'owner', pin:'123456' }
const admin: Employee = { id:'a', name:'Admin', position:'Admin', branch:'Kedamaian', systemRole:'admin', status:'active', phone:'', hireDate:'2024-01-01', username:'admin', pin:'123456' }

describe('staff account rules', () => {
  it('requires lowercase usernames and six numeric PIN digits', () => {
    expect(canCreateStaffAccount({ employees:[owner], username:'1staff', pin:'123456', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], username:'staff.one', pin:'12345a', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], username:'staff.one', pin:'123456', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(true)
  })
  it('blocks duplicate usernames and roles outside the actor scope', () => {
    expect(canCreateStaffAccount({ employees:[owner], username:'owner', pin:'123456', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], username:'staff', pin:'123456', systemRole:'finance', actor:{name:'HR',role:'hr'} }).ok).toBe(false)
  })
  it('allows Owner and HR account creation only for their permitted roles', () => {
    expect(canCreateStaffAccount({ employees:[owner], username:'finance.two', pin:'654321', systemRole:'finance', actor:{name:'Owner',role:'owner'} }).ok).toBe(true)
    expect(canCreateStaffAccount({ employees:[owner], username:'admin.two', pin:'654321', systemRole:'admin', actor:{name:'HR',role:'hr'} }).ok).toBe(true)
    expect(canCreateStaffAccount({ employees:[owner], username:'florist.two', pin:'654321', systemRole:'florist', actor:{name:'HR',role:'hr'} }).ok).toBe(true)
    expect(canCreateStaffAccount({ employees:[owner], username:'owner.two', pin:'654321', systemRole:'owner', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], username:'hr.two', pin:'654321', systemRole:'hr', actor:{name:'HR',role:'hr'} }).ok).toBe(false)
  })
  it('prevents reassigning the last active owner', () => {
    expect(canChangeEmployeeRole({ employees:[owner,admin], employeeId:'o', nextRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
  })
  it('respects the Owner-configured hrManagedRoles scope for HR account creation', () => {
    const narrowedScope = { employees: ['florist' as const] }
    expect(canCreateStaffAccount({ employees:[owner], username:'admin.three', pin:'654321', systemRole:'admin', actor:{name:'HR',role:'hr'}, hrManagedRoles: narrowedScope }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], username:'florist.three', pin:'654321', systemRole:'florist', actor:{name:'HR',role:'hr'}, hrManagedRoles: narrowedScope }).ok).toBe(true)
    const widenedScope = { employees: ['admin' as const, 'florist' as const, 'finance' as const] }
    expect(canCreateStaffAccount({ employees:[owner], username:'finance.three', pin:'654321', systemRole:'finance', actor:{name:'HR',role:'hr'}, hrManagedRoles: widenedScope }).ok).toBe(true)
  })
})
