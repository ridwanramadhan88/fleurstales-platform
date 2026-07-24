import type { AttendanceRecord, AttendanceReviewCase, AttendanceWarningType, Employee, EmployeeDefaultSchedule, ScheduleOverride } from '../store/hrStoreTypes'
import type { OwnerSettingsStateValue } from '../types/settings'
import { getEffectiveScheduleForDate } from './hrSchedulingDomain'

export const minutesFromTime = (value:string):number => { const [h,m]=value.split(':').map(Number); return h*60+m }
const localTimeFromIso = (value?:string):string | undefined => value ? new Intl.DateTimeFormat('en-GB',{ timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false }).format(new Date(value)) : undefined

export const buildAttendanceWarnings = (params:{ record:AttendanceRecord; employee:Employee; defaults:EmployeeDefaultSchedule[]; overrides:ScheduleOverride[]; settings:OwnerSettingsStateValue; nowIso?:string }): AttendanceReviewCase[] => {
  const { record, employee, defaults, overrides, settings } = params
  const effective = getEffectiveScheduleForDate({ employee, date:record.date, defaults, overrides, settings })
  const createdAt = params.nowIso ?? new Date().toISOString()
  const base = { attendanceId:record.id, employeeId:employee.id, date:record.date, status:'pending' as const, scheduledBranchId:effective.shift.branchId, scheduledBranchName:settings.branches.find(b=>b.id===effective.shift.branchId)?.name, scheduledStartTime:effective.shift.startTime, scheduledEndTime:effective.shift.endTime, detectedBranchId:record.checkInLocation?.detectedBranchId, detectedBranchName:record.checkInLocation?.detectedBranchName, createdAt }
  const result:AttendanceReviewCase[]=[]
  const add=(type:AttendanceWarningType, reason:string, actualTime?:string, minutesDifference?:number)=>result.push({ id:`review-${record.id}-${type}`, warningType:type, reason, actualTime, minutesDifference, ...base })
  if (!effective.shift.isWorking) add('scheduled_day_off','Employee checked in on a scheduled day off.', localTimeFromIso(record.checkInAt))
  if (record.checkInLocation?.detectedBranchId && effective.shift.branchId && record.checkInLocation.detectedBranchId !== effective.shift.branchId) add('wrong_branch',`Detected at ${record.checkInLocation.detectedBranchName ?? 'another branch'} instead of scheduled branch ${base.scheduledBranchName ?? effective.shift.branchId}.`,localTimeFromIso(record.checkInAt))
  const checkIn = localTimeFromIso(record.checkInAt)
  if (effective.shift.isWorking && checkIn) {
    const late = minutesFromTime(checkIn)-minutesFromTime(effective.shift.startTime)-settings.attendance.lateGraceMinutes
    if (late>0) add('late_check_in',`Checked in ${late} minute${late===1?'':'s'} after the allowed grace period.`,checkIn,late)
  }
  return result
}


export const buildCheckoutWarnings = (params:{ record:AttendanceRecord; employee:Employee; defaults:EmployeeDefaultSchedule[]; overrides:ScheduleOverride[]; settings:OwnerSettingsStateValue; nowIso?:string }): AttendanceReviewCase[] => {
  const { record, employee, defaults, overrides, settings } = params
  if (!record.checkOutAt) return []
  const effective = getEffectiveScheduleForDate({ employee, date:record.date, defaults, overrides, settings })
  if (!effective.shift.isWorking) return []
  const actualTime = localTimeFromIso(record.checkOutAt)
  if (!actualTime) return []
  const actual = minutesFromTime(actualTime)
  const scheduledEnd = minutesFromTime(effective.shift.endTime)
  const grace = settings.attendance.checkoutGraceMinutes
  const base = { attendanceId:record.id, employeeId:employee.id, date:record.date, status:'pending' as const, scheduledBranchId:effective.shift.branchId, scheduledBranchName:settings.branches.find(b=>b.id===effective.shift.branchId)?.name, scheduledStartTime:effective.shift.startTime, scheduledEndTime:effective.shift.endTime, detectedBranchId:record.checkOutLocation?.detectedBranchId ?? record.checkInLocation?.detectedBranchId, detectedBranchName:record.checkOutLocation?.detectedBranchName ?? record.checkInLocation?.detectedBranchName, actualTime, createdAt:params.nowIso ?? new Date().toISOString() }
  // Early checkout is intentionally not calculated. HR only reviews missing
  // attendance records and other explicit exceptions; leaving before the
  // scheduled end does not automatically create a problem task.
  if (actual > scheduledEnd + grace) {
    const difference = actual - scheduledEnd
    return [{ id:`review-${record.id}-overtime`, warningType:'overtime', reason:`Checked out ${difference} minute${difference===1?'':'s'} after the scheduled end time.`, minutesDifference:difference, ...base }]
  }
  return []
}

export const shouldCreateMissingCheckoutWarning = (params:{ record:AttendanceRecord; employee:Employee; defaults:EmployeeDefaultSchedule[]; overrides:ScheduleOverride[]; settings:OwnerSettingsStateValue; now:Date }): { due:boolean; reason?:string; minutesLate?:number; scheduledEnd?:string } => {
  const effective=getEffectiveScheduleForDate({employee:params.employee,date:params.record.date,defaults:params.defaults,overrides:params.overrides,settings:params.settings})
  if (!effective.shift.isWorking || !params.record.checkInAt || params.record.checkOutAt) return {due:false}
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(params.now)
  if (params.record.date>today) return {due:false}
  const nowTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(params.now)
  if (params.record.date<today) return {due:true,reason:'No checkout was recorded before the attendance day ended.',scheduledEnd:effective.shift.endTime}
  const minutesLate=minutesFromTime(nowTime)-minutesFromTime(effective.shift.endTime)-params.settings.attendance.checkoutGraceMinutes
  return minutesLate>=0 ? {due:true,reason:`No checkout recorded ${minutesLate} minute${minutesLate===1?'':'s'} after the checkout grace period.`,minutesLate,scheduledEnd:effective.shift.endTime}:{due:false}
}
