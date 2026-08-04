#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (value) => readFile(path.join(root, value), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const [
  card,
  statusDomain,
  store,
  reviewQueue,
  controller,
  payroll,
  realtime,
  migration,
  smoke,
] = await Promise.all([
  read('apps/os/src/components/hr/SelfieAttendanceCard.tsx'),
  read('apps/os/src/domain/hrStatusDomain.ts'),
  read('apps/os/src/store/hrStore.ts'),
  read('apps/os/src/components/hr/AttendanceReviewQueue.tsx'),
  read('apps/os/src/components/hr/HrTabContentController.ts'),
  read('apps/os/src/components/hr/HrPayrollSection.tsx'),
  read('apps/os/src/data/realtimeSupabaseSync.ts'),
  read('supabase/migrations/20260804152500_simplify_attendance_flow.sql'),
  read('supabase/tests/v314_attendance_simplification_smoke.sql'),
])

assert(!card.includes('continueWithLocationReview'), 'Failed-GPS attendance bypass still exists.')
assert(!card.includes('Continue for HR review'), 'Failed-GPS bypass button still exists.')
assert(card.includes('A dated working schedule is required before check-in.'), 'Missing dated-schedule guidance.')
assert(statusDomain.includes('scheduledEndTime?: string'), 'Checkout validation is not schedule-based.')
assert(statusDomain.includes('checkoutWindowMinutes: number'), 'Configured checkout window is not enforced.')
assert(store.includes("effectiveSchedule.source !== 'override'"), 'Self attendance still accepts schedule fallback.')
assert(store.includes('corrections: ['), 'Attendance corrections are not append-only.')
assert(store.includes("!['resolved','corrected'].includes(decision)"), 'Attendance review still supports complex decisions.')
assert(store.includes("reviewCaseId") && store.includes("status: 'corrected' as const"), 'Attendance correction and review are not committed atomically.')
assert(!reviewQueue.includes('Record as Problem'), 'Problem escalation remains in attendance review.')
assert(reviewQueue.includes('Confirm record') && reviewQueue.includes('Correct attendance'), 'Confirm/correct review actions are missing.')
assert(reviewQueue.includes("item.status === 'pending' || item.status === 'problem'"), 'Legacy unresolved attendance problems can become a dead end.')
assert(controller.includes('Add a reason for this manual attendance record or correction.'), 'Manual attendance reason is not required.')
assert(payroll.includes("label: 'Attendance reviewed', severity:'blocker'"), 'Unresolved attendance does not block payroll.')
assert(realtime.includes('queueRosterRefresh()') && realtime.includes('queueOperationalHydrate()'), 'Attendance Realtime does not refresh roster and HR state.')
for (const token of [
  'DATED_ATTENDANCE_SCHEDULE_REQUIRED',
  'CHECKOUT_NOT_YET_AVAILABLE',
  'v_minutes_until_end',
  'ATTENDANCE_SELF_SERVICE_RECORD_SERVER_OWNED',
  "'selfieDataUrl',ar.record->'selfieDataUrl'",
  "'checkInLocation',ar.record->'checkInLocation'",
  "'checkOutLocation',ar.record->'checkOutLocation'",
  'grant execute on function public.save_my_attendance_record(jsonb) to authenticated',
  'grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated',
]) {
  assert(migration.includes(token), `Attendance migration missing ${token}.`)
}

for (const token of [
  'Self-attendance RPC grants are incorrect',
  'v_minutes_until_end',
  'save_my_attendance_record_v310_internal',
  'save_hr_operational_state_v36_internal',
]) {
  assert(smoke.includes(token), `Attendance SQL smoke test missing ${token}.`)
}

console.log('Attendance simplification contract PASS')
