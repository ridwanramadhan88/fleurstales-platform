import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import { useSettingsStore } from './settingsStore'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'

const employee={id:'e1',name:'Agus',position:'Employee',branch:'Pahoman' as const,systemRole:'florist' as const,status:'active' as const,phone:'',hireDate:'2024-01-01'}
beforeEach(()=>{useSettingsStore.setState({...DEFAULT_OWNER_SETTINGS,attendance:{...DEFAULT_OWNER_SETTINGS.attendance,lateGraceMinutes:10,checkoutGraceMinutes:30}});useHrStore.setState({employees:[employee],attendance:[{id:'a1',employeeId:'e1',date:'2026-07-13',status:'present',actor:'Agus',createdAt:'x',checkInAt:'2026-07-13T02:20:00.000Z',source:'selfie'}],employeeDefaultSchedules:[],scheduleOverrides:[],attendanceReviewCases:[]})})
describe('attendance review store',()=>{
 it('generates idempotent warnings',()=>{const first=useHrStore.getState().generateAttendanceWarnings(new Date('2026-07-14T00:00:00Z'));const second=useHrStore.getState().generateAttendanceWarnings(new Date('2026-07-14T00:00:00Z'));expect(first).toBeGreaterThan(0);expect(second).toBe(0)})
 it('allows an optional HR review note and locks the reviewed case',()=>{useHrStore.setState({attendanceReviewCases:[{id:'r1',attendanceId:'a1',employeeId:'e1',date:'2026-07-13',warningType:'missing_check_out',status:'pending',reason:'Missing',createdAt:'x'}]});expect(useHrStore.getState().reviewAttendanceCase({caseId:'r1',decision:'accepted',note:'',actor:{name:'Star',role:'hr'}}).ok).toBe(true);expect(useHrStore.getState().attendanceReviewCases[0].status).toBe('accepted');expect(useHrStore.getState().attendanceReviewCases[0].reviewNote).toBeUndefined()})
 it('moves a warning to Problem List and later marks it solved',()=>{
  useHrStore.setState({attendanceReviewCases:[{id:'r2',attendanceId:'a1',employeeId:'e1',date:'2026-07-13',warningType:'late_check_in',status:'pending',reason:'Late',createdAt:'x'}]})
  expect(useHrStore.getState().reviewAttendanceCase({caseId:'r2',decision:'problem',note:'Needs follow-up',actor:{name:'Star',role:'hr'}}).ok).toBe(true)
  expect(useHrStore.getState().attendanceReviewCases[0].status).toBe('problem')
  expect(useHrStore.getState().reviewAttendanceCase({caseId:'r2',decision:'resolved',note:'Handled',actor:{name:'Star',role:'hr'}}).ok).toBe(true)
  expect(useHrStore.getState().attendanceReviewCases[0].status).toBe('resolved')
 })

})
