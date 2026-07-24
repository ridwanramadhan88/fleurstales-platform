/**
 * @file StaffRoleSettingsPanel.tsx
 * @description Owner-controlled role definitions, HR scope, staff account
 * draft creation, and employee salary drafts. Nothing is committed until the
 * Settings Center save confirmation is accepted.
 */

import type { FC } from 'react'
import { Plus, UserPlus, Users, X } from 'lucide-react'
import type { UserRole } from '../../store/userStore'
import type { Employee } from '../../store/hrStoreTypes'
import type { StaffRoleSettings } from '../../types/settings'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import { compactValueRowClass, SettingsSectionHeader } from './SettingsPrimitives'
import type { StaffAccountDraft } from './settingsDraftTypes'

interface Props {
  isEditing: boolean
  staffRoles: StaffRoleSettings
  onUpdate: (patch: Partial<StaffRoleSettings>) => void
  validationErrors: SettingsValidationErrors
  employees: Employee[]
  staffAccountDraft: StaffAccountDraft | null
  employeeSalaryDrafts: Record<string, number>
  onStartStaffAccountDraft: () => void
  onCancelStaffAccountDraft: () => void
  onUpdateStaffAccountDraft: (patch: Partial<StaffAccountDraft>) => void
  onUpdateEmployeeSalaryDraft: (employeeId: string, value: number) => void
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner', admin: 'Admin', finance: 'Finance', hr: 'HR', florist: 'Florist',
}
const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'finance', 'hr', 'florist']
const HR_SCOPE_ROLES: UserRole[] = ['admin', 'finance', 'hr', 'florist']
const HR_AREAS = [
  ['employees', 'Employee accounts'],
  ['attendance', 'Attendance'],
  ['scheduling', 'Scheduling'],
  ['points', 'Points'],
  ['payroll', 'Payroll preparation'],
] as const
const FIELD_CLASS = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'
const LABEL_CLASS = 'text-2xs font-semibold uppercase tracking-wide text-muted-foreground'

