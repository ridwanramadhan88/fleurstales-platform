import { beforeEach, describe, expect, it } from 'vitest'
import { canRecordSelfieAttendance } from './hrStatusDomain'
import { useHrStore } from '../store/hrStore'
import type { Employee } from '../store/hrStoreTypes'

const admin: Employee = { id:'admin-1', name:'Sari', position:'Admin', branch:'Kedamaian', systemRole:'admin', status:'active', phone:'', hireDate:'2026-01-01' }
const employee: Employee = { id:'employee-1', name:'Agus', position:'Florist', branch:'Pahoman', systemRole:'florist', status:'active', phone:'', hireDate:'2026-01-01' }

describe('selfie attendance guard and store', () => {
  beforeEach(() => useHrStore.setState({ employees:[admin, employee], attendance:[] }))

  it('allows an active admin to self check in once with image evidence', () => {
    const result = useHrStore.getState().recordSelfieAttendance({ employeeId:admin.id, selfieDataUrl:'data:image/jpeg;base64,abc', actor:{ name:'Tito', role:'admin' }, location:{ latitude:-5.3971, longitude:105.2668, accuracyMeters:10 } })
    expect(result.ok).toBe(true)
    const record = useHrStore.getState().attendance[0]
    expect(record.employeeId).toBe(admin.id)
    expect(record.status).toBe('present')
    expect(record.source).toBe('selfie')
    expect(record.selfieDataUrl).toContain('data:image/jpeg')
    expect(useHrStore.getState().recordSelfieAttendance({ employeeId:admin.id, selfieDataUrl:'data:image/jpeg;base64,def', actor:{ name:'Tito', role:'admin' }, location:{ latitude:-5.3971, longitude:105.2668, accuracyMeters:10 } }).ok).toBe(false)
  })

  it('blocks cross-role, missing-photo, inactive and non-self-service roles', () => {
    expect(canRecordSelfieAttendance({ employee, date:'2026-07-10', today:'2026-07-10', selfieDataUrl:'data:image/jpeg;base64,a', actor:{name:'Tito',role:'admin'}, alreadyRecorded:false }).ok).toBe(false)
    expect(canRecordSelfieAttendance({ employee:admin, date:'2026-07-10', today:'2026-07-10', selfieDataUrl:'', actor:{name:'Tito',role:'admin'}, alreadyRecorded:false }).ok).toBe(false)
    expect(canRecordSelfieAttendance({ employee:{...employee,status:'inactive'}, date:'2026-07-10', today:'2026-07-10', selfieDataUrl:'data:image/jpeg;base64,a', actor:{name:'Agus',role:'florist'}, alreadyRecorded:false }).ok).toBe(false)
    expect(canRecordSelfieAttendance({ employee:admin, date:'2026-07-10', today:'2026-07-10', selfieDataUrl:'data:image/jpeg;base64,a', actor:{name:'Star',role:'hr'}, alreadyRecorded:false }).ok).toBe(false)
  })
})
