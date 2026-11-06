import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { getEmployeeRoleLabel, useHrStore, todayIsoDate, type HrEmployeeCommandResult } from '../../store/hrStore'
import type { AttendanceRecord, AttendanceStatus, Employee } from '../../store/hrStoreTypes'
import type { UserRole } from '../../store/userStore'
import { useUserStore } from '../../store/userStore'
import { canAccessSection, canEditSection } from '../../config/permissions'
import { hasActionPermission } from '../../config/actionPermissions'
import { useSettingsStore } from '../../store/settingsStore'
import { getAttendanceForEmployeeOnDate, getBranchEmployees, getFilteredEmployees, getHrSummary, type EmployeeStatusFilter } from '../../domain/hrDomain'
import type { HrTabContentProps } from './HrTabContent'
import { canSetEmployeeActiveState } from '../../domain/hrStatusDomain'
import { canViewScheduling, getEffectiveScheduleForDate } from '../../domain/hrSchedulingDomain'
import { isHrManagedEmployee } from '../../domain/hrManagedEmployeeDomain'
import { canCreateStaffAccount, getCreatableAccountRoles } from '../../domain/staffAccountDomain'
import { applyLocalEmploymentStatusMetadata, provisionStaffAccountSupabase, sendStaffPasswordResetSupabase, updateStaffEmployeeSupabase, type StaffEmployeePatch } from '../../data/staffLifecycleSupabase'
import { isSupabaseConfigured } from '../../data/shared/supabaseConfig'
import { isStrongStaffPassword, STAFF_PASSWORD_HELP } from '../../domain/staffCredentialDomain'
import { openAttendanceEvidence } from '../../data/attendanceEvidenceSupabase'
import { getEmployeeReadiness, type EmployeeReadiness } from '../../domain/hrEmployeeLifecycleDomain'
import { useStaffCopy } from '../../i18n/staffAccountCopy'

export type HrSection = 'employees' | 'attendance' | 'scheduling' | 'reports' | 'points' | 'payroll'

export interface NewEmployeeFormState {
  name: string
  systemRole: UserRole
  phone: string
  hireDate: string
  email: string
  username: string
  pin: string
}

export const createEmptyHrForm = (systemRole: UserRole = 'florist'): NewEmployeeFormState => ({
  name: '', systemRole, phone: '', hireDate: todayIsoDate(), email: '', username: '', pin: '',
})

export type EmployeeFieldErrors = Partial<Record<keyof EmployeeDetailsFormState, string>>
export type NewEmployeeFieldErrors = Partial<Record<keyof NewEmployeeFormState, string>>

export interface EmployeeDetailsFormState {
  name: string
  systemRole: UserRole
  phone: string
  hireDate: string
  email: string
  username: string
  pin: string
}

export interface HrEmployeeRowViewModel { employee: Employee; todayRecord: AttendanceRecord | null; readiness: EmployeeReadiness }
export interface AttendanceEditorState { employee: Employee; date: string; status: AttendanceStatus | ''; note: string; reviewCaseId?: string }

