import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_BRANCH_OPENING_HOURS } from '../../domain/branchOpeningHoursDomain'
import type {
  AttendanceSettings,
  BankAccountDetail,
  BranchSettings,
  OwnerSettingsStateValue,
  PaymentMethodSettings,
  PayrollDefaultSettings,
  PermissionMatrix,
  SchedulingSettings,
  StaffRoleSettings,
  StoreProfileSettings,
  SettingsSectionId,
  SettingsSectionValueMap,
} from '../../types/settings'
import type { AccessLevel, AppSection } from '../../config/permissions'
import { hasActionPermission, type ActionCapability, type ActionPermissionMatrix } from '../../config/actionPermissions'
import type { UserRole } from '../../store/userStore'
import type { Employee } from '../../store/hrStoreTypes'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { useHrStore } from '../../store/hrStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useStockStore } from '../../store/stockStore'
import { usePayrollStore } from '../../store/payrollStore'
import { summarizeScheduleImpacts } from '../../domain/hrSchedulingDomain'
import type { PayrollSettingsRevision, SchedulingSettingsRevision } from '../../domain/settings/effectiveSettingsDomain'
import { buildBranchDependencyImpacts, type BranchDependencyImpact } from '../../domain/settings/branchSafetyDomain'
import { normalizeBankAccounts } from '../../domain/settings/paymentMethodSettingsDomain'
import {
  validateOwnerSettingsSection,
  type SettingsValidationErrors,
} from '../../domain/settings/settingsValidation'
import { summarizeActionPermissions, summarizeSectionChanges } from '../../domain/settings/settingsChangeSummaryDomain'
import { SETTINGS_NAVIGATION_REQUEST_EVENT, type SettingsNavigationRequestDetail } from './settingsNavigationGuard'
import type { StaffAccountDraft } from './settingsDraftTypes'
import { canCreateStaffAccount } from '../../domain/staffAccountDomain'

export interface SettingsNavItem {
  id: SettingsSectionId
  label: string
  available: boolean
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'store-profile', label: 'Store Profile', available: true },
  { id: 'branches', label: 'Branches', available: true },
  { id: 'payment-methods', label: 'Payment Methods', available: true },
  { id: 'staff-roles', label: 'Staff & Roles', available: true },
  { id: 'permissions', label: 'Permissions', available: true },
  { id: 'attendance', label: 'Attendance', available: true },
  { id: 'scheduling', label: 'Scheduling', available: true },
  { id: 'payroll', label: 'Payroll', available: true },
]

export interface SettingsCenterViewModel {
  isOwner: boolean
  canEditActiveSection: boolean
  navItems: SettingsNavItem[]
  activeSection: SettingsSectionId
  onSectionChange: (section: SettingsSectionId) => void
  isEditing: boolean
  isDirty: boolean
  leaveConfirmationOpen: boolean
  validationErrors: SettingsValidationErrors
  saveFeedback: string | null
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onKeepEditing: () => void
  onDiscardAndLeave: () => void
  onSaveAndLeave: () => void
  /** Request leaving the current edit session. Dirty drafts open the
   * Save / Discard / Keep editing confirmation. */
  onRequestLeave: (continueNavigation: () => void) => void


  /** Save confirmation dialog: shown after validation passes, before the
   * change is actually committed to the settings store. */
  saveConfirmationOpen: boolean
  pendingChangeSummary: string[]
  onConfirmSave: () => void
  onCancelSaveConfirmation: () => void

  storeProfile: StoreProfileSettings
  onUpdateStoreProfile: (patch: Partial<StoreProfileSettings>) => void

  branches: BranchSettings[]
  onAddBranch: () => void
  onUpdateBranch: (branchId: string, patch: Partial<BranchSettings>) => void
  onSetBranchActive: (branchId: string, isActive: boolean) => void
  branchImpacts: Record<string, BranchDependencyImpact>

  attendance: AttendanceSettings
  onUpdateAttendance: (patch: Partial<AttendanceSettings>) => void

  scheduling: SchedulingSettings
  schedulingEffectiveFrom: string
  schedulingChangeReason: string
  schedulingRevisions: SchedulingSettingsRevision[]
  schedulingImpact: { inheritedFutureShifts: number; invalidCustomShifts: number }
  onSchedulingEffectiveFromChange: (value: string) => void
  onSchedulingChangeReasonChange: (value: string) => void
  onUpdateScheduling: (patch: Partial<SchedulingSettings>) => void

