import { useState, type FC, type ReactNode } from 'react'
import type { BranchFilter } from '../../types/orders'
import type { AttendanceStatus } from '../../store/hrStoreTypes'
import { useHrStore } from '../../store/hrStore'
import type { EmployeeStatusFilter } from '../../domain/hrDomain'
import { DatePickerField } from '../ui/date-time-field'
import type { HrSection, HrTabContentViewModel } from './HrTabContentController'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { HrSchedulingSection } from './HrSchedulingSection'
import { AttendanceReviewQueue } from './AttendanceReviewQueue'
import { AttendanceCalendar } from './AttendanceCalendar'
import { AttendanceExportButton } from './AttendanceExportButton'
import { HrPayrollSection } from './HrPayrollSection'
import { FieldLabel, ValidationSummary } from '../ui/form-patterns'
import { ChevronRight, UserPlus } from 'lucide-react'
import { FilterChip } from '../ui/chip'
import { getDateLocale } from '../../i18n/uiLanguage'
import { CreateStaffSheet, PeopleListCard, PeoplePageHeader, PeoplePageShell, PeopleSummaryCard, PeopleSummaryGrid, PeopleTabs } from './PeopleWorkspaceUI'
import { EmployeeRemovalControl } from './EmployeeRemovalControl'
import { READINESS_LABELS, useStaffCopy } from '../../i18n/staffAccountCopy'
import { STAFF_PASSWORD_MIN_LENGTH } from '../../domain/staffCredentialDomain'

export interface HrTabContentProps {
  activeBranch: BranchFilter
  onOpenOrder?: (orderNumber: string) => void
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  onActiveSectionChange?: (section: HrSection) => void
}

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' }, { value: 'late', label: 'Late' }, { value: 'absent', label: 'Absent' }, { value: 'leave', label: 'Leave' },
]

const roleLabel = (role: string) => role === 'hr' ? 'HR' : role[0].toUpperCase() + role.slice(1)
const formatBusinessDate = (value: string, options: Intl.DateTimeFormatOptions = { day:'numeric', month:'short', year:'numeric' }) =>
  new Date(`${value}T12:00:00+07:00`).toLocaleDateString(getDateLocale(), { ...options, timeZone:'Asia/Jakarta' })