export interface HrTabContentViewModel {
  activeBranch: HrTabContentProps['activeBranch']
  onOpenOrder?: (orderNumber: string) => void
  activeSection: HrSection
  availableSections: HrSection[]
  canEdit: boolean
  canCreateEmployee: boolean
  canManageEmployeeStatus: boolean
  /** True while a staff account command is running; buttons are disabled to prevent duplicate submits. */
  isStaffActionBusy: boolean
  canManageEmployeeDetails: boolean
  canEditCredentials: boolean
  canCreateAccounts: boolean
  usesProductionPassword: boolean
  pendingStatusEmployee: Employee | null
  statusActionError: string | null
  attendanceEditor: AttendanceEditorState | null
  attendanceActionError: string | null
  attendanceHistory: AttendanceRecord[]
  statusFilter: EmployeeStatusFilter
  employeeSearch: string
  employeeRoleFilter: 'all' | UserRole
  isAddOpen: boolean
  form: NewEmployeeFormState
  formErrors: NewEmployeeFieldErrors
  detailsEmployee: Employee | null
  detailsForm: EmployeeDetailsFormState | null
  profileErrors: EmployeeFieldErrors
  accessErrors: EmployeeFieldErrors
  detailsError: string | null
  detailsMessage: string | null
  pendingAccessConfirmation: { changes: string[] } | null
  pendingDetailsCloseConfirmation: boolean
  pendingAddCloseConfirmation: boolean
  hasUnsavedEmployeeDetails: boolean
  hasUnsavedNewEmployee: boolean
  today: string
  summary: ReturnType<typeof getHrSummary>
  branchEmployees: Employee[]
  employeeRows: HrEmployeeRowViewModel[]
  assignableRoles: UserRole[]
  branches: { id: string; name: string }[]
  onSectionChange: (section: HrSection) => void
  onStatusFilterChange: (value: EmployeeStatusFilter) => void
  onEmployeeSearchChange: (value: string) => void
  onEmployeeRoleFilterChange: (value: 'all' | UserRole) => void
  onToggleAddOpen: () => void
  onCloseAddForm: () => void
  onRequestCloseAddForm: () => void
  onDiscardAddForm: () => void
  onKeepEditingAddForm: () => void
  onFormFieldChange: <K extends keyof NewEmployeeFormState>(field: K) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onHireDateChange: (value: string) => void
  onCreateEmployee: (event: FormEvent) => void
  onOpenAttendanceCorrection: (caseId: string, employeeId: string, date: string) => void
  onOpenAttendanceEditor: (employee: Employee) => void
  onCloseAttendanceEditor: () => void
  onAttendanceDateChange: (value: string) => void
  onAttendanceStatusChange: (value: AttendanceStatus) => void
  onAttendanceNoteChange: (value: string) => void
  onOpenAttendanceEvidence: (value?: string) => void
  onSaveAttendance: () => void
  onOpenEmployeeDetails: (employee: Employee) => void
  onCloseEmployeeDetails: () => void
  onDiscardEmployeeDetailsChanges: () => void
  onKeepEditingEmployeeDetails: () => void
  onDetailsFieldChange: <K extends keyof EmployeeDetailsFormState>(field: K, value: EmployeeDetailsFormState[K]) => void
  onSaveEmployeeProfile: () => void
  onRequestSaveEmployeeAccess: () => void
  onConfirmEmployeeAccessChange: () => void
  onCancelEmployeeAccessChange: () => void
  /** Owner/HR: email the selected employee a password reset link. */
  onSendPasswordReset: () => void
  canSendPasswordReset: boolean
  onRequestEmployeeStatusChange: (employee: Employee) => void
  onCancelEmployeeStatusChange: () => void
  onConfirmEmployeeStatusChange: () => void
}

