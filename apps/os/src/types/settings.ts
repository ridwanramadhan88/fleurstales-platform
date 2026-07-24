/**
 * @file settings.ts
 * @description Shared types for the Owner Settings Center — the
 * consolidated, owner-editable source of truth for core business config.
 *
 * Phase 1 scope note: this file currently models the **Store profile**,
 * **Branch list**, **Staff & Roles**, and **Permission matrix** slices.
 * The remaining slices from the wiring brief (order workflow, finance
 * verification, payment methods, florists, dashboard revenue) will be added
 * to `OwnerSettingsStateValue` incrementally in the same shape described
 * there, without needing to change what's here.
 */

import type { AppSection, AccessLevel } from '../config/permissions'
import type { UserRole } from '../store/userStore'

/**
 * @description Store-wide identity/contact info shown across the app
 * (sidebar brand, storefront header, and — later — receipts/invoices).
 */
export interface StoreProfileSettings {
  storeName: string
  legalName?: string
  logoUrl?: string
  phone: string
  whatsapp: string
  email: string
  address: string
  currency: 'IDR'
  timezone: 'Asia/Jakarta'
  /** Owner-controlled inventory module switch. Disabled by default. */
  inventoryEnabled: boolean
}


export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface DayOpeningHours {
  isOpen: boolean
  opensAt: string
  closesAt: string
}

export type BranchOpeningHours = Record<WeekdayKey, DayOpeningHours>

/**
 * @description A single physical branch/outlet. Replaces the old hardcoded
 * `BranchId` union — branches are now owner-managed data, not a type-level
 * constant, so adding/renaming/deactivating a branch doesn't require a code
 * change.
 */
export interface BranchLocationSettings {
  latitude: number
  longitude: number
}


export type PaymentAccountType = 'bank_transfer' | 'ewallet'

export interface BankAccountDetail {
  id: string
  bankName: string
  accountNumber: string
  accountHolder: string
  /** Operational account type displayed to Owner and customers. */
  type: PaymentAccountType
  /** Inactive accounts stay in history but cannot be selected for new payments. */
  isActive: boolean
  /** Exactly one active account is the default customer payment destination. */
  isDefault: boolean
  /** Lower numbers appear first at checkout. */
  displayOrder: number
  /** Hidden accounts remain usable internally but are not displayed at checkout. */
  isCustomerVisible: boolean
  /** Empty means all branches; otherwise only these branches may display the account. */
  branchIds: string[]
}

export interface PaymentMethodSettings {
  bankAccounts: BankAccountDetail[]
  paymentInstructions: string
}

export interface AttendanceSettings {
  /** Maximum accepted distance from any active branch location. */
  locationRadiusMeters: number
  /** Minutes after scheduled start before a late warning is created. */
  lateGraceMinutes: number
  /** Minutes after scheduled end before a missing-checkout warning is created. */
  checkoutGraceMinutes: number
}

export type ScheduleShiftMode = 'follow_branch_hours' | 'custom' | 'off'

export interface ScheduleDaySettings {
  /** Defaults to follow_branch_hours for backward compatibility. */
  mode?: ScheduleShiftMode
  isWorking: boolean
  startTime: string
  endTime: string
}

export type DefaultWeeklySchedule = Record<WeekdayKey, ScheduleDaySettings>

export interface SchedulingSettings {
  /** Company template used when an employee has no saved personal default schedule. */
  defaultWeeklySchedule: DefaultWeeklySchedule
  /** Simple minimum staffing target per open branch and day. */
  minimumCoverage?: {
    admin: number
    florist: number
  }
}


export interface PayrollDefaultSettings {
  frequency: 'monthly'
  /** Earning period starts on this day of the previous month. */
  periodStartDay: number
  /** Earning period ends on this day of the payment month. */
  periodEndDay: number
  hrSubmissionDay: number
  financeReviewDay: number
  paymentDay: number
  timezone: 'Asia/Jakarta'
  /** Owner-editable conversion used for future payroll calculations. */
  pointValueIdr: number
  /** Default monthly base salary by role. Individual effective salary records may override these defaults. */
  baseSalaryByRole?: Record<Exclude<UserRole, 'owner'>, number>
}

export interface BranchSettings {
  /** Stable identifier. Existing orders/records reference branches by this
   * id, so it must never be reused for a different branch once created. */
  id: string
  name: string
  code: string
  address: string
  phone: string
  managerEmployeeId?: string
  /** Inactive branches stop appearing in selectors (top bar, sidebar,
   * BranchSelect, new-order forms) but historical records that reference
   * them still display normally. */
  isActive: boolean
  /** Exactly one active branch is used as the default fallback for new records. */
  isDefault?: boolean
  dailyOrderLimit?: number
  /** Default delivery fee used by storefront checkout for this branch. */
  deliveryFeeIdr?: number
  /** Weekly operating hours used to constrain delivery and pickup slots. */
  openingHours?: BranchOpeningHours
  /** Geographic point used to validate selfie attendance. */
  location?: BranchLocationSettings
}

/**
 * @description Owner-configurable rules for which system roles exist and
 * how new staff are assigned to one. This does not itself grant access —
 * see `PermissionMatrix` for the per-section access levels each role gets.
 */
export type HrManagementArea = 'employees' | 'attendance' | 'scheduling' | 'points' | 'payroll'

export type HrManagedRolesByArea = Record<HrManagementArea, UserRole[]>

export interface StaffRoleSettings {
  /** The full set of assignable system roles, in display order. */
  roles: UserRole[]
  /** Role pre-selected when adding a new staff member in HR. */
  defaultRole: UserRole
  /** Owner decides which non-owner roles HR may manage in each HR workflow. */
  hrManagedRoles?: HrManagedRolesByArea
}

/**
 * @description Owner-editable copy of the role → section access grid.
 * Seeded from `DEFAULT_ROLE_SECTION_ACCESS` (src/config/permissions.ts) so
 * behavior is unchanged until Owner edits it. `settings` should stay
 * 'edit'-only for the 'owner' role — the Permission Matrix panel enforces
 * this in the UI rather than at the type level.
 */
export type PermissionMatrix = Record<UserRole, Record<AppSection, AccessLevel>>

/**
 * @description Root shape of all owner-configurable business settings.
 * Phase 1 populates `storeProfile`, `branches`, `staffRoles`, and
 * `permissions`; later phases add the remaining keys described in the
 * wiring brief.
 */

export type SettingsSectionId =
  | 'store-profile'
  | 'branches'
  | 'staff-roles'
  | 'permissions'
  | 'payment-methods'
  | 'attendance'
  | 'scheduling'
  | 'payroll'

export interface SettingsSectionValueMap {
  'store-profile': StoreProfileSettings
  branches: BranchSettings[]
  'staff-roles': StaffRoleSettings
  permissions: PermissionMatrix
  'payment-methods': PaymentMethodSettings
  attendance: AttendanceSettings
  scheduling: SchedulingSettings
  payroll: PayrollDefaultSettings
}

export interface OwnerSettingsStateValue {
  storeProfile: StoreProfileSettings
  branches: BranchSettings[]
  staffRoles: StaffRoleSettings
  permissions: PermissionMatrix
  attendance: AttendanceSettings
  scheduling: SchedulingSettings
  paymentMethods: PaymentMethodSettings
  payroll: PayrollDefaultSettings
}
