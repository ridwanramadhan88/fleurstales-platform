/**
 * @file StaffRoleSettingsPanel.tsx
 * @description Owner-controlled role definitions, HR scope, staff account
 * draft creation, and employee salary drafts. Nothing is committed until the
 * Settings Center save confirmation is accepted.
 */

import type { FC } from 'react'
import { Plus, UserPlus, X } from 'lucide-react'
import type { UserRole } from '../../store/userStore'
import type { Employee } from '../../store/hrStoreTypes'
import type { StaffRoleSettings } from '../../types/settings'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import { compactValueRowClass } from './SettingsPrimitives'
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
const HR_AREAS = ['employees', 'attendance', 'scheduling', 'points', 'payroll'] as const
const DEFAULT_HR_MANAGED_ROLES: UserRole[] = ['admin', 'florist']
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

  const getHrManagedRoles = (area: (typeof HR_AREAS)[number]) => staffRoles.hrManagedRoles?.[area] ?? DEFAULT_HR_MANAGED_ROLES
  const isHrManagedEverywhere = (role: UserRole) => HR_AREAS.every((area) => getHrManagedRoles(area).includes(role))
  const visibleHrScopeRoles = HR_SCOPE_ROLES.filter((role) => staffRoles.roles.includes(role))
  const managedEverywhereRoles = visibleHrScopeRoles.filter(isHrManagedEverywhere)

  const toggleHrManagedRole = (role: UserRole) => {
    const shouldEnable = !isHrManagedEverywhere(role)
    const updateArea = (area: (typeof HR_AREAS)[number]) => {
      const current = getHrManagedRoles(area)
      if (shouldEnable) return current.includes(role) ? current : [...current, role]
      return current.filter((item) => item !== role)
    }

    onUpdate({
      hrManagedRoles: {
        employees: updateArea('employees'),
        attendance: updateArea('attendance'),
        scheduling: updateArea('scheduling'),
        points: updateArea('points'),
        payroll: updateArea('payroll'),
      },
    })
  }

  const nonOwnerEmployees = employees.filter((employee) => employee.systemRole !== 'owner')
  return (
    <section className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-ios-sm ring-1 ring-black/[0.02] sm:p-5">
        <div>
          <h3 className="text-sm font-semibold leading-5">Staff roles</h3>
          <p className="mt-1 text-xs text-muted-foreground">Roles available for staff accounts.</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <span className="rounded-full bg-surface-panel px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border/70">{ROLE_LABELS.owner}</span>
              {ASSIGNABLE_ROLES.map((role) => {
                const included = staffRoles.roles.includes(role)
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={included}
                    onClick={() => toggleRole(role)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${included ? 'bg-surface-selected text-primary-foreground ring-primary/30' : 'text-muted-foreground ring-border hover:text-foreground'}`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                )
              })}
            </>
          ) : (
            staffRoles.roles.map((role) => <span key={role} className="rounded-full bg-background px-3 py-1.5 text-xs font-medium ring-1 ring-border/70">{ROLE_LABELS[role]}</span>)
          )}
        </div>
        {validationErrors.ownerRole && <p className="mt-2 text-2xs font-medium text-destructive">{validationErrors.ownerRole}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
          <div>
            <p className="text-xs font-semibold">Default role</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Used for new staff.</p>
          </div>
          {isEditing ? (
            <div className="w-full sm:w-56">
              <select value={staffRoles.defaultRole} onChange={(event) => onUpdate({ defaultRole: event.target.value as UserRole })} className={FIELD_CLASS}>
                {staffRoles.roles.filter((role) => role !== 'owner').map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
              {validationErrors.defaultRole && <p className="mt-1 text-2xs font-medium text-destructive">{validationErrors.defaultRole}</p>}
            </div>
          ) : (
            <span className="rounded-full bg-surface-panel px-3 py-1.5 text-xs font-semibold ring-1 ring-border/60">{ROLE_LABELS[staffRoles.defaultRole]}</span>
          )}
        </div>
      </section>

      {isEditing && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><UserPlus className="size-4" /><h3 className="text-sm font-semibold leading-5">Create staff account</h3></div>
              <p className="mt-1 text-xs text-muted-foreground">Add a staff login and basic employment details.</p>
            </div>
            {!staffAccountDraft && <button type="button" onClick={onStartStaffAccountDraft} className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-[18px] text-xs font-semibold text-primary-foreground"><Plus className="size-3.5" /> Add account draft</button>}
          </div>
          {staffAccountDraft && (
            <div className="mt-4 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60">
              <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold">New account draft</p><button type="button" onClick={onCancelStaffAccountDraft} className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Remove account draft"><X className="size-4" /></button></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Full name" error={validationErrors['staff.account.name']}><input value={staffAccountDraft.name} onChange={(event) => { const name = event.target.value; onUpdateStaffAccountDraft({ name, username: name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '') }) }} className={FIELD_CLASS} /></Field>
                <Field label="Role" error={validationErrors['staff.account.systemRole']}><select value={staffAccountDraft.systemRole} onChange={(event) => onUpdateStaffAccountDraft({ systemRole: event.target.value as UserRole })} className={FIELD_CLASS}>{staffRoles.roles.filter((role) => role !== 'owner').map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></Field>
                <Field label="Username" error={validationErrors['staff.account.username']}><input value={staffAccountDraft.username} onChange={(event) => onUpdateStaffAccountDraft({ username: event.target.value.toLowerCase() })} className={FIELD_CLASS} /></Field>
                <Field label="Recovery email" error={validationErrors['staff.account.email']}><input type="email" autoComplete="email" value={staffAccountDraft.email} onChange={(event) => onUpdateStaffAccountDraft({ email: event.target.value.toLowerCase() })} className={FIELD_CLASS} /></Field>
                <Field label="Password" error={validationErrors['staff.account.pin']}><input type="password" autoComplete="new-password" value={staffAccountDraft.pin} onChange={(event) => onUpdateStaffAccountDraft({ pin: event.target.value })} placeholder="6+ characters" className={FIELD_CLASS} /></Field>
                <Field label="Hire date" error={validationErrors['staff.account.hireDate']}><input type="date" value={staffAccountDraft.hireDate} onChange={(event) => onUpdateStaffAccountDraft({ hireDate: event.target.value })} className={FIELD_CLASS} /></Field>
                <Field label="Monthly base salary" error={validationErrors['staff.account.baseSalaryIdr']}><div className="flex h-10 overflow-hidden rounded-lg border border-border bg-background"><span className="flex items-center border-r border-border px-2 text-xs text-muted-foreground">Rp</span><input type="number" min={1} step={100000} value={staffAccountDraft.baseSalaryIdr} onChange={(event) => onUpdateStaffAccountDraft({ baseSalaryIdr: Number(event.target.value) })} className="min-w-0 flex-1 px-2 text-sm outline-none" /></div></Field>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <SalarySectionHeader count={nonOwnerEmployees.length} description={isEditing ? 'Changes are saved with this section.' : 'Monthly base salary per employee.'} />
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {nonOwnerEmployees.map((employee) => (
            <SalaryRow
              key={employee.id}
              employee={employee}
              isEditing={isEditing}
              value={employeeSalaryDrafts[employee.id] ?? employee.baseSalaryIdr ?? 0}
              error={isEditing ? validationErrors[`staff.salary.${employee.id}`] : undefined}
              onChange={(value) => onUpdateEmployeeSalaryDraft(employee.id, value)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-semibold leading-5">HR can manage</h3>
        <p className="mt-1 text-xs text-muted-foreground">Applies to staff accounts, attendance, schedules, points, and payroll.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {isEditing ? (
            visibleHrScopeRoles.map((role) => {
              const checked = isHrManagedEverywhere(role)
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleHrManagedRole(role)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${checked ? 'bg-surface-selected text-primary-foreground ring-primary/30' : 'bg-background text-muted-foreground ring-border'}`}
                >
                  {ROLE_LABELS[role]}
                </button>
              )
            })
          ) : managedEverywhereRoles.length > 0 ? (
            managedEverywhereRoles.map((role) => <span key={role} className="rounded-full bg-background px-3 py-1.5 text-xs font-medium ring-1 ring-border/70">{ROLE_LABELS[role]}</span>)
          ) : (
            <span className="text-xs text-muted-foreground">No roles selected</span>
          )}
        </div>
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
