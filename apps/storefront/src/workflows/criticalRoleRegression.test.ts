import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import { authorizeOrderMutation } from '../domain/orderAuthorizationDomain'
import { makeOrder } from '../test/factories/order'
import { useOrdersStore } from '../store/ordersStore'

const originalOrders = useOrdersStore.getState().orders
const originalSequences = useOrdersStore.getState().lastSequence

const admin = {
  employeeId: 'admin-kdm',
  name: 'Admin Kedamaian',
  role: 'admin' as const,
  branchId: 'Kedamaian',
}
const finance = {
  employeeId: 'finance-1',
  name: 'Finance',
  role: 'finance' as const,
}

const currentRevision = (orderNumber: string) =>
  useOrdersStore.getState().orders.find((order) => order.orderNumber === orderNumber)?.revision ?? 1

beforeEach(() => {
  useOrdersStore.setState({ orders: [], lastSequence: originalSequences })
})

afterEach(() => {
  useOrdersStore.setState({ orders: originalOrders, lastSequence: originalSequences })
})

describe('critical role workflow regression coverage', () => {



  it('Finance verifies an eligible paid order and creates the commercial lock', () => {
    useOrdersStore.setState({
      orders: [makeOrder({
        orderNumber: 'FINANCE-FLOW',
        branch: 'Kedamaian',
        status: 'picked_up',
        paymentStatus: 'paid',
        paidAmountIdr: 500_000,
        totalIdr: 500_000,
        financeVerified: false,
      })],
    })

    const result = useOrdersStore.getState().verifyOrderFinance({
      orderNumber: 'FINANCE-FLOW',
      expectedRevision: currentRevision('FINANCE-FLOW'),
      actor: finance,
    })

    expect(result.allowed).toBe(true)
    expect(useOrdersStore.getState().orders[0]).toMatchObject({
      financeVerified: true,
      financeVerifiedBy: finance.name,
    })
  })

  it('Admin cannot directly edit a Finance-verified locked order', () => {
    useOrdersStore.setState({
      orders: [makeOrder({
        orderNumber: 'LOCKED-FLOW',
        branch: 'Kedamaian',
        status: 'picked_up',
        financeVerified: true,
        editUnlocked: false,
      })],
    })

    const result = useOrdersStore.getState().updateOrderDetails({
      orderNumber: 'LOCKED-FLOW',
      expectedRevision: currentRevision('LOCKED-FLOW'),
      actor: admin,
      patch: { internalNote: 'This must require a change request.' },
    })

    expect(result.allowed).toBe(false)
    expect(useOrdersStore.getState().orders[0].internalNote).toBeUndefined()
  })

  it('Admin cannot mutate an order belonging to another branch', () => {
    const pahomanOrder = makeOrder({
      orderNumber: 'BRANCH-FLOW',
      branch: 'Pahoman',
      status: 'confirmed',
    })

    const authorization = authorizeOrderMutation({
      order: pahomanOrder,
      actor: admin,
      permissions: DEFAULT_ROLE_SECTION_ACCESS,
      kind: 'details',
    })

    expect(authorization).toMatchObject({ allowed: false })
  })
})
