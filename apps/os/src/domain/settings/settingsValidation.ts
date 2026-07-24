import type { OwnerSettingsStateValue, SettingsSectionId } from '../../types/settings'
import { DEFAULT_BRANCH_OPENING_HOURS, WEEKDAY_KEYS } from '../branchOpeningHoursDomain'
import { isSupportedStoreLogoValue } from './storeLogoDomain'

export type SettingsValidationErrors = Record<string, string>

export const validateOwnerSettings = (
  settings: OwnerSettingsStateValue,
): SettingsValidationErrors => {
  const errors: SettingsValidationErrors = {}

  if (!settings.storeProfile.storeName.trim()) {
    errors.storeName = 'Store name is required.'
  }
  const storeEmail = settings.storeProfile.email.trim()
  if (storeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeEmail)) {
    errors.email = 'Enter a valid store email address.'
  }
  const logoUrl = settings.storeProfile.logoUrl?.trim()
  if (logoUrl && !isSupportedStoreLogoValue(logoUrl)) {
    errors.logoUrl = 'Upload a valid logo image.'
  }

  const seenCodes = new Set<string>()
  settings.branches.forEach((branch, index) => {
    if (!branch.name.trim()) errors[`branch.${index}.name`] = 'Branch name is required.'
    const code = branch.code.trim().toLocaleUpperCase()
    if (!code) {
      errors[`branch.${index}.code`] = 'Branch code is required.'
    } else if (seenCodes.has(code)) {
      errors[`branch.${index}.code`] = 'Branch code must be unique.'
    }
    seenCodes.add(code)
    if (!branch.location || !Number.isFinite(branch.location.latitude) || !Number.isFinite(branch.location.longitude)) {
      errors[`branch.${index}.location`] = 'Branch map location is required.'
    }
    if (!Number.isFinite(branch.deliveryFeeIdr ?? 15000) || (branch.deliveryFeeIdr ?? 15000) < 0) {
      errors[`branch.${index}.deliveryFeeIdr`] = 'Delivery fee must be zero or greater.'
    }
    const openingHours = branch.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS
    WEEKDAY_KEYS.forEach((day) => {
      const hours = openingHours[day]
      if (hours.isOpen && hours.opensAt >= hours.closesAt) {
        errors[`branch.${index}.openingHours.${day}`] =
          'Opening time must be earlier than closing time.'
      }
    })
  })

  const minimumCoverage = settings.scheduling.minimumCoverage ?? { admin: 1, florist: 2 }
  if (!Number.isInteger(minimumCoverage.admin) || minimumCoverage.admin < 0 || minimumCoverage.admin > 50) {
    errors['scheduling.minimumCoverage.admin'] = 'Minimum Admin coverage must be between 0 and 50.'
  }
  if (!Number.isInteger(minimumCoverage.florist) || minimumCoverage.florist < 0 || minimumCoverage.florist > 50) {
    errors['scheduling.minimumCoverage.florist'] = 'Minimum Florist coverage must be between 0 and 50.'
  }

  for (const [day, schedule] of Object.entries(settings.scheduling.defaultWeeklySchedule)) {
    const mode = schedule.mode ?? (schedule.isWorking ? 'follow_branch_hours' : 'off')
    if (mode === 'custom' && schedule.startTime >= schedule.endTime) {
      errors[`scheduling.default.${day}`] = 'Start time must be earlier than end time.'
    }
  }

  if (!Number.isFinite(settings.attendance.locationRadiusMeters) || settings.attendance.locationRadiusMeters < 10 || settings.attendance.locationRadiusMeters > 5000) {
    errors.attendanceRadius = 'Attendance radius must be between 10 and 5,000 meters.'
  }
  if (!Number.isFinite(settings.attendance.lateGraceMinutes) || settings.attendance.lateGraceMinutes < 0 || settings.attendance.lateGraceMinutes > 180) {
    errors.attendanceLateGrace = 'Late grace must be between 0 and 180 minutes.'
  }
  if (!Number.isFinite(settings.attendance.checkoutGraceMinutes) || settings.attendance.checkoutGraceMinutes < 0 || settings.attendance.checkoutGraceMinutes > 240) {
    errors.attendanceCheckoutGrace = 'Checkout grace must be between 0 and 240 minutes.'
  }

  const payroll = settings.payroll
  const dayFields: Array<[keyof typeof payroll, string]> = [
    ['periodStartDay', 'Payroll period start day'],
    ['periodEndDay', 'Payroll period end day'],
    ['hrSubmissionDay', 'HR submission day'],
    ['financeReviewDay', 'Finance review day'],
    ['paymentDay', 'Payment day'],
  ]
  dayFields.forEach(([field, label]) => {
    const value = payroll[field]
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 28) {
      errors[`payroll.${String(field)}`] = `${label} must be between 1 and 28.`
    }
  })
  if (payroll.periodEndDay >= payroll.hrSubmissionDay) errors['payroll.hrSubmissionDay'] = 'HR submission must be after the earning period ends.'
  if (payroll.hrSubmissionDay > payroll.financeReviewDay) errors['payroll.financeReviewDay'] = 'Finance review cannot be before HR submission.'
  if (payroll.financeReviewDay > payroll.paymentDay) errors['payroll.paymentDay'] = 'Payment cannot be before Finance review.'
  if (!Number.isInteger(payroll.pointValueIdr) || payroll.pointValueIdr < 1 || payroll.pointValueIdr > 1_000_000) errors['payroll.pointValueIdr'] = 'Point value must be a whole rupiah amount between Rp1 and Rp1,000,000.'
  for (const role of ['admin','finance','hr','florist'] as const) {
    const salary = payroll.baseSalaryByRole?.[role]
    if (salary !== undefined && (!Number.isInteger(salary) || salary <= 0 || salary > 1_000_000_000)) errors[`payroll.baseSalaryByRole.${role}`] = 'Base salary must be a positive whole rupiah amount.'
  }


  if (settings.paymentMethods.bankAccounts.length === 0) {
    errors['paymentMethods.bankAccounts'] = 'At least one payment account is required.'
  }
  const activePaymentAccounts = settings.paymentMethods.bankAccounts.filter((account) => account.isActive)
  if (activePaymentAccounts.length === 0) {
    errors['paymentMethods.bankAccounts.active'] = 'At least one payment account must stay active.'
  }
  if (activePaymentAccounts.filter((account) => account.isDefault).length !== 1) {
    errors['paymentMethods.bankAccounts.default'] = 'Exactly one active payment account must be the default.'
  }
  settings.paymentMethods.bankAccounts.forEach((account, index) => {
    if (!account.bankName.trim()) {
      errors[`paymentMethods.bankAccounts.${index}.bankName`] = account.type === 'ewallet' ? 'Provider name is required.' : 'Bank name is required.'
    }
    if (!account.accountNumber.trim()) {
      errors[`paymentMethods.bankAccounts.${index}.accountNumber`] = 'Account number is required.'
    }
    if (!account.accountHolder.trim()) {
      errors[`paymentMethods.bankAccounts.${index}.accountHolder`] = 'Account holder is required.'
    }
    if (!Number.isInteger(account.displayOrder) || account.displayOrder < 0) {
      errors[`paymentMethods.bankAccounts.${index}.displayOrder`] = 'Display order must be zero or greater.'
    }
    const invalidBranch = account.branchIds.find((branchId) => !settings.branches.some((branch) => branch.id === branchId))
    if (invalidBranch) {
      errors[`paymentMethods.bankAccounts.${index}.branchIds`] = 'Remove branch assignments that no longer exist.'
    }
    if (account.isDefault && !account.isActive) {
      errors[`paymentMethods.bankAccounts.${index}.isDefault`] = 'The default payment account must stay active.'
    }
  })
  if (!settings.paymentMethods.paymentInstructions.trim()) {
    errors['paymentMethods.paymentInstructions'] = 'Payment instructions are required.'
  }

  if (!settings.branches.some((branch) => branch.isActive)) {
    errors.branches = 'At least one branch must stay active.'
  }
  if (!settings.staffRoles.roles.includes(settings.staffRoles.defaultRole)) {
    errors.defaultRole = 'Default staff role must exist in the active role list.'
  }
  if (!settings.staffRoles.roles.includes('owner')) {
    errors.ownerRole = 'Owner role cannot be removed.'
  }
  if (settings.permissions.owner.settings !== 'edit') {
    errors.ownerSettings = 'Owner Settings permission must stay edit.'
  }
  const nonOwnerRoles = (Object.keys(settings.permissions) as Array<keyof typeof settings.permissions>)
    .filter((role) => role !== 'owner')
  if (nonOwnerRoles.some((role) => settings.permissions[role].settings !== 'none')) {
    errors.nonOwnerSettings = 'Non-owner Settings permission must stay none.'
  }

  return errors
}


