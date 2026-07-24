import { useState, type FC, type ReactNode } from 'react'
import type { BranchFilter } from '../../types/orders'
import type { AttendanceStatus } from '../../store/hrStoreTypes'
import { useUserStore } from '../../store/userStore'
import { useHrStore } from '../../store/hrStore'
import { useOrdersStore } from '../../store/ordersStore'
import type { EmployeeStatusFilter } from '../../domain/hrDomain'
import { getEmployeeOrderPerformance } from '../../domain/employeeOrderPerformanceDomain'
import { buildHrProblems, getHrProblemStatus } from '../../domain/hrProblemDomain'
import { useHrProblemStore } from '../../store/hrProblemStore'
import { DatePickerField } from '../ui/date-time-field'
import type { HrSection, HrTabContentViewModel } from './HrTabContentController'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { HrSchedulingSection } from './HrSchedulingSection'
import { AttendanceReviewQueue } from './AttendanceReviewQueue'
import { HrPointsSection } from './HrPointsSection'
import { HrPayrollSection } from './HrPayrollSection'
import { HrMonthlyReportSection } from './HrMonthlyReportSection'
import { FieldLabel, ValidationSummary } from '../ui/form-patterns'
import { ChevronRight, UserPlus } from 'lucide-react'
import { FilterChip } from '../ui/chip'
import { CreateStaffSheet, PeopleListCard, PeoplePageHeader, PeoplePageShell, PeopleSummaryCard, PeopleSummaryGrid, PeopleTabs } from './PeopleWorkspaceUI'

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