  payroll: PayrollDefaultSettings
  payrollEffectiveFrom: string
  payrollChangeReason: string
  payrollRevisions: PayrollSettingsRevision[]
  payrollMinimumEffectiveDate: string
  onPayrollEffectiveFromChange: (value: string) => void
  onPayrollChangeReasonChange: (value: string) => void
  onUpdatePayroll: (patch: Partial<PayrollDefaultSettings>) => void

  staffRoles: StaffRoleSettings
  onUpdateStaffRoles: (patch: Partial<StaffRoleSettings>) => void
  staffEmployees: Employee[]
  staffAccountDraft: StaffAccountDraft | null
  employeeSalaryDrafts: Record<string, number>
  onStartStaffAccountDraft: () => void
  onCancelStaffAccountDraft: () => void
  onUpdateStaffAccountDraft: (patch: Partial<StaffAccountDraft>) => void
  onUpdateEmployeeSalaryDraft: (employeeId: string, value: number) => void

  permissions: PermissionMatrix
  actionPermissions: ActionPermissionMatrix
  permissionImpact: Record<UserRole, number>
  onUpdateRoleActionPermission: (role: UserRole, capability: ActionCapability, enabled: boolean) => void
  onUpdateRoleSectionAccess: (
    role: UserRole,
    section: AppSection,
    level: AccessLevel,
  ) => void

  paymentMethods: PaymentMethodSettings
  onUpdateBankAccount: (
    id: string,
    patch: Partial<Omit<BankAccountDetail, 'id'>>,
  ) => void
  onAddBankAccount: () => void
  onRemoveBankAccount: (id: string) => void
  onPaymentInstructionsChange: (value: string) => void
}

const SETTINGS_CAPABILITY_BY_SECTION: Record<SettingsSectionId, ActionCapability> = {
  'store-profile': 'settings.edit_store_profile',
  branches: 'settings.edit_branches',
  'staff-roles': 'settings.edit_roles',
  permissions: 'settings.edit_permissions',
  'payment-methods': 'settings.edit_payment_methods',
  attendance: 'settings.edit_attendance',
  scheduling: 'settings.edit_scheduling',
  payroll: 'settings.edit_payroll',
}

