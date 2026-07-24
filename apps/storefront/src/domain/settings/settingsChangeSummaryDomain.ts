/**
 * @file settingsChangeSummaryDomain.ts
 * @description Builds a human-readable list of "what will change" bullet
 * points for the Owner Settings save-confirmation dialog. Pure functions
 * only — no store/React imports — so they're easy to unit test and reuse.
 *
 * Each section gets its own summarizer because the shapes differ too much
 * for one generic field walker to read naturally (e.g. a branch rename vs.
 * a permission-matrix cell flip need very different phrasing). Every
 * summarizer returns [] when nothing in its slice actually changed.
 */

import type {
  AttendanceSettings,
  BankAccountDetail,
  BranchSettings,
  PaymentMethodSettings,
  PayrollDefaultSettings,
  PermissionMatrix,
  SchedulingSettings,
  SettingsSectionId,
  StaffRoleSettings,
  StoreProfileSettings,
} from '../../types/settings'
import type { AppSection } from '../../config/permissions'
import type { ActionCapability, ActionPermissionMatrix } from '../../config/actionPermissions'
import { CAPABILITY_REGISTRY } from '../../config/actionPermissions'
import type { UserRole } from '../../store/userStore'
import { WEEKDAY_KEYS } from '../branchOpeningHoursDomain'

const SECTION_LABELS: Record<AppSection, string> = {
  dashboard: 'Dashboard',
  orders: 'Orders',
  stock: 'Stock',
  catalog: 'Catalog',
  customers: 'Customers',
  revenue: 'Revenue',
  finance: 'Finance',
  hr: 'HR',
  scheduling: 'Scheduling',
  settings: 'Settings',
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  finance: 'Finance',
  hr: 'HR',
  florist: 'Florist',
}

const ACCESS_LABELS: Record<string, string> = { none: 'No access', view: 'View', edit: 'Edit' }

const formatText = (value: string | undefined | null): string =>
  value && value.trim() ? value.trim() : '(empty)'

const formatNumber = (value: number | undefined | null): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '(empty)'

const formatToggle = (value: boolean): string => (value ? 'On' : 'Off')

const formatIdr = (value: number | undefined | null): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? `Rp${value.toLocaleString('en-US')}`
    : '(empty)'

const maskAccountNumber = (accountNumber: string): string =>
  accountNumber.trim().length > 4 ? `••••${accountNumber.trim().slice(-4)}` : accountNumber.trim() || '(empty)'

/** Store Profile */
const summarizeStoreProfile = (before: StoreProfileSettings, after: StoreProfileSettings): string[] => {
  const lines: string[] = []
  const fields: Array<[keyof StoreProfileSettings, string]> = [
    ['storeName', 'Store name'],
    ['legalName', 'Legal name'],
    ['phone', 'WhatsApp'],
    ['whatsapp', 'WhatsApp'],
    ['email', 'Email'],
    ['address', 'Address'],
    ['logoUrl', 'Logo URL'],
  ]
  for (const [field, label] of fields) {
    const beforeValue = before[field] as string | undefined
    const afterValue = after[field] as string | undefined
    if ((beforeValue ?? '') !== (afterValue ?? '')) {
      lines.push(`${label}: ${formatText(beforeValue)} → ${formatText(afterValue)}`)
    }
  }
  return lines
}

