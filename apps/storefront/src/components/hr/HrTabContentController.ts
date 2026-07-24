import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useHrStore, todayIsoDate, type HrEmployeeCommandResult } from '../../store/hrStore'
import type { AttendanceRecord, AttendanceStatus, Employee } from '../../store/hrStoreTypes'
import type { UserRole } from '../../store/userStore'
import { useUserStore } from '../../store/userStore'
import { canAccessSection, canEditSection } from '../../config/permissions'
import { hasActionPermission } from '../../config/actionPermissions'
import { useSettingsStore } from '../../store/settingsStore'
import { getAttendanceForEmployeeOnDate, getBranchEmployees, getFilteredEmployees, getHrSummary, type EmployeeStatusFilter } from '../../domain/hrDomain'
import type { HrTabContentProps } from './HrTabContent'
import { canSetEmployeeActiveState } from '../../domain/hrStatusDomain'
import { canViewScheduling } from '../../domain/hrSchedulingDomain'
import { isHrManagedEmployee } from '../../domain/hrManagedEmployeeDomain'
import { getCreatableAccountRoles } from '../../domain/staffAccountDomain'

export type HrSection = 'employees' | 'attendance' | 'scheduling' | 'reports' | 'points' | 'payroll'

export interface NewEmployeeFormState {
  name: string
  systemRole: UserRole
  phone: string
  hireDate: string
  username: string
  pin: string
}

export const createEmptyHrForm = (systemRole: UserRole = 'florist'): NewEmployeeFormState => ({
  name: '', systemRole, phone: '', hireDate: todayIsoDate(), username: '', pin: '',
})

export type EmployeeFieldErrors = Partial<Record<keyof EmployeeDetailsFormState, string>>
export type NewEmployeeFieldErrors = Partial<Record<keyof NewEmployeeFormState, string>>

export interface EmployeeDetailsFormState {
  name: string
  systemRole: UserRole
  phone: string
  hireDate: string
  username: string
  pin: string
}

export interface HrEmployeeRowViewModel { employee: Employee; todayRecord: AttendanceRecord | null }
export interface AttendanceEditorState { employee: Employee; date: string; status: AttendanceStatus | ''; note: string }

export interface HrTabContentViewModel {
  activeBranch: HrTabContentProps['activeBranch']
  onOpenOrder?: (orderNumber: string) => void
  activeSection: HrSection
  availableSections: HrSection[]
  canEdit: boolean
  canCreateEmployee: boolean
  canManageEmployeeStatus: boolean
  canManageEmployeeDetails: boolean
  canEditCredentials: boolean
  canCreateAccounts: boolean
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
  onRecordAttendance: (employeeId: string, status: AttendanceStatus) => void
  onOpenAttendanceEditor: (employee: Employee) => void
  onCloseAttendanceEditor: () => void
  onAttendanceDateChange: (value: string) => void
  onAttendanceStatusChange: (value: AttendanceStatus) => void
  onAttendanceNoteChange: (value: string) => void
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
  onRequestEmployeeStatusChange: (employee: Employee) => void
  onCancelEmployeeStatusChange: () => void
  onConfirmEmployeeStatusChange: () => void
}