const formatBusinessTime = (value: string) =>
  new Date(value).toLocaleTimeString(getDateLocale(), { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Jakarta' })

const STATUS_FILTER_LABELS: Record<EmployeeStatusFilter, string> = {
  all: 'All',
  active: 'Active',
  inactive: 'Inactive',
}

export const HrTabContent: FC<HrTabContentViewModel> = (vm) => {
  const tr = useStaffCopy()
  const attendanceReviewCases = useHrStore((state) => state.attendanceReviewCases)
  const {
    activeBranch, activeSection, availableSections, canEdit, canCreateEmployee, canManageEmployeeStatus, canManageEmployeeDetails, canEditCredentials, canCreateAccounts, usesProductionPassword,
    pendingStatusEmployee, statusActionError, attendanceEditor, attendanceActionError, attendanceHistory,
    statusFilter, employeeSearch, employeeRoleFilter, isAddOpen, form, formErrors, detailsEmployee, detailsForm, profileErrors, accessErrors, detailsError, detailsMessage, pendingAccessConfirmation, pendingDetailsCloseConfirmation, pendingAddCloseConfirmation, hasUnsavedEmployeeDetails,
    employeeRows, assignableRoles,
  } = vm

  const selectedAccountEditable = canManageEmployeeDetails && detailsEmployee?.systemRole !== 'owner'
  const [detailsSection,setDetailsSection] = useState<'profile'|'access'>('profile')
  const [attendanceView,setAttendanceView] = useState<'calendar'|'review'>('calendar')
  const pendingReviewCount = attendanceReviewCases.filter((item) => item.status === 'pending' || item.status === 'problem').length
  const readyCount = employeeRows.filter((item)=>item.readiness.state==='active' && item.readiness.setupComplete).length
  const setupRequiredCount = employeeRows.filter((item)=>item.readiness.state==='active' && !item.readiness.setupComplete).length
  const inactiveCount = employeeRows.filter((item)=>item.readiness.state==='inactive').length

  return <PeoplePageShell>
    <PeopleTabs sections={availableSections} activeSection={activeSection} onChange={vm.onSectionChange} badges={{ attendance: pendingReviewCount }} />

    <div className="space-y-5">
    {activeSection === 'scheduling' ? <HrSchedulingSection activeBranch={activeBranch} searchQuery={employeeSearch} /> : activeSection === 'payroll' ? <HrPayrollSection searchQuery={employeeSearch} /> : activeSection === 'employees' ? <>
      <PeoplePageHeader
        section="employees"
        action={canCreateEmployee ? <button type="button" onClick={vm.onToggleAddOpen} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm"><UserPlus className="size-4" />{canCreateAccounts ? 'Create staff' : 'New employee'}</button> : undefined}
      />

      <PeopleSummaryGrid className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PeopleSummaryCard className="min-w-0 md:min-h-[76px]" label="Ready" value={readyCount.toString()} tone="success" />
        <PeopleSummaryCard className="min-w-0 md:min-h-[76px]" label="Setup required" value={setupRequiredCount.toString()} tone={setupRequiredCount ? 'warning' : 'default'} />
        <PeopleSummaryCard className="col-span-2 min-w-0 sm:col-span-1 md:min-h-[76px]" label="Inactive" value={inactiveCount.toString()} tone="default" />
      </PeopleSummaryGrid>

      <section aria-label="Employee filters" className="flex flex-col gap-3 border-y border-border/60 py-3 md:flex-row md:items-center">
        <select aria-label="Filter employees by role" value={employeeRoleFilter} onChange={(event) => vm.onEmployeeRoleFilterChange(event.target.value as typeof employeeRoleFilter)} className={`${inputClass} md:w-56`}><option value="all">All roles</option>{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
        <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-1 md:flex-wrap md:overflow-visible md:px-0">
          {(['all', 'active', 'inactive'] as EmployeeStatusFilter[]).map((option) => <FilterChip key={option} active={option === statusFilter} onClick={() => vm.onStatusFilterChange(option)}>{STATUS_FILTER_LABELS[option]}</FilterChip>)}
        </div>
      </section>

      <section aria-label="Employees" className="space-y-3 pb-4">
        <div className="grid gap-3 lg:grid-cols-2">{employeeRows.length === 0 ? <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground lg:col-span-2">{employeeSearch.trim() || employeeRoleFilter !== 'all' || statusFilter !== 'all' ? 'No employees match the selected filters.' : 'No employees yet.'}</p> : employeeRows.map(({ employee, readiness }) => { const hasLogin = Boolean(employee.username && (usesProductionPassword || employee.pin)); return <PeopleListCard key={employee.id} density="dense">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{employee.name}</p><p className="mt-0.5 text-xs font-medium text-muted-foreground">{roleLabel(employee.systemRole)}</p></div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${readiness.state === 'active' ? 'bg-success/10 text-success' : 'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{readiness.state === 'active' ? 'Active' : 'Inactive'}</span>
              {readiness.state === 'active' && !readiness.setupComplete && <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">Setup required</span>}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{`${employee.phone || 'No WhatsApp'} · Since ${formatBusinessDate(employee.hireDate, { month:'short', year:'numeric' })}`}</p>
          {readiness.state === 'inactive' && <p className="mt-1 text-xs text-muted-foreground">{employee.employmentEndDate ? `Employment ended ${formatBusinessDate(employee.employmentEndDate)}` : 'Inactive · separation date not recorded (legacy)'}</p>}
          {readiness.state === 'active' && readiness.missing.length > 0 && <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{`${tr('Missing', 'Belum lengkap')}: ${readiness.missing.map((item) => tr(...READINESS_LABELS[item])).join(', ')}`}</p>}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
            <span className={`rounded-full px-2 py-1 text-2xs font-medium ${hasLogin ? 'bg-info/10 text-info' : 'bg-surface-neutral text-muted-foreground ring-1 ring-border/70'}`}>{hasLogin ? 'Account · Login enabled' : readiness.state === 'active' ? 'Account · Profile only' : 'Account · Inactive'}</span>
            <button type="button" onClick={() => vm.onOpenEmployeeDetails(employee)} className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground">Details <ChevronRight className="size-3.5" /></button>
          </div>
        </PeopleListCard>})}</div>
      </section>
    </> : <>
      {/* Calendar first: a week (or month) of everyone at a glance. The list
          view keeps every open review item reachable in one place. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={tr('Attendance view', 'Tampilan absensi')} className="inline-flex h-11 rounded-full bg-muted/60 p-1 ring-1 ring-border/70">
          {(['calendar', 'review'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={attendanceView === value} onClick={() => setAttendanceView(value)} className={`rounded-full px-4 text-sm font-medium ${attendanceView === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>{value === 'calendar' ? tr('Calendar', 'Kalender') : `${tr('Review list', 'Daftar cek')}${pendingReviewCount ? ` · ${pendingReviewCount}` : ''}`}</button>)}
        </div>
        <AttendanceExportButton activeBranch={activeBranch} />
      </div>
      {attendanceActionError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{attendanceActionError}</p>}
      {attendanceView === 'calendar'
        ? <AttendanceCalendar employees={employeeRows.filter(({ employee }) => employee.status === 'active').map(({ employee }) => employee)} canEdit={canEdit} onOpenRecord={vm.onOpenAttendanceEditor} onOpenOrder={vm.onOpenOrder} onCorrectAttendance={vm.onOpenAttendanceCorrection} />
        : <AttendanceReviewQueue onOpenOrder={vm.onOpenOrder} onCorrectAttendance={vm.onOpenAttendanceCorrection} searchQuery={employeeSearch} />}
    </>}
    </div>

    <CreateStaffSheet
      open={isAddOpen}
      onOpenChange={(open) => { if (!open) vm.onRequestCloseAddForm() }}
      onSubmit={vm.onCreateEmployee}
      title={canCreateAccounts ? 'Create staff' : 'Create employee'}
      description={tr('Add employment details and login access in one step.', 'Isi data kepegawaian dan akses login dalam satu langkah.')}
      footer={<>
        <button type="button" onClick={vm.onRequestCloseAddForm} className="h-11 min-w-0 rounded-full border border-border bg-card px-4 text-sm font-medium">Cancel</button>
        <button type="submit" disabled={vm.isStaffActionBusy} className="h-11 min-w-0 rounded-full disabled:opacity-60 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{canCreateAccounts ? tr('Create staff account', 'Buat akun staf') : tr('Create employee profile', 'Buat profil karyawan')}</button>
      </>}
    >
      <ValidationSummary errors={[...new Set(Object.values(formErrors).filter((value): value is string => Boolean(value)))]} title="Complete the required staff details" />
      <section className="space-y-5 rounded-xl bg-card p-4 ring-1 ring-border/70">
        <div className="space-y-1"><h3 className="text-sm font-semibold leading-5">Account and employment</h3></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" required error={formErrors.name}><input required value={form.name} onChange={vm.onFormFieldChange('name')} className={createStaffFieldInputClass(formErrors.name)} /></Field>
          <Field label="Role / position" required error={formErrors.systemRole}><select value={form.systemRole} onChange={vm.onFormFieldChange('systemRole')} className={createStaffFieldInputClass(formErrors.systemRole)}>{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></Field>
          <Field label="WhatsApp" error={formErrors.phone}><input value={form.phone} onChange={vm.onFormFieldChange('phone')} className={createStaffFieldInputClass(formErrors.phone)} /></Field>
          <Field label="Hire date" required error={formErrors.hireDate}><DatePickerField value={form.hireDate} onChange={vm.onHireDateChange} className={`h-11 rounded-xl bg-card text-sm ${formErrors.hireDate ? 'ring-2 ring-destructive/40' : ''}`} /></Field>
        </div>
      </section>
      {canCreateAccounts ? <section className="space-y-5 rounded-xl bg-card p-4 ring-1 ring-border/70">
        <div className="space-y-1"><h3 className="text-sm font-semibold leading-5">Login access</h3></div>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Recovery email" required error={formErrors.email}><input required type="email" autoComplete="email" value={form.email} onChange={vm.onFormFieldChange('email')} className={createStaffFieldInputClass(formErrors.email)} placeholder="name@example.com" /></Field><Field label="Username" required error={formErrors.username}><input required value={form.username} onChange={vm.onFormFieldChange('username')} className={createStaffFieldInputClass(formErrors.username)} placeholder="lowercase" /></Field><Field label="Password" required error={formErrors.pin}><input required type="password" autoComplete="new-password" value={form.pin} onChange={vm.onFormFieldChange('pin')} className={createStaffFieldInputClass(formErrors.pin)} placeholder="6+ characters" /></Field></div>
      </section> : <p className="rounded-xl bg-surface-info p-4 text-sm text-info ring-1 ring-info/30">This creates an employee profile only. No login account will be generated.</p>}
      {canCreateAccounts && (() => {
        const checks: Array<[boolean, string]> = [
          [Boolean(form.name.trim()), tr('Name added', 'Nama terisi')],
          [assignableRoles.includes(form.systemRole), tr('Allowed role selected', 'Peran yang diizinkan dipilih')],
          [/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email), tr('Recovery email ready', 'Email pemulihan siap')],
          [/^[a-z][a-z0-9._-]*$/.test(form.username), tr('Username ready', 'Nama pengguna siap')],
          // Same rule the server enforces (staffCredentialDomain): length only.
          [form.pin.length >= STAFF_PASSWORD_MIN_LENGTH, tr(`Password has ${STAFF_PASSWORD_MIN_LENGTH}+ characters`, `Kata sandi minimal ${STAFF_PASSWORD_MIN_LENGTH} karakter`)],
          [Boolean(form.hireDate), tr('Start date added', 'Tanggal bergabung terisi')],
        ]
        return <section className="rounded-xl bg-surface-panel p-4 ring-1 ring-border/70"><h3 className="text-sm font-semibold leading-5">{tr('Account setup check', 'Pemeriksaan akun')}</h3><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{checks.map(([done, label]) => <span key={label} className={done ? 'text-success' : 'text-muted-foreground'}>{`${done ? '✓' : '○'} ${label}`}</span>)}</div></section>
      })()}
      {detailsError && <p role="alert" className="rounded-xl bg-surface-error p-4 text-sm text-destructive ring-1 ring-destructive/30">{detailsError}</p>}
    </CreateStaffSheet>

    <AlertDialog open={pendingAddCloseConfirmation} onOpenChange={(open) => { if (!open) vm.onKeepEditingAddForm() }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard new staff details?</AlertDialogTitle><AlertDialogDescription>The staff form has unsaved information. Closing now will permanently discard it.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={vm.onKeepEditingAddForm}>Keep editing</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); vm.onDiscardAddForm() }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <Dialog open={Boolean(detailsEmployee)} onOpenChange={(open) => { if (!open) vm.onCloseEmployeeDetails() }}>
      <DialogContent className="mobile-focus-workflow max-w-5xl overflow-hidden p-0"><div className="border-b border-border px-5 py-4"><DialogHeader><DialogTitle>Employee details</DialogTitle><DialogDescription className="sr-only">{detailsEmployee?.name}</DialogDescription></DialogHeader><div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 py-1">{(['profile','access'] as const).map((section)=><button key={section} type="button" onClick={()=>setDetailsSection(section)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${detailsSection===section?'bg-foreground text-background':'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{section==='access'?'Access & Work':'Profile'}</button>)}</div></div>
        {detailsEmployee && detailsForm && <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4">
          <section className={`${detailsSection==='profile'?'block':'hidden'} rounded-xl bg-muted/35 p-4 ring-1 ring-border/60`}>
            <div className="mb-3"><h3 className="text-sm font-semibold leading-5">Profile</h3><p className="text-xs text-muted-foreground">Personal and employment information. This does not change login access.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={profileErrors.name}><input disabled={!selectedAccountEditable} value={detailsForm.name} onChange={(e) => vm.onDetailsFieldChange('name', e.target.value)} className={fieldInputClass(profileErrors.name)} /></Field>
              <Field label="WhatsApp" error={profileErrors.phone}><input disabled={!selectedAccountEditable} value={detailsForm.phone} onChange={(e) => vm.onDetailsFieldChange('phone', e.target.value)} className={fieldInputClass(profileErrors.phone)} /></Field>
              <Field label="Hire date" error={profileErrors.hireDate}><DatePickerField value={detailsForm.hireDate} onChange={(value) => vm.onDetailsFieldChange('hireDate', value)} className={`h-10 rounded-lg bg-card text-sm ${profileErrors.hireDate ? 'ring-2 ring-destructive/40' : ''}`} /></Field>
              <Field label="Status"><div className="flex h-10 items-center gap-2"><span>{STATUS_FILTER_LABELS[detailsEmployee.status]}</span>{selectedAccountEditable && canManageEmployeeStatus && <button type="button" aria-label={detailsEmployee.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => vm.onRequestEmployeeStatusChange(detailsEmployee)} className={`rounded-full border px-3 py-1 text-xs ${detailsEmployee.status === 'active' ? 'border-destructive/30 text-destructive' : 'border-success/30 text-success'}`}>{detailsEmployee.status === 'active' ? 'Deactivate' : 'Activate'}</button>}</div></Field>
            </div>
            {detailsEmployee.status === 'inactive' && <div className="mt-4 rounded-xl bg-surface-neutral p-3 text-xs text-muted-foreground ring-1 ring-border/60"><p className="font-semibold text-foreground">Employment history</p><div className="mt-2 grid gap-1.5 sm:grid-cols-2"><span>Ended: {detailsEmployee.employmentEndDate ? formatBusinessDate(detailsEmployee.employmentEndDate) : 'Not recorded (legacy)'}</span><span>Separated by: {detailsEmployee.separatedBy ?? 'Not recorded'}</span><span className="sm:col-span-2">Reason: {detailsEmployee.separationReason ?? 'Not recorded'}</span>{detailsEmployee.separatedAt && <span className="sm:col-span-2">Recorded: {new Date(detailsEmployee.separatedAt).toLocaleString(getDateLocale(), { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Jakarta' })}</span>}</div></div>}
            {selectedAccountEditable && <div className="mt-3 flex justify-end"><button type="button" disabled={vm.isStaffActionBusy} onClick={vm.onSaveEmployeeProfile} className="h-11 rounded-full disabled:opacity-60 bg-primary px-[18px] text-sm font-semibold text-primary-foreground hover:bg-primary/90">Save profile</button></div>}
          </section>
          <div className={detailsSection==='profile'?'block':'hidden'}><EmployeeRemovalControl employee={detailsEmployee} onRemoved={vm.onDiscardEmployeeDetailsChanges} /></div>

          <section className={`${detailsSection==='access'?'block':'hidden'} rounded-xl bg-muted/35 p-4 ring-1 ring-border/60`}>
            <div className="mb-3"><h3 className="text-sm font-semibold leading-5">Access & role</h3><p className="text-xs text-muted-foreground">Role changes affect permissions. Daily branch assignment is managed only from Scheduling.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role / position" error={accessErrors.systemRole}><select disabled={!canEditCredentials} value={detailsForm.systemRole} onChange={(e) => vm.onDetailsFieldChange('systemRole', e.target.value as typeof detailsForm.systemRole)} className={fieldInputClass(accessErrors.systemRole)}>{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></Field>
              <Field label="Recovery email" error={accessErrors.email}><input disabled={!canEditCredentials} type="email" autoComplete="email" value={detailsForm.email} onChange={(e) => vm.onDetailsFieldChange('email', e.target.value.toLowerCase())} className={fieldInputClass(accessErrors.email)} /></Field>
              <><Field label="Username" error={accessErrors.username}><input disabled={!canEditCredentials} value={detailsForm.username} onChange={(e) => vm.onDetailsFieldChange('username', e.target.value.toLowerCase())} className={fieldInputClass(accessErrors.username)} /></Field><Field label="New password" error={accessErrors.pin}><input disabled={!canEditCredentials} type="password" autoComplete="new-password" value={detailsForm.pin} onChange={(e) => vm.onDetailsFieldChange('pin', e.target.value)} placeholder="Leave blank to keep current password" className={fieldInputClass(accessErrors.pin)} /></Field></>
            </div>
            {selectedAccountEditable && canEditCredentials && vm.canSendPasswordReset && <div className="mt-4 flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-border/60 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">{tr('Forgot password? Email a reset link to the recovery email instead of sharing a new password.', 'Lupa sandi? Kirim tautan atur ulang ke email pemulihan, tanpa perlu membagikan sandi baru.')}</p><button type="button" disabled={vm.isStaffActionBusy} onClick={vm.onSendPasswordReset} className="h-10 shrink-0 rounded-full border border-border bg-background px-4 text-sm font-medium disabled:opacity-60">{tr('Send reset link', 'Kirim tautan atur ulang sandi')}</button></div>}
            {selectedAccountEditable && <div className="mt-3 flex justify-end"><button type="button" disabled={vm.isStaffActionBusy} onClick={vm.onRequestSaveEmployeeAccess} className="h-11 rounded-full disabled:opacity-60 border border-foreground bg-foreground px-[18px] text-sm font-semibold text-background">Save access</button></div>}
          </section>
          {hasUnsavedEmployeeDetails && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Unsaved employee changes. Save the affected section or close and discard them.</p>}
          {detailsError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{detailsError}</p>}{detailsMessage && <p className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{detailsMessage}</p>}
        </div>}
        <DialogFooter className="border-t border-border bg-surface-footer px-5 py-3"><button type="button" onClick={vm.onCloseEmployeeDetails} className="h-11 rounded-full border border-border px-[18px] text-sm">Close</button></DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(pendingAccessConfirmation)} onOpenChange={(open) => { if (!open) vm.onCancelEmployeeAccessChange() }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm access change</AlertDialogTitle><AlertDialogDescription>Role changes affect permissions and active sessions. Daily branch assignment is managed from Scheduling.</AlertDialogDescription></AlertDialogHeader>
        <div className="rounded-lg bg-muted p-3 text-sm"><ul className="space-y-1">{pendingAccessConfirmation?.changes.map((change) => <li key={change}>• {change}</li>)}</ul></div>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={vm.isStaffActionBusy} onClick={(event) => { event.preventDefault(); vm.onConfirmEmployeeAccessChange() }}>Confirm changes</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={pendingDetailsCloseConfirmation} onOpenChange={(open) => { if (!open) vm.onKeepEditingEmployeeDetails() }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved employee changes?</AlertDialogTitle><AlertDialogDescription>Profile or access changes have not been saved. Closing Employee Details will permanently discard them.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel onClick={vm.onKeepEditingEmployeeDetails}>Keep editing</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); vm.onDiscardEmployeeDetailsChanges() }}>Discard changes</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={Boolean(attendanceEditor)} onOpenChange={(open) => { if (!open) vm.onCloseAttendanceEditor() }}>
      <DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{attendanceEditor?.reviewCaseId ? 'Correct attendance' : 'Attendance'} · {attendanceEditor?.employee.name}</DialogTitle><DialogDescription>{tr('A reason is required.', 'Alasan wajib diisi.')}</DialogDescription></DialogHeader>
        {attendanceEditor && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Field label="Date"><DatePickerField value={attendanceEditor.date} onChange={vm.onAttendanceDateChange} className="h-10 rounded-full bg-card text-sm" /></Field><Field label="Status"><select aria-label="Attendance status" value={attendanceEditor.status} onChange={(e) => vm.onAttendanceStatusChange(e.target.value as AttendanceStatus)} className={inputClass}><option value="">Select</option>{ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Reason" required><input required aria-label="Attendance reason" value={attendanceEditor.note} onChange={(e) => vm.onAttendanceNoteChange(e.target.value)} placeholder="Why is this record being added or corrected?" className={inputClass} /></Field></div>{attendanceActionError && <p role="alert" className="text-xs text-destructive">{attendanceActionError}</p>}
          <div className="max-h-72 space-y-2 overflow-y-auto"><p className="text-xs font-semibold text-muted-foreground">History</p>{attendanceHistory.length === 0 ? <p className="text-xs text-muted-foreground">No attendance history.</p> : attendanceHistory.map((record) => <article key={record.id} className="rounded-lg bg-muted/60 p-3 text-xs"><div className="flex justify-between gap-2"><strong>{record.date} · {roleLabel(record.status)}</strong><span className="text-muted-foreground">{record.actor}</span></div><p className="mt-1 text-muted-foreground">{record.checkInAt ? `Check-in ${formatBusinessTime(record.checkInAt)}` : 'Manual record'}{record.checkOutAt ? ` · Check-out ${formatBusinessTime(record.checkOutAt)}` : ''}</p>{record.note && <p className="mt-1">{record.note}</p>}<div className="mt-2 flex flex-wrap gap-2">{record.selfieDataUrl && <button type="button" onClick={() => vm.onOpenAttendanceEvidence(record.selfieDataUrl)} className="text-primary underline">Check-in selfie</button>}{record.checkOutSelfieDataUrl && <button type="button" onClick={() => vm.onOpenAttendanceEvidence(record.checkOutSelfieDataUrl)} className="text-primary underline">Check-out selfie</button>}{record.checkInLocation && <a href={`https://www.openstreetmap.org/?mlat=${record.checkInLocation.latitude}&mlon=${record.checkInLocation.longitude}`} target="_blank" rel="noreferrer" className="text-primary underline">Check-in · {record.checkInLocation.detectedBranchName ?? 'branch'} · {record.checkInLocation.distanceMeters}m</a>}{record.checkOutLocation && <a href={`https://www.openstreetmap.org/?mlat=${record.checkOutLocation.latitude}&mlon=${record.checkOutLocation.longitude}`} target="_blank" rel="noreferrer" className="text-primary underline">Check-out · {record.checkOutLocation.detectedBranchName ?? 'branch'} · {record.checkOutLocation.distanceMeters}m</a>}{record.checkInLocation?.scheduledBranchName && <span className="rounded-full bg-info/10 px-2 py-1 text-info">Scheduled {record.checkInLocation.scheduledBranchName} · {record.checkInLocation.scheduledStartTime}–{record.checkInLocation.scheduledEndTime}</span>}{record.checkInLocation?.reviewStatus === 'pending_review' && <span className="rounded-full bg-warning/10 px-2 py-1 font-medium text-warning">Schedule mismatch · review pending</span>}{record.checkOutLocation?.reviewStatus === 'pending_review' && <span className="rounded-full bg-warning/10 px-2 py-1 font-medium text-warning">Checkout branch mismatch</span>}</div></article>)}</div></div>}
        <DialogFooter><button type="button" onClick={vm.onCloseAttendanceEditor} className="h-11 rounded-full border border-border px-[18px] text-sm">Close</button>{canEdit && <button type="button" onClick={vm.onSaveAttendance} className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground hover:bg-primary/90">{attendanceEditor?.reviewCaseId ? 'Save correction' : 'Save attendance'}</button>}</DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(pendingStatusEmployee)} onOpenChange={(open) => { if (!open) vm.onCancelEmployeeStatusChange() }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingStatusEmployee?.status === 'active' ? tr('Deactivate employee?', 'Nonaktifkan karyawan?') : tr('Activate employee?', 'Aktifkan karyawan?')}</AlertDialogTitle><AlertDialogDescription>{pendingStatusEmployee?.status === 'active' ? tr('Today is recorded as the last day of work. The login is switched off and open sessions end right away; payroll periods that include the last day still count.', 'Hari ini dicatat sebagai hari kerja terakhir. Login langsung dimatikan dan sesi yang sedang terbuka berakhir; periode penggajian yang mencakup hari terakhir tetap dihitung.') : tr('The employee becomes active again and can sign in and record attendance. Payroll counts again from today.', 'Karyawan aktif kembali dan bisa masuk serta mencatat kehadiran. Penggajian dihitung lagi mulai hari ini.')}</AlertDialogDescription></AlertDialogHeader>{statusActionError && <p role="alert" className="text-xs text-destructive">{statusActionError}</p>}<AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={vm.isStaffActionBusy} onClick={(event) => { event.preventDefault(); vm.onConfirmEmployeeStatusChange() }}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </PeoplePageShell>
}

const Field: FC<{ label: string; children: ReactNode; error?: string; required?: boolean }> = ({ label, children, error, required }) => <label className="space-y-2"><FieldLabel required={required}>{label}</FieldLabel>{children}{error && <span className="block text-xs text-destructive">{error}</span>}</label>
const fieldInputClass = (error?: string) => `${inputClass} ${error ? 'border-destructive ring-2 ring-destructive/20' : ''}`
const createStaffFieldInputClass = (error?: string) => `h-11 w-full rounded-full border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 disabled:opacity-60 ${error ? 'border-destructive ring-2 ring-destructive/20' : ''}`
const inputClass = 'h-10 w-full rounded-full border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 disabled:opacity-60'
