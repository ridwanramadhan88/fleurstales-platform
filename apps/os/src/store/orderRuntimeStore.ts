/**
 * @file orderRuntimeStore.ts
 * @description Persisted order activity history. Business fields are never
 * patched here; editable order data belongs exclusively to ordersStore.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { apiStorage, subscribeToExternalUpdates } from './persistApiStorage'

export type OrderActivityKind =
  | 'created'
  | 'status'
  | 'payment'
  | 'assignment'
  | 'fulfillment'
  | 'note'
  | 'system'

export interface OrderActivityEvent {
  id: string
  kind: OrderActivityKind
  description: string
  at: string
  actor: string
}

interface OrderRuntimeState {
  /** Per-order durable activity timeline entries, newest first. */
  activities: Record<string, OrderActivityEvent[]>
  addActivity: (
    orderNumber: string,
    event: Omit<OrderActivityEvent, 'id' | 'at'>,
  ) => void
  upsertServerActivities: (activities: Record<string, OrderActivityEvent[]>) => void
  clearActivities: () => void
}

const ORDER_ACTIVITY_PERSIST_NAME = 'order-activities'

export const useOrderRuntimeStore = create<OrderRuntimeState>()(
  persist(
    (set) => ({
      activities: {},
      addActivity: (orderNumber, event) => {
        const id = `${orderNumber}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 7)}`
        const nowIso = new Date().toISOString()

        set((state) => ({
          activities: {
            ...state.activities,
            [orderNumber]: [
              { id, at: nowIso, ...event },
              ...(state.activities[orderNumber] ?? []),
            ],
          },
        }))
      },
      upsertServerActivities: (incoming) =>
        set((state) => {
          const next = { ...state.activities }
          for (const [orderNumber, events] of Object.entries(incoming)) {
            const byId = new Map((next[orderNumber] ?? []).map((event) => [event.id, event]))
            for (const event of events) byId.set(event.id, event)
            next[orderNumber] = Array.from(byId.values()).sort((a, b) => b.at.localeCompare(a.at))
          }
          return { activities: next }
        }),
      clearActivities: () => set({ activities: {} }),
    }),
    {
      name: ORDER_ACTIVITY_PERSIST_NAME,
      storage: createJSONStorage(() => apiStorage),
      partialize: (state) => ({ activities: state.activities }) as OrderRuntimeState,
    },
  ),
)

subscribeToExternalUpdates(ORDER_ACTIVITY_PERSIST_NAME, useOrderRuntimeStore)
