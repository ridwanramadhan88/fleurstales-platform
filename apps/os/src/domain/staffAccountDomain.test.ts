import { describe, expect, it } from 'vitest'
import { canChangeEmployeeRole, canCreateStaffAccount } from './staffAccountDomain'
import type { Employee } from '../store/hrStoreTypes'

const owner: Employee = { id:'o', name:'Owner', position:'Owner', branch:'Kedamaian', systemRole:'owner', status:'active', phone:'', hireDate:'2024-01-01', username:'owner', pin:'Fleur1' }
const admin: Employee = { id:'a', name:'Admin', position:'Admin', branch:'Kedamaian', systemRole:'admin', status:'active', phone:'', hireDate:'2024-01-01', username:'admin', pin:'Fleur1' }

describe('staff account rules', () => {
  it('requires lowercase usernames and passwords with upper/lowercase letters and a number', () => {
    expect(canCreateStaffAccount({ employees:[owner], email:'staff@example.com', username:'1staff', pin:'Staff1', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], email:'staff@example.com', username:'staff.one', pin:'staff1', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], email:'staff@example.com', username:'staff.one', pin:'Staff1', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(true)
    expect(canCreateStaffAccount({ employees:[owner], email:'', username:'staff.one', pin:'Staff1', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
  })
  it('blocks duplicate usernames and roles outside the actor scope', () => {
    expect(canCreateStaffAccount({ employees:[owner], email:'staff@example.com', username:'owner', pin:'Staff1', systemRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], email:'staff@example.com', username:'staff', pin:'Staff1', systemRole:'finance', actor:{name:'HR',role:'hr'} }).ok).toBe(false)
  })
  it('allows Owner and HR account creation only for their permitted roles', () => {
    expect(canCreateStaffAccount({ employees:[owner], email:'finance@example.com', username:'finance.two', pin:'Staff1', systemRole:'finance', actor:{name:'Owner',role:'owner'} }).ok).toBe(true)
    expect(canCreateStaffAccount({ employees:[owner], email:'admin@example.com', username:'admin.two', pin:'Staff1', systemRole:'admin', actor:{name:'HR',role:'hr'} }).ok).toBe(true)
    expect(canCreateStaffAccount({ employees:[owner], email:'florist@example.com', username:'florist.two', pin:'Staff1', systemRole:'florist', actor:{name:'HR',role:'hr'} }).ok).toBe(true)
    expect(canCreateStaffAccount({ employees:[owner], email:'owner2@example.com', username:'owner.two', pin:'Staff1', systemRole:'owner', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], email:'hr@example.com', username:'hr.two', pin:'Staff1', systemRole:'hr', actor:{name:'HR',role:'hr'} }).ok).toBe(false)
  })
  it('prevents reassigning the last active owner', () => {
    expect(canChangeEmployeeRole({ employees:[owner,admin], employeeId:'o', nextRole:'admin', actor:{name:'Owner',role:'owner'} }).ok).toBe(false)
  })
  it('respects the Owner-configured hrManagedRoles scope for HR account creation', () => {
    const narrowedScope = { employees: ['florist' as const] }
    expect(canCreateStaffAccount({ employees:[owner], email:'admin3@example.com', username:'admin.three', pin:'Staff1', systemRole:'admin', actor:{name:'HR',role:'hr'}, hrManagedRoles: narrowedScope }).ok).toBe(false)
    expect(canCreateStaffAccount({ employees:[owner], email:'florist3@example.com', username:'florist.three', pin:'Staff1', systemRole:'florist', actor:{name:'HR',role:'hr'}, hrManagedRoles: narrowedScope }).ok).toBe(true)
    const widenedScope = { employees: ['admin' as const, 'florist' as const, 'finance' as const] }
    expect(canCreateStaffAccount({ employees:[owner], email:'finance3@example.com', username:'finance.three', pin:'Staff1', systemRole:'finance', actor:{name:'HR',role:'hr'}, hrManagedRoles: widenedScope }).ok).toBe(true)
  })
})