export const useHrTabContentController = ({ activeBranch, onOpenOrder, searchQuery, onSearchQueryChange, onActiveSectionChange }: HrTabContentProps): HrTabContentViewModel => {
  const tr = useStaffCopy()
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const usesProductionPassword = isSupabaseConfigured()
  const permissions = useSettingsStore((state) => state.permissions)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const staffRoles = useSettingsStore((state) => state.staffRoles)
  const payrollSettings = useSettingsStore((state) => state.payroll)
  const getSchedulingSettingsForDate = useSettingsStore((state) => state.getSchedulingSettingsForDate)
  const hrManagedRoles = staffRoles.hrManagedRoles
  const configuredBranches = useSettingsStore((state) => state.branches)
  const branches = configuredBranches.filter((branch) => branch.isActive)
  const canAccessHrCore = canAccessSection(role, 'hr', permissions)
  const canEditSectionLevel = canEditSection(role, 'hr', permissions)
  const canViewEmployees = hasActionPermission(role, 'hr.view_employees', actionPermissions, permissions)
  const canCreateEmployee = hasActionPermission(role, 'hr.create_employee', actionPermissions, permissions)
  const canManageEmployeeDetails = hasActionPermission(role, 'hr.edit_employee', actionPermissions, permissions)
  const canManageEmployeeStatus = canManageEmployeeDetails
  const canReviewAttendance = hasActionPermission(role, 'hr.review_attendance', actionPermissions, permissions)
  const canCorrectAttendance = hasActionPermission(role, 'hr.correct_attendance', actionPermissions, permissions)
  const canPreparePayroll = hasActionPermission(role, 'hr.create_payroll_proposal', actionPermissions, permissions) || hasActionPermission(role, 'hr.edit_payroll_proposal', actionPermissions, permissions) || hasActionPermission(role, 'hr.resolve_rejected_employee', actionPermissions, permissions)
  const canEdit = canEditSectionLevel && canCorrectAttendance
  const canAccessScheduling = canViewScheduling(role, permissions)
  const availableSections: HrSection[] = [
    ...(canAccessHrCore && canViewEmployees ? ['employees'] as HrSection[] : []),
    ...(canAccessScheduling ? ['scheduling'] as HrSection[] : []),
    ...(canAccessHrCore && (canReviewAttendance || canCorrectAttendance) ? ['attendance'] as HrSection[] : []),
    ...(canAccessHrCore && canPreparePayroll ? ['payroll'] as HrSection[] : []),
  ]
  const canEditCredentials = role === 'owner' && canManageEmployeeDetails
  const canCreateAccounts = ['owner', 'hr'].includes(role) && canCreateEmployee
  const creatableRoleSet = new Set(getCreatableAccountRoles(role, hrManagedRoles))
  const assignableRoles = staffRoles.roles.filter((candidate) => creatableRoleSet.has(candidate))

  const [activeSection, setActiveSection] = useState<HrSection>(() => canAccessHrCore ? 'employees' : 'scheduling')
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>('all')
  const [internalEmployeeSearch, setInternalEmployeeSearch] = useState('')
  const employeeSearch = searchQuery ?? internalEmployeeSearch
  const setEmployeeSearch = onSearchQueryChange ?? setInternalEmployeeSearch
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState<'all' | UserRole>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [form, setForm] = useState<NewEmployeeFormState>(() => createEmptyHrForm(assignableRoles.includes(staffRoles.defaultRole) ? staffRoles.defaultRole : (assignableRoles[0] ?? 'florist')))
  const [formErrors, setFormErrors] = useState<NewEmployeeFieldErrors>({})
  const [pendingStatusEmployee, setPendingStatusEmployee] = useState<Employee | null>(null)
  const [statusActionError, setStatusActionError] = useState<string | null>(null)
  const [attendanceEditor, setAttendanceEditor] = useState<AttendanceEditorState | null>(null)
  const [attendanceActionError, setAttendanceActionError] = useState<string | null>(null)
  // The details sheet always reads the live store record (never a copy taken
  // when it opened), so a save can never resend stale status or role values.
  const [detailsEmployeeId, setDetailsEmployeeId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'create' | 'profile' | 'access' | 'status' | 'reset' | null>(null)
  const [detailsForm, setDetailsForm] = useState<EmployeeDetailsFormState | null>(null)
  const [profileErrors, setProfileErrors] = useState<EmployeeFieldErrors>({})
  const [accessErrors, setAccessErrors] = useState<EmployeeFieldErrors>({})
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsMessage, setDetailsMessage] = useState<string | null>(null)
  const [pendingAccessConfirmation, setPendingAccessConfirmation] = useState<{ changes: string[] } | null>(null)
  const [pendingDetailsCloseConfirmation, setPendingDetailsCloseConfirmation] = useState(false)
  const [pendingAddCloseConfirmation, setPendingAddCloseConfirmation] = useState(false)

  useEffect(() => {
    if (!availableSections.includes(activeSection)) {
      const nextSection = availableSections[0] ?? 'scheduling'
      setActiveSection(nextSection)
      onActiveSectionChange?.(nextSection)
    }
  }, [activeSection, availableSections.join('|'), onActiveSectionChange])

  useEffect(() => {
    onActiveSectionChange?.(activeSection)
  }, [activeSection, onActiveSectionChange])

  useEffect(() => {
    const openSection = (event: Event) => {
      const section = (event as CustomEvent<{ section?: HrSection }>).detail?.section
      if (section && availableSections.includes(section)) setActiveSection(section)
    }
    window.addEventListener('hr-open-section', openSection)
    return () => window.removeEventListener('hr-open-section', openSection)
  }, [availableSections.join('|')])

  const employees = useHrStore((state) => state.employees)
  const detailsEmployee = useMemo(() => (detailsEmployeeId ? employees.find((item) => item.id === detailsEmployeeId) ?? null : null), [detailsEmployeeId, employees])
  const attendance = useHrStore((state) => state.attendance)
  const employeeDefaultSchedules = useHrStore((state) => state.employeeDefaultSchedules)
  const scheduleOverrides = useHrStore((state) => state.scheduleOverrides)
  const addEmployee = useHrStore((state) => state.addEmployee)
  const createStaffAccount = useHrStore((state) => state.createStaffAccount)
  const updateEmployeeProfile = useHrStore((state) => state.updateEmployeeProfile)
  const updateEmployeeAccess = useHrStore((state) => state.updateEmployeeAccess)
  const recordAttendance = useHrStore((state) => state.recordAttendance)
  const activateEmployee = useHrStore((state) => state.activateEmployee)
  const deactivateEmployee = useHrStore((state) => state.deactivateEmployee)
  const applyDeactivationScheduleEffects = useHrStore((state) => state.applyDeactivationScheduleEffects)
  const today = todayIsoDate()

  const branchEmployees = useMemo(() => getBranchEmployees(employees, activeBranch).filter((employee) => role === 'owner' ? true : isHrManagedEmployee(employee, 'employees', hrManagedRoles)), [employees, activeBranch, role, hrManagedRoles])
  const expectedAttendanceEmployeeIds = useMemo(() => {
    const scheduling = getSchedulingSettingsForDate(today)
    return new Set(branchEmployees
      .filter((employee) => employee.status === 'active')
      .filter((employee) => getEffectiveScheduleForDate({
        employee,
        date: today,
        defaults: employeeDefaultSchedules,
        overrides: scheduleOverrides,
        settings: { scheduling, branches: configuredBranches },
      }).shift.isWorking)
      .map((employee) => employee.id))
  }, [branchEmployees, configuredBranches, employeeDefaultSchedules, getSchedulingSettingsForDate, scheduleOverrides, today])
  const summary = useMemo(() => getHrSummary(branchEmployees, attendance, today, expectedAttendanceEmployeeIds), [branchEmployees, attendance, expectedAttendanceEmployeeIds, today])
  const filteredEmployees = useMemo(() => getFilteredEmployees(branchEmployees, statusFilter).filter((employee) => {
    const query = employeeSearch.trim().toLowerCase()
    const matchesSearch = !query || [employee.name, employee.phone, employee.email ?? '', employee.username ?? ''].some((value) => value.toLowerCase().includes(query))
    const matchesRole = employeeRoleFilter === 'all' || employee.systemRole === employeeRoleFilter
    const matchesBranch = true
    return matchesSearch && matchesRole && matchesBranch
  }), [branchEmployees, statusFilter, employeeSearch, employeeRoleFilter])
  const attendanceHistory = useMemo(() => attendanceEditor ? attendance.filter((record) => record.employeeId === attendanceEditor.employee.id).sort((a, b) => b.date.localeCompare(a.date)) : [], [attendance, attendanceEditor])
  const employeeRows = useMemo(() => filteredEmployees.map((employee) => ({
    employee,
    todayRecord: getAttendanceForEmployeeOnDate(attendance, employee.id, today),
    readiness: getEmployeeReadiness({
      employee,
      roleSalaryIdr: employee.systemRole === 'owner' ? 0 : (payrollSettings.baseSalaryByRole?.[employee.systemRole] ?? 0),
      productionAuth: usesProductionPassword,
    }),
  })), [attendance, filteredEmployees, payrollSettings.baseSalaryByRole, today, usesProductionPassword])

  const emptyNewEmployeeForm = createEmptyHrForm(assignableRoles.includes(staffRoles.defaultRole) ? staffRoles.defaultRole : (assignableRoles[0] ?? 'florist'))
  const hasUnsavedNewEmployee = Boolean(
    form.name.trim() || form.phone.trim() || form.email.trim() || form.username.trim() || form.pin.trim() ||
    form.systemRole !== emptyNewEmployeeForm.systemRole || form.hireDate !== emptyNewEmployeeForm.hireDate
  )

  const hasUnsavedEmployeeDetails = Boolean(detailsEmployee && detailsForm && (
    detailsForm.name !== detailsEmployee.name ||
    detailsForm.phone !== detailsEmployee.phone ||
    detailsForm.hireDate !== detailsEmployee.hireDate ||
    detailsForm.email !== (detailsEmployee.email ?? '') ||
    detailsForm.systemRole !== detailsEmployee.systemRole ||
    detailsForm.username !== (detailsEmployee.username ?? '') ||
    Boolean(detailsForm.pin)
  ))

  const applyEmployeeCommandError = (result: Extract<HrEmployeeCommandResult, { ok: false }>, target: 'form' | 'profile' | 'access') => {
    if (target === 'form') setFormErrors(result.fieldErrors ?? {})
    if (target === 'profile') setProfileErrors(result.fieldErrors ?? {})
    if (target === 'access') setAccessErrors(result.fieldErrors ?? {})
    setDetailsError(result.reason)
    setDetailsMessage(null)
  }

  const handleFormFieldChange = <K extends keyof NewEmployeeFormState>(field: K) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value as NewEmployeeFormState[K] }))
    setFormErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleCreateEmployee = async (event: FormEvent) => {
    event.preventDefault()
    if (!canCreateEmployee) return
    setFormErrors({})
    const actor = { name: actorName, role }
    const hireDate = form.hireDate || today
    const preflightErrors: NewEmployeeFieldErrors = {}
    if (!form.name.trim()) preflightErrors.name = tr('Employee name is required.', 'Nama karyawan wajib diisi.')
    if (form.phone.trim() && !/^\+?[0-9][0-9 ()-]{7,19}$/.test(form.phone.trim())) preflightErrors.phone = tr('Enter a valid WhatsApp number.', 'Masukkan nomor WhatsApp yang valid.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) preflightErrors.hireDate = tr('Hire date is required.', 'Tanggal bergabung wajib diisi.')
    else if (hireDate > today) preflightErrors.hireDate = tr('Hire date cannot be in the future.', 'Tanggal bergabung tidak boleh di masa depan.')
    if (!assignableRoles.includes(form.systemRole)) preflightErrors.systemRole = tr('The selected role is not available for this account.', 'Peran yang dipilih tidak tersedia untuk akun ini.')
    if (Object.keys(preflightErrors).length) { setFormErrors(preflightErrors); return }
    const common = { name: form.name, position: form.systemRole, systemRole: form.systemRole, phone: form.phone, hireDate, actor }
    const configuredRoleSalary = form.systemRole === 'owner' ? 0 : (payrollSettings.baseSalaryByRole?.[form.systemRole] ?? 0)
    const baseSalaryIdr = Number.isInteger(configuredRoleSalary) && configuredRoleSalary > 0
      ? configuredRoleSalary : undefined
    let result: HrEmployeeCommandResult
    if (canCreateAccounts && isSupabaseConfigured()) {
      const eligibility = canCreateStaffAccount({ employees, email: form.email, username: form.username, pin: form.pin, systemRole: form.systemRole, actor, hrManagedRoles, usesProductionPassword })
      if (!eligibility.ok) {
        const lower = eligibility.reason.toLowerCase()
        setFormErrors({ [lower.includes('email') ? 'email' : lower.includes('username') ? 'username' : (lower.includes('pin') || lower.includes('password')) ? 'pin' : 'systemRole']: eligibility.reason })
        return
      }
      if (busyAction) return
      const employee: Employee = {
        id: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: form.name.trim(),
        position: getEmployeeRoleLabel(form.systemRole),
        branch: '',
        systemRole: form.systemRole,
        status: 'active',
        phone: form.phone.trim(),
        hireDate,
        email: form.email.trim().toLowerCase(),
        username: form.username.trim().toLowerCase(),
        ...(baseSalaryIdr ? { baseSalaryIdr } : {}),
      }
      setBusyAction('create')
      try {
        // The server creates the login and the HR employee together and the
        // store adopts that record; nothing is written locally afterwards.
        await provisionStaffAccountSupabase({ employee, password: form.pin })
      } catch (cause) {
        setDetailsError(cause instanceof Error ? cause.message : tr('Unable to create the staff account.', 'Akun staf tidak bisa dibuat.'))
        return
      } finally {
        setBusyAction(null)
      }
      setForm(createEmptyHrForm(staffRoles.defaultRole)); setFormErrors({}); setIsAddOpen(false); setDetailsError(null)
      return
    } else {
      result = canCreateAccounts
        ? createStaffAccount({ ...common, email: form.email, username: form.username, pin: form.pin, baseSalaryIdr })
        : addEmployee(common)
    }
    if (!result.ok) { applyEmployeeCommandError(result, 'form'); return }
    setForm(createEmptyHrForm(staffRoles.defaultRole)); setFormErrors({}); setIsAddOpen(false); setDetailsError(null)
  }

  return {
    activeBranch, onOpenOrder, activeSection, availableSections, canEdit, canCreateEmployee, canManageEmployeeStatus, isStaffActionBusy: busyAction !== null, canManageEmployeeDetails, canEditCredentials, canCreateAccounts, usesProductionPassword,
    pendingStatusEmployee, statusActionError, attendanceEditor, attendanceActionError, attendanceHistory,
    statusFilter, employeeSearch, employeeRoleFilter, isAddOpen, form, formErrors, detailsEmployee, detailsForm, profileErrors, accessErrors, detailsError, detailsMessage, pendingAccessConfirmation, pendingDetailsCloseConfirmation, pendingAddCloseConfirmation, hasUnsavedEmployeeDetails, hasUnsavedNewEmployee, today, summary,
    branchEmployees, employeeRows, assignableRoles, branches,
    onSectionChange: (section) => {
      if (!availableSections.includes(section)) return
      setActiveSection(section)
      setEmployeeSearch('')
      onActiveSectionChange?.(section)
    },
    onStatusFilterChange: setStatusFilter,
    onEmployeeSearchChange: setEmployeeSearch,
    onEmployeeRoleFilterChange: setEmployeeRoleFilter,
    onToggleAddOpen: () => { setDetailsError(null); setFormErrors({}); setPendingAddCloseConfirmation(false); setIsAddOpen(true) },
    onCloseAddForm: () => { setIsAddOpen(false); setPendingAddCloseConfirmation(false); setDetailsError(null); setFormErrors({}); setForm(createEmptyHrForm(staffRoles.defaultRole)) },
    onRequestCloseAddForm: () => {
      if (hasUnsavedNewEmployee) { setPendingAddCloseConfirmation(true); return }
      setIsAddOpen(false); setDetailsError(null); setFormErrors({}); setForm(createEmptyHrForm(staffRoles.defaultRole))
    },
    onDiscardAddForm: () => { setPendingAddCloseConfirmation(false); setIsAddOpen(false); setDetailsError(null); setFormErrors({}); setForm(createEmptyHrForm(staffRoles.defaultRole)) },
    onKeepEditingAddForm: () => setPendingAddCloseConfirmation(false),
    onFormFieldChange: handleFormFieldChange,
    onHireDateChange: (value) => { setForm((previous) => ({ ...previous, hireDate: value })); setFormErrors((current) => ({ ...current, hireDate: undefined })) },
    onCreateEmployee: handleCreateEmployee,
    onOpenAttendanceEditor: (employee) => {
      const existing = getAttendanceForEmployeeOnDate(attendance, employee.id, today)
      setAttendanceActionError(null); setAttendanceEditor({ employee, date: today, status: existing?.status ?? '', note: '' })
    },
    onOpenAttendanceCorrection: (caseId, employeeId, date) => {
      const employee = employees.find((item) => item.id === employeeId)
      if (!employee) { setAttendanceActionError('Employee was not found.'); return }
      const existing = getAttendanceForEmployeeOnDate(attendance, employeeId, date)
      setAttendanceActionError(null)
      setAttendanceEditor({ employee, date, status: existing?.status ?? '', note: '', reviewCaseId: caseId })
    },
    onCloseAttendanceEditor: () => { setAttendanceEditor(null); setAttendanceActionError(null) },
    onAttendanceDateChange: (value) => {
      setAttendanceEditor((current) => {
        if (!current || current.reviewCaseId) return current
        const existing = getAttendanceForEmployeeOnDate(attendance, current.employee.id, value)
        return { ...current, date: value, status: existing?.status ?? '', note: '' }
      })
      setAttendanceActionError(null)
    },
    onAttendanceStatusChange: (value) => setAttendanceEditor((current) => current ? { ...current, status: value } : current),
    onAttendanceNoteChange: (value) => setAttendanceEditor((current) => current ? { ...current, note: value } : current),
    onOpenAttendanceEvidence: (value) => {
      setAttendanceActionError(null)
      void openAttendanceEvidence(value).catch((cause) => setAttendanceActionError(cause instanceof Error ? cause.message : 'Unable to open attendance evidence.'))
    },
    onSaveAttendance: () => {
      if (!canCorrectAttendance) { setAttendanceActionError('You do not have permission to correct attendance.'); return }
      if (!attendanceEditor?.status) { setAttendanceActionError('Select an attendance status.'); return }
      const reason = attendanceEditor.note.trim()
      if (!reason) { setAttendanceActionError('Add a reason for this manual attendance record or correction.'); return }
      const changed = recordAttendance({ employeeId: attendanceEditor.employee.id, date: attendanceEditor.date, status: attendanceEditor.status, note: reason, reviewCaseId: attendanceEditor.reviewCaseId, actor: { name: actorName, role } })
      if (!changed) { setAttendanceActionError('Attendance could not be saved. Check employee status and permissions.'); return }
      setAttendanceActionError(null)
      setAttendanceEditor(null)
    },
    onOpenEmployeeDetails: (employee) => {
      setDetailsEmployeeId(employee.id); setProfileErrors({}); setAccessErrors({}); setDetailsError(null); setDetailsMessage(null); setPendingAccessConfirmation(null); setPendingDetailsCloseConfirmation(false)
      setDetailsForm({ name: employee.name, systemRole: employee.systemRole, phone: employee.phone, hireDate: employee.hireDate, email: employee.email ?? '', username: employee.username ?? '', pin: '' })
    },
    onCloseEmployeeDetails: () => {
      if (hasUnsavedEmployeeDetails) { setPendingDetailsCloseConfirmation(true); return }
      setDetailsEmployeeId(null); setDetailsForm(null); setProfileErrors({}); setAccessErrors({}); setDetailsError(null); setDetailsMessage(null); setPendingAccessConfirmation(null)
    },
    onDiscardEmployeeDetailsChanges: () => { setPendingDetailsCloseConfirmation(false); setDetailsEmployeeId(null); setDetailsForm(null); setProfileErrors({}); setAccessErrors({}); setDetailsError(null); setDetailsMessage(null); setPendingAccessConfirmation(null) },
    onKeepEditingEmployeeDetails: () => setPendingDetailsCloseConfirmation(false),
    onDetailsFieldChange: (field, value) => {
      setDetailsForm((current) => current ? { ...current, [field]: value } : current)
      setProfileErrors((current) => ({ ...current, [field]: undefined }))
      setAccessErrors((current) => ({ ...current, [field]: undefined }))
      setDetailsError(null); setDetailsMessage(null)
    },
    onSaveEmployeeProfile: async () => {
      if (!detailsEmployee || !detailsForm) return
      const errors: EmployeeFieldErrors = {}
      if (!detailsForm.name.trim()) errors.name = tr('Employee name is required.', 'Nama karyawan wajib diisi.')
      if (detailsForm.phone.trim() && !/^\+?[0-9][0-9 ()-]{7,19}$/.test(detailsForm.phone.trim())) errors.phone = tr('Enter a valid WhatsApp number.', 'Masukkan nomor WhatsApp yang valid.')
      if (!detailsForm.hireDate) errors.hireDate = tr('Hire date is required.', 'Tanggal bergabung wajib diisi.')
      else if (detailsForm.hireDate > today) errors.hireDate = tr('Hire date cannot be in the future.', 'Tanggal bergabung tidak boleh di masa depan.')
      setProfileErrors(errors)
      if (Object.keys(errors).length) return
      if (isSupabaseConfigured()) {
        if (busyAction) return
        setBusyAction('profile')
        try {
          await updateStaffEmployeeSupabase(detailsEmployee.id, { name: detailsForm.name.trim(), phone: detailsForm.phone.trim(), hireDate: detailsForm.hireDate })
        } catch (cause) {
          setDetailsError(cause instanceof Error ? cause.message : tr('Unable to save the employee profile.', 'Profil karyawan tidak bisa disimpan.'))
          return
        } finally {
          setBusyAction(null)
        }
        setDetailsError(null); setDetailsMessage(tr('Profile updated.', 'Profil tersimpan.'))
        return
      }
      const result = updateEmployeeProfile({ employeeId: detailsEmployee.id, name: detailsForm.name, phone: detailsForm.phone, hireDate: detailsForm.hireDate, actor: { name: actorName, role } })
      if (!result.ok) { applyEmployeeCommandError(result, 'profile'); return }
      setDetailsError(null); setDetailsMessage(tr('Profile updated.', 'Profil tersimpan.'))
    },
    onRequestSaveEmployeeAccess: () => {
      if (!detailsEmployee || !detailsForm) return
      const errors: EmployeeFieldErrors = {}
      if (!assignableRoles.includes(detailsForm.systemRole)) errors.systemRole = tr('Select an enabled role.', 'Pilih peran yang aktif.')
      if (canEditCredentials) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(detailsForm.email.trim())) errors.email = tr('Enter a valid recovery email address.', 'Masukkan email pemulihan yang valid.')
        if (!/^[a-z][a-z0-9._-]*$/.test(detailsForm.username.trim())) errors.username = tr('Use lowercase letters, numbers, dots, underscores, or hyphens, starting with a letter.', 'Gunakan huruf kecil, angka, titik, garis bawah, atau tanda hubung, diawali huruf.')
        if (detailsForm.pin && !isStrongStaffPassword(detailsForm.pin)) errors.pin = STAFF_PASSWORD_HELP
      }
      setAccessErrors(errors)
      if (Object.keys(errors).length) return
      const changes: string[] = []
      if (detailsForm.systemRole !== detailsEmployee.systemRole) changes.push(`${tr('Role', 'Peran')}: ${detailsEmployee.systemRole} → ${detailsForm.systemRole}`)
      if (detailsForm.email.trim().toLowerCase() !== (detailsEmployee.email ?? '').toLowerCase()) changes.push(`${tr('Recovery email', 'Email pemulihan')}: ${detailsEmployee.email ?? '-'} → ${detailsForm.email.trim().toLowerCase()}`)
      if (detailsForm.username.trim() !== (detailsEmployee.username ?? '')) changes.push(`${tr('Username', 'Nama pengguna')}: ${detailsEmployee.username ?? '-'} → ${detailsForm.username.trim()}`)
      if (detailsForm.pin) changes.push(tr('New password', 'Kata sandi baru'))
      if (changes.length) { setPendingAccessConfirmation({ changes }); return }
      if (isSupabaseConfigured()) { setDetailsError(null); setDetailsMessage(tr('Nothing to change.', 'Tidak ada yang berubah.')); return }
      const result = updateEmployeeAccess({ employeeId: detailsEmployee.id, systemRole: detailsForm.systemRole, email: detailsForm.email, username: detailsForm.username, pin: detailsForm.pin, productionAuth: usesProductionPassword, actor: { name: actorName, role } })
      if (!result.ok) { applyEmployeeCommandError(result, 'access'); return }
      setDetailsError(null); setDetailsMessage('Access settings updated.')
    },
    onConfirmEmployeeAccessChange: async () => {
      if (!detailsEmployee || !detailsForm) return
      if (isSupabaseConfigured()) {
        if (busyAction) return
        const patch: StaffEmployeePatch = {}
        const nextEmail = detailsForm.email.trim().toLowerCase()
        const nextUsername = detailsForm.username.trim().toLowerCase()
        if (detailsForm.systemRole !== detailsEmployee.systemRole) patch.systemRole = detailsForm.systemRole
        if (nextEmail && nextEmail !== (detailsEmployee.email ?? '').toLowerCase()) patch.email = nextEmail
        if (nextUsername && nextUsername !== (detailsEmployee.username ?? '')) patch.username = nextUsername
        setBusyAction('access')
        try {
          await updateStaffEmployeeSupabase(detailsEmployee.id, patch, detailsForm.pin || undefined)
        } catch (cause) {
          setDetailsError(cause instanceof Error ? cause.message : tr('Unable to save the login changes.', 'Perubahan login tidak bisa disimpan.'))
          setPendingAccessConfirmation(null)
          return
        } finally {
          setBusyAction(null)
        }
        setPendingAccessConfirmation(null); setDetailsError(null); setDetailsMessage(tr('Access changes saved.', 'Perubahan akses tersimpan.'))
        setDetailsForm((current) => current ? { ...current, pin: '' } : current)
        return
      }
      const result = updateEmployeeAccess({ employeeId: detailsEmployee.id, systemRole: detailsForm.systemRole, email: detailsForm.email, username: detailsForm.username, pin: detailsForm.pin, productionAuth: usesProductionPassword, actor: { name: actorName, role } })
      if (!result.ok) { applyEmployeeCommandError(result, 'access'); setPendingAccessConfirmation(null); return }
      const updated = useHrStore.getState().employees.find((item) => item.id === detailsEmployee.id) ?? null
      setPendingAccessConfirmation(null); setDetailsError(null); setDetailsMessage('Role change confirmed.')
      if (updated) setDetailsForm((current) => current ? { ...current, systemRole: updated.systemRole, email: updated.email ?? '', username: updated.username ?? '', pin: '' } : current)
    },
    onCancelEmployeeAccessChange: () => setPendingAccessConfirmation(null),
    canSendPasswordReset: Boolean(usesProductionPassword && detailsEmployee && detailsEmployee.status === 'active' && detailsEmployee.username && detailsEmployee.email),
    onSendPasswordReset: async () => {
      if (!detailsEmployee || busyAction) return
      setBusyAction('reset')
      try {
        const sentTo = await sendStaffPasswordResetSupabase(detailsEmployee.id)
        setDetailsError(null)
        setDetailsMessage(tr(`Password reset link sent to ${sentTo}.`, `Tautan atur ulang sandi dikirim ke ${sentTo}.`))
      } catch (cause) {
        setDetailsMessage(null)
        setDetailsError(cause instanceof Error ? cause.message : tr('Unable to send the reset link.', 'Tautan atur ulang sandi tidak bisa dikirim.'))
      } finally {
        setBusyAction(null)
      }
    },
    onRequestEmployeeStatusChange: (employee) => { setStatusActionError(null); setPendingStatusEmployee(employee) },
    onCancelEmployeeStatusChange: () => { setPendingStatusEmployee(null); setStatusActionError(null) },
    onConfirmEmployeeStatusChange: async () => {
      if (!pendingStatusEmployee) return
      const actor = { name: actorName, role }; const active = pendingStatusEmployee.status === 'inactive'
      const eligibility = canSetEmployeeActiveState({ employees: useHrStore.getState().employees, employeeId: pendingStatusEmployee.id, active, actor })
      if (!eligibility.ok) { setStatusActionError(eligibility.reason); return }
      if (isSupabaseConfigured()) {
        if (busyAction) return
        setBusyAction('status')
        try {
          // Server sets status, end-of-employment data and the login flag together.
          await updateStaffEmployeeSupabase(pendingStatusEmployee.id, { status: active ? 'active' : 'inactive' })
        } catch (cause) {
          setStatusActionError(cause instanceof Error ? cause.message : tr('Unable to change the employee status.', 'Status karyawan tidak bisa diubah.'))
          return
        } finally {
          setBusyAction(null)
        }
        // Future shifts are HR schedule data, saved by the normal HR writer
        // against the revision adopted above.
        if (!active) applyDeactivationScheduleEffects(pendingStatusEmployee.id, actor)
        setPendingStatusEmployee(null); setStatusActionError(null)
        return
      }
      const changed = active ? activateEmployee(pendingStatusEmployee.id, actor) : deactivateEmployee(pendingStatusEmployee.id, actor)
      if (!changed) { setStatusActionError('Employee status could not be changed. Refresh and try again.'); return }
      applyLocalEmploymentStatusMetadata(pendingStatusEmployee.id, active ? 'active' : 'inactive')
      setPendingStatusEmployee(null); setStatusActionError(null)
    },
  }
}
