import { describe, expect, it } from 'vitest'
import { buildHrMonthlyReport } from './hrMonthlyReportDomain'
import { DEFAULT_OWNER_SETTINGS } from './settings/defaultOwnerSettings'
import type { Employee } from '../store/hrStoreTypes'

const employee: Employee = { id:'e1', name:'Vero', position:'Florist', branch:'Kedamaian', systemRole:'florist', status:'active', phone:'', hireDate:'2026-01-01' }

describe('hr monthly report', () => {
  it('counts attendance problem tasks without early checkout metrics', () => {
    const rows = buildHrMonthlyReport({
      month:'2026-07', employees:[employee], attendance:[{ id:'a1', employeeId:'e1', date:'2026-07-06', status:'present', actor:'Vero', createdAt:'x', checkInAt:'2026-07-06T00:10:00.000Z' }],
      reviewCases:[
        { id:'r1', attendanceId:'a1', employeeId:'e1', date:'2026-07-06', warningType:'late_check_in', status:'problem', reason:'Late', createdAt:'x' },
        { id:'r2', attendanceId:'a2', employeeId:'e1', date:'2026-07-07', warningType:'missing_check_out', status:'accepted', reason:'Missing', createdAt:'x' },
      ],
      defaults:[], overrides:[], settings:DEFAULT_OWNER_SETTINGS, branchId:'All',
    })
    expect(rows[0].presentDays).toBe(1)
    expect(rows[0].lateTasks).toBe(1)
    expect(rows[0].missingCheckOutTasks).toBe(1)
    expect(rows[0].openProblems).toBe(1)
  })
})