/** Branches */
const summarizeBranches = (before: BranchSettings[], after: BranchSettings[]): string[] => {
  const lines: string[] = []
  const beforeById = new Map(before.map((branch) => [branch.id, branch]))
  const afterById = new Map(after.map((branch) => [branch.id, branch]))

  for (const branch of after) {
    if (!beforeById.has(branch.id)) lines.push(`Added branch "${formatText(branch.name)}"`)
  }
  for (const branch of before) {
    if (!afterById.has(branch.id)) lines.push(`Removed branch "${formatText(branch.name)}"`)
  }

  for (const branch of after) {
    const previous = beforeById.get(branch.id)
    if (!previous) continue
    const fieldChanges: string[] = []
    if (previous.name !== branch.name) fieldChanges.push(`name ${formatText(previous.name)} → ${formatText(branch.name)}`)
    if (previous.code !== branch.code) fieldChanges.push(`code ${formatText(previous.code)} → ${formatText(branch.code)}`)
    if (previous.address !== branch.address) fieldChanges.push('address updated')
    if (previous.phone !== branch.phone) fieldChanges.push('WhatsApp updated')
    if (Boolean(previous.isActive) !== Boolean(branch.isActive)) {
      fieldChanges.push(`status ${formatToggle(previous.isActive)} → ${formatToggle(branch.isActive)}`)
    }
    if ((previous.dailyOrderLimit ?? null) !== (branch.dailyOrderLimit ?? null)) {
      fieldChanges.push(`daily order limit ${formatNumber(previous.dailyOrderLimit)} → ${formatNumber(branch.dailyOrderLimit)}`)
    }
    if ((previous.deliveryFeeIdr ?? null) !== (branch.deliveryFeeIdr ?? null)) {
      fieldChanges.push(`delivery fee ${formatIdr(previous.deliveryFeeIdr)} → ${formatIdr(branch.deliveryFeeIdr)}`)
    }
    if (JSON.stringify(previous.openingHours) !== JSON.stringify(branch.openingHours)) {
      fieldChanges.push('opening hours updated')
    }
    if (JSON.stringify(previous.location) !== JSON.stringify(branch.location)) {
      fieldChanges.push('map location updated')
    }
    if (fieldChanges.length > 0) {
      lines.push(`Branch "${formatText(branch.name)}": ${fieldChanges.join(', ')}`)
    }
  }
  return lines
}

/** Attendance */
const summarizeAttendance = (before: AttendanceSettings, after: AttendanceSettings): string[] => {
  const lines: string[] = []
  if (before.locationRadiusMeters !== after.locationRadiusMeters) {
    lines.push(`Attendance radius: ${formatNumber(before.locationRadiusMeters)}m → ${formatNumber(after.locationRadiusMeters)}m`)
  }
  if (before.lateGraceMinutes !== after.lateGraceMinutes) {
    lines.push(`Late grace: ${formatNumber(before.lateGraceMinutes)}min → ${formatNumber(after.lateGraceMinutes)}min`)
  }
  if (before.checkoutGraceMinutes !== after.checkoutGraceMinutes) {
    lines.push(`Checkout grace: ${formatNumber(before.checkoutGraceMinutes)}min → ${formatNumber(after.checkoutGraceMinutes)}min`)
  }
  return lines
}

/** Scheduling */
const summarizeScheduling = (before: SchedulingSettings, after: SchedulingSettings): string[] => {
  const lines: string[] = []
  const changedDays = WEEKDAY_KEYS.filter(
    (day) => JSON.stringify(before.defaultWeeklySchedule[day]) !== JSON.stringify(after.defaultWeeklySchedule[day]),
  )
  if (changedDays.length > 0) {
    lines.push(`Default weekly schedule updated for ${changedDays.length} day${changedDays.length === 1 ? '' : 's'}`)
  }
  const beforeCoverage = before.minimumCoverage ?? { admin: 1, florist: 2 }
  const afterCoverage = after.minimumCoverage ?? { admin: 1, florist: 2 }
  if (beforeCoverage.admin !== afterCoverage.admin) {
    lines.push(`Minimum Admin coverage: ${formatNumber(beforeCoverage.admin)} → ${formatNumber(afterCoverage.admin)}`)
  }
  if (beforeCoverage.florist !== afterCoverage.florist) {
    lines.push(`Minimum Florist coverage: ${formatNumber(beforeCoverage.florist)} → ${formatNumber(afterCoverage.florist)}`)
  }
  return lines
}

