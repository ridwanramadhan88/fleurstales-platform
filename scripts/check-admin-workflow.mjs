#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (value) => readFile(path.join(root, value), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const [app, branches, topBar, sidebar, queue, dashboard, migration, readScopeMigration] = await Promise.all([
  read('apps/os/src/App.tsx'),
  read('apps/os/src/domain/branchSelectionDomain.ts'),
  read('apps/os/src/components/dashboard/TopBarController.ts'),
  read('apps/os/src/components/layout/DesktopSidebarController.ts'),
  read('apps/os/src/components/dashboard/AdminTodayQueue.tsx'),
  read('apps/os/src/components/dashboard/DashboardTab.tsx'),
  read('supabase/migrations/20260804183609_simplify_admin_workflow.sql'),
  read('supabase/migrations/20260905221500_staff_review_read_access.sql'),
])

assert(app.includes("role === 'admin' && productionSession"), 'Production Admin is not locked to the dated operational branch.')
assert(app.includes('Admin requires a dated working schedule'), 'Missing Admin schedule requirement.')
assert(branches.includes("role === 'florist'"), 'Florist operational branch switching is missing.')
assert(!branches.includes("role === 'admin' || role === 'florist'"), 'Admin branch selector is still coupled to operational branch switching.')
assert(topBar.includes('userRole === "florist" ? branch !== "All" : true'), 'Top bar does not expose All as a browsing filter for Admin.')
assert(sidebar.includes("userRole === 'florist' ? branch !== 'All' : true"), 'Desktop sidebar does not expose All as a browsing filter for Admin.')
assert(readScopeMigration.includes('enforce_admin_order_mutation_branch'), 'Admin order mutation branch trigger is missing.')
assert(readScopeMigration.includes('ORDER_OUTSIDE_BRANCH_SCOPE'), 'Admin order mutation branch rejection is missing.')
assert(!queue.includes("new Date().toISOString().slice(0, 10)"), 'Admin dashboard still uses UTC for today.')
assert(queue.includes('getLocalDateString(nowInJakarta())'), 'Admin dashboard does not use Jakarta business date.')
assert(queue.includes('Review & confirm') && queue.includes('Assign & start'), 'Admin next-action labels are incomplete.')
assert(dashboard.includes('onOpenOrder={(orderNumber) => onNavigate(toOrders({ orderNumber }))}'), 'Admin queue does not deep-link directly to orders.')

for (const token of [
  'ADMIN_DATED_BRANCH_REQUIRED',
  'ADMIN_BRANCH_SCOPE_REQUIRED',
  'ORDER_STATUS_SEQUENCE_REQUIRED',
  "set status='confirmed'",
  "'Ready for reconciliation'",
  "array['owner','admin']",
]) {
  assert(migration.includes(token), `Admin migration missing ${token}.`)
}
assert(!migration.includes("array['owner','finance'],new.branch_id,'order_pending_verification'"), 'New customer orders are still routed to Finance before completion.')

console.log('Admin workflow contract PASS')
