import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const requireText = (file, values) => {
  const text = read(file)
  for (const value of values) {
    if (!text.includes(value)) throw new Error(`${file} missing: ${value}`)
  }
}

requireText('src/data/shared/staffSessionDomain.ts', [
  "'local_demo'", "'legacy_shared_backend'", "'supabase'", 'canSharedSession', 'buildSupabaseStaffSession',
])
requireText('src/data/shared/supabaseSession.ts', [
  'SupabaseBrowserSession', 'setSupabaseBrowserSession', 'browserSupabaseTokenProvider',
])
requireText('src/data/shared/realtimeContracts.ts', [
  "'catalog'", "'store'", "'customers'", "'orders'", 'SharedRealtimeClient', 'SHARED_REALTIME_TABLE_DOMAIN',
  "customers: 'customers'", "orders: 'orders'", "order_activities: 'orders'",
])
requireText('src/data/shared/realtimeLocalAdapter.ts', ['BroadcastChannel', 'fleurstales.shared-realtime.v1'])
requireText('src/core/realtime/sharedBackend.ts', ['@deprecated Phase 9'])
requireText('src/data/shared/repositories.ts', ['createStaffAccessRepository', 'get_current_staff_access_profile'])
requireText('src/data/shared/bootstrap.ts', ['staffAccess: StaffAccessRepository', 'createStaffAccessRepository(client)'])
requireText('supabase/migrations/20260724164011_auth_realtime_contract.sql', [
  'idx_staff_access_profiles_employee_unique', 'get_current_staff_access_profile', 'staff_access_profiles', 'supabase_realtime',
])
console.log('Phase 9 auth/realtime contract check PASS')
