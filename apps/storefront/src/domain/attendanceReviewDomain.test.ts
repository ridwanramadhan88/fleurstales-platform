import { describe, expect, it } from 'vitest'
import { buildAttendanceWarnings, buildCheckoutWarnings, shouldCreateMissingCheckoutWarning } from './attendanceReviewDomain'
import { DEFAULT_OWNER_SETTINGS } from './settings/defaultOwnerSettings'
import type { AttendanceRecord, Employee, EmployeeDefaultSchedule } from '../store/hrStoreTypes'

const employee:Employee={id:'e1',name:'Agus',position:'Florist',branch:'Pahoman',systemRole:'florist',status:'active',phone:'',hireDate:'2024-01-01'}
const settings={...DEFAULT_OWNER_SETTINGS,attendance:{...DEFAULT_OWNER_SETTINGS.attendance,lateGraceMinutes:10,checkoutGraceMinutes:30}}
const defaults:EmployeeDefaultSchedule[]=[{employeeId:'e1',updatedAt:'x',updatedBy:'HR',days:{monday:{mode:'custom',isWorking:true,startTime:'09:00',endTime:'18:00',branchId:'Pahoman'},tuesday:{mode:'off',isWorking:false,startTime:'09:00',endTime:'18:00',branchId:'Pahoman'},wednesday:{mode:'off',isWorking:false,startTime:'09:00',endTime:'18:00',branchId:'Pahoman'},thursday:{mode:'off',isWorking:false,startTime:'09:00',endTime:'18:00',branchId:'Pahoman'},friday:{mode:'off',isWorking:false,startTime:'09:00',endTime:'18:00',branchId:'Pahoman'},saturday:{mode:'off',isWorking:false,startTime:'09:00',endTime:'18:00',branchId:'Pahoman'},sunday:{mode:'off',isWorking:false,startTime:'09:00',endTime:'18:00',branchId:'Pahoman'}}}]

describe('attendance review warnings',()=>{
 it('creates a late warning only after grace',()=>{
  const record:AttendanceRecord={id:'a1',employeeId:'e1',date:'2026-07-13',status:'present',actor:'Agus',createdAt:'x',checkInAt:'2026-07-13T02:15:00.000Z',source:'selfie'}
  const warnings=buildAttendanceWarnings({record,employee,defaults,overrides:[],settings})
  expect(warnings.some(item=>item.warningType==='late_check_in')).toBe(true)
 })
 it('creates missing checkout after shift end plus grace',()=>{
  const record:AttendanceRecord={id:'a1',employeeId:'e1',date:'2026-07-13',status:'present',actor:'Agus',createdAt:'x',checkInAt:'2026-07-13T02:00:00.000Z',source:'selfie'}
  const result=shouldCreateMissingCheckoutWarning({record,employee,defaults,overrides:[],settings,now:new Date('2026-07-13T11:31:00.000Z')})
  expect(result.due).toBe(true)
 })
 it('does not create early checkout tasks and still creates overtime warnings',()=>{
  const early:AttendanceRecord={id:'a2',employeeId:'e1',date:'2026-07-13',status:'present',actor:'Agus',createdAt:'x',checkInAt:'2026-07-13T02:00:00.000Z',checkOutAt:'2026-07-13T10:30:00.000Z',source:'selfie'}
  const overtime:AttendanceRecord={...early,id:'a3',checkOutAt:'2026-07-13T11:45:00.000Z'}
  expect(buildCheckoutWarnings({record:early,employee,defaults,overrides:[],settings})).toEqual([])
  expect(buildCheckoutWarnings({record:overtime,employee,defaults,overrides:[],settings})[0]?.warningType).toBe('overtime')
 })
})
