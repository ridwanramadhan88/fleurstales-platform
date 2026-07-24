import { create } from 'zustand'

export type PersistenceHealthStatus = 'idle' | 'saved' | 'saving' | 'error' | 'conflict'

export interface PersistenceHealthState {
  status: PersistenceHealthStatus
  lastSavedAt?: string
  schemaVersion: number
  revision: number
  message?: string
  storageBytes: number
  setHealth: (partial: PersistenceHealthPatch) => void
}

export type PersistenceHealthPatch = Partial<Omit<PersistenceHealthState, 'setHealth'>>

export const usePersistenceHealthStore = create<PersistenceHealthState>((set) => ({
  status: 'idle',
  schemaVersion: 6,
  revision: 0,
  storageBytes: 0,
  setHealth: (partial) => set(partial),
}))
