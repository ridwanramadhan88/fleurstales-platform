import { useHrStore } from '../store/hrStore'
import type { EmployeePointEntry } from '../store/hrStoreTypes'
import { useUserStore } from '../store/userStore'
import { bootstrapSharedData } from './shared/bootstrap'
import type { Json } from './shared/databaseTypes'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'
import {
  acknowledgeHrPointProjection,
  beginHrPointMutation,
  endHrPointMutation,
} from './operationalSupabaseSync'

interface HrDomainResponse {
  revision: number
  snapshot: Json
}

let stopSubscription: (() => void) | undefined
let applyingRemote = false
let baseline = new Map<string, EmployeePointEntry>()
let queue: Promise<void> = Promise.resolve()

const client = () => bootstrapSharedData(browserSupabaseTokenProvider)
const snapshotMap = (): Map<string, EmployeePointEntry> =>
  new Map(useHrStore.getState().employeePointEntries.map((entry) => [entry.id, { ...entry }]))

export const refreshEmployeePointsFromSupabase = async (): Promise<void> => {
  const boot = client()
  if (!boot.enabled || !getSupabaseBrowserSession()) return
  const response = await boot.repositories.client.rpc<HrDomainResponse>('get_operational_domain_state', { p_domain: 'hr' })
  const snapshot = response.snapshot && typeof response.snapshot === 'object' && !Array.isArray(response.snapshot)
    ? response.snapshot as Record<string, Json>
    : {}
  const entries = Array.isArray(snapshot.employeePointEntries)
    ? snapshot.employeePointEntries as unknown as EmployeePointEntry[]
    : []

  // Update the generic HR writer's revision/baseline before Zustand notifies
  // its broad HR subscription. This prevents a points-only Realtime refresh
  // from being mistaken for a new full HR edit.
  acknowledgeHrPointProjection(response.revision, entries as unknown as Json)

  applyingRemote = true
  try {
    useHrStore.setState({ employeePointEntries: entries })
    baseline = new Map(entries.map((entry) => [entry.id, { ...entry }]))
  } finally {
    applyingRemote = false
  }
}

const persistChanges = async (): Promise<void> => {
  if (applyingRemote || !getSupabaseBrowserSession()) return
  const role = useUserStore.getState().role
  if (role !== 'owner' && role !== 'hr') return
  const boot = client()
  if (!boot.enabled) return
  const current = snapshotMap()
  const commands: Array<() => Promise<unknown>> = []

  for (const [id, entry] of current) {
    const previous = baseline.get(id)
    if (!previous) {
      if (entry.sourceType === 'manual' || entry.sourceType === 'attendance_review') {
        commands.push(() => boot.repositories.client.rpc('create_employee_point', { p_entry: entry as unknown as Json }))
      }
      continue
    }
    if (entry.status === previous.status) continue
    if (previous.status === 'pending' && (entry.status === 'approved' || entry.status === 'rejected')) {
      commands.push(() => boot.repositories.client.rpc('review_employee_point', {
        p_entry_id: id,
        p_decision: entry.status,
        p_note: entry.reviewNote ?? null,
      }))
    } else if (previous.status === 'approved' && entry.status === 'reversed') {
      commands.push(() => boot.repositories.client.rpc('reverse_employee_point', {
        p_entry_id: id,
        p_reason: entry.reviewNote ?? 'Point entry reversed in Business OS.',
      }))
    }
  }

  if (!commands.length) {
    baseline = current
    return
  }
  // Capture the optimistic state immediately so a second Zustand notification
  // cannot enqueue the same business command while the first is in flight.
  baseline = current
  await beginHrPointMutation()
  try {
    for (const command of commands) await command()
    await refreshEmployeePointsFromSupabase()
  } catch (error) {
    console.error('Unable to synchronize employee point command.', error)
    await refreshEmployeePointsFromSupabase().catch(() => undefined)
  } finally {
    endHrPointMutation()
  }
}

const schedule = (): void => {
  queue = queue.then(persistChanges).catch((error) => {
    console.error('Employee point synchronization failed.', error)
  })
}

export const connectEmployeePointsSupabase = async (): Promise<boolean> => {
  if (!getSupabaseBrowserSession()) return false
  const role = useUserStore.getState().role
  if (role !== 'owner' && role !== 'hr') return true
  await refreshEmployeePointsFromSupabase()
  stopSubscription?.()
  stopSubscription = useHrStore.subscribe(() => {
    if (!applyingRemote) schedule()
  })
  return true
}

export const stopEmployeePointsSupabase = (): void => {
  stopSubscription?.()
  stopSubscription = undefined
  baseline = new Map()
  queue = Promise.resolve()
}
