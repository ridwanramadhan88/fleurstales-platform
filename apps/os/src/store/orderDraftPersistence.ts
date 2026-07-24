/**
 * @file orderDraftPersistence.ts
 * @description Storage boundary for New Order drafts. Kept outside the UI
 * component so backup/restore/reset can include drafts without reaching into
 * component internals.
 */

export const ORDER_DRAFTS_STORAGE_KEY = 'fleurstales_order_drafts_v1'
export const ORDER_DRAFTS_CHANGED_EVENT = 'fleurstales-order-drafts-changed'

export const readOrderDraftRecords = <T>(): T[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ORDER_DRAFTS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export const writeOrderDraftRecords = <T>(drafts: T[]): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ORDER_DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
  window.dispatchEvent(new Event(ORDER_DRAFTS_CHANGED_EVENT))
}

export const clearOrderDraftRecords = (): void => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ORDER_DRAFTS_STORAGE_KEY)
  window.dispatchEvent(new Event(ORDER_DRAFTS_CHANGED_EVENT))
}
