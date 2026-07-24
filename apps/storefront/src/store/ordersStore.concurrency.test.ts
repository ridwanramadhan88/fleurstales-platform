import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { useAuditLogStore } from './auditLogStore'
import { useOrdersStore } from './ordersStore'

const originalOrders = useOrdersStore.getState().orders
const originalAuditEvents = useAuditLogStore.getState().events
const admin = {
  employeeId: 'admin-a',
  name: 'Admin A',
  role: 'admin' as const,
  branchId: 'Kedamaian',
}

beforeEach(() => {
  useOrdersStore.setState({
    orders: [
      makeOrder({
        id: 'order-a',
        orderNumber: 'A',
        revision: 1,
        branch: 'Kedamaian',
        internalNote: 'Original',
      }),
    ],
  })
  useAuditLogStore.setState({ events: [] })
})

afterEach(() => {
  useOrdersStore.setState({ orders: originalOrders })
  useAuditLogStore.setState({ events: originalAuditEvents })
})

describe('orders store optimistic concurrency', () => {
  it('commits the first write, increments revision, and rejects a stale second write', () => {
    const first = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: admin,
      patch: { orderNote: 'First save' },
    })
    expect(first).toMatchObject({ allowed: true, order: { revision: 2 } })

    const stale = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: admin,
      patch: { internalNote: 'Stale overwrite' },
    })
    expect(stale).toMatchObject({
      allowed: false,
      code: 'REVISION_CONFLICT',
      currentRevision: 2,
    })
    expect(useOrdersStore.getState().orders[0]).toMatchObject({
      orderNote: 'First save',
      revision: 2,
    })
  })

  it('records both successful and conflicting commands in the audit trail', () => {
    useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: admin,
      patch: { internalNote: 'Saved' },
    })
    useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: admin,
      patch: { internalNote: 'Conflict' },
    })

    expect(useAuditLogStore.getState().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'order.details.update',
          outcome: 'succeeded',
          previousRevision: 1,
          nextRevision: 2,
        }),
        expect.objectContaining({
          action: 'order.details.update',
          outcome: 'conflict',
          previousRevision: 2,
        }),
      ]),
    )
  })

  it('denies and audits a cross-branch write without mutating the order', () => {
    const result = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'A',
      expectedRevision: 1,
      actor: { ...admin, employeeId: 'admin-b', name: 'Admin B', branchId: 'Pahoman' },
      patch: { internalNote: 'Not allowed' },
    })

    expect(result).toMatchObject({ allowed: false, code: 'NOT_PERMITTED' })
    expect(useOrdersStore.getState().orders[0].internalNote).toBe('Original')
    expect(useAuditLogStore.getState().events[0]).toMatchObject({
      action: 'order.details.update',
      outcome: 'denied',
    })
  })
})
