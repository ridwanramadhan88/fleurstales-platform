import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'

const initial = useHrStore.getState().employees
const owner = { name:'Budi', role:'owner' as const }

describe('employee account store', () => {
  beforeEach(() => useHrStore.setState({ employees: initial, attendance: [] }))
  it('creates an active employee account with normalized username', () => {
    const result = useHrStore.getState().createStaffAccount({ name:'Rina', position:'Florist', branch:'Kedamaian', systemRole:'florist', phone:'', hireDate:'2026-07-10', username:'rina.one', pin:'654321', actor:owner })
    expect(result.ok).toBe(true)
    expect(useHrStore.getState().employees[0]).toMatchObject({ username:'rina.one', pin:'654321', status:'active', systemRole:'florist', position:'Florist' })
  })

  it('lets Owner create Finance and HR accounts but not another Owner', () => {
    const finance = useHrStore.getState().createStaffAccount({ name:'Finance Two', position:'Finance', branch:'Kedamaian', systemRole:'finance', phone:'', hireDate:'2026-07-10', username:'finance.two', pin:'654321', actor:owner })
    const hr = useHrStore.getState().createStaffAccount({ name:'HR Two', position:'HR', branch:'Kedamaian', systemRole:'hr', phone:'', hireDate:'2026-07-10', username:'hr.two', pin:'654321', actor:owner })
    const ownerAccount = useHrStore.getState().createStaffAccount({ name:'Owner Two', position:'Owner', branch:'Kedamaian', systemRole:'owner', phone:'', hireDate:'2026-07-10', username:'owner.two', pin:'654321', actor:owner })
    expect(finance.ok).toBe(true)
    expect(hr.ok).toBe(true)
    expect(ownerAccount.ok).toBe(false)
  })
  it('lets HR create Admin and Florist accounts only', () => {
    const actor = { name:'Star', role:'hr' as const }
    const adminResult = useHrStore.getState().createStaffAccount({ name:'Admin Two', position:'Admin', branch:'Kedamaian', systemRole:'admin', phone:'', hireDate:'2026-07-10', username:'admin.two', pin:'654321', actor })
    const floristResult = useHrStore.getState().createStaffAccount({ name:'Florist Three', position:'Florist', branch:'Kedamaian', systemRole:'florist', phone:'', hireDate:'2026-07-10', username:'florist.three', pin:'654321', actor })
    const financeResult = useHrStore.getState().createStaffAccount({ name:'Finance Three', position:'Finance', branch:'Kedamaian', systemRole:'finance', phone:'', hireDate:'2026-07-10', username:'finance.three', pin:'654321', actor })
    expect(adminResult.ok).toBe(true)
    expect(floristResult.ok).toBe(true)
    expect(financeResult.ok).toBe(false)
  })
  it('updates a system role through the owner-only command', () => {
    const employee = initial.find((item) => item.username === 'vero')!
    expect(useHrStore.getState().updateEmployeeRole(employee.id, 'admin', owner).ok).toBe(true)
    expect(useHrStore.getState().employees.find((item) => item.id === employee.id)?.systemRole).toBe('admin')
  })
})

it('ignores legacy branch input because schedules own branch assignment', () => {
  const state = useHrStore.getState()
  const result = state.updateEmployeeAccess({
    employeeId: initial.find((item) => item.username === 'vero')!.id,
    branch: 'missing-branch',
    systemRole: 'florist',
    username: 'vero',
    actor: owner,
  })
  expect(result.ok).toBe(true)
})

it('lets HR create an employee profile without silently creating login credentials', () => {
  const result = useHrStore.getState().addEmployee({
    name: 'Profile Only',
    position: 'Florist',
    branch: 'Kedamaian',
    systemRole: 'florist',
    phone: '',
    hireDate: '2026-07-10',
    actor: { name: 'Star', role: 'hr' },
  })
  expect(result.ok).toBe(true)
  const created = useHrStore.getState().employees.find((item) => item.name === 'Profile Only')
  expect(created).toMatchObject({ systemRole: 'florist' })
  expect(created?.username).toBeUndefined()
  expect(created?.pin).toBeUndefined()
})
