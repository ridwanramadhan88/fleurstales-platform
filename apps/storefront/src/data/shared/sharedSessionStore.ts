import type { SharedSession, SharedStaffSession } from './staffSessionDomain'
import { anonymousSharedSession } from './staffSessionDomain'

let currentSession: SharedSession = anonymousSharedSession()
const listeners = new Set<(session: SharedSession) => void>()

export const getSharedSession = (): SharedSession => currentSession

export const setSharedSession = (session: SharedSession): void => {
  currentSession = session
  for (const listener of listeners) listener(currentSession)
}

export const setSharedStaffSession = (session: SharedStaffSession): void => setSharedSession(session)
export const clearSharedSession = (): void => setSharedSession(anonymousSharedSession())

export const subscribeSharedSession = (listener: (session: SharedSession) => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