/** Payroll */
const summarizePayroll = (before: PayrollDefaultSettings, after: PayrollDefaultSettings): string[] => {
  const lines: string[] = []
  const dayFields: Array<[keyof PayrollDefaultSettings, string]> = [
    ['periodStartDay', 'Period start day'],
    ['periodEndDay', 'Period end day'],
    ['hrSubmissionDay', 'HR submission day'],
    ['financeReviewDay', 'Finance review day'],
    ['paymentDay', 'Payment day'],
  ]
  for (const [field, label] of dayFields) {
    if (before[field] !== after[field]) {
      lines.push(`${label}: ${formatNumber(before[field] as number)} → ${formatNumber(after[field] as number)}`)
    }
  }
  if (before.pointValueIdr !== after.pointValueIdr) {
    lines.push(`Point value: ${formatIdr(before.pointValueIdr)} → ${formatIdr(after.pointValueIdr)}`)
  }
  const roles: Array<Exclude<UserRole, 'owner'>> = ['admin', 'finance', 'hr', 'florist']
  for (const role of roles) {
    const beforeSalary = before.baseSalaryByRole?.[role]
    const afterSalary = after.baseSalaryByRole?.[role]
    if ((beforeSalary ?? null) !== (afterSalary ?? null)) {
      lines.push(`${ROLE_LABELS[role]} base salary: ${formatIdr(beforeSalary)} → ${formatIdr(afterSalary)}`)
    }
  }
  return lines
}

/** Staff & Roles */
const summarizeStaffRoles = (before: StaffRoleSettings, after: StaffRoleSettings): string[] => {
  const lines: string[] = []
  const beforeRoles = new Set(before.roles)
  const afterRoles = new Set(after.roles)
  const added = after.roles.filter((role) => !beforeRoles.has(role))
  const removed = before.roles.filter((role) => !afterRoles.has(role))
  if (added.length > 0) lines.push(`Added role${added.length === 1 ? '' : 's'}: ${added.map((role) => ROLE_LABELS[role]).join(', ')}`)
  if (removed.length > 0) lines.push(`Removed role${removed.length === 1 ? '' : 's'}: ${removed.map((role) => ROLE_LABELS[role]).join(', ')}`)
  if (before.defaultRole !== after.defaultRole) {
    lines.push(`Default role for new staff: ${ROLE_LABELS[before.defaultRole]} → ${ROLE_LABELS[after.defaultRole]}`)
  }
  if (JSON.stringify(before.hrManagedRoles ?? {}) !== JSON.stringify(after.hrManagedRoles ?? {})) {
    lines.push('HR-managed roles updated')
  }
  return lines
}

/** Section access (Permissions tab, section-level grid) */
const summarizePermissions = (before: PermissionMatrix, after: PermissionMatrix): string[] => {
  const lines: string[] = []
  const roles = Object.keys(after) as UserRole[]
  for (const role of roles) {
    const sections = Object.keys(after[role]) as AppSection[]
    for (const section of sections) {
      const beforeLevel = before[role]?.[section]
      const afterLevel = after[role]?.[section]
      if (beforeLevel !== afterLevel) {
        lines.push(
          `${ROLE_LABELS[role]} — ${SECTION_LABELS[section] ?? section}: ${ACCESS_LABELS[beforeLevel] ?? beforeLevel} → ${ACCESS_LABELS[afterLevel] ?? afterLevel}`,
        )
      }
    }
  }
  return lines
}

/** Action-level capability toggles, also shown on the Permissions tab. */
export const summarizeActionPermissions = (
  before: ActionPermissionMatrix,
  after: ActionPermissionMatrix,
): string[] => {
  const lines: string[] = []
  const roles = Object.keys(after) as UserRole[]
  const capabilityLabel = (capability: ActionCapability) =>
    CAPABILITY_REGISTRY.find((item) => item.id === capability)?.label ?? capability
  for (const role of roles) {
    const capabilities = Object.keys(after[role] ?? {}) as ActionCapability[]
    for (const capability of capabilities) {
      const beforeValue = Boolean(before[role]?.[capability])
      const afterValue = Boolean(after[role]?.[capability])
      if (beforeValue !== afterValue) {
        lines.push(`${ROLE_LABELS[role]} — ${capabilityLabel(capability)}: ${afterValue ? 'Enabled' : 'Disabled'}`)
      }
    }
  }
  return lines
}

