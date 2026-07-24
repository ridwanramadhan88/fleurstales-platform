import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import { useSettingsStore } from './settingsStore'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'

const initialEmployees = useHrStore.getState().employees
const hr = { name:'Star', role:'hr' as const }

describe('HR scheduling store', () => {
  beforeEach(() => {
    useSettingsStore.setState({ ...structuredClone(DEFAULT_OWNER_SETTINGS), settingsHasUnsavedChanges:false })
    useHrStore.setState({ employees:initialEmployees, attendance:[], employeeDefaultSchedules:[], scheduleOverrides:[], weeklySchedulePublications:[], scheduleRevisions:[] })
  })

  it('bulk applies one branch shift across employees and dates', () => {
    const ids = initialEmployees.filter((item) => item.status === 'active' && ['admin','florist'].includes(item.systemRole)).slice(0, 2).map((item) => item.id)
    const result = useHrStore.getState().bulkSetScheduleOverrides({
      employeeIds:ids,
      dates:['2026-07-13','2026-07-14'],
      shift:{ isWorking:true, branchId:'Kedamaian', startTime:'07:00', endTime:'16:00' },
      actor:hr,
    })
    expect(result).toEqual({ ok:true, affected:4 })
    expect(useHrStore.getState().scheduleOverrides).toHaveLength(4)
  })

  it('blocks inactive employees and invalid branch schedules', () => {
    const employee = initialEmployees.find((item) => item.systemRole === 'admin')!
    useHrStore.setState({ employees:initialEmployees.map((item) => item.id === employee.id ? { ...item, status:'inactive' as const } : item) })
    expect(useHrStore.getState().setScheduleOverride({ employeeId:employee.id, date:'2026-07-13', shift:{ isWorking:true, branchId:'Kedamaian', startTime:'09:00', endTime:'18:00' }, actor:hr })).toMatchObject({ ok:false, code:'inactive_employee' })

    useHrStore.setState({ employees:initialEmployees })
    expect(useHrStore.getState().setScheduleOverride({ employeeId:employee.id, date:'2026-07-13', shift:{ isWorking:true, branchId:'missing', startTime:'09:00', endTime:'18:00' }, actor:hr })).toMatchObject({ ok:false, code:'invalid_branch' })
  })

  it('does not create employee-level default branch schedules', () => {
    const employee = initialEmployees.find((item) => item.systemRole === 'florist')!
    const days = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((day) => [day, { isWorking:day !== 'sunday', branchId:'Pahoman', startTime:'10:00', endTime:'19:00' }])) as any
    expect(useHrStore.getState().saveEmployeeDefaultSchedule({ employeeId:employee.id, days, actor:hr })).toMatchObject({ ok:false })
    expect(useHrStore.getState().employeeDefaultSchedules).toHaveLength(0)
  })

  it('stores a branch-hours snapshot for inherited overrides', () => {
    const settings = structuredClone(DEFAULT_OWNER_SETTINGS)
    settings.branches[0].openingHours!.monday = { isOpen:true, opensAt:'10:00', closesAt:'20:00' }
    useSettingsStore.setState({ ...settings, settingsHasUnsavedChanges:false })
    const employee = initialEmployees.find((item) => item.status === 'active' && ['admin','florist'].includes(item.systemRole))!
    const result = useHrStore.getState().setScheduleOverride({
      employeeId:employee.id,
      date:'2099-07-13',
      shift:{ mode:'follow_branch_hours', isWorking:true, branchId:'Kedamaian', startTime:'09:00', endTime:'18:00' },
      actor:hr,
    })
    expect(result).toMatchObject({ ok:true })
    expect(useHrStore.getState().scheduleOverrides[0].shift).toMatchObject({ mode:'follow_branch_hours', startTime:'10:00', endTime:'20:00' })
  })


  it('generates a complete weekly schedule for active staff', () => {
    const eligible = initialEmployees.filter((item) => item.status === 'active' && ['admin','florist'].includes(item.systemRole))
    const result = useHrStore.getState().generateWeekFromDefaults({ weekStart:'2026-07-13', branchId:'All', actor:hr })
    expect(result.ok).toBe(true)
    expect(useHrStore.getState().scheduleOverrides.length).toBeGreaterThanOrEqual(eligible.length * 7)
    for (const employee of eligible) {
      const week = useHrStore.getState().scheduleOverrides.filter((item)=>item.employeeId===employee.id)
      expect(week).toHaveLength(7)
      expect(week.filter((item)=>!item.shift.isWorking)).toHaveLength(1)
    }
    for (const date of ['2026-07-13','2026-07-14','2026-07-15','2026-07-16','2026-07-17','2026-07-18','2026-07-19']) {
      const assignments = useHrStore.getState().scheduleOverrides.filter((item)=>item.date===date && item.shift.isWorking)
      const employeesById = new Map(initialEmployees.map((employee)=>[employee.id,employee]))
      const count = (role:'admin'|'florist', branch:'Kedamaian'|'Pahoman') => assignments.filter((item)=>employeesById.get(item.employeeId)?.systemRole===role && item.shift.branchId===branch).length
      expect(count('admin','Kedamaian')).toBeGreaterThanOrEqual(1)
      expect(count('admin','Pahoman')).toBeGreaterThanOrEqual(1)
      expect(count('florist','Kedamaian')).toBeGreaterThanOrEqual(2)
      expect(count('florist','Pahoman')).toBeGreaterThanOrEqual(2)
    }
  })

  it('publishes only a complete week with exactly one OFF day and flags later edits', () => {
    const eligible = initialEmployees.filter((item) => item.status === 'active' && ['admin','florist'].includes(item.systemRole))
    useHrStore.getState().generateWeekFromDefaults({ weekStart:'2026-07-13', branchId:'All', actor:hr })
    expect(useHrStore.getState().publishScheduleWeek({ weekStart:'2026-07-13', branchId:'All', actor:hr })).toMatchObject({ ok:true })
    expect(useHrStore.getState().weeklySchedulePublications[0].status).toBe('published')
    const employee = eligible[0]
    useHrStore.getState().setScheduleOverride({ employeeId:employee.id, date:'2026-07-14', shift:{mode:'off',isWorking:false,branchId:'',startTime:'00:00',endTime:'00:00'}, note:'Coverage changed', actor:hr })
    expect(useHrStore.getState().weeklySchedulePublications[0].status).toBe('changed_after_publish')
    expect(useHrStore.getState().scheduleRevisions).toHaveLength(1)
    expect(useHrStore.getState().scheduleRevisions[0]).toMatchObject({ employeeId:employee.id, date:'2026-07-14', reason:'Coverage changed' })
  })

})