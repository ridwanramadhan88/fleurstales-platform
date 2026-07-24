import { describe, expect, it } from 'vitest'
import { buildDeliveryLateWarnings } from './employeeWarningDomain'
import type { Employee } from '../store/hrStoreTypes'
import type { OrderTableRow } from '../types/orders'

const employee: Employee = {
  id: 'admin-1', name: 'Ayu', position: 'Admin', systemRole: 'admin',
  branch: 'Kedamaian', phone: '1', hireDate: '2026-01-01', status: 'active',
}

const lateDelivery: OrderTableRow = {
  id: 'order-1', orderNumber: 'ORD-1', customerName: 'Nina', source: 'walk_in',
  fulfillment: 'delivery', status: 'delivered', paymentStatus: 'paid', totalIdr: 100_000,
  branch: 'Kedamaian', createdAtLabel: 'Today', scheduleDate: '2026-07-10', scheduleTime: '10:00',
  completedAt: '2026-07-11T10:00:00.000Z', adminHandledEmployeeId: 'admin-1',
}

describe('employee order warnings', () => {
  it('creates one stable delivery-late warning for the responsible Admin', () => {
    const first = buildDeliveryLateWarnings({ orders: [lateDelivery], employees: [employee], existingCases: [], nowIso: '2026-07-11T00:00:00.000Z' })
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ warningType: 'delivery_late', employeeId: 'admin-1', orderNumber: 'ORD-1', status: 'pending' })
    expect(buildDeliveryLateWarnings({ orders: [lateDelivery], employees: [employee], existingCases: first, nowIso: '2026-07-11T00:00:00.000Z' })).toHaveLength(0)
  })
})
