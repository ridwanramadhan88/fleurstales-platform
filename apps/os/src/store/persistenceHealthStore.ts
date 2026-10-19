import { create } from 'zustand'

export type PersistenceHealthStatus = 'idle' | 'saved' | 'saving' | 'error' | 'conflict'

export type PersistenceHealthReason =
  | 'conflict'
  | 'conflict_locked'
  | 'finance_server_owned'
  | 'finance_delete_blocked'
  | 'save_failed'

export interface PersistenceHealthState {
  /** Operational data section the current problem belongs to (hr, finance, stock, ...). */
  domain?: string
  reason?: PersistenceHealthReason
  status: PersistenceHealthStatus
  lastSavedAt?: string
  schemaVersion: number
  revision: number
  message?: string
  storageBytes: number
  setHealth: (partial: PersistenceHealthPatch) => void
  /** Clears any problem notice, e.g. when the staff session changes. */
  resetHealth: () => void
}

export type PersistenceHealthPatch = Partial<Omit<PersistenceHealthState, 'setHealth'>>

export const usePersistenceHealthStore = create<PersistenceHealthState>((set) => ({
  status: 'idle',
  schemaVersion: 6,
  revision: 0,
  storageBytes: 0,
  setHealth: (partial) => set(partial),
  resetHealth: () => set({ status: 'idle', domain: undefined, reason: undefined, message: undefined }),
}))