export const useSettingsCenterController = (): SettingsCenterViewModel => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const isOwner = role === 'owner'

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('store-profile')
  const savedStoreProfile = useSettingsStore((state) => state.storeProfile)
  const savedBranches = useSettingsStore((state) => state.branches)
  const savedStaffRoles = useSettingsStore((state) => state.staffRoles)
  const savedPermissions = useSettingsStore((state) => state.permissions)
  const savedActionPermissions = useSettingsStore((state) => state.actionPermissions)
  const canEditActiveSection = isOwner && hasActionPermission(role, SETTINGS_CAPABILITY_BY_SECTION[activeSection], savedActionPermissions, savedPermissions)
  const setActionPermissions = useSettingsStore((state) => state.setActionPermissions)
  const savedAttendance = useSettingsStore((state) => state.attendance)
  const savedScheduling = useSettingsStore((state) => state.scheduling)
  const savedPaymentMethods = useSettingsStore((state) => state.paymentMethods)
  const savedPayroll = useSettingsStore((state) => state.payroll)
  const applySettingsSection = useSettingsStore((state) => state.applySettingsSection)
  const savePayrollRevision = useSettingsStore((state) => state.savePayrollRevision)
  const saveSchedulingRevision = useSettingsStore((state) => state.saveSchedulingRevision)
  const payrollRevisions = useSettingsStore((state) => state.payrollConfigRevisions)
  const schedulingRevisions = useSettingsStore((state) => state.schedulingConfigRevisions)
  const setSettingsUnsavedChanges = useSettingsStore(
    (state) => state.setSettingsUnsavedChanges,
  )
  const employees = useHrStore((state) => state.employees)
  const createStaffAccount = useHrStore((state) => state.createStaffAccount)
  const updateEmployeeBaseSalary = useHrStore((state) => state.updateEmployeeBaseSalary)
  const employeeDefaultSchedules = useHrStore((state) => state.employeeDefaultSchedules)
  const scheduleOverrides = useHrStore((state) => state.scheduleOverrides)
  const orders = useOrdersStore((state) => state.orders)
  const stockItems = useStockStore((state) => state.items)
  const stockTransfers = useStockStore((state) => state.transfers)
  const payrollPeriods = usePayrollStore((state) => state.periods)

  const savedSettings = useMemo<OwnerSettingsStateValue>(
    () => ({
      storeProfile: savedStoreProfile,
      branches: savedBranches,
      staffRoles: savedStaffRoles,
      permissions: savedPermissions,
      attendance: savedAttendance,
      scheduling: savedScheduling,
      paymentMethods: savedPaymentMethods,
      payroll: savedPayroll,
    }),
    [
      savedStoreProfile,
      savedBranches,
      savedStaffRoles,
      savedPermissions,
      savedAttendance,
      savedScheduling,
      savedPaymentMethods,
      savedPayroll,
    ],
  )

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState<OwnerSettingsStateValue>(savedSettings)
  const [editActionPermissions, setEditActionPermissions] = useState<ActionPermissionMatrix>(savedActionPermissions)
  const [validationErrors, setValidationErrors] =
    useState<SettingsValidationErrors>({})
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false)
  const [pendingLeaveAction, setPendingLeaveAction] = useState<null | (() => void)>(null)
  const [saveThenLeave, setSaveThenLeave] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false)
  const [pendingSave, setPendingSave] = useState<OwnerSettingsStateValue | null>(null)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const tomorrowDate = new Date(`${today}T00:00:00Z`); tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
  const tomorrow = tomorrowDate.toISOString().slice(0, 10)
  const currentSalaryValues = useMemo<Record<string, number>>(() => Object.fromEntries(
    employees.filter((employee) => employee.systemRole !== 'owner').map((employee) => [employee.id, employee.baseSalaryIdr ?? 0]),
  ), [employees])
  const [staffAccountDraft, setStaffAccountDraft] = useState<StaffAccountDraft | null>(null)
  const [employeeSalaryDrafts, setEmployeeSalaryDrafts] = useState<Record<string, number>>(currentSalaryValues)
  const latestGeneratedPeriodEnd = payrollPeriods.map((period) => period.periodEnd).sort().at(-1)
  const afterLatestPeriod = latestGeneratedPeriodEnd ? (() => { const date = new Date(`${latestGeneratedPeriodEnd}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0,10) })() : tomorrow
  const payrollMinimumEffectiveDate = afterLatestPeriod > tomorrow ? afterLatestPeriod : tomorrow
  const [payrollEffectiveFrom, setPayrollEffectiveFrom] = useState(payrollMinimumEffectiveDate)
  const [payrollChangeReason, setPayrollChangeReason] = useState('')
  const [schedulingEffectiveFrom, setSchedulingEffectiveFrom] = useState(tomorrow)
  const [schedulingChangeReason, setSchedulingChangeReason] = useState('')

  const getSectionValue = <TSection extends SettingsSectionId>(
    settings: OwnerSettingsStateValue,
    section: TSection,
  ): SettingsSectionValueMap[TSection] => {
    const values: SettingsSectionValueMap = {
      'store-profile': settings.storeProfile,
      branches: settings.branches,
      'staff-roles': settings.staffRoles,
      permissions: settings.permissions,
      'payment-methods': settings.paymentMethods,
      attendance: settings.attendance,
      scheduling: settings.scheduling,
      payroll: settings.payroll,
    }
    return values[section]
  }

  const branchImpacts = useMemo(() => buildBranchDependencyImpacts({
    branches: editValue.branches,
    employeeDefaultSchedules,
    scheduleOverrides,
    orders,
    stockItems,
    stockTransfers,
  }), [editValue.branches, employeeDefaultSchedules, scheduleOverrides, orders, stockItems, stockTransfers])

  const schedulingImpact = useMemo(() => summarizeScheduleImpacts({
    employees, defaults: employeeDefaultSchedules, overrides: scheduleOverrides,
    settings: { scheduling: editValue.scheduling, branches: editValue.branches },
    fromDate: schedulingEffectiveFrom,
  }), [employees, employeeDefaultSchedules, scheduleOverrides, editValue.scheduling, editValue.branches, schedulingEffectiveFrom])

  const sectionMetadataDirty = activeSection === 'payroll'
    ? payrollEffectiveFrom !== payrollMinimumEffectiveDate || payrollChangeReason.trim().length > 0
    : activeSection === 'scheduling'
      ? schedulingEffectiveFrom !== tomorrow || schedulingChangeReason.trim().length > 0
      : false

  const permissionActionsDirty = activeSection === 'permissions' && JSON.stringify(editActionPermissions) !== JSON.stringify(savedActionPermissions)
  const staffOperationsDirty = activeSection === 'staff-roles' && (
    staffAccountDraft !== null ||
    employees.some((employee) => employee.systemRole !== 'owner' && employeeSalaryDrafts[employee.id] !== (employee.baseSalaryIdr ?? 0))
  )
  const isDirty =
    isEditing &&
    (sectionMetadataDirty || permissionActionsDirty || staffOperationsDirty || JSON.stringify(getSectionValue(editValue, activeSection)) !==
      JSON.stringify(getSectionValue(savedSettings, activeSection)))

  useEffect(() => {
    if (!isEditing) { setEditValue(savedSettings); setEditActionPermissions(savedActionPermissions) }
  }, [isEditing, savedSettings, savedActionPermissions])

  useEffect(() => {
    setSettingsUnsavedChanges(isDirty)
    return () => setSettingsUnsavedChanges(false)
  }, [isDirty, setSettingsUnsavedChanges])

  useEffect(() => {
    if (!isDirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isDirty])

  const updateEditValue = (
    updater: (current: OwnerSettingsStateValue) => OwnerSettingsStateValue,
  ) => {
    if (!isEditing) return
    setEditValue(updater)
    setValidationErrors({})
    setLeaveConfirmationOpen(false)
    setSaveFeedback(null)
    setSaveConfirmationOpen(false)
    setPendingSave(null)
  }

  const handleAddBranch = () => {
    const id = `branch-${Date.now().toString(36)}`
    updateEditValue((current) => ({
      ...current,
      branches: [
        ...current.branches,
        {
          id,
          name: '',
          code: '',
          address: '',
          phone: '',
          isActive: true,
          isDefault: false,
          openingHours: structuredClone(DEFAULT_BRANCH_OPENING_HOURS),
          location: { latitude: -5.3971, longitude: 105.2668 },
        },
      ],
    }))
  }

  const resetEditSession = useCallback(() => {
    setEditValue(savedSettings)
    setEditActionPermissions(savedActionPermissions)
    setStaffAccountDraft(null)
    setEmployeeSalaryDrafts(currentSalaryValues)
    setValidationErrors({})
    setLeaveConfirmationOpen(false)
    setPendingLeaveAction(null)
    setSaveThenLeave(false)
    setSaveFeedback(null)
    setSaveConfirmationOpen(false)
    setPendingSave(null)
    setPayrollEffectiveFrom(payrollMinimumEffectiveDate)
    setPayrollChangeReason('')
    setSchedulingEffectiveFrom(tomorrow)
    setSchedulingChangeReason('')
    setIsEditing(false)
  }, [savedSettings, savedActionPermissions, currentSalaryValues, payrollMinimumEffectiveDate, tomorrow])

  const completeLeave = useCallback((continueNavigation?: () => void) => {
    resetEditSession()
    continueNavigation?.()
  }, [resetEditSession])

  const requestLeave = useCallback((continueNavigation: () => void) => {
    if (isDirty) {
      setPendingLeaveAction(() => continueNavigation)
      setLeaveConfirmationOpen(true)
      setSaveConfirmationOpen(false)
      return
    }
    completeLeave(continueNavigation)
  }, [completeLeave, isDirty])

  useEffect(() => {
    const handleNavigationRequest = (event: Event) => {
      const detail = (event as CustomEvent<SettingsNavigationRequestDetail>).detail
      if (typeof detail?.continueNavigation === 'function') {
        requestLeave(detail.continueNavigation)
      }
    }
    window.addEventListener(SETTINGS_NAVIGATION_REQUEST_EVENT, handleNavigationRequest)
    return () => window.removeEventListener(SETTINGS_NAVIGATION_REQUEST_EVENT, handleNavigationRequest)
  }, [requestLeave])

  const handleSectionChange = (section: SettingsSectionId) => {
    if (section === activeSection) return
    requestLeave(() => setActiveSection(section))
  }

  const handleEdit = () => {
    if (!canEditActiveSection) return
    setEditValue(savedSettings)
    setEditActionPermissions(savedActionPermissions)
    setStaffAccountDraft(null)
    setEmployeeSalaryDrafts(currentSalaryValues)
    setValidationErrors({})
    setLeaveConfirmationOpen(false)
    setPendingLeaveAction(null)
    setSaveThenLeave(false)
    setSaveFeedback(null)
    setSaveConfirmationOpen(false)
    setPendingSave(null)
    setPayrollEffectiveFrom(payrollMinimumEffectiveDate)
    setPayrollChangeReason('')
    setSchedulingEffectiveFrom(tomorrow)
    setSchedulingChangeReason('')
    setIsEditing(true)
  }

  const handleCancel = () => {
    if (isDirty) {
      setPendingLeaveAction(() => () => undefined)
      setLeaveConfirmationOpen(true)
      return
    }
    resetEditSession()
  }

  const handleKeepEditing = () => {
    setLeaveConfirmationOpen(false)
    setPendingLeaveAction(null)
    setSaveThenLeave(false)
  }

  const handleDiscardAndLeave = () => {
    const continueNavigation = pendingLeaveAction
    completeLeave(continueNavigation ?? undefined)
  }


  const stageSave = (continueAfterSave = false) => {
    if (!canEditActiveSection) { setSaveFeedback('You do not have permission to edit this Settings section.'); return }
    const normalizedEditValue = activeSection === 'branches'
      ? { ...editValue, branches: (editValue.branches) }
      : editValue
    const errors = validateOwnerSettingsSection(normalizedEditValue, activeSection)
    if (activeSection === 'branches') {
      for (const [index, branch] of normalizedEditValue.branches.entries()) {
        const savedBranch = savedBranches.find((item) => item.id === branch.id)
        const impact = branchImpacts[branch.id]
        if (savedBranch?.isActive && !branch.isActive && impact && !impact.canDeactivate) {
          errors[`branch.${index}.active`] = impact.blockingReasons.join(' ')
        }
        if (savedBranch && impact?.codeLocked && savedBranch.code.trim().toUpperCase() !== branch.code.trim().toUpperCase()) {
          errors[`branch.${index}.code`] = 'Branch code is locked because this branch already has orders.'
        }
      }
    }
    if (activeSection === 'payroll') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payrollEffectiveFrom) || payrollEffectiveFrom < payrollMinimumEffectiveDate) {
        errors['payroll.effectiveFrom'] = `Payroll changes must start on or after ${payrollMinimumEffectiveDate}.`
      }
      if (!payrollChangeReason.trim()) errors['payroll.changeReason'] = 'Explain why this payroll configuration is changing.'
    }
    if (activeSection === 'scheduling') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(schedulingEffectiveFrom) || schedulingEffectiveFrom < tomorrow) {
        errors['scheduling.effectiveFrom'] = `Scheduling changes must start on or after ${tomorrow}.`
      }
      if (!schedulingChangeReason.trim()) errors['scheduling.changeReason'] = 'Explain why this scheduling configuration is changing.'
    }
    if (activeSection === 'staff-roles') {
      for (const employee of employees.filter((item) => item.systemRole !== 'owner')) {
        const savedSalary = employee.baseSalaryIdr ?? 0
        const salary = employeeSalaryDrafts[employee.id] ?? savedSalary
        if (salary !== savedSalary && (!Number.isInteger(salary) || salary <= 0)) {
          errors[`staff.salary.${employee.id}`] = 'Base salary must be a positive whole rupiah amount.'
        }
      }
      if (staffAccountDraft) {
        if (!staffAccountDraft.name.trim()) errors['staff.account.name'] = 'Full name is required.'
        if (!editValue.staffRoles.roles.includes(staffAccountDraft.systemRole) || staffAccountDraft.systemRole === 'owner') errors['staff.account.systemRole'] = 'Choose an enabled non-Owner role.'
        if (!/^\d{4}-\d{2}-\d{2}$/.test(staffAccountDraft.hireDate) || staffAccountDraft.hireDate > today) errors['staff.account.hireDate'] = 'Enter a valid hire date that is not in the future.'
        if (!Number.isInteger(staffAccountDraft.baseSalaryIdr) || staffAccountDraft.baseSalaryIdr <= 0) errors['staff.account.baseSalaryIdr'] = 'Base salary must be a positive whole rupiah amount.'
        const eligibility = canCreateStaffAccount({ employees, username: staffAccountDraft.username, pin: staffAccountDraft.pin, systemRole: staffAccountDraft.systemRole, actor: { name: actorName, role }, hrManagedRoles: editValue.staffRoles.hrManagedRoles })
        if (!eligibility.ok) errors[eligibility.reason.toLowerCase().includes('pin') ? 'staff.account.pin' : 'staff.account.username'] = eligibility.reason
      }
    }
    setValidationErrors(errors)
    setSaveFeedback(null)
    if (Object.keys(errors).length > 0) {
      if (continueAfterSave) {
        setPendingLeaveAction(null)
        setSaveThenLeave(false)
      }
      return
    }

    // Validation passed — stage the change and ask for explicit
    // confirmation (with a summary of what's about to change) instead of
    // committing straight away.
    setSaveThenLeave(continueAfterSave)
    setPendingSave(normalizedEditValue)
    setSaveConfirmationOpen(true)
  }

  const handleSave = () => stageSave(false)

  const handleSaveAndLeave = () => {
    setLeaveConfirmationOpen(false)
    stageSave(true)
  }

  const handleConfirmSave = () => {
    if (!pendingSave) return
    const normalizedEditValue = pendingSave
    if (activeSection === 'payroll') {
      savePayrollRevision({ value: normalizedEditValue.payroll, effectiveFrom: payrollEffectiveFrom, reason: payrollChangeReason, actor: actorName, actorRole: role })
    } else if (activeSection === 'scheduling') {
      saveSchedulingRevision({ value: normalizedEditValue.scheduling, effectiveFrom: schedulingEffectiveFrom, reason: schedulingChangeReason, actor: actorName, actorRole: role })
    } else {
      applySettingsSection(activeSection, getSectionValue(normalizedEditValue, activeSection), role)
      if (activeSection === 'permissions') setActionPermissions(editActionPermissions, role)
      if (activeSection === 'staff-roles') {
        for (const employee of employees.filter((item) => item.systemRole !== 'owner')) {
          const nextSalary = employeeSalaryDrafts[employee.id]
          if (nextSalary !== (employee.baseSalaryIdr ?? 0)) updateEmployeeBaseSalary(employee.id, nextSalary, { name: actorName, role: 'owner' })
        }
        if (staffAccountDraft) {
          createStaffAccount({ ...staffAccountDraft, position: staffAccountDraft.systemRole, actor: { name: actorName, role: 'owner' } })
        }
      }
    }
    const continueNavigation = saveThenLeave ? pendingLeaveAction : null
    setIsEditing(false)
    setLeaveConfirmationOpen(false)
    setPendingLeaveAction(null)
    setSaveThenLeave(false)
    setSaveConfirmationOpen(false)
    setPendingSave(null)
    const label = SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection)?.label ?? 'Settings'
    setSaveFeedback(`${label} saved.`)
    continueNavigation?.()
  }

  const handleCancelSaveConfirmation = () => {
    setSaveConfirmationOpen(false)
    setPendingSave(null)
    if (saveThenLeave) {
      setPendingLeaveAction(null)
      setSaveThenLeave(false)
    }
  }

  const pendingChangeSummary = useMemo(() => {
    if (!pendingSave) return []
    const fieldChanges = summarizeSectionChanges(
      activeSection,
      getSectionValue(savedSettings, activeSection),
      getSectionValue(pendingSave, activeSection),
    )
    const metaChanges: string[] = []
    if (activeSection === 'payroll') {
      metaChanges.push(`Effective from: ${payrollEffectiveFrom}`)
      if (payrollChangeReason.trim()) metaChanges.push(`Reason: ${payrollChangeReason.trim()}`)
    }
    if (activeSection === 'scheduling') {
      metaChanges.push(`Effective from: ${schedulingEffectiveFrom}`)
      if (schedulingChangeReason.trim()) metaChanges.push(`Reason: ${schedulingChangeReason.trim()}`)
    }
    const actionChanges =
      activeSection === 'permissions' ? summarizeActionPermissions(savedActionPermissions, editActionPermissions) : []
    const staffChanges: string[] = []
    if (activeSection === 'staff-roles') {
      for (const employee of employees.filter((item) => item.systemRole !== 'owner')) {
        const nextSalary = employeeSalaryDrafts[employee.id]
        if (nextSalary !== (employee.baseSalaryIdr ?? 0)) staffChanges.push(`${employee.name} base salary: Rp ${(employee.baseSalaryIdr ?? 0).toLocaleString('id-ID')} → Rp ${nextSalary.toLocaleString('id-ID')}`)
      }
      if (staffAccountDraft) staffChanges.push(`Create staff account: ${staffAccountDraft.name} (${staffAccountDraft.systemRole})`)
    }
    return [...fieldChanges, ...actionChanges, ...staffChanges, ...metaChanges]
  }, [
    pendingSave,
    activeSection,
    savedSettings,
    payrollEffectiveFrom,
    payrollChangeReason,
    schedulingEffectiveFrom,
    schedulingChangeReason,
    savedActionPermissions,
    editActionPermissions,
    employees,
    employeeSalaryDrafts,
    staffAccountDraft,
  ])

  return {
    isOwner,
    canEditActiveSection,
    navItems: SETTINGS_NAV_ITEMS,
    activeSection,
    onSectionChange: handleSectionChange,
    isEditing,
    isDirty,
    leaveConfirmationOpen,
    validationErrors,
    saveFeedback,
    onEdit: handleEdit,
    onCancel: handleCancel,
    onSave: handleSave,
    onKeepEditing: handleKeepEditing,
    onDiscardAndLeave: handleDiscardAndLeave,
    onSaveAndLeave: handleSaveAndLeave,
    onRequestLeave: requestLeave,
    saveConfirmationOpen,
    pendingChangeSummary,
    onConfirmSave: handleConfirmSave,
    onCancelSaveConfirmation: handleCancelSaveConfirmation,

    storeProfile: editValue.storeProfile,
    onUpdateStoreProfile: (patch) =>
      updateEditValue((current) => ({
        ...current,
        storeProfile: { ...current.storeProfile, ...patch },
      })),

    branches: editValue.branches,
    onAddBranch: handleAddBranch,
    onUpdateBranch: (branchId, patch) =>
      updateEditValue((current) => ({
        ...current,
        branches: current.branches.map((branch) =>
          branch.id === branchId ? { ...branch, ...patch, id: branch.id } : branch,
        ),
      })),
    onSetBranchActive: (branchId, isActive) => {
      const impact = branchImpacts[branchId]
      if (!isActive && impact && !impact.canDeactivate) {
        const index = editValue.branches.findIndex((branch) => branch.id === branchId)
        setValidationErrors((current) => ({
          ...current,
          [`branch.${index}.active`]: impact.blockingReasons.join(' '),
        }))
        return
      }
      updateEditValue((current) => ({
        ...current,
        branches: current.branches.map((branch) =>
          branch.id === branchId ? { ...branch, isActive } : branch,
        ),
      }))
    },
    branchImpacts,

    attendance: editValue.attendance,
    onUpdateAttendance: (patch) =>
      updateEditValue((current) => ({
        ...current,
        attendance: { ...current.attendance, ...patch },
      })),

    scheduling: editValue.scheduling,
    schedulingEffectiveFrom,
    schedulingChangeReason,
    schedulingRevisions,
    schedulingImpact,
    onSchedulingEffectiveFromChange: setSchedulingEffectiveFrom,
    onSchedulingChangeReasonChange: setSchedulingChangeReason,
    onUpdateScheduling: (patch) =>
      updateEditValue((current) => ({
        ...current,
        scheduling: { ...current.scheduling, ...patch },
      })),

    payroll: editValue.payroll,
    payrollEffectiveFrom,
    payrollChangeReason,
    payrollRevisions,
    payrollMinimumEffectiveDate,
    onPayrollEffectiveFromChange: setPayrollEffectiveFrom,
    onPayrollChangeReasonChange: setPayrollChangeReason,
    onUpdatePayroll: (patch) =>
      updateEditValue((current) => ({
        ...current,
        payroll: { ...current.payroll, ...patch },
      })),

    staffRoles: editValue.staffRoles,
    onUpdateStaffRoles: (patch) =>
      updateEditValue((current) => ({
        ...current,
        staffRoles: { ...current.staffRoles, ...patch },
      })),

    staffEmployees: employees,
    staffAccountDraft,
    employeeSalaryDrafts,
    onStartStaffAccountDraft: () => {
      if (!isEditing) return
      const defaultRole = editValue.staffRoles.roles.includes(editValue.staffRoles.defaultRole) && editValue.staffRoles.defaultRole !== 'owner'
        ? editValue.staffRoles.defaultRole
        : (editValue.staffRoles.roles.find((roleValue) => roleValue !== 'owner') ?? 'florist')
      setStaffAccountDraft({ name: '', username: '', pin: '123456', systemRole: defaultRole, phone: '', hireDate: today, baseSalaryIdr: 3_000_000 })
      setSaveFeedback(null)
    },
    onCancelStaffAccountDraft: () => setStaffAccountDraft(null),
    onUpdateStaffAccountDraft: (patch) => { if (isEditing) { setStaffAccountDraft((current) => current ? { ...current, ...patch } : current); setValidationErrors({}); setSaveFeedback(null) } },
    onUpdateEmployeeSalaryDraft: (employeeId, value) => { if (isEditing) { setEmployeeSalaryDrafts((current) => ({ ...current, [employeeId]: value })); setValidationErrors({}); setSaveFeedback(null) } },

    permissions: editValue.permissions,
    actionPermissions: editActionPermissions,
    permissionImpact: Object.fromEntries((['owner','admin','finance','hr','florist'] as UserRole[]).map((roleValue) => [roleValue, employees.filter((employee) => employee.systemRole === roleValue && employee.status === 'active').length])) as Record<UserRole, number>,
    onUpdateRoleActionPermission: (roleValue, capability, enabled) => { if (!isEditing) return; setEditActionPermissions((current) => ({ ...current, [roleValue]: { ...current[roleValue], [capability]: enabled } })); setSaveFeedback(null) },
    onUpdateRoleSectionAccess: (roleValue, section, level) =>
      updateEditValue((current) => ({
        ...current,
        permissions: {
          ...current.permissions,
          [roleValue]: {
            ...current.permissions[roleValue],
            [section]: level,
          },
        },
      })),

    paymentMethods: editValue.paymentMethods,
    onUpdateBankAccount: (id, patch) =>
      updateEditValue((current) => ({
        ...current,
        paymentMethods: normalizeBankAccounts({
          ...current.paymentMethods,
          bankAccounts: current.paymentMethods.bankAccounts.map((account) => {
            if (account.id !== id) return patch.isDefault ? { ...account, isDefault: false } : account
            return { ...account, ...patch, id: account.id }
          }),
        }),
      })),
    onAddBankAccount: () =>
      updateEditValue((current) => ({
        ...current,
        paymentMethods: {
          ...current.paymentMethods,
          bankAccounts: [
            ...current.paymentMethods.bankAccounts,
            {
              id: `bank-${Date.now().toString(36)}`,
              bankName: '',
              accountNumber: '',
              accountHolder: '',
              type: 'bank_transfer',
              isActive: true,
              isDefault: current.paymentMethods.bankAccounts.length === 0,
              displayOrder: current.paymentMethods.bankAccounts.length,
              isCustomerVisible: true,
              branchIds: [],
            },
          ],
        },
      })),
    onRemoveBankAccount: (id) =>
      updateEditValue((current) => ({
        ...current,
        paymentMethods: normalizeBankAccounts({
          ...current.paymentMethods,
          bankAccounts: current.paymentMethods.bankAccounts.filter(
            (account) => account.id !== id,
          ),
        }),
      })),
    onPaymentInstructionsChange: (value) =>
      updateEditValue((current) => ({
        ...current,
        paymentMethods: {
          ...current.paymentMethods,
          paymentInstructions: value,
        },
      })),
  }
}