/** Payment Methods */
const summarizePaymentMethods = (before: PaymentMethodSettings, after: PaymentMethodSettings): string[] => {
  const lines: string[] = []
  const beforeById = new Map(before.bankAccounts.map((account) => [account.id, account]))
  const afterById = new Map(after.bankAccounts.map((account) => [account.id, account]))

  for (const account of after.bankAccounts) {
    if (!beforeById.has(account.id)) {
      lines.push(`Added payment account "${formatText(account.bankName)}" (${maskAccountNumber(account.accountNumber)})`)
    }
  }
  for (const account of before.bankAccounts) {
    if (!afterById.has(account.id)) {
      lines.push(`Removed payment account "${formatText(account.bankName)}"`)
    }
  }
  for (const account of after.bankAccounts) {
    const previous = beforeById.get(account.id)
    if (!previous) continue
    const changes = accountFieldChanges(previous, account)
    if (changes.length > 0) lines.push(`Account "${formatText(account.bankName)}": ${changes.join(', ')}`)
  }
  if (before.paymentInstructions !== after.paymentInstructions) {
    lines.push('Payment instructions updated')
  }
  return lines
}

const accountFieldChanges = (previous: BankAccountDetail, account: BankAccountDetail): string[] => {
  const changes: string[] = []
  if (previous.bankName !== account.bankName) changes.push(`name ${formatText(previous.bankName)} → ${formatText(account.bankName)}`)
  if (previous.accountNumber !== account.accountNumber) {
    changes.push(`account number → ${maskAccountNumber(account.accountNumber)}`)
  }
  if (previous.accountHolder !== account.accountHolder) changes.push('account holder updated')
  if (previous.type !== account.type) changes.push(`type ${previous.type} → ${account.type}`)
  if (previous.isActive !== account.isActive) changes.push(`status ${formatToggle(previous.isActive)} → ${formatToggle(account.isActive)}`)
  if (previous.isDefault !== account.isDefault && account.isDefault) changes.push('set as default')
  if (previous.isCustomerVisible !== account.isCustomerVisible) {
    changes.push(`customer visibility ${formatToggle(previous.isCustomerVisible)} → ${formatToggle(account.isCustomerVisible)}`)
  }
  if (JSON.stringify(previous.branchIds) !== JSON.stringify(account.branchIds)) changes.push('branch assignment updated')
  return changes
}

export type SectionBeforeAfter = {
  'store-profile': [StoreProfileSettings, StoreProfileSettings]
  branches: [BranchSettings[], BranchSettings[]]
  'staff-roles': [StaffRoleSettings, StaffRoleSettings]
  permissions: [PermissionMatrix, PermissionMatrix]
  'payment-methods': [PaymentMethodSettings, PaymentMethodSettings]
  attendance: [AttendanceSettings, AttendanceSettings]
  scheduling: [SchedulingSettings, SchedulingSettings]
  payroll: [PayrollDefaultSettings, PayrollDefaultSettings]
}

/**
 * @description Entry point used by the Settings Center controller. Returns
 * an empty array (never throws) if a section somehow has no differences —
 * callers should treat that as "nothing to summarize" rather than an error.
 */
export function summarizeSectionChanges<TSection extends SettingsSectionId>(
  section: TSection,
  before: SectionBeforeAfter[TSection][0],
  after: SectionBeforeAfter[TSection][1],
): string[] {
  switch (section) {
    case 'store-profile':
      return summarizeStoreProfile(before as StoreProfileSettings, after as StoreProfileSettings)
    case 'branches':
      return summarizeBranches(before as BranchSettings[], after as BranchSettings[])
    case 'staff-roles':
      return summarizeStaffRoles(before as StaffRoleSettings, after as StaffRoleSettings)
    case 'permissions':
      return summarizePermissions(before as PermissionMatrix, after as PermissionMatrix)
    case 'payment-methods':
      return summarizePaymentMethods(before as PaymentMethodSettings, after as PaymentMethodSettings)
    case 'attendance':
      return summarizeAttendance(before as AttendanceSettings, after as AttendanceSettings)
    case 'scheduling':
      return summarizeScheduling(before as SchedulingSettings, after as SchedulingSettings)
    case 'payroll':
      return summarizePayroll(before as PayrollDefaultSettings, after as PayrollDefaultSettings)
    default:
      return []
  }
}
