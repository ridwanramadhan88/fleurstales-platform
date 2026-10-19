import { beforeEach, describe, expect, it } from 'vitest'
import { useAuditLogStore } from './auditLogStore'

describe('audit log local cache', () => {
  beforeEach(() => useAuditLogStore.getState().clear())

  it('keeps only the newest events in the persisted cache', () => {
    const options = (useAuditLogStore.persist as unknown as { getOptions: () => { partialize: (s: unknown) => { events: unknown[] } } }).getOptions()
    for (let i = 0; i < 300; i += 1) {
      useAuditLogStore.getState().append({ entityType: 'system', entityId: `e${i}`, action: 'test', outcome: 'succeeded', actor: { employeeId: 'x', name: 'X', role: 'owner' } })
    }
    expect(useAuditLogStore.getState().events).toHaveLength(300)
    expect(options.partialize(useAuditLogStore.getState()).events).toHaveLength(200)
  })
})
