import { describe, expect, it } from 'vitest'
import { usePersistenceHealthStore } from './persistenceHealthStore'

describe('persistenceHealthStore.resetHealth', () => {
  it('clears a stale error so it cannot leak into the next staff session', () => {
    const store = usePersistenceHealthStore.getState()
    store.setHealth({ status: 'error', domain: 'finance', reason: 'save_failed', message: 'SESSION_REQUIRED' })
    usePersistenceHealthStore.getState().resetHealth()
    const next = usePersistenceHealthStore.getState()
    expect(next.status).toBe('idle')
    expect(next.message).toBeUndefined()
    expect(next.domain).toBeUndefined()
    expect(next.reason).toBeUndefined()
  })
})
