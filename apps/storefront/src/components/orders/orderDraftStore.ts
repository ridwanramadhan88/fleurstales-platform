import { useSyncExternalStore } from 'react'
import type { NewOrderFormValues } from './useNewOrderForm'
import type { BranchFilter } from '../../types/orders'
import {
  ORDER_DRAFTS_CHANGED_EVENT,
  ORDER_DRAFTS_STORAGE_KEY,
  readOrderDraftRecords,
  writeOrderDraftRecords,
} from '../../store/orderDraftPersistence'

export interface SavedOrderDraft {
  id: string
  branch: BranchFilter
  values: NewOrderFormValues
  createdAt: string
  updatedAt: string
}

const readDrafts = (): SavedOrderDraft[] =>
  readOrderDraftRecords<SavedOrderDraft>()

let cachedRaw: string | null | undefined
let cachedDrafts: SavedOrderDraft[] = []
const getSnapshot = (): SavedOrderDraft[] => {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(ORDER_DRAFTS_STORAGE_KEY)
  if (raw === cachedRaw) return cachedDrafts
  cachedRaw = raw
  cachedDrafts = readDrafts()
  return cachedDrafts
}
const getServerSnapshot = (): SavedOrderDraft[] => []

const writeDrafts = (drafts: SavedOrderDraft[]) => {
  writeOrderDraftRecords(drafts)
  cachedRaw = undefined
}

export const saveOrderDraft = ({
  id,
  branch,
  values,
}: {
  id?: string | null
  branch: BranchFilter
  values: NewOrderFormValues
}): SavedOrderDraft => {
  const drafts = readDrafts()
  const now = new Date().toISOString()
  const existing = id ? drafts.find((draft) => draft.id === id) : undefined
  const saved: SavedOrderDraft = {
    id: existing?.id ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    branch,
    values,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  writeDrafts([saved, ...drafts.filter((draft) => draft.id !== saved.id)])
  return saved
}

export const getOrderDraft = (id: string | null | undefined): SavedOrderDraft | null =>
  id ? readDrafts().find((draft) => draft.id === id) ?? null : null

export const deleteOrderDraft = (id: string) => {
  writeDrafts(readDrafts().filter((draft) => draft.id !== id))
}

export const useOrderDrafts = (): SavedOrderDraft[] =>
  useSyncExternalStore(
    (listener) => {
      window.addEventListener(ORDER_DRAFTS_CHANGED_EVENT, listener)
      window.addEventListener('storage', listener)
      return () => {
        window.removeEventListener(ORDER_DRAFTS_CHANGED_EVENT, listener)
        window.removeEventListener('storage', listener)
      }
    },
    getSnapshot,
    getServerSnapshot,
  )
