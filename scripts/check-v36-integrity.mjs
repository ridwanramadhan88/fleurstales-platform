#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => readFile(path.join(root, p), 'utf8')
const assert = (value, message) => { if (!value) throw new Error(message) }
const [sql, submit, pricing, structure, attendance, customer, images, repos, app, user, realtime] = await Promise.all([
  read('supabase/migrations/20260725233000_integrity_concurrency_completion.sql'),
  read('apps/os/src/components/orders/useNewOrderSubmit.ts'),
  read('apps/os/src/components/orders/useNewOrderPricing.ts'),
  read('apps/os/src/components/orders/NewOrderStructureSection.tsx'),
  read('apps/os/src/data/staffOperationsSupabaseSync.ts'),
  read('apps/os/src/data/shared/customerBridge.ts'),
  read('apps/os/src/domain/catalogImageDomain.ts'),
  read('apps/os/src/data/shared/repositories.ts'),
  read('apps/os/src/App.tsx'),
  read('apps/os/src/store/userStore.ts'),
  read('apps/os/src/data/realtimeSupabaseSync.ts'),
])
for (const token of [
  'idempotency_request_hash', 'IDEMPOTENCY_KEY_REUSED', 'private.jsonb_request_hash',
  'create_storefront_order_v35_internal', 'create_storefront_order_v34_internal',
  'create_internal_order_v35_internal', 'PARTIAL_PAYMENT_REQUIRES_DEPOSIT',
  'private.customer_voucher_metrics', 'finance_verified=true',
  'private.geo_distance_meters', 'OUTSIDE_ATTENDANCE_RADIUS',
  'employee_point_events_source', 'save_hr_operational_state_v35_internal',
  'private.employee_point_event_json', 'pg_advisory_xact_lock',
]) assert(sql.includes(token), `V3.6 migration missing ${token}`)
assert((sql.match(/pg_advisory_xact_lock/g) ?? []).length >= 2, 'Storefront and internal Order idempotency are not transaction-serialized.')
assert(sql.includes('v_result:=public.create_storefront_order_v34_internal'), 'Storefront checkout still passes through the unsafe V3.5 dedupe wrapper.')
assert(sql.includes("v_canonical_snapshot:=jsonb_set(v_canonical_snapshot,'{employeePointEntries}'"), 'Employee points are not rebuilt from the normalized authority.')
assert(sql.includes("'id','att-'||replace(gen_random_uuid()::text"), 'Attendance IDs are still browser-controlled.')
assert(sql.includes('partition by recipient_user_id,kind,entity_id,title'), 'Notification deduplication does not use the staff_notifications recipient column.')
assert(!sql.includes('partition by user_id,kind,entity_id,title'), 'Notification deduplication references the nonexistent staff_notifications.user_id column.')
assert(submit.includes('authoritativeDeliveryFeeIdr'), 'Internal Order submission does not use authoritative branch fee.')
assert(pricing.includes('authoritativeDeliveryFeeIdr'), 'Internal Order review is not using authoritative branch fee.')
assert(structure.includes('Set in Store Settings for this branch.'), 'Delivery fee is not visibly server-configured/read-only.')
assert(attendance.includes("rpc<{ record: AttendanceRecord }>('save_my_attendance_record'"), 'Attendance does not apply the server-derived record.')
assert(customer.includes('mergeCustomer') && customer.includes('customer-sync-conflict') && customer.includes('scheduleRetry'), 'CRM conflict/retry protection is missing.')
assert(images.includes('contentVersion') && images.includes('hashText(image.url)'), 'Catalog images do not use immutable content-versioned paths.')
assert(repos.includes('upsert: false'), 'Catalog image uploads still overwrite active objects.')
assert(app.includes('stopAllProductionBridges') && app.includes('await resetSession()'), 'Failed startup does not clean up the authenticated session.')
assert(user.includes('clearSession'), 'User session reset action is missing.')
assert(realtime.includes("table: 'employee_point_events'"), 'Point-event Realtime hydration is missing.')
console.log('V3.6 integrity/concurrency contract PASS')
