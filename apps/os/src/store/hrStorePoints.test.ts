import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import type { AttendanceReviewCase } from './hrStoreTypes'

const hr={name:'HR User',role:'hr' as const}
const initial=useHrStore.getState()

beforeEach(()=>useHrStore.setState({...initial,employeePointEntries:[],attendanceReviewCases:[]}))

describe('employee points ledger',()=>{
 it('keeps late attendance as an HR problem task without points',()=>{
  const review:AttendanceReviewCase={id:'r1',attendanceId:'a1',employeeId:'emp-vero',date:'2026-07-13',warningType:'late_check_in',status:'pending',reason:'Late',createdAt:'x'}
  useHrStore.setState({attendanceReviewCases:[review]})
  const result=useHrStore.getState().reviewAttendanceCase({caseId:'r1',decision:'penalized',note:'Unexcused',actor:hr,proposedMinusPoints:10})
  expect(result.ok).toBe(false)
  expect(useHrStore.getState().employeePointEntries).toHaveLength(0)
 })
 it('approves and reverses without editing the approved amount',()=>{
  const created=useHrStore.getState().createManualPointAdjustment({employeeId:'emp-vero',points:10,reason:'Great work',actor:hr})
  expect(created.ok).toBe(true); if(!created.ok)return
  expect(useHrStore.getState().approvePointEntry({entryId:created.entryId,note:'',actor:hr}).ok).toBe(true)
  const reversed=useHrStore.getState().reversePointEntry({entryId:created.entryId,reason:'Correction',actor:hr})
  expect(reversed.ok).toBe(true)
  const entries=useHrStore.getState().employeePointEntries
  expect(entries.find(e=>e.id===created.entryId)?.status).toBe('reversed')
  expect(entries.some(e=>e.sourceType==='reversal'&&e.points===-10&&e.status==='approved')).toBe(true)
 })
 it('blocks duplicate decisions and invalid manual values',()=>{
  expect(useHrStore.getState().createManualPointAdjustment({employeeId:'emp-vero',points:0,reason:'x',actor:hr}).ok).toBe(false)
  const created=useHrStore.getState().createManualPointAdjustment({employeeId:'emp-vero',points:-5,reason:'Manual penalty',actor:hr}); if(!created.ok)return
  expect(useHrStore.getState().rejectPointEntry({entryId:created.entryId,note:'Not valid',actor:hr}).ok).toBe(true)
  expect(useHrStore.getState().approvePointEntry({entryId:created.entryId,note:'Retry',actor:hr}).ok).toBe(false)
 })
})
