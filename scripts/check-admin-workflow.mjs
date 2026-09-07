#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (value) => readFile(path.join(root, value), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const [
  app,
  branches,
  topBar,
  sidebar,
  queue,
  dashboard,
  adminMigration,
  runtimeMigration,
  attendanceMigration,
  readScopeMigration,
] = await Promise.all([
  read('apps/os/src/App.tsx'),
  read('apps/os/src/domain/branchSelectionDomain.ts'),
  read('apps/os/src/components/dashboard/TopBarController.ts'),
  read('apps/os/src/components/layout/DesktopSidebarController.ts'),
  read('apps/os/src/components/dashboard/AdminTodayQueue.tsx'),
  read('apps/os/src/components/dashboard/DashboardTab.tsx'),
  read('supabase/migrations/20260804183609_simplify_admin_workflow.sql'),
  read('supabase/migrations/20260907133500_allow_unscheduled_staff_runtime_context.sql'),
  read('supabase/migrations/20260804152500_simplify_attendance_flow.sql'),
  read('supabase/migrations/20260905221500_staff_review_read_access.sql'),
])

assert(app.includes('resolveStaffBranchContext'), 'Staff login does not resolve safe unscheduled branch context.')
assert(app.includes('fallbackOperationalBranch'), 'Unscheduled branch-scoped staff do not receive an operational fallback.')
assert(!app.includes('Admin requires a dated working schedule'), 'Admin login is still incorrectly gated by today\'s schedule.')
assert(app.includes('scheduledBranchId: undefined'), 'Profile branch is still being misrepresented as a schedule during login.')
assert(branches.includes("role === 'florist'"), 'Florist operational branch switching is missing.')
assert(!branches.includes("role === 'admin' || role === 'florist'"), 'Admin branch selector is still coupled to operational branch switching.')
assert(topBar.includes('userRole === "florist" ? branch !== "All" : true'), 'Top bar does not expose All as a browsing filter for Admin.')
assert(sidebar.includes("userRole === 'florist' ? branch !== 'All' : true"), 'Desktop sidebar does not expose All as a browsing filter for Admin.')
assert(readScopeMigration.includes('enforce_admin_order_mutation_branch'), 'Admin order mutation branch trigger is missing.')
assert(readScopeMigration.includes("v_role is distinct from 'admin'"), 'Admin order mutation trigger is not null-safe for non-staff/service writers.')
assert(readScopeMigration.includes('ORDER_OUTSIDE_BRANCH_SCOPE'), 'Admin order mutation branch rejection is missing.')
assert(!queue.includes("new Date().toISOString().slice(0, 10)"), 'Admin dashboard still uses UTC for today.')
assert(queue.includes('getLocalDateString(nowInJakarta())'), 'Admin dashboard does not use Jakarta business date.')
assert(queue.includes('Review & confirm') && queue.includes('Assign & start'), 'Admin next-action labels are incomplete.')
assert(dashboard.includes('onOpenOrder={(orderNumber) => onNavigate(toOrders({ orderNumber }))}'), 'Admin queue does not deep-link directly to orders.')

for (const token of [
  'ORDER_STATUS_SEQUENCE_REQUIRED',
  "set status='confirmed'",
  "'Ready for reconciliation'",
  "array['owner','admin']",
]) {
  assert(adminMigration.includes(token), `Admin migration missing ${token}.`)
}
assert(!adminMigration.includes("array['owner','finance'],new.branch_id,'order_pending_verification'"), 'New customer orders are still routed to Finance before completion.')

assert(runtimeMigration.includes("v_role in ('admin','florist')"), 'Branch-scoped staff runtime enforcement is missing.')
assert(runtimeMigration.includes('OPERATIONAL_BRANCH_REQUIRED'), 'Branch-scoped staff can open runtime context without a branch.')
assert(runtimeMigration.includes('INVALID_OPERATIONAL_BRANCH'), 'Runtime context no longer validates active operational branches.')
assert(!runtimeMigration.includes('ADMIN_DATED_BRANCH_REQUIRED'), 'Runtime context still requires Admin to be scheduled today.')
assert(!runtimeMigration.includes('staff_schedule_overrides'), 'Runtime authentication is still coupled to schedule storage.')
assert(attendanceMigration.includes('DATED_ATTENDANCE_SCHEDULE_REQUIRED'), 'Attendance no longer requires an authoritative dated schedule.')

console.log('Admin workflow contract PASS')
