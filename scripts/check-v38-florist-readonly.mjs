#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => readFile(path.join(root, p), 'utf8')
const assert = (value, message) => { if (!value) throw new Error(message) }

const [sql, permissions, osAuthz, storefrontAuthz, smoke] = await Promise.all([
  read('supabase/migrations/20260725235500_florist_order_read_only.sql'),
  read('apps/os/src/config/actionPermissions.ts'),
  read('apps/os/src/domain/orderAuthorizationDomain.ts'),
  read('apps/storefront/src/domain/orderAuthorizationDomain.ts'),
  read('supabase/tests/v38_florist_order_read_only_smoke.sql'),
])

for (const token of [
  "array['owner','admin']::text[]",
  "role = 'florist'",
  "capability = 'orders.advance_status'",
  'FLORIST_ORDER_READ_ONLY',
  'save_order_operational_state_v37_internal',
]) assert(sql.includes(token), `V3.8 migration missing ${token}`)

assert(permissions.includes("'orders.advance_status': ['owner','admin']"), 'Florist remains eligible for the status capability in OS settings.')
assert(!permissions.includes("'orders.advance_status': ['owner','admin','florist']"), 'Legacy Florist status eligibility remains in OS settings.')

for (const [name, authz] of [['OS', osAuthz], ['Storefront mirror', storefrontAuthz]]) {
  assert(authz.includes("Florists can view assigned work but cannot change order status."), `${name} does not explicitly deny Florist status mutations.`)
  assert(!authz.includes('Florists can update only assigned production work through Processing and Ready.'), `${name} still contains the old Florist transition allowance.`)
}

assert(smoke.includes('FLORIST_ORDER_READ_ONLY') && smoke.includes('has_function_privilege'), 'V3.8 live smoke does not verify the public/internal RPC boundary.')

console.log('V3.8 Florist Order read-only contract PASS')