export const useHrTabContentController = ({ activeBranch, onOpenOrder, searchQuery, onSearchQueryChange, onActiveSectionChange }: HrTabContentProps): HrTabContentViewModel => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const permissions = useSettingsStore((state) => state.permissions)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const staffRoles = useSettingsStore((state) => state.staffRoles)
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
  const canManagePoints = hasActionPermission(role, 'hr.manage_points', actionPermissions, permissions)
  const canPreparePayroll = hasActionPermission(role, 'hr.create_payroll_proposal', actionPermissions, permissions) || hasActionPermission(role, 'hr.edit_payroll_proposal', actionPermissions, permissions) || hasActionPermission(role, 'hr.resolve_rejected_employee', actionPermissions, permissions)
  const canEdit = canEditSectionLevel && canCorrectAttendance
  const canAccessScheduling = canViewScheduling(role, permissions)
  const availableSections: HrSection[] = [
    ...(canAccessHrCore && canViewEmployees ? ['employees'] as HrSection[] : []),
    ...(canAccessHrCore && (canReviewAttendance || canCorrectAttendance) ? ['attendance'] as HrSection[] : []),
    ...(canAccessScheduling ? ['scheduling'] as HrSection[] : []),
    ...(canAccessHrCore && (canReviewAttendance || canCorrectAttendance) ? ['reports'] as HrSection[] : []),
    ...(canAccessHrCore && canManagePoints ? ['points'] as HrSection[] : []),
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
  const [detailsEmployee, setDetailsEmployee] = useState<Employee | null>(null)
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
  const attendance = useHrStore((state) => state.attendance)
  const addEmployee = useHrStore((state) => state.addEmployee)
  const createStaffAccount = useHrStore((state) => state.createStaffAccount)
  const updateEmployeeProfile = useHrStore((state) => state.updateEmployeeProfile)
  const updateEmployeeAccess = useHrStore((state) => state.updateEmployeeAccess)
  const recordAttendance = useHrStore((state) => state.recordAttendance)
  const activateEmployee = useHrStore((state) => state.activateEmployee)
  const deactivateEmployee = useHrStore((state) => state.deactivateEmployee)
  const today = todayIsoDate()

  const branchEmployees = useMemo(() => getBranchEmployees(employees, activeBranch).filter((employee) => role === 'owner' ? true : isHrManagedEmployee(employee, 'employees', hrManagedRoles)), [employees, activeBranch, role, hrManagedRoles])
  const summary = useMemo(() => getHrSummary(branchEmployees, attendance, today), [branchEmployees, attendance, today])
  const filteredEmployees = useMemo(() => getFilteredEmployees(branchEmployees, statusFilter).filter((employee) => {
    const query = employeeSearch.trim().toLowerCase()
    const matchesSearch = !query || [employee.name, employee.phone, employee.username ?? ''].some((value) => value.toLowerCase().includes(query))
    const matchesRole = employeeRoleFilter === 'all' || employee.systemRole === employeeRoleFilter
    const matchesBranch = true
    return matchesSearch && matchesRole && matchesBranch
  }), [branchEmployees, statusFilter, employeeSearch, employeeRoleFilter])
  const attendanceHistory = useMemo(() => attendanceEditor ? attendance.filter((record) => record.employeeId === attendanceEditor.employee.id).sort((a, b) => b.date.localeCompare(a.date)) : [], [attendance, attendanceEditor])
  const employeeRows = useMemo(() => filteredEmployees.map((employee) => ({ employee, todayRecord: getAttendanceForEmployeeOnDate(attendance, employee.id, today) })), [attendance, filteredEmployees, today])


  const emptyNewEmployeeForm = createEmptyHrForm(assignableRoles.includes(staffRoles.defaultRole) ? staffRoles.defaultRole : (assignableRoles[0] ?? 'florist'))
  const hasUnsavedNewEmployee = Boolean(
    form.name.trim() || form.phone.trim() || form.username.trim() || form.pin.trim() ||
    form.systemRole !== emptyNewEmployeeForm.systemRole || form.hireDate !== emptyNewEmployeeForm.hireDate
  )

  const hasUnsavedEmployeeDetails = Boolean(detailsEmployee && detailsForm && (
    detailsForm.name !== detailsEmployee.name ||
    detailsForm.phone !== detailsEmployee.phone ||
    detailsForm.hireDate !== detailsEmployee.hireDate ||
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

  const handleCreateEmployee = (event: FormEvent) => {
    event.preventDefault()
    if (!canCreateEmployee) return
    setFormErrors({})
    const actor = { name: actorName, role }
    const common = { name: form.name, position: form.systemRole, systemRole: form.systemRole, phone: form.phone, hireDate: form.hireDate || today, actor }
    const result = canCreateAccounts
      ? createStaffAccount({ ...common, username: form.username, pin: form.pin })
      : addEmployee(common)
    if (!result.ok) { applyEmployeeCommandError(result, 'form'); return }
    setForm(createEmptyHrForm(staffRoles.defaultRole)); setFormErrors({}); setIsAddOpen(false); setDetailsError(null)
  }

  return {
    activeBranch, onOpenOrder, activeSection, availableSections, canEdit, canCreateEmployee, canManageEmployeeStatus, canManageEmployeeDetails, canEditCredentials, canCreateAccounts,
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
    onRecordAttendance: (employeeId, status) => {
      if (!canCorrectAttendance) { setAttendanceActionError('You do not have permission to correct attendance.'); return }
      const changed = recordAttendance({ employeeId, date: today, status, actor: { name: actorName, role } })
      setAttendanceActionError(changed ? null : 'Attendance could not be saved. Check employee status and permissions.')
    },
    onOpenAttendanceEditor: (employee) => {
      const existing = getAttendanceForEmployeeOnDate(attendance, employee.id, today)
      setAttendanceActionError(null); setAttendanceEditor({ employee, date: today, status: existing?.status ?? '', note: existing?.note ?? '' })
    },
    onCloseAttendanceEditor: () => { setAttendanceEditor(null); setAttendanceActionError(null) },
    onAttendanceDateChange: (value) => {
      setAttendanceEditor((current) => { if (!current) return current; const existing = getAttendanceForEmployeeOnDate(attendance, current.employee.id, value); return { ...current, date: value, status: existing?.status ?? '', note: existing?.note ?? '' } })
      setAttendanceActionError(null)
    },
    onAttendanceStatusChange: (value) => setAttendanceEditor((current) => current ? { ...current, status: value } : current),
    onAttendanceNoteChange: (value) => setAttendanceEditor((current) => current ? { ...current, note: value } : current),
    onSaveAttendance: () => {
      if (!canCorrectAttendance) { setAttendanceActionError('You do not have permission to correct attendance.'); return }
      if (!attendanceEditor?.status) { setAttendanceActionError('Select an attendance status.'); return }
      const changed = recordAttendance({ employeeId: attendanceEditor.employee.id, date: attendanceEditor.date, status: attendanceEditor.status, note: attendanceEditor.note.trim() || undefined, actor: { name: actorName, role } })
      if (!changed) { setAttendanceActionError('Attendance could not be saved. Check employee status and permissions.'); return }
      setAttendanceActionError(null)
    },
    onOpenEmployeeDetails: (employee) => {
      setDetailsEmployee(employee); setProfileErrors({}); setAccessErrors({}); setDetailsError(null); setDetailsMessage(null); setPendingAccessConfirmation(null); setPendingDetailsCloseConfirmation(false)
      setDetailsForm({ name: employee.name, systemRole: employee.systemRole, phone: employee.phone, hireDate: employee.hireDate, username: employee.username ?? '', pin: '' })
    },
    onCloseEmployeeDetails: () => {
      if (hasUnsavedEmployeeDetails) { setPendingDetailsCloseConfirmation(true); return }
      setDetailsEmployee(null); setDetailsForm(null); setProfileErrors({}); setAccessErrors({}); setDetailsError(null); setDetailsMessage(null); setPendingAccessConfirmation(null)
    },
    onDiscardEmployeeDetailsChanges: () => { setPendingDetailsCloseConfirmation(false); setDetailsEmployee(null); setDetailsForm(null); setProfileErrors({}); setAccessErrors({}); setDetailsError(null); setDetailsMessage(null); setPendingAccessConfirmation(null) },
    onKeepEditingEmployeeDetails: () => setPendingDetailsCloseConfirmation(false),
    onDetailsFieldChange: (field, value) => {
      setDetailsForm((current) => current ? { ...current, [field]: value } : current)
      setProfileErrors((current) => ({ ...current, [field]: undefined }))
      setAccessErrors((current) => ({ ...current, [field]: undefined }))
      setDetailsError(null); setDetailsMessage(null)
    },
    onSaveEmployeeProfile: () => {
      if (!detailsEmployee || !detailsForm) return
      const errors: EmployeeFieldErrors = {}
      if (!detailsForm.name.trim()) errors.name = 'Employee name is required.'
      if (detailsForm.phone.trim() && !/^\+?[0-9][0-9 ()-]{7,19}$/.test(detailsForm.phone.trim())) errors.phone = 'Enter a valid WhatsApp number.'
      if (!detailsForm.hireDate) errors.hireDate = 'Hire date is required.'
      else if (detailsForm.hireDate > today) errors.hireDate = 'Hire date cannot be in the future.'
      setProfileErrors(errors)
      if (Object.keys(errors).length) return
      const result = updateEmployeeProfile({ employeeId: detailsEmployee.id, name: detailsForm.name, phone: detailsForm.phone, hireDate: detailsForm.hireDate, actor: { name: actorName, role } })
      if (!result.ok) { applyEmployeeCommandError(result, 'profile'); return }
      setDetailsError(null); setDetailsMessage('Profile updated.')
      const updated = useHrStore.getState().employees.find((item) => item.id === detailsEmployee.id) ?? null
      setDetailsEmployee(updated)
      if (updated) setDetailsForm((current) => current ? { ...current, name: updated.name, phone: updated.phone, hireDate: updated.hireDate } : current)
    },
    onRequestSaveEmployeeAccess: () => {
      if (!detailsEmployee || !detailsForm) return
      const errors: EmployeeFieldErrors = {}
      if (!assignableRoles.includes(detailsForm.systemRole)) errors.systemRole = 'Select an enabled role.'
      if (canEditCredentials) {
        if (!/^[a-z][a-z0-9._-]*$/.test(detailsForm.username.trim())) errors.username = 'Use lowercase letters, numbers, dots, underscores, or hyphens.'
        if (detailsForm.pin && !/^\d{6}$/.test(detailsForm.pin)) errors.pin = 'PIN must contain exactly 6 numbers.'
      }
      setAccessErrors(errors)
      if (Object.keys(errors).length) return
      const changes: string[] = []
      if (detailsForm.systemRole !== detailsEmployee.systemRole) changes.push(`Role: ${detailsEmployee.systemRole} → ${detailsForm.systemRole}`)
      if (changes.length) { setPendingAccessConfirmation({ changes }); return }
      const result = updateEmployeeAccess({ employeeId: detailsEmployee.id, systemRole: detailsForm.systemRole, username: detailsForm.username, pin: detailsForm.pin, actor: { name: actorName, role } })
      if (!result.ok) { applyEmployeeCommandError(result, 'access'); return }
      setDetailsError(null); setDetailsMessage('Access settings updated.')
    },
    onConfirmEmployeeAccessChange: () => {
      if (!detailsEmployee || !detailsForm) return
      const result = updateEmployeeAccess({ employeeId: detailsEmployee.id, systemRole: detailsForm.systemRole, username: detailsForm.username, pin: detailsForm.pin, actor: { name: actorName, role } })
      if (!result.ok) { applyEmployeeCommandError(result, 'access'); setPendingAccessConfirmation(null); return }
      const updated = useHrStore.getState().employees.find((item) => item.id === detailsEmployee.id) ?? null
      setDetailsEmployee(updated); setPendingAccessConfirmation(null); setDetailsError(null); setDetailsMessage('Role change confirmed.')
      if (updated) setDetailsForm((current) => current ? { ...current, systemRole: updated.systemRole, username: updated.username ?? '', pin: '' } : current)
    },
    onCancelEmployeeAccessChange: () => setPendingAccessConfirmation(null),
    onRequestEmployeeStatusChange: (employee) => { setStatusActionError(null); setPendingStatusEmployee(employee) },
    onCancelEmployeeStatusChange: () => { setPendingStatusEmployee(null); setStatusActionError(null) },
    onConfirmEmployeeStatusChange: () => {
      if (!pendingStatusEmployee) return
      const actor = { name: actorName, role }; const active = pendingStatusEmployee.status === 'inactive'
      const eligibility = canSetEmployeeActiveState({ employees: useHrStore.getState().employees, employeeId: pendingStatusEmployee.id, active, actor })
      if (!eligibility.ok) { setStatusActionError(eligibility.reason); return }
      const changed = active ? activateEmployee(pendingStatusEmployee.id, actor) : deactivateEmployee(pendingStatusEmployee.id, actor)
      if (!changed) { setStatusActionError('Employee status could not be changed. Refresh and try again.'); return }
      setPendingStatusEmployee(null); setStatusActionError(null)
    },
  }
}
