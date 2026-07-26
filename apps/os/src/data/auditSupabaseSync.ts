import { useAuditLogStore, type AuditEvent, type AuditOutcome } from '../store/auditLogStore'
import type { UserRole } from '../store/userStore'
import { useUserStore } from '../store/userStore'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'

interface SecurityAuditRow {
  id: string
  actor_employee_id?: string | null
  actor_name: string
  actor_role: string
  action: string
  entity_type: string
  entity_id: string
  outcome: string
  previous_revision?: number | null
  next_revision?: number | null
  metadata?: Record<string, unknown> | null
  occurred_at: string
}

const ROLES = new Set<UserRole>(['owner', 'admin', 'finance', 'hr', 'florist'])
const OUTCOMES = new Set<AuditOutcome>(['succeeded', 'denied', 'conflict'])

const mapAuditEvent = (row: SecurityAuditRow): AuditEvent => ({
  id: row.id,
  entityType: row.entity_type === 'order' ? 'order' : 'system',
  entityId: row.entity_id,
  entityLabel: row.entity_type,
  action: row.action,
  outcome: OUTCOMES.has(row.outcome as AuditOutcome) ? row.outcome as AuditOutcome : 'succeeded',
  actor: {
    employeeId: row.actor_employee_id ?? '',
    name: row.actor_name,
    role: ROLES.has(row.actor_role as UserRole) ? row.actor_role as UserRole : 'owner',
  },
  occurredAt: row.occurred_at,
  previousRevision: row.previous_revision ?? undefined,
  nextRevision: row.next_revision ?? undefined,
  metadata: row.metadata ?? undefined,
})

/** Owner-only authoritative audit hydration. Local command audit remains demo-only. */
export const hydrateSecurityAuditFromSupabase = async (): Promise<boolean> => {
  if (useUserStore.getState().role !== 'owner' || !getSupabaseBrowserSession()) return false
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return false
  const rows = await shared.repositories.client.rpc<SecurityAuditRow[]>('list_security_audit_events', { p_limit: 1000 })
  useAuditLogStore.setState({ events: rows.map(mapAuditEvent) })
  return true
}
