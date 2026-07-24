import { describe, expect, it } from 'vitest'
import { DEFAULT_OWNER_SETTINGS } from './settings/defaultOwnerSettings'
import { canEditScheduling, canViewScheduling, getEffectiveScheduleForDate, getWeekDates, summarizeWeeklyCoverage } from './hrSchedulingDomain'
import type { Employee, ScheduleOverride } from '../store/hrStoreTypes'

const employee: Employee = { id:'emp-vero', name:'Vero', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2025-01-01' }

describe('HR scheduling domain', () => {
  it('builds a Monday-to-Sunday week', () => {
    expect(getWeekDates('2026-07-15')).toEqual(['2026-07-13','2026-07-14','2026-07-15','2026-07-16','2026-07-17','2026-07-18','2026-07-19'])
  })

  it('uses no branch until a dated assignment exists', () => {
    const unassigned = getEffectiveScheduleForDate({ employee, date:'2026-07-13', defaults:[], overrides:[], settings:DEFAULT_OWNER_SETTINGS })
    expect(unassigned).toMatchObject({ source:'company_default', shift:{ branchId:'', isWorking:false } })

    const override: ScheduleOverride = { id:'o1', employeeId:employee.id, date:'2026-07-13', shift:{ isWorking:true, branchId:'Pahoman', startTime:'10:00', endTime:'19:00' }, updatedAt:'', updatedBy:'HR' }
    expect(getEffectiveScheduleForDate({ employee, date:'2026-07-13', defaults:[], overrides:[override], settings:DEFAULT_OWNER_SETTINGS })).toMatchObject({ source:'override', shift:{ branchId:'Pahoman', isWorking:true } })
  })

  it('keeps Owner edit access and supports view-only roles', () => {
    const permissions = structuredClone(DEFAULT_OWNER_SETTINGS.permissions)
    permissions.owner.scheduling = 'none'
    expect(canViewScheduling('owner', permissions)).toBe(false)
    expect(canEditScheduling('admin', DEFAULT_OWNER_SETTINGS.permissions)).toBe(false)
  })
})

describe('branch-aware shift modes', () => {
  it('resolves future inherited shifts from current branch hours', () => {
    const settings = structuredClone(DEFAULT_OWNER_SETTINGS)
    settings.branches[0].openingHours!.monday = { isOpen:true, opensAt:'10:00', closesAt:'20:00' }
    const override: ScheduleOverride = {
      id:'follow-1', employeeId:employee.id, date:'2099-07-13',
      shift:{ mode:'follow_branch_hours', isWorking:true, branchId:'Kedamaian', startTime:'09:00', endTime:'18:00' },
      updatedAt:'', updatedBy:'HR',
    }
    expect(getEffectiveScheduleForDate({ employee, date:'2099-07-13', defaults:[], overrides:[override], settings }).shift)
      .toMatchObject({ mode:'follow_branch_hours', startTime:'10:00', endTime:'20:00' })
  })

  it('preserves a past inherited shift snapshot', () => {
    const settings = structuredClone(DEFAULT_OWNER_SETTINGS)
    settings.branches[0].openingHours!.monday = { isOpen:true, opensAt:'10:00', closesAt:'20:00' }
    const override: ScheduleOverride = {
      id:'past-1', employeeId:employee.id, date:'2020-07-13',
      shift:{ mode:'follow_branch_hours', isWorking:true, branchId:'Kedamaian', startTime:'08:00', endTime:'17:00' },
      updatedAt:'', updatedBy:'HR',
    }
    expect(getEffectiveScheduleForDate({ employee, date:'2020-07-13', defaults:[], overrides:[override], settings }).shift)
      .toMatchObject({ startTime:'08:00', endTime:'17:00' })
  })
})


describe('weekly staffing coverage', () => {
  it('flags Admin and Florist shortages per open branch', () => {
    const admin: Employee = { ...employee, id:'admin-1', name:'Ari', position:'Admin', systemRole:'admin' }
    const overrides: ScheduleOverride[] = [
      { id:'f1', employeeId:employee.id, date:'2099-07-13', shift:{ isWorking:true, branchId:'Kedamaian', startTime:'07:00', endTime:'16:00' }, updatedAt:'', updatedBy:'HR' },
      { id:'a1', employeeId:admin.id, date:'2099-07-13', shift:{ isWorking:true, branchId:'Kedamaian', startTime:'07:30', endTime:'16:30' }, updatedAt:'', updatedBy:'HR' },
    ]
    const result = summarizeWeeklyCoverage({
      employees:[employee, admin],
      dates:['2099-07-13'],
      defaults:[],
      overrides,
      branchIds:['Kedamaian'],
      settingsForDate:()=>({ ...DEFAULT_OWNER_SETTINGS, scheduling:{ ...DEFAULT_OWNER_SETTINGS.scheduling, minimumCoverage:{ admin:1, florist:2 } } }),
    })
    expect(result[0]).toMatchObject({ adminScheduled:1, floristScheduled:1, adminRequired:1, floristRequired:2, hasShortage:true })
  })

  it('does not require coverage when the branch is closed', () => {
    const settings = structuredClone(DEFAULT_OWNER_SETTINGS)
    settings.branches[0].openingHours!.sunday.isOpen = false
    const result = summarizeWeeklyCoverage({ employees:[employee], dates:['2099-07-19'], defaults:[], overrides:[], branchIds:['Kedamaian'], settingsForDate:()=>settings })
    expect(result[0]).toMatchObject({ isOpen:false, adminRequired:0, floristRequired:0, hasShortage:false })
  })
})