const SECTION_ERROR_MATCHERS: Record<SettingsSectionId, Array<(key: string) => boolean>> = {
  'store-profile': [(key) => key === 'storeName'],
  branches: [(key) => key === 'branches' || key.startsWith('branch.')],
  'staff-roles': [(key) => key === 'defaultRole' || key === 'ownerRole'],
  permissions: [(key) => key === 'ownerSettings' || key === 'nonOwnerSettings'],
  'payment-methods': [(key) => key.startsWith('paymentMethods.')],
  attendance: [(key) => key.startsWith('attendance')],
  scheduling: [(key) => key.startsWith('scheduling.')],
  payroll: [(key) => key.startsWith('payroll.')],
}

/** Validate only the Settings section currently being edited. The complete
 * settings object is still supplied so cross-field rules inside that section
 * use the latest saved values, but unrelated invalid sections cannot block a
 * section-level save. */
export const validateOwnerSettingsSection = (
  settings: OwnerSettingsStateValue,
  section: SettingsSectionId,
): SettingsValidationErrors => {
  const allErrors = validateOwnerSettings(settings)
  const matchers = SECTION_ERROR_MATCHERS[section]
  return Object.fromEntries(
    Object.entries(allErrors).filter(([key]) => matchers.some((matches) => matches(key))),
  )
}
