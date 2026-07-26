import { readFileSync, existsSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')
const requireText = (path, needles) => {
  if (!existsSync(path)) throw new Error(`Missing ${path}`)
  const source = read(path)
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${path} is missing required V3.11 marker: ${needle}`)
  }
  return source
}
const forbidText = (path, needles) => {
  const source = read(path)
  for (const needle of needles) {
    if (source.includes(needle)) throw new Error(`${path} still contains forbidden V3.11 pattern: ${needle}`)
  }
}

requireText('apps/os/src/components/customers/CustomerProfileDrawer.tsx', ['side="responsiveRight"', 'size="wide"'])
requireText('apps/os/src/components/ui/sheet.tsx', ['responsiveRight:'])
requireText('apps/os/src/components/ui/app-confirm.ts', ['max-w-lg'])
forbidText('apps/os/src/components/ui/app-confirm.ts', ['max-w-2xl'])

requireText('apps/os/src/domain/staffCredentialDomain.ts', ['STAFF_PASSWORD_MIN_LENGTH = 6', 'isStrongStaffPassword'])
requireText('supabase/config.toml', ['minimum_password_length = 6', 'password_requirements = "lower_upper_letters_digits"'])
requireText('supabase/functions/staff-login/index.ts', ['service_consume_staff_login_attempt', 'MIN_PRODUCTION_PASSWORD_LENGTH = 6', 'MAX_BODY_BYTES = 4096'])
requireText('supabase/functions/staff-admin/index.ts', ['service_create_staff_access_profile', 'service_update_staff_access_email', 'isStrongPassword'])
forbidText('supabase/functions/staff-admin/index.ts', [".from('staff_access_profiles').update(", ".from('staff_access_profiles').upsert(", ".from('staff_access_profiles').insert(", ".from('staff_access_profiles').delete("])

const migration = requireText('supabase/migrations/20260726090000_v311_production_hardening.sql', [
  'revoke insert, update, delete on table public.staff_access_profiles from authenticated',
  'drop policy if exists attendance_selfies_delete',
  'attendance_selfie_object_is_valid',
  'staff_roster_refresh_events',
  'current_staff_branch_id()',
  "private.has_action_permission('hr.review_attendance')",
  'service_consume_staff_login_attempt',
  'extensions.digest(v_username',
  "extensions.digest(lower(trim(coalesce(p_username,'')))",
])
if (!migration.includes("grant execute on function public.service_create_staff_access_profile") || !migration.includes('to service_role')) {
  throw new Error('V3.11 migration does not keep staff profile service RPCs service-role-only.')
}

requireText('apps/os/src/data/realtimeSupabaseSync.ts', ["table: 'staff_roster_refresh_events'", 'queueRosterRefresh'])
requireText('supabase/tests/v311_production_hardening_smoke.sql', ['Attendance selfie evidence is still deletable', 'current_staff_branch_id', 'hr.review_attendance'])
requireText('scripts/run-supabase-smoke-tests.sh', ["find supabase/tests", "-name '*.sql'"])
requireText('.github/workflows/release-production.yml', ['database-preflight', 'run-supabase-smoke-tests.sh'])
requireText('.github/workflows/release-staging.yml', ['Release staging', 'run-supabase-smoke-tests.sh'])

console.log('V3.11 focused hardening static checks passed.')
