/**
 * @file hrStoreTypes.ts
 * @description Shared type definitions for the HR store and domain.
 * Store modules only hold raw state and CRUD logic; these types are reused
 * by the domain and UI layers to avoid circular dependencies.
 */

import type { BranchId } from '../types/orders'
import type { ScheduleShiftMode } from '../types/settings'
import type { UserRole } from './userStore'

/**
 * @description Employment status of a staff record.
 */
export type EmployeeStatus = 'active' | 'inactive'

/**
 * @description Staff record. Position is derived from `systemRole`; the legacy `position`
 * field remains for stored-record compatibility and is always synchronized to
 * the role display label by guarded employee commands.
 */
export interface Employee {
  id: string
  name: string
  position: string
  /** Legacy field retained for persisted-data compatibility; scheduling is the source of truth. */
  branch: BranchId | ''
  systemRole: UserRole
  status: EmployeeStatus
  phone: string
  hireDate: string
  /** Lowercase login identifier for the internal demo app. */
  username?: string
  /** Demo-only six-digit PIN. Production must store a salted hash server-side. */
  pin?: string
  /** Employee-specific monthly base salary. Payroll never derives this from role. */
  baseSalaryIdr?: number
}


export interface ScheduleShift {
  /** follow_branch_hours inherits the branch window; custom uses explicit times; off has no working window. */
  mode?: ScheduleShiftMode
  isWorking: boolean
  startTime: string
  endTime: string
  branchId: string
}

export interface EmployeeDefaultSchedule {
  employeeId: string
  days: Record<import('../types/settings').WeekdayKey, ScheduleShift>
  updatedAt: string
  updatedBy: string
}

export interface ScheduleOverride {
  id: string
  employeeId: string
  date: string
  shift: ScheduleShift
  note?: string
  workMode?: 'onsite' | 'wfh'
  updatedAt: string
  updatedBy: string
}

export interface ScheduleRevision {
  id: string
  employeeId: string
  date: string
  previousShift?: ScheduleShift
  nextShift?: ScheduleShift
  previousNote?: string
  nextNote?: string
  previousWorkMode?: 'onsite' | 'wfh'
  nextWorkMode?: 'onsite' | 'wfh'
  changedBy: string
  changedAt: string
  reason: string
}

export interface WeeklySchedulePublication {
  id: string
  weekStart: string
  branchId: string | 'All'
  status: 'published' | 'changed_after_publish'
  publishedAt: string
  publishedBy: string
  updatedAt: string
}

/**
 * @description Daily attendance status for one employee.
 */
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave'

/**
 * @description A single attendance record for one employee on one date.
 */
export type AttendanceReviewStatus = 'not_required' | 'pending_review' | 'approved' | 'rejected'

export interface AttendanceLocationEvidence {
  latitude: number
  longitude: number
  accuracyMeters: number
  branchLatitude: number
  branchLongitude: number
  distanceMeters: number
  acceptedRadiusMeters: number
  withinRange: boolean
  /** Branch physically matched by GPS. */
  detectedBranchId?: string
  detectedBranchName?: string
  /** Employee profile branch is only a default/fallback, not a hard attendance restriction. */
  defaultBranchId?: string
  defaultBranchName?: string
  branchMismatch?: boolean
  reviewStatus?: AttendanceReviewStatus
  reviewReason?: string
  scheduledBranchId?: string
  scheduledBranchName?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  scheduleMismatch?: boolean
}


export type AttendanceWarningType = 'late_check_in' | 'missing_check_in' | 'missing_check_out' | 'early_check_out' | 'overtime' | 'wrong_branch' | 'scheduled_day_off' | 'outside_shift_time' | 'delivery_late'
export type AttendanceReviewDecision = 'resolved' | 'problem' | 'accepted' | 'excused' | 'corrected' | 'penalized'
export type AttendanceReviewCaseStatus = 'pending' | AttendanceReviewDecision

export interface AttendanceReviewCase {
  id: string
  attendanceId: string
  sourceType?: 'attendance' | 'order'
  sourceId?: string
  orderNumber?: string
  employeeId: string
  date: string
  warningType: AttendanceWarningType
  status: AttendanceReviewCaseStatus
  reason: string
  scheduledBranchId?: string
  scheduledBranchName?: string
  detectedBranchId?: string
  detectedBranchName?: string
  scheduledStartTime?: string
  scheduledEndTime?: string
  actualTime?: string
  minutesDifference?: number
  proposedMinusPoints?: number
  employeeNote?: string
  reviewNote?: string
  reviewedBy?: string
  reviewedAt?: string
  createdAt: string
}


export type EmployeePointCategory =
  | 'attendance_penalty'
  | 'florist_assignment' // Legacy persisted entries only.
  | 'admin_order_handled'
  | 'florist_order_completed'
  | 'manual_reward'
  | 'manual_penalty'
  | 'reversal'

export type EmployeePointStatus = 'pending' | 'approved' | 'rejected' | 'reversed'

export interface EmployeePointEntry {
  id: string
  employeeId: string
  category: EmployeePointCategory
  points: number
  sourceType: 'attendance_review' | 'order' | 'manual' | 'reversal'
  sourceId: string
  /** Effective activity date used for payroll eligibility, not record creation time. */
  effectiveDate?: string
  /** Generated payroll period that owns this point entry. */
  payrollPeriodId?: string
  /** Legacy/display grouping hint (payment month YYYY-MM). */
  periodKey?: string
  /** Source order number for drill-down. */
  orderNumber?: string
  /** Eligible product subtotal captured when the automatic point was created. */
  sourceAmountIdr?: number
  /** Actual order completion timestamp that made the reward eligible. */
  sourceCompletedAt?: string
  /** Assignment ordinal inside the employee/category period. */
  ordinal?: number
  /** Number of assignments included in base salary before points start. */
  minimumIncluded?: number
  reason: string
  status: EmployeePointStatus
  createdBy: string
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
  reversedByEntryId?: string
}

export interface AttendanceRecord {
  id: string
  employeeId: string
  date: string
  status: AttendanceStatus
  note?: string
  actor: string
  createdAt: string
  /** Selfie evidence captured during self check-in. Kept for backward compatibility. */
  selfieDataUrl?: string
  checkInAt?: string
  checkOutSelfieDataUrl?: string
  checkOutAt?: string
  /** Distinguishes HR-entered records from employee/admin self attendance. */
  source?: 'manual' | 'selfie'
  checkInLocation?: AttendanceLocationEvidence
  checkOutLocation?: AttendanceLocationEvidence
}
