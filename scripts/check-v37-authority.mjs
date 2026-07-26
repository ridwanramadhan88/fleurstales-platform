#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => readFile(path.join(root, p), 'utf8')
const assert = (value, message) => { if (!value) throw new Error(message) }

const [sql, submit, controller, pricing, authz, attendance, points, customer, realtime, workflow] = await Promise.all([
  read('supabase/migrations/20260725234500_authority_consistency_completion.sql'),
  read('apps/os/src/components/orders/useNewOrderSubmit.ts'),
  read('apps/os/src/components/orders/NewOrderSheetController.ts'),
  read('apps/os/src/components/orders/useNewOrderPricing.ts'),
  read('apps/os/src/domain/orderAuthorizationDomain.ts'),
  read('apps/os/src/data/staffOperationsSupabaseSync.ts'),
  read('apps/os/src/data/employeePointsSupabaseSync.ts'),
  read('apps/os/src/data/shared/customerBridge.ts'),
  read('apps/os/src/data/realtimeSupabaseSync.ts'),
  read('.github/workflows/release-production.yml'),
])

for (const token of [
  'quote_internal_order',
  'get_customer_business_metrics',
  'private.current_staff_branch_id()',
  'internal_order_semantic_payload',
  'revision=revision+1',
  'create_employee_point',
  'review_employee_point',
  'reverse_employee_point',
  'attendance-selfies',
  'ORDER_QUOTE_CHANGED',
]) assert(sql.includes(token), `V3.7 migration missing ${token}`)

assert(submit.includes('quoteOrderFromForm') && submit.includes('quoteInternalOrder') && submit.includes('expectedQuote'), 'Internal Order form is not wired to a confirmation-bound server quote.')
assert(controller.includes('quoteOrderFromForm') && controller.includes('setServerQuote') && controller.includes('ORDER_QUOTE_CHANGED'), 'Internal Order review is not bound to the authoritative quote through final confirmation.')
assert(pricing.includes('serverQuote'), 'Internal Order pricing does not render authoritative quote.')
assert(authz.includes("actor.role === 'florist'"), 'Florist authorization branch is missing.')
assert(attendance.includes("ATTENDANCE_BUCKET = 'attendance-selfies'") && attendance.includes('createSignedUrl'), 'Attendance selfies are not using private Storage paths/signed URLs.')
assert(points.includes("rpc('create_employee_point'") && points.includes("rpc('review_employee_point'") && points.includes("rpc('reverse_employee_point'"), 'Employee-point UI projection is not wired to dedicated commands.')
assert(customer.includes('listBusinessMetrics') && customer.includes('authoritativeLifetimeSpendIdr') && customer.includes('refreshBusinessOsCustomerMetricsFromRemote'), 'CRM bridge does not hydrate authoritative verified-business metrics.')
assert(realtime.includes('refreshBusinessOsCustomerMetricsFromRemote') && realtime.includes('customer_id'), 'Order Realtime does not refresh CRM verified-business metrics.')
assert(workflow.includes('db lint --linked') && workflow.includes('run-supabase-smoke-tests.sh'), 'Production release does not gate deploy on live database lint + the complete SQL smoke suite.')

console.log('V3.7 authority consistency contract PASS')
