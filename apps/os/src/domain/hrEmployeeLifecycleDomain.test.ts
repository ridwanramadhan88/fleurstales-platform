import { describe, expect, it } from 'vitest'
import { getEmployeeReadiness, getEmployeeRemovalBlockers } from './hrEmployeeLifecycleDomain'
import type { Employee } from '../store/hrStoreTypes'

const employee: Employee = {
  id:'emp-new',
  name:'New Florist',
  position:'Florist',
  branch:'',
  systemRole:'florist',
  status:'active',
  phone:'',
  hireDate:'2026-08-01',
  username:'new.florist',
  email:'new@example.com',
}

describe('HR employee lifecycle', () => {
  it('uses the role salary when no individual override exists', () => {
    expect(getEmployeeReadiness({ employee, roleSalaryIdr:4_000_000, productionAuth:true })).toEqual({
      state:'active',
      missing:[],
      effectiveBaseSalaryIdr:4_000_000,
    })
  })

  it('shows setup required without a production recovery email', () => {
    const readiness = getEmployeeReadiness({
      employee:{ ...employee, email:undefined },
      roleSalaryIdr:4_000_000,
      productionAuth:true,
    })
    expect(readiness.state).toBe('setup_required')
    expect(readiness.missing).toContain('Recovery email')
  })

  it('blocks permanent removal when operational history exists', () => {
    const blockers = getEmployeeRemovalBlockers({
      employeeId:employee.id,
      attendance:[{ id:'att-1', employeeId:employee.id, date:'2026-08-01', status:'present', actor:'Staff', createdAt:'2026-08-01T00:00:00Z' }],
      attendanceReviews:[],
      points:[],
      scheduleOverrides:[],
      scheduleRevisions:[],
      schedulePublications:[],
      orders:[],
      payrollDrafts:[],
      compensations:[],
      today:'2026-08-05',
    })
    expect(blockers).toEqual([{ key:'attendance', label:'attendance records', count:1 }])
  })

  it('allows an unused setup record to be removed', () => {
    expect(getEmployeeRemovalBlockers({
      employeeId:employee.id,
      attendance:[],
      attendanceReviews:[],
      points:[],
      scheduleOverrides:[],
      scheduleRevisions:[],
      schedulePublications:[],
      orders:[],
      payrollDrafts:[],
      compensations:[],
      today:'2026-08-05',
    })).toEqual([])
  })
})
