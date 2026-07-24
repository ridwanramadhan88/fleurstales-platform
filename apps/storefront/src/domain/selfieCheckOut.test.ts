import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useHrStore } from '../store/hrStore'
import { useSettingsStore } from '../store/settingsStore'
import { DEFAULT_OWNER_SETTINGS } from './settings/defaultOwnerSettings'

const selfie = 'data:image/jpeg;base64,abc'
const admin = { id:'admin-1', name:'Sari', position:'Admin', branch:'Kedamaian' as const, systemRole:'admin' as const, status:'active' as const, phone:'', hireDate:'2026-01-01', username:'admin', pin:'123456' }

describe('selfie check-out', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSettingsStore.setState({ ...DEFAULT_OWNER_SETTINGS })
    useHrStore.setState({ employees:[admin], attendance:[], scheduleOverrides:[{ id:'shift-admin', employeeId:admin.id, date:'2026-07-10', shift:{ mode:'custom', isWorking:true, branchId:'Kedamaian', startTime:'07:30', endTime:'16:30' }, updatedAt:'', updatedBy:'HR' }] })
  })
  afterEach(() => vi.useRealTimers())

  it('blocks check-out before branch closing time', () => {
    vi.setSystemTime(new Date('2026-07-10T08:00:00.000Z')) // 15:00 Jakarta
    expect(useHrStore.getState().recordSelfieAttendance({ employeeId:admin.id, selfieDataUrl:selfie, actor:{name:'Sari',role:'admin'}, location:{ latitude:-5.3971, longitude:105.2668, accuracyMeters:10 } }).ok).toBe(true)
    const result = useHrStore.getState().recordSelfieCheckOut({ employeeId:admin.id, selfieDataUrl:selfie, actor:{name:'Sari',role:'admin'}, location:{ latitude:-5.3971, longitude:105.2668, accuracyMeters:10 } })
    expect(result).toEqual({ ok:false, reason:'Check-out becomes available after 16:30.' })
  })

  it('records a second selfie at or after branch closing time', () => {
    vi.setSystemTime(new Date('2026-07-10T08:00:00.000Z'))
    expect(useHrStore.getState().recordSelfieAttendance({ employeeId:admin.id, selfieDataUrl:selfie, actor:{name:'Sari',role:'admin'}, location:{ latitude:-5.3971, longitude:105.2668, accuracyMeters:10 } }).ok).toBe(true)
    vi.setSystemTime(new Date('2026-07-10T11:00:00.000Z')) // 18:00 Jakarta
    expect(useHrStore.getState().recordSelfieCheckOut({ employeeId:admin.id, selfieDataUrl:selfie, actor:{name:'Sari',role:'admin'}, location:{ latitude:-5.3971, longitude:105.2668, accuracyMeters:10 } }).ok).toBe(true)
    const record = useHrStore.getState().attendance[0]
    expect(record.checkOutSelfieDataUrl).toBe(selfie)
    expect(record.checkOutAt).toBeTruthy()
  })
})
