import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseAuthClient } from '../api/supabaseAuth'
import type { AlertKind, AlertSeverity } from '../domain/alertsDomain'
import type { NotificationRecord } from '../domain/notificationDomain'
import type { BranchId } from '../types/orders'
import type { NotificationItem } from '../types/notifications'
import { useNotificationStore } from '../store/notificationStore'
import { useOrderRuntimeStore, type OrderActivityEvent, type OrderActivityKind } from '../store/orderRuntimeStore'
import { useOrdersStore } from '../store/ordersStore'
import { hydrateAuthorizationFromSupabase } from './authorizationSupabaseSync'
import { hydratePayrollFromSupabase } from './payrollSupabaseSync'
import { hydrateInternalSettingsFromSupabase } from './internalSettingsSupabaseSync'
import { connectOperationalSupabase, hydrateOperationalStateFromSupabase, stopOperationalSupabaseSync } from './operationalSupabaseSync'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'
import { mergeBusinessOsCustomerFromRemote, refreshBusinessOsCustomerMetricsFromRemote } from './shared/customerBridge'
import { hydrateMyStaffOperations } from './staffOperationsSupabaseSync'
import { hydrateSecurityAuditFromSupabase } from './auditSupabaseSync'

interface StaffNotificationRow {
  id: string
  kind: string
  severity: string
  title: string
  message: string | null
  branch_id: string | null
  entity_type: string | null
  entity_id: string | null
  target: string | null
  target_id: string | null
  read_at: string | null
  created_at: string
}

interface OrderActivityRow {
  id: string
  order_id: string
  kind: string
  description: string
  actor: string
  occurred_at: string
}

const DISPLAY_KINDS = new Set<AlertKind>([
  'order_pending_verification',
  'finance_rejected',
  'admin_resubmitted',
  'order_received',
  'order_assigned',
  'order_change_requested',
  'order_change_resolved',
  'payroll_submitted',
  'payroll_rejected',
  'payroll_approved',
  'payroll_paid',
])

const DISPLAY_TARGETS = new Set<NonNullable<NotificationItem['target']>>([
  'order',
  'finance_orders',
  'finance_payroll',
  'hr_attendance',
  'hr_reports',
  'hr_payroll',
  'my_schedule',
])

