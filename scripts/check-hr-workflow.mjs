import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [
  controller,
  peopleUi,
  hrStore,
  scheduleUi,
  payrollStore,
  lifecycle,
  staffLifecycle,
  staffAdmin,
  migration,
] = await Promise.all([
  read('apps/os/src/components/hr/HrTabContentController.ts'),
  read('apps/os/src/components/hr/PeopleWorkspaceUI.tsx'),
  read('apps/os/src/store/hrStore.ts'),
  read('apps/os/src/components/hr/HrSchedulingSection.tsx'),
  read('apps/os/src/store/payrollStore.ts'),
  read('apps/os/src/domain/hrEmployeeLifecycleDomain.ts'),
  read('apps/os/src/data/staffLifecycleSupabase.ts'),
  read('supabase/functions/staff-admin/index.ts'),
  read('supabase/migrations/20260805042546_simplify_hr_workflow.sql'),
])

const assert = (condition, message) => {
  if (!condition) throw new Error(`HR workflow contract failed: ${message}`)
}

const availableStart = controller.indexOf('const availableSections: HrSection[]')
const availableEnd = controller.indexOf('const canEditCredentials', availableStart)
const availableSections = availableStart >= 0 && availableEnd > availableStart ? controller.slice(availableStart, availableEnd) : ''
assert(availableSections.length > 0 && !availableSections.includes("['reports']") && !availableSections.includes("['points']"), 'HR navigation is not reduced to People, Schedule, Attendance, and Payroll.')
assert(lifecycle.includes("'setup_required' | 'active' | 'inactive'"), 'Employee readiness states are missing.')
assert(lifecycle.includes('getEmployeeRemovalBlockers'), 'Safe permanent-removal dependency checks are missing.')
assert(hrStore.includes('removeUnusedEmployee:'), 'The local HR store cannot remove unused employees.')
assert(hrStore.includes("status:'changed_after_publish'"), 'Deactivation does not invalidate affected published schedules.')
assert(payrollStore.includes("payrollSettings.baseSalaryByRole?.[employee.systemRole]"), 'Payroll does not fall back to configured role salary.')
assert(payrollStore.includes("code:'pending_attendance'"), 'Payroll submission does not hard-block unresolved attendance.')

const generatorStart = hrStore.indexOf("reason:'You do not have permission to generate schedules.'")
const generatorEnd = hrStore.indexOf('publishScheduleWeek:', generatorStart)
const generator = generatorStart >= 0 && generatorEnd > generatorStart ? hrStore.slice(generatorStart, generatorEnd) : ''
assert(generator.length > 0, 'Schedule generator could not be inspected.')
assert(!generator.includes('Math.random'), 'Generated schedules remain random.')
assert(generator.includes('follow_branch_hours'), 'Generated schedules do not use configured branch hours.')
assert(generator.includes('isSupabaseConfigured() || isSharedBackendConfigured()'), 'Production Supabase staff would be excluded from schedule generation.')
assert(scheduleUi.includes('Copy previous') && scheduleUi.includes('Generate deterministic pattern'), 'Copy-previous is not the primary schedule action.')
assert(scheduleUi.includes('Shortage reason · Required'), 'Coverage-shortage publication has no required reason.')
assert(staffLifecycle.includes('removeStaffEmployeeSupabase'), 'The client cannot invoke trusted staff removal.')
assert(staffAdmin.includes("action === 'remove'"), 'The staff-admin function does not support removal.')
assert(staffAdmin.includes("['owner','hr'].includes(actorProfile.role)"), 'HR cannot remove unused Admin or Florist accounts.')
assert(migration.includes("v_employee->>'systemRole' not in ('admin','florist')"), 'HR protected-role deletion guard is missing.')
assert(migration.includes('public.staff_attendance_records') && migration.includes('public.employee_point_events'), 'Removal blockers do not include normalized attendance or point authority.')
assert(migration.includes('delete from public.staff_schedule_overrides'), 'Final removal leaves normalized future schedules behind.')
assert(migration.includes('prepare_unused_staff_removal'), 'Two-phase removal preparation is missing.')
assert(migration.includes('finalize_unused_staff_removal'), 'Two-phase removal finalization is missing.')
assert(migration.includes('PENDING_ATTENDANCE_REVIEW'), 'PostgreSQL payroll attendance enforcement is missing.')

console.log('HR workflow contract PASS')