export const StaffRoleSettingsPanel: FC<Props> = ({
  staffRoles,
  onUpdate,
  isEditing,
  validationErrors,
  employees,
  staffAccountDraft,
  employeeSalaryDrafts,
  onStartStaffAccountDraft,
  onCancelStaffAccountDraft,
  onUpdateStaffAccountDraft,
  onUpdateEmployeeSalaryDraft,
}) => {
  const toggleRole = (role: UserRole) => {
    if (role === 'owner') return
    const isIncluded = staffRoles.roles.includes(role)
    const nextRoles = isIncluded ? staffRoles.roles.filter((item) => item !== role) : [...staffRoles.roles, role]
    const nextDefaultRole = nextRoles.includes(staffRoles.defaultRole) ? staffRoles.defaultRole : (nextRoles.find((item) => item !== 'owner') ?? 'florist')
    onUpdate({ roles: nextRoles, defaultRole: nextDefaultRole })
  }

  const nonOwnerEmployees = employees.filter((employee) => employee.systemRole !== 'owner')

  return (
    <section className="space-y-5">
      <SettingsSectionHeader icon={Users} title="People configuration" description="Role availability, new-account defaults, HR management scope, and employee base salaries." />

      {!isEditing ? (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-ios-sm ring-1 ring-black/[0.02] sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold leading-5">Enabled roles</h3><p className="mt-1 text-xs text-muted-foreground">Roles available for employee accounts.</p></div><span className="rounded-full bg-background px-2.5 py-1 text-2xs font-semibold text-muted-foreground ring-1 ring-border/60">Default: {ROLE_LABELS[staffRoles.defaultRole]}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">{staffRoles.roles.map((role) => <span key={role} className="rounded-full bg-background px-3 py-1.5 text-xs font-medium ring-1 ring-border/70">{ROLE_LABELS[role]}</span>)}</div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <SalarySectionHeader count={nonOwnerEmployees.length} description="Saved monthly salary per employee." />
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {nonOwnerEmployees.map((employee) => (
                <SalaryRow key={employee.id} employee={employee} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><UserPlus className="size-4" /><h3 className="text-sm font-semibold leading-5">Create staff account</h3></div><p className="mt-1 text-xs text-muted-foreground">The account is only created after the section is saved and confirmed.</p></div>{!staffAccountDraft && <button type="button" onClick={onStartStaffAccountDraft} className="inline-flex items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"><Plus className="size-3.5" /> Add account draft</button>}</div>
            {staffAccountDraft && (
              <div className="mt-4 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60">
                <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold">New account draft</p><button type="button" onClick={onCancelStaffAccountDraft} className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted rounded-full p-0 size-11 rounded-full p-0 whitespace-nowrap" aria-label="Remove account draft"><X className="size-4" /></button></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Full name" error={validationErrors['staff.account.name']}><input value={staffAccountDraft.name} onChange={(event) => { const name = event.target.value; onUpdateStaffAccountDraft({ name, username: name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '') }) }} className={FIELD_CLASS} /></Field>
                  <Field label="Role" error={validationErrors['staff.account.systemRole']}><select value={staffAccountDraft.systemRole} onChange={(event) => onUpdateStaffAccountDraft({ systemRole: event.target.value as UserRole })} className={FIELD_CLASS}>{staffRoles.roles.filter((role) => role !== 'owner').map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></Field>
                  <Field label="Username" error={validationErrors['staff.account.username']}><input value={staffAccountDraft.username} onChange={(event) => onUpdateStaffAccountDraft({ username: event.target.value.toLowerCase() })} className={FIELD_CLASS} /></Field>
                  <Field label="PIN" error={validationErrors['staff.account.pin']}><input inputMode="numeric" maxLength={6} value={staffAccountDraft.pin} onChange={(event) => onUpdateStaffAccountDraft({ pin: event.target.value.replace(/\D/g, '').slice(0, 6) })} className={FIELD_CLASS} /></Field>
                  <Field label="Hire date" error={validationErrors['staff.account.hireDate']}><input type="date" value={staffAccountDraft.hireDate} onChange={(event) => onUpdateStaffAccountDraft({ hireDate: event.target.value })} className={FIELD_CLASS} /></Field>
                  <Field label="Monthly base salary" error={validationErrors['staff.account.baseSalaryIdr']}><div className="flex h-10 overflow-hidden rounded-lg border border-border bg-background"><span className="flex items-center border-r border-border px-2 text-xs text-muted-foreground">Rp</span><input type="number" min={1} step={100000} value={staffAccountDraft.baseSalaryIdr} onChange={(event) => onUpdateStaffAccountDraft({ baseSalaryIdr: Number(event.target.value) })} className="min-w-0 flex-1 px-2 text-sm outline-none" /></div></Field>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <SalarySectionHeader count={nonOwnerEmployees.length} description="Changes remain drafts until this section is saved." />
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {nonOwnerEmployees.map((employee) => (
                <SalaryRow
                  key={employee.id}
                  employee={employee}
                  isEditing
                  value={employeeSalaryDrafts[employee.id] ?? employee.baseSalaryIdr ?? 0}
                  error={validationErrors[`staff.salary.${employee.id}`]}
                  onChange={(value) => onUpdateEmployeeSalaryDraft(employee.id, value)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div><h3 className="text-sm font-semibold leading-5">Assignable roles</h3><p className="mt-1 text-xs text-muted-foreground">Owner is permanently enabled and cannot be assigned from staff management.</p></div>
        {isEditing ? (
          <div className="flex flex-wrap gap-2">{ASSIGNABLE_ROLES.map((role) => { const included = staffRoles.roles.includes(role); return <button key={role} type="button" aria-pressed={included} onClick={() => toggleRole(role)} className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${included ? 'bg-surface-selected text-primary-foreground ring-primary/30' : 'text-muted-foreground ring-border hover:text-foreground'}`}>{ROLE_LABELS[role]}</button> })}</div>
        ) : (
          <div className="flex flex-wrap gap-2">{ASSIGNABLE_ROLES.map((role) => <span key={role} className={`rounded-full px-3 py-1.5 text-xs font-medium ${staffRoles.roles.includes(role) ? 'bg-success/10 text-success' : 'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{ROLE_LABELS[role]} · {staffRoles.roles.includes(role) ? 'Enabled' : 'Disabled'}</span>)}</div>
        )}
        {validationErrors.ownerRole && <p className="text-2xs font-medium text-destructive">{validationErrors.ownerRole}</p>}
        <div className="max-w-sm space-y-1"><span className={LABEL_CLASS}>Default role for new staff</span>{isEditing ? <select value={staffRoles.defaultRole} onChange={(event) => onUpdate({ defaultRole: event.target.value as UserRole })} className={FIELD_CLASS}>{staffRoles.roles.filter((role) => role !== 'owner').map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select> : <p className="rounded-full bg-surface-panel px-3 py-2.5 text-sm font-semibold ring-1 ring-border/60">{ROLE_LABELS[staffRoles.defaultRole]}</p>}{validationErrors.defaultRole && <p className="text-2xs font-medium text-destructive">{validationErrors.defaultRole}</p>}</div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-semibold leading-5">HR management scope</h3><p className="mt-1 text-xs text-muted-foreground">Roles HR may handle in each workspace. Owner always keeps full access.</p>
        <div className="mt-4 space-y-3">{HR_AREAS.map(([area, label]) => { const selected = staffRoles.hrManagedRoles?.[area] ?? ['admin', 'florist']; return <div key={area} className="rounded-lg bg-surface-panel p-3"><p className="text-xs font-semibold">{label}</p><div className="mt-2 flex flex-wrap gap-2">{HR_SCOPE_ROLES.map((role) => { const checked = selected.includes(role); return isEditing ? <button key={role} type="button" aria-pressed={checked} onClick={() => { const next = checked ? selected.filter((item) => item !== role) : [...selected, role]; onUpdate({ hrManagedRoles: { employees: staffRoles.hrManagedRoles?.employees ?? ['admin', 'florist'], attendance: staffRoles.hrManagedRoles?.attendance ?? ['admin', 'florist'], scheduling: staffRoles.hrManagedRoles?.scheduling ?? ['admin', 'florist'], points: staffRoles.hrManagedRoles?.points ?? ['admin', 'florist'], payroll: staffRoles.hrManagedRoles?.payroll ?? ['admin', 'florist'], [area]: next } }) }} className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${checked ? 'bg-surface-selected text-primary-foreground ring-primary/30' : 'bg-background text-muted-foreground ring-border'}`}>{ROLE_LABELS[role]}</button> : checked ? <span key={role} className="rounded-full bg-background px-3 py-1.5 text-xs font-medium ring-1 ring-border/70">{ROLE_LABELS[role]}</span> : null })}{!isEditing && selected.length === 0 && <span className="text-xs text-muted-foreground">No delegated roles</span>}</div></div> })}</div>
      </section>
    </section>
  )
}


const SalarySectionHeader: FC<{ count: number; description: string }> = ({ count, description }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h3 className="text-sm font-semibold leading-5">Employee base salaries</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
    <span className="rounded-full bg-surface-panel px-2.5 py-1 text-2xs font-semibold text-muted-foreground ring-1 ring-border/60">{count} employees</span>
  </div>
)

const SalaryRow: FC<{ employee: Employee; isEditing?: boolean; value?: number; error?: string; onChange?: (value: number) => void }> = ({ employee, isEditing = false, value, error, onChange }) => (
  <div className={compactValueRowClass(Boolean(error))}>
    <div className="flex min-h-10 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{ROLE_LABELS[employee.systemRole]}</p>
      </div>
      {isEditing ? (
        <div className="flex h-10 w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 sm:w-44">
          <span className="flex items-center border-r border-border px-2.5 text-xs font-medium text-muted-foreground">Rp</span>
          <input aria-label={`${employee.name} base salary`} type="number" min={1} step={100000} value={value ?? 0} onChange={(event) => onChange?.(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-2.5 text-right text-sm font-semibold outline-none" />
        </div>
      ) : (
        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">Rp {(employee.baseSalaryIdr ?? 0).toLocaleString('id-ID')}</p>
      )}
    </div>
    {error && <p className="mt-2 text-2xs font-medium text-destructive">{error}</p>}
  </div>
)

const Field: FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => <label className="space-y-1"><span className={LABEL_CLASS}>{label}</span>{children}{error && <p className="text-2xs font-medium text-destructive">{error}</p>}</label>
