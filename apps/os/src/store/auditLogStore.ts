/**
 * @file auditLogStore.ts
 * @description Append-only, persisted audit records for sensitive commands.
 * This remains a client-side demo; production must write the same shape on
 * the server in the same transaction as the business mutation.
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { apiStorage, subscribeToExternalUpdates } from './persistApiStorage'
import type { UserRole } from './userStore'
import { generateId } from '../lib/id'

export type AuditOutcome = 'succeeded' | 'denied' | 'conflict'

export interface AuditActor {
  employeeId: string
  name: string
  role: UserRole
}

export interface AuditEvent {
  id: string
  entityType: 'order' | 'system'
  entityId: string
  entityLabel?: string
  action: string
  outcome: AuditOutcome
  actor: AuditActor
  occurredAt: string
  reason?: string
  previousRevision?: number
  nextRevision?: number
  metadata?: Record<string, unknown>
}

interface AuditLogState {
  events: AuditEvent[]
  append: (event: Omit<AuditEvent, 'id' | 'occurredAt'>) => AuditEvent
  clear: () => void
}

const AUDIT_PERSIST_NAME = 'audit-log'
const MAX_LOCAL_AUDIT_EVENTS = 5000

export const useAuditLogStore = create<AuditLogState>()(
  persist(
    (set) => ({
      events: [],
      append: (event) => {
        const record: AuditEvent = {
          ...event,
          id: generateId('audit'),
          occurredAt: new Date().toISOString(),
        }
        set((state) => ({
          events: [record, ...state.events].slice(0, MAX_LOCAL_AUDIT_EVENTS),
        }))
        return record
      },
      clear: () => set({ events: [] }),
    }),
    {
      name: AUDIT_PERSIST_NAME,
      storage: createJSONStorage(() => apiStorage),
      partialize: (state) => ({ events: state.events }) as AuditLogState,
    },
  ),
)

subscribeToExternalUpdates(AUDIT_PERSIST_NAME, useAuditLogStore)
