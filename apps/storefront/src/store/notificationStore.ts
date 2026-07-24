import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AlertItem } from '../domain/alertsDomain'
import type { NotificationRecord } from '../domain/notificationDomain'
import { apiStorage } from './persistApiStorage'

interface NotificationStoreState {
  notifications: NotificationRecord[]
  readIds: string[]
  syncAlerts: (alerts: AlertItem[]) => void
  markRead: (ids: string[]) => void
}

export const useNotificationStore = create<NotificationStoreState>()(
  persist(
    (set) => ({
      notifications: [],
      readIds: [],
      syncAlerts: (alerts) =>
        set((state) => {
          const previousById = new Map(
            state.notifications.map((notification) => [
              notification.id,
              notification,
            ]),
          )
          const now = new Date().toISOString()
          const updates = alerts.map((alert) => ({
            ...alert,
            createdAt: previousById.get(alert.id)?.createdAt ?? now,
          }))
          const updateIds = new Set(updates.map((item) => item.id))
          return {
            notifications: [
              ...updates,
              ...state.notifications.filter((item) => !updateIds.has(item.id)),
            ],
          }
        }),
      markRead: (ids) =>
        set((state) => ({
          readIds: Array.from(new Set([...state.readIds, ...ids])),
        })),
    }),
    {
      name: 'notifications',
      storage: createJSONStorage(() => apiStorage),
    },
  ),
)
