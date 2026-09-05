#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative) => readFile(path.join(root, relative), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

// This contract intentionally runs in global CI before production release.
const [
  middleware,
  storefrontPackage,
  mediaBootstrap,
  conflictGuard,
  orderBridge,
  realtimeSync,
] = await Promise.all([
  read('apps/storefront/middleware.ts'),
  read('apps/storefront/package.json'),
  read('supabase/migrations/20260906010000_order_lifecycle_photos.sql'),
  read('supabase/migrations/20260906023000_revision_conflict_cpu_guard.sql'),
  read('apps/os/src/data/shared/orderBridge.ts'),
  read('apps/os/src/data/realtimeSupabaseSync.ts'),
])

// Vercel's current framework-agnostic Routing Middleware helper lives in
// @vercel/functions. Keep the deprecated edge package out of the release.
assert(
  middleware.includes("from '@vercel/functions'"),
  'Storefront Routing Middleware must use @vercel/functions.',
)
assert(
  !middleware.includes("from '@vercel/edge'"),
  'Storefront Routing Middleware still imports deprecated @vercel/edge.',
)
const packageJson = JSON.parse(storefrontPackage)
assert(
  packageJson.dependencies?.['@vercel/functions'],
  'Storefront must depend on @vercel/functions.',
)
assert(
  !packageJson.dependencies?.['@vercel/edge'],
  'Storefront must not ship @vercel/edge.',
)

// Payment proofs are Finance-only evidence. The very first migration that
// creates the bucket must be private so an interrupted migration sequence
// cannot expose evidence before the later RLS hardening migration runs.
assert(
  /values\s*\(\s*'order-payment-proofs'\s*,\s*'order-payment-proofs'\s*,\s*false\b/is.test(mediaBootstrap),
  'Payment-proof Storage bucket must be private from its bootstrap migration.',
)
assert(
  !/values\s*\(\s*'order-payment-proofs'\s*,\s*'order-payment-proofs'\s*,\s*true\b/is.test(mediaBootstrap),
  'Payment-proof bootstrap migration must never create a public bucket.',
)

// Stale revision requests must fail before the expensive HR projection and
// before an Order writer waits on the authoritative row lock. Inner writers
// retain their own locked checks for race safety.
const hrPreflight = conflictGuard.indexOf('select revision, snapshot, updated_at')
const hrWriter = conflictGuard.indexOf('v_result := public.save_hr_operational_state_unchecked')
assert(hrPreflight >= 0 && hrWriter > hrPreflight, 'HR conflict fast-fail must run before the expensive HR writer.')

const orderPreflight = conflictGuard.indexOf('select branch_id, revision')
const orderWriter = conflictGuard.indexOf('v_result := public.save_order_operational_state_unchecked')
assert(orderPreflight >= 0 && orderWriter > orderPreflight, 'Order conflict fast-fail must run before the locked Order writer.')
assert(
  conflictGuard.includes("v_profile.role='admin'") && conflictGuard.includes('private.current_staff_branch_id()'),
  'Order conflict fast-fail must preserve the Admin runtime-branch boundary.',
)

// Remote Order hydration must unsubscribe the previous local-mutation bridge
// before replacing Zustand state. Otherwise newer server revisions are seen by
// the stale bridge as local edits and immediately written back with old
// expected revisions, producing the same-second conflict fan-out seen in prod.
const stopOldBridge = orderBridge.indexOf('stopBusinessOsOrderBridge()')
const applyRemoteOrders = orderBridge.indexOf('useOrdersStore.setState')
assert(
  stopOldBridge >= 0 && applyRemoteOrders > stopOldBridge,
  'Order refresh must stop the stale mutation bridge before applying remote state.',
)

// Realtime bursts should collapse to trailing refreshes instead of one full
// Order/audit hydration per row event.
assert(
  realtimeSync.includes('let orderRefreshTimer:') && realtimeSync.includes('}, 150)'),
  'Order Realtime refresh must remain debounced.',
)
assert(
  realtimeSync.includes('const queueAuditRefresh') && realtimeSync.includes('}, 500)'),
  'Owner audit Realtime refresh must remain debounced.',
)
assert(
  realtimeSync.includes('queueAuditRefresh()'),
  'Business activity events must enqueue, not directly fan out, audit hydration.',
)

console.log('Release safety contracts passed.')