export const HrTabContent: FC<HrTabContentViewModel> = (vm) => {
  const signedInRole = useUserStore((state) => state.role)
  const attendanceReviewCases = useHrStore((state) => state.attendanceReviewCases)
  const orders = useOrdersStore((state) => state.orders)
  const problemReviews = useHrProblemStore((state) => state.reviews)
  const {
    activeBranch, onOpenOrder, activeSection, availableSections, canEdit, canCreateEmployee, canManageEmployeeStatus, canManageEmployeeDetails, canEditCredentials, canCreateAccounts,
    pendingStatusEmployee, statusActionError, attendanceEditor, attendanceActionError, attendanceHistory,
    statusFilter, employeeSearch, employeeRoleFilter, isAddOpen, form, formErrors, detailsEmployee, detailsForm, profileErrors, accessErrors, detailsError, detailsMessage, pendingAccessConfirmation, pendingDetailsCloseConfirmation, pendingAddCloseConfirmation, hasUnsavedEmployeeDetails,
    summary, branchEmployees, employeeRows, assignableRoles,
  } = vm


  const openProblemCount = buildHrProblems({ employees: branchEmployees, attendanceCases: attendanceReviewCases, orders }).filter((problem) => getHrProblemStatus(problem, problemReviews[problem.id]?.status) !== 'solved').length

  const selectedAccountEditable = canManageEmployeeDetails && detailsEmployee?.systemRole !== 'owner'
  const [detailsSection,setDetailsSection] = useState<'profile'|'access'>('profile')

  return <PeoplePageShell>
    <PeopleTabs sections={availableSections} activeSection={activeSection} onChange={vm.onSectionChange} badges={{ reports: openProblemCount }} />


    <div className="space-y-5">
    {activeSection === 'scheduling' ? <HrSchedulingSection activeBranch={activeBranch} searchQuery={employeeSearch} /> : activeSection === 'reports' ? <HrMonthlyReportSection activeBranch={activeBranch} searchQuery={employeeSearch} onOpenOrder={onOpenOrder} /> : activeSection === 'points' ? <HrPointsSection searchQuery={employeeSearch} /> : activeSection === 'payroll' ? <HrPayrollSection searchQuery={employeeSearch} /> : activeSection === 'employees' ? <>
      <PeoplePageHeader
        section="employees"
        action={canCreateEmployee ? <button type="button" onClick={vm.onToggleAddOpen} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm"><UserPlus className="size-4" />{canCreateAccounts ? 'Create staff' : 'New employee'}</button> : undefined}
      />

      <PeopleSummaryGrid className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PeopleSummaryCard className="min-w-0 md:min-h-[76px]" label="Active staff" value={summary.activeCount.toString()} tone="default" />
        <PeopleSummaryCard className="min-w-0 md:min-h-[76px]" label="Inactive staff" value={(branchEmployees.length - summary.activeCount).toString()} tone="warning" />
        <PeopleSummaryCard className="col-span-2 min-w-0 sm:col-span-1 md:min-h-[76px]" label="Total employees" value={branchEmployees.length.toString()} tone="default" />
      </PeopleSummaryGrid>

      <section aria-label="Employee filters" className="flex flex-col gap-3 border-y border-border/60 py-3 md:flex-row md:items-center">
        <select aria-label="Filter employees by role" value={employeeRoleFilter} onChange={(event) => vm.onEmployeeRoleFilterChange(event.target.value as typeof employeeRoleFilter)} className={`${inputClass} md:w-56`}><option value="all">All roles</option>{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
        <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
          {(['all', 'active', 'inactive'] as EmployeeStatusFilter[]).map((option) => <FilterChip key={option} active={option === statusFilter} onClick={() => vm.onStatusFilterChange(option)} className="capitalize">{option}</FilterChip>)}
        </div>
        <span className="shrink-0 text-sm text-muted-foreground md:ml-auto">{employeeRows.length} results</span>
      </section>

      <section aria-label="Employees" className="space-y-3 pb-4">
        <header className="space-y-1"><h3 className="text-sm font-semibold leading-5 text-foreground">{signedInRole === 'owner' ? 'Staff account management' : 'Employee directory'}</h3><p className="text-xs text-muted-foreground">{signedInRole === 'owner' ? 'Manage profiles, roles, and login access.' : `Showing ${employeeRows.length} of ${branchEmployees.length}`}</p></header>

        <div className="grid gap-3 lg:grid-cols-2">{employeeRows.length === 0 ? <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground lg:col-span-2">No employees match the selected filters.</p> : employeeRows.map(({ employee }) => { const hasLogin = Boolean(employee.username && employee.pin); const performance = getEmployeeOrderPerformance(employee.id, orders); return <PeopleListCard key={employee.id} density="dense">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{employee.name}</p><p className="mt-0.5 text-xs font-medium text-muted-foreground">{roleLabel(employee.systemRole)}</p></div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${employee.status === 'active' ? 'bg-success/10 text-success' : 'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{employee.status === 'active' ? 'Active' : 'Inactive'}</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{employee.phone || 'No WhatsApp'} · Since {new Date(employee.hireDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
          {employee.systemRole === 'florist' && <div className="mt-3 rounded-lg bg-muted/40 p-2.5"><p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">All-time order performance</p><div className="grid grid-cols-3 gap-2 text-center"><div><p className="text-sm font-semibold leading-5">{performance.floristAssigned}</p><p className="text-2xs text-muted-foreground">Assigned</p></div><div><p className="text-sm font-semibold leading-5">{performance.floristCompleted}</p><p className="text-2xs text-muted-foreground">Completed</p></div><div><p className="text-sm font-semibold leading-5">{performance.floristProcessing}</p><p className="text-2xs text-muted-foreground">Processing</p></div></div></div>}
          {employee.systemRole === 'admin' && <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs"><span className="mr-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">All time</span><span className="font-semibold">{performance.adminStartedProcessing}</span> orders moved to Processing</div>}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
            <span className={`rounded-full px-2 py-1 text-2xs font-medium ${hasLogin ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'}`}>{hasLogin ? 'Account · Login enabled' : 'Account · Profile only'}</span>
            <button type="button" onClick={() => vm.onOpenEmployeeDetails(employee)} className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground">Details <ChevronRight className="size-3.5" /></button>
          </div>
        </PeopleListCard>})}</div>
      </section>
    </> : <>
      <PeoplePageHeader section="attendance" />
      <PeopleSummaryGrid className="grid-cols-2 gap-3 sm:grid-cols-3">
        <PeopleSummaryCard className="md:min-h-[76px]" label="Present today" value={summary.presentToday.toString()} tone="success" />
        <PeopleSummaryCard className="md:min-h-[76px]" label="Late / absent" value={(summary.lateToday + summary.absentToday).toString()} tone={summary.lateToday + summary.absentToday > 0 ? 'warning' : 'default'} />
        <PeopleSummaryCard className="md:min-h-[76px]" label="Not marked yet" value={summary.notMarkedToday.toString()} tone={summary.notMarkedToday > 0 ? 'warning' : 'default'} />
      </PeopleSummaryGrid>
      <AttendanceReviewQueue onOpenOrder={vm.onOpenOrder} searchQuery={employeeSearch} />
      <section aria-label="Employee attendance" className="space-y-3">
        <header><h3 className="text-sm font-semibold leading-5 text-foreground">Employee attendance</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Create today&apos;s record or review previous entries.</p></header>
        {attendanceActionError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{attendanceActionError}</p>}
        <div className="grid gap-3 lg:grid-cols-2">{employeeRows.filter(({ employee }) => employee.status === 'active').map(({ employee, todayRecord }) => {
          const warningTypes = attendanceReviewCases
            .filter((item) => item.employeeId === employee.id && item.date === todayRecord?.date && ['pending', 'problem'].includes(item.status))
            .map((item) => item.warningType)
          const isLate = todayRecord?.status === 'late' || warningTypes.includes('late_check_in')
          const missingCheckout = warningTypes.includes('missing_check_out')
          return <PeopleListCard key={employee.id} density="dense" className="flex min-h-[68px] flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5">{employee.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(employee.systemRole)} · {todayRecord ? `${roleLabel(todayRecord.status)}${todayRecord.checkInAt ? ` · ${new Date(todayRecord.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Not marked today'}</p>
              {(isLate || missingCheckout) && <div className="mt-1.5 flex flex-wrap gap-1.5">
                {isLate && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-2xs font-semibold text-warning">Late</span>}
                {missingCheckout && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-2xs font-semibold text-warning">Missing checkout</span>}
              </div>}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">{canEdit && !todayRecord && <select aria-label={`Mark attendance for ${employee.name}`} defaultValue="" onChange={(event) => vm.onRecordAttendance(employee.id, event.target.value as AttendanceStatus)} className="h-11 rounded-full border border-border bg-background px-4 text-sm"><option value="">Mark today</option>{ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}{canEdit && todayRecord && <button type="button" onClick={() => vm.onOpenAttendanceEditor(employee)} className="h-11 rounded-full bg-foreground px-[18px] text-sm font-medium text-background">Edit today</button>}<button type="button" onClick={() => vm.onOpenAttendanceEditor(employee)} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium">History</button></div>
          </PeopleListCard>
        })}</div>
      </section>
    </>}
    </div>

    <CreateStaffSheet
      open={isAddOpen}
      onOpenChange={(open) => { if (!open) vm.onRequestCloseAddForm() }}
      onSubmit={vm.onCreateEmployee}
      title={canCreateAccounts ? 'Create staff' : 'Create employee'}
      description="Add employment details and login access in one focused workflow."
      footer={<>
        <button type="button" onClick={vm.onRequestCloseAddForm} className="h-11 min-w-0 rounded-full border border-border bg-card px-4 text-sm font-medium">Cancel</button>
        <button type="submit" className="h-11 min-w-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{canCreateAccounts ? 'Create employee account' : 'Create employee profile'}</button>
      </>}
    >
      <ValidationSummary errors={[...new Set(Object.values(formErrors).filter((value): value is string => Boolean(value)))]} title="Complete the required staff details" />
      <section className="space-y-5 rounded-xl bg-card p-4 ring-1 ring-border/70">
        <div className="space-y-1"><h3 className="text-sm font-semibold leading-5">Account and employment</h3><p className="text-sm leading-5 text-muted-foreground">Required fields are marked with *. Daily branch assignments remain managed in Scheduling.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" required error={formErrors.name}><input required value={form.name} onChange={vm.onFormFieldChange('name')} className={createStaffFieldInputClass(formErrors.name)} /></Field>
          <Field label="Role / position" required error={formErrors.systemRole}><select value={form.systemRole} onChange={vm.onFormFieldChange('systemRole')} className={createStaffFieldInputClass(formErrors.systemRole)}>{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></Field>
          <Field label="WhatsApp" error={formErrors.phone}><input value={form.phone} onChange={vm.onFormFieldChange('phone')} className={createStaffFieldInputClass(formErrors.phone)} /></Field>
          <Field label="Hire date" required error={formErrors.hireDate}><DatePickerField value={form.hireDate} onChange={vm.onHireDateChange} className={`h-11 rounded-xl bg-card text-sm ${formErrors.hireDate ? 'ring-2 ring-destructive/40' : ''}`} /></Field>
        </div>
      </section>
      {canCreateAccounts ? <section className="space-y-5 rounded-xl bg-card p-4 ring-1 ring-border/70">
        <div className="space-y-1"><h3 className="text-sm font-semibold leading-5">Login access</h3><p className="text-sm leading-5 text-muted-foreground">Create the staff username and six-digit PIN.</p></div>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Username" required error={formErrors.username}><input required value={form.username} onChange={vm.onFormFieldChange('username')} className={createStaffFieldInputClass(formErrors.username)} placeholder="lowercase" /></Field><Field label="PIN" required error={formErrors.pin}><input required inputMode="numeric" maxLength={6} value={form.pin} onChange={vm.onFormFieldChange('pin')} className={createStaffFieldInputClass(formErrors.pin)} placeholder="6 numbers" /></Field></div>
      </section> : <p className="rounded-xl bg-surface-info p-4 text-sm text-info ring-1 ring-info/30">This creates an employee profile only. No username, PIN, or login account will be generated.</p>}
      {canCreateAccounts && <section className="rounded-xl bg-surface-panel p-4 ring-1 ring-border/70"><h3 className="text-sm font-semibold leading-5">Account setup check</h3><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><span className={form.name.trim() ? 'text-success' : 'text-muted-foreground'}>{form.name.trim() ? '✓' : '○'} Name added</span><span className={assignableRoles.includes(form.systemRole) ? 'text-success' : 'text-muted-foreground'}>{assignableRoles.includes(form.systemRole) ? '✓' : '○'} Allowed role selected</span><span className={/^[a-z0-9._-]+$/.test(form.username) ? 'text-success' : 'text-muted-foreground'}>{/^[a-z0-9._-]+$/.test(form.username) ? '✓' : '○'} Username ready</span><span className={/^\d{6}$/.test(form.pin) ? 'text-success' : 'text-muted-foreground'}>{/^\d{6}$/.test(form.pin) ? '✓' : '○'} Six-digit PIN ready</span><span className={form.hireDate ? 'text-success' : 'text-muted-foreground'}>{form.hireDate ? '✓' : '○'} Start date added</span></div></section>}
      {detailsError && <p role="alert" className="rounded-xl bg-surface-error p-4 text-sm text-destructive ring-1 ring-destructive/30">{detailsError}</p>}
    </CreateStaffSheet>

    <AlertDialog open={pendingAddCloseConfirmation} onOpenChange={(open) => { if (!open) vm.onKeepEditingAddForm() }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard new staff details?</AlertDialogTitle><AlertDialogDescription>The staff form has unsaved information. Closing now will permanently discard it.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={vm.onKeepEditingAddForm}>Keep editing</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); vm.onDiscardAddForm() }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>

    <Dialog open={Boolean(detailsEmployee)} onOpenChange={(open) => { if (!open) vm.onCloseEmployeeDetails() }}>
      <DialogContent className="mobile-focus-workflow max-w-2xl overflow-hidden p-0"><div className="border-b border-border px-5 py-4"><DialogHeader><DialogTitle>Employee details</DialogTitle><DialogDescription>Review one employee area at a time.</DialogDescription></DialogHeader><div className="mt-3 flex gap-2 overflow-x-auto">{(['profile','access'] as const).map((section)=><button key={section} type="button" onClick={()=>setDetailsSection(section)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${detailsSection===section?'bg-foreground text-background':'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{section==='access'?'Access & Work':'Profile'}</button>)}</div></div>
        {detailsEmployee && detailsForm && <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4">
          <section className={`${detailsSection==='profile'?'block':'hidden'} rounded-xl bg-muted/35 p-4 ring-1 ring-border/60`}>
            <div className="mb-3"><h3 className="text-sm font-semibold leading-5">Profile</h3><p className="text-xs text-muted-foreground">Personal and employment information. This does not change login access.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={profileErrors.name}><input disabled={!selectedAccountEditable} value={detailsForm.name} onChange={(e) => vm.onDetailsFieldChange('name', e.target.value)} className={fieldInputClass(profileErrors.name)} /></Field>
              <Field label="WhatsApp" error={profileErrors.phone}><input disabled={!selectedAccountEditable} value={detailsForm.phone} onChange={(e) => vm.onDetailsFieldChange('phone', e.target.value)} className={fieldInputClass(profileErrors.phone)} /></Field>
              <Field label="Hire date" error={profileErrors.hireDate}><DatePickerField value={detailsForm.hireDate} onChange={(value) => vm.onDetailsFieldChange('hireDate', value)} className={`h-10 rounded-lg bg-card text-sm ${profileErrors.hireDate ? 'ring-2 ring-destructive/40' : ''}`} /></Field>
              <Field label="Status"><div className="flex h-10 items-center gap-2"><span className="capitalize">{detailsEmployee.status}</span>{selectedAccountEditable && canManageEmployeeStatus && <button type="button" aria-label={detailsEmployee.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => vm.onRequestEmployeeStatusChange(detailsEmployee)} className={`rounded-full border px-3 py-1 text-xs ${detailsEmployee.status === 'active' ? 'border-destructive/30 text-destructive' : 'border-success/30 text-success'}`}>{detailsEmployee.status === 'active' ? 'Deactivate' : 'Activate'}</button>}</div></Field>
            </div>
            {selectedAccountEditable && <div className="mt-3 flex justify-end"><button type="button" onClick={vm.onSaveEmployeeProfile} className="bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Save profile</button></div>}
          </section>

          <section className={`${detailsSection==='access'?'block':'hidden'} rounded-xl bg-muted/35 p-4 ring-1 ring-border/60`}>
            <div className="mb-3"><h3 className="text-sm font-semibold leading-5">Access & role</h3><p className="text-xs text-muted-foreground">Role changes affect permissions. Daily branch assignment is managed only from Scheduling.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role / position" error={accessErrors.systemRole}><select disabled={!canEditCredentials} value={detailsForm.systemRole} onChange={(e) => vm.onDetailsFieldChange('systemRole', e.target.value as typeof detailsForm.systemRole)} className={fieldInputClass(accessErrors.systemRole)}>{assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></Field>
              <Field label="Username" error={accessErrors.username}><input disabled={!canEditCredentials} value={detailsForm.username} onChange={(e) => vm.onDetailsFieldChange('username', e.target.value.toLowerCase())} className={fieldInputClass(accessErrors.username)} /></Field>
              <Field label="New PIN" error={accessErrors.pin}><input disabled={!canEditCredentials} inputMode="numeric" maxLength={6} value={detailsForm.pin} onChange={(e) => vm.onDetailsFieldChange('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Leave blank to keep current PIN" className={fieldInputClass(accessErrors.pin)} /></Field>
            </div>
            {selectedAccountEditable && <div className="mt-3 flex justify-end"><button type="button" onClick={vm.onRequestSaveEmployeeAccess} className="rounded-full border border-foreground bg-foreground text-sm font-semibold text-background rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Save access</button></div>}
          </section>
          {hasUnsavedEmployeeDetails && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Unsaved employee changes. Save the affected section or close and discard them.</p>}
          {detailsError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{detailsError}</p>}{detailsMessage && <p className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{detailsMessage}</p>}
        </div>}
        <DialogFooter className="border-t border-border bg-surface-footer px-5 py-3"><button type="button" onClick={vm.onCloseEmployeeDetails} className="rounded-full border border-border text-sm rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Close</button></DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(pendingAccessConfirmation)} onOpenChange={(open) => { if (!open) vm.onCancelEmployeeAccessChange() }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm access change</AlertDialogTitle><AlertDialogDescription>Role changes affect permissions and active sessions. Daily branch assignment is managed from Scheduling.</AlertDialogDescription></AlertDialogHeader>
        <div className="rounded-lg bg-muted p-3 text-sm"><ul className="space-y-1">{pendingAccessConfirmation?.changes.map((change) => <li key={change}>• {change}</li>)}</ul></div>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); vm.onConfirmEmployeeAccessChange() }}>Confirm changes</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={pendingDetailsCloseConfirmation} onOpenChange={(open) => { if (!open) vm.onKeepEditingEmployeeDetails() }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved employee changes?</AlertDialogTitle><AlertDialogDescription>Profile or access changes have not been saved. Closing Employee Details will permanently discard them.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel onClick={vm.onKeepEditingEmployeeDetails}>Keep editing</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); vm.onDiscardEmployeeDetailsChanges() }}>Discard changes</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={Boolean(attendanceEditor)} onOpenChange={(open) => { if (!open) vm.onCloseAttendanceEditor() }}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Attendance · {attendanceEditor?.employee.name}</DialogTitle><DialogDescription>Record, correct, and review selfie/location evidence.</DialogDescription></DialogHeader>
        {attendanceEditor && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Field label="Date"><DatePickerField value={attendanceEditor.date} onChange={vm.onAttendanceDateChange} className="h-10 rounded-full bg-card text-sm" /></Field><Field label="Status"><select aria-label="Attendance status" value={attendanceEditor.status} onChange={(e) => vm.onAttendanceStatusChange(e.target.value as AttendanceStatus)} className={inputClass}><option value="">Select</option>{ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Note · Optional"><input aria-label="Attendance note" value={attendanceEditor.note} onChange={(e) => vm.onAttendanceNoteChange(e.target.value)} className={inputClass} /></Field></div>{attendanceActionError && <p role="alert" className="text-xs text-destructive">{attendanceActionError}</p>}
          <div className="max-h-72 space-y-2 overflow-y-auto"><p className="text-xs font-semibold text-muted-foreground">History</p>{attendanceHistory.length === 0 ? <p className="text-xs text-muted-foreground">No attendance history.</p> : attendanceHistory.map((record) => <article key={record.id} className="rounded-lg bg-muted/60 p-3 text-xs"><div className="flex justify-between gap-2"><strong>{record.date} · {roleLabel(record.status)}</strong><span className="text-muted-foreground">{record.actor}</span></div><p className="mt-1 text-muted-foreground">{record.checkInAt ? `Check-in ${new Date(record.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Manual record'}{record.checkOutAt ? ` · Check-out ${new Date(record.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p>{record.note && <p className="mt-1">{record.note}</p>}<div className="mt-2 flex flex-wrap gap-2">{record.selfieDataUrl && <a href={record.selfieDataUrl} target="_blank" rel="noreferrer" className="text-primary underline">Check-in selfie</a>}{record.checkOutSelfieDataUrl && <a href={record.checkOutSelfieDataUrl} target="_blank" rel="noreferrer" className="text-primary underline">Check-out selfie</a>}{record.checkInLocation && <a href={`https://www.openstreetmap.org/?mlat=${record.checkInLocation.latitude}&mlon=${record.checkInLocation.longitude}`} target="_blank" rel="noreferrer" className="text-primary underline">Check-in · {record.checkInLocation.detectedBranchName ?? 'branch'} · {record.checkInLocation.distanceMeters}m</a>}{record.checkOutLocation && <a href={`https://www.openstreetmap.org/?mlat=${record.checkOutLocation.latitude}&mlon=${record.checkOutLocation.longitude}`} target="_blank" rel="noreferrer" className="text-primary underline">Check-out · {record.checkOutLocation.detectedBranchName ?? 'branch'} · {record.checkOutLocation.distanceMeters}m</a>}{record.checkInLocation?.scheduledBranchName && <span className="rounded-full bg-info/10 px-2 py-1 text-info">Scheduled {record.checkInLocation.scheduledBranchName} · {record.checkInLocation.scheduledStartTime}–{record.checkInLocation.scheduledEndTime}</span>}{record.checkInLocation?.reviewStatus === 'pending_review' && <span className="rounded-full bg-warning/10 px-2 py-1 font-medium text-warning">Schedule warning · HR review pending</span>}{record.checkOutLocation?.reviewStatus === 'pending_review' && <span className="rounded-full bg-warning/10 px-2 py-1 font-medium text-warning">Check-out branch warning</span>}</div></article>)}</div></div>}
        <DialogFooter><button type="button" onClick={vm.onCloseAttendanceEditor} className="rounded-full border border-border text-sm rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Close</button>{canEdit && <button type="button" onClick={vm.onSaveAttendance} className="bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Save attendance</button>}</DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(pendingStatusEmployee)} onOpenChange={(open) => { if (!open) vm.onCancelEmployeeStatusChange() }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingStatusEmployee?.status === 'active' ? 'Deactivate employee?' : 'Activate employee?'}</AlertDialogTitle><AlertDialogDescription>{pendingStatusEmployee?.status === 'active' ? 'The account cannot sign in or record attendance until reactivated.' : 'The account can sign in and record attendance again.'}</AlertDialogDescription></AlertDialogHeader>{statusActionError && <p role="alert" className="text-xs text-destructive">{statusActionError}</p>}<AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); vm.onConfirmEmployeeStatusChange() }}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </PeoplePageShell>
}

const Field: FC<{ label: string; children: ReactNode; error?: string; required?: boolean }> = ({ label, children, error, required }) => <label className="space-y-2"><FieldLabel required={required}>{label}</FieldLabel>{children}{error && <span className="block text-xs text-destructive">{error}</span>}</label>
const fieldInputClass = (error?: string) => `${inputClass} ${error ? 'border-destructive ring-2 ring-destructive/20' : ''}`
const createStaffFieldInputClass = (error?: string) => `h-11 w-full rounded-full border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 disabled:opacity-60 ${error ? 'border-destructive ring-2 ring-destructive/20' : ''}`
const inputClass = 'h-10 w-full rounded-full border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 disabled:opacity-60'