const DISPLAY_SEVERITIES = new Set<AlertSeverity>(['critical', 'warning', 'info'])
const ORDER_ACTIVITY_KINDS = new Set<OrderActivityKind>([
  'created',
  'status',
  'payment',
  'assignment',
  'fulfillment',
  'note',
  'system',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let realtimeChannel: RealtimeChannel | undefined
let orderRefreshQueued = false
let rosterRefreshQueued = false

const notificationFromRow = (row: StaffNotificationRow): NotificationRecord | null => {
  if (!DISPLAY_KINDS.has(row.kind as AlertKind)) return null
  const target = row.target && DISPLAY_TARGETS.has(row.target as NonNullable<NotificationItem['target']>)
    ? row.target as NonNullable<NotificationItem['target']>
    : undefined
  const severity = DISPLAY_SEVERITIES.has(row.severity as AlertSeverity)
    ? row.severity as AlertSeverity
    : 'info'
  const orderNumber = row.entity_type === 'order' ? row.target_id ?? undefined : undefined
  return {
    id: row.id,
    kind: row.kind as AlertKind,
    severity,
    title: row.title,
    message: row.message ?? undefined,
    branch: row.branch_id as BranchId | undefined,
    orderNumber,
    target,
    targetId: row.target_id ?? undefined,
    createdAt: row.created_at,
  }
}

export const hydrateServerNotifications = async (): Promise<void> => {
  const client = getSupabaseAuthClient()
  if (!client) return
  const { data, error } = await client
    .from('staff_notifications')
    .select('id,kind,severity,title,message,branch_id,entity_type,entity_id,target,target_id,read_at,created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error

  const rows = (data ?? []) as StaffNotificationRow[]
  const records = rows.map(notificationFromRow).filter((item): item is NotificationRecord => Boolean(item))
  const readIds = rows.filter((row) => row.read_at).map((row) => row.id)
  useNotificationStore.getState().upsertServerNotifications(records, readIds)
}

export const markServerNotificationsRead = async (ids: string[]): Promise<void> => {
  const serverIds = ids.filter((id) => UUID_PATTERN.test(id))
  if (!serverIds.length) return
  const client = getSupabaseAuthClient()
  if (!client) return
  const { error } = await client.rpc('mark_notifications_read', { p_ids: serverIds })
  if (error) throw error
}

export const hydrateServerOrderActivities = async (): Promise<void> => {
  const client = getSupabaseAuthClient()
  if (!client) return
  const { data, error } = await client
    .from('order_activities')
    .select('id,order_id,kind,description,actor,occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(500)
  if (error) throw error

  const orderNumberById = new Map(
    useOrdersStore.getState().orders.map((order) => [order.id ?? order.orderNumber, order.orderNumber]),
  )
  const grouped: Record<string, OrderActivityEvent[]> = {}
  for (const row of (data ?? []) as OrderActivityRow[]) {
    const orderNumber = orderNumberById.get(row.order_id)
    if (!orderNumber || !ORDER_ACTIVITY_KINDS.has(row.kind as OrderActivityKind)) continue
    const event: OrderActivityEvent = {
      id: row.id,
      kind: row.kind as OrderActivityKind,
      description: row.description,
      actor: row.actor,
      at: row.occurred_at,
    }
    grouped[orderNumber] = [...(grouped[orderNumber] ?? []), event]
  }
  useOrderRuntimeStore.getState().upsertServerActivities(grouped)
}

const queueRosterRefresh = (): void => {
  if (rosterRefreshQueued) return
  rosterRefreshQueued = true
  queueMicrotask(() => {
    rosterRefreshQueued = false
    void hydrateMyStaffOperations().catch(() => undefined)
  })
}

const queueOrderRefresh = (): void => {
  if (orderRefreshQueued) return
  orderRefreshQueued = true
  queueMicrotask(() => {
    orderRefreshQueued = false
    void refreshBusinessOsOrdersFromRemote().then(() => hydrateServerOrderActivities()).catch(() => undefined)
  })
}

// employee_point_events and the operational-domain business_activities rows
// can each fire many times in quick succession (e.g. one HR save can touch
// several point-event rows). Without coalescing, every single row change
// triggered its own hydrateOperationalStateFromSupabase() call, and each
// hydrate re-applies the HR snapshot into the store, which can itself
// schedule another save - a feedback loop with no natural rate limit.
// Debounce so a burst of table changes results in exactly one re-hydrate.
let operationalHydrateQueued = false
let operationalHydrateTimer: ReturnType<typeof setTimeout> | undefined
const queueOperationalHydrate = (): void => {
  if (operationalHydrateQueued) return
  operationalHydrateQueued = true
  if (operationalHydrateTimer) clearTimeout(operationalHydrateTimer)
  operationalHydrateTimer = setTimeout(() => {
    operationalHydrateQueued = false
    operationalHydrateTimer = undefined
    void hydrateOperationalStateFromSupabase().catch(() => undefined)
  }, 250)
}

const refreshAuthorizationRuntime = async (): Promise<void> => {
  await hydrateAuthorizationFromSupabase()
  await hydrateInternalSettingsFromSupabase().catch(() => undefined)
  stopOperationalSupabaseSync()
  await connectOperationalSupabase()
  queueOrderRefresh()
}

export const startRealtimeSupabaseSync = (): void => {
  if (realtimeChannel) return
  const client = getSupabaseAuthClient()
  if (!client) return

  realtimeChannel = client
    .channel('fleurstales-os-v3-5')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_notifications' }, (payload) => {
      const row = payload.new as Partial<StaffNotificationRow>
      if (row.kind === 'authorization_changed') void refreshAuthorizationRuntime().catch(() => undefined)
      void hydrateServerNotifications().catch(() => undefined)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'business_activities' }, (payload) => {
      const row = payload.new as { entity_type?: string }
      if (row.entity_type === 'payroll') {
        void hydratePayrollFromSupabase().catch(() => undefined)
        queueOperationalHydrate()
      }
      if (row.entity_type === 'finance' || row.entity_type === 'hr' || row.entity_type === 'stock') {
        queueOperationalHydrate()
      }
      if (row.entity_type === 'authorization') void refreshAuthorizationRuntime().catch(() => undefined)
      if (row.entity_type === 'internal_settings') void hydrateInternalSettingsFromSupabase().catch(() => undefined)
      void hydrateSecurityAuditFromSupabase().catch(() => undefined)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
      const row = ((payload.new && Object.keys(payload.new).length ? payload.new : payload.old) ?? {}) as { id?: string }
      if (row.id) void mergeBusinessOsCustomerFromRemote(row.id).catch(() => undefined)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_schedule_defaults' }, queueRosterRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_schedule_overrides' }, queueRosterRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_attendance_records' }, queueRosterRefresh)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_roster_refresh_events' }, queueRosterRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_point_events' }, () => {
      queueOperationalHydrate()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
      queueOrderRefresh()
      const row = ((payload.new && Object.keys(payload.new).length ? payload.new : payload.old) ?? {}) as { customer_id?: string | null }
      if (row.customer_id) void refreshBusinessOsCustomerMetricsFromRemote(row.customer_id).catch(() => undefined)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_activities' }, () => {
      void hydrateServerOrderActivities().catch(() => undefined)
    })
    .subscribe()
}

export const stopRealtimeSupabaseSync = (): void => {
  const client = getSupabaseAuthClient()
  const channel = realtimeChannel
  realtimeChannel = undefined
  if (client && channel) void client.removeChannel(channel)
}

export const connectRealtimeSupabase = async (): Promise<void> => {
  await Promise.allSettled([
    hydrateServerNotifications(),
    hydrateServerOrderActivities(),
  ])
  startRealtimeSupabaseSync()
}
