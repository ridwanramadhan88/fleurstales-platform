import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderTableRow } from '../types/orders'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  refreshOrders: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}))

vi.mock('./shared/bootstrap', () => ({
  bootstrapSharedData: () => ({
    enabled: true as const,
    repositories: {
      client: { rpc: mocks.rpc },
    },
  }),
}))

vi.mock('./shared/supabaseConfig', () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}))

vi.mock('./shared/orderBridge', () => ({
  refreshBusinessOsOrdersFromRemote: mocks.refreshOrders,
}))

vi.mock('./shared/supabaseSession', () => ({
  browserSupabaseTokenProvider: { getAccessToken: vi.fn() },
}))

import { confirmOrderPaymentForProcessing, processOrderForProduction } from './orderPaymentProcessing'

const baseOrder = {
  id: 'order_test_hosted_supabase',
  orderNumber: 'KDM-TEST-001',
  revision: 4,
  status: 'confirmed',
  paymentStatus: 'unpaid',
  paymentMethod: 'transfer',
  paidAmountIdr: 0,
  totalIdr: 105_000,
  paymentProofUrl: undefined,
} as OrderTableRow

describe('hosted order payment/production backend routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isSupabaseConfigured.mockReturnValue(true)
    mocks.refreshOrders.mockResolvedValue(false)
  })

  it('confirms payment through the Supabase RPC whenever Supabase is configured', async () => {
    const proofPath = `${baseOrder.id}/proof-test.jpg`
    mocks.rpc.mockResolvedValue({
      orderId: baseOrder.id,
      orderNumber: baseOrder.orderNumber,
      revision: 6,
      paymentStatus: 'paid',
      paidAmountIdr: baseOrder.totalIdr,
      financeAccountId: 'bank-bca',
      paymentVerifiedAt: '2026-09-06T07:47:37.000Z',
      paymentProofPath: proofPath,
    })

    await confirmOrderPaymentForProcessing(baseOrder, 'bank-bca', proofPath)

    expect(mocks.isSupabaseConfigured).toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_order_payment_with_proof', {
      p_order_id: baseOrder.id,
      p_expected_revision: 4,
      p_finance_account_id: 'bank-bca',
      p_payment_proof_path: proofPath,
    })
  })

  it('starts paid production through the Supabase RPC whenever Supabase is configured', async () => {
    const paidOrder = {
      ...baseOrder,
      revision: 6,
      paymentStatus: 'paid',
      paidAmountIdr: baseOrder.totalIdr,
      paymentProofUrl: `${baseOrder.id}/proof-test.jpg`,
    } as OrderTableRow

    mocks.rpc.mockResolvedValue({
      orderId: paidOrder.id,
      orderNumber: paidOrder.orderNumber,
      revision: 7,
      status: 'processing',
      floristEmployeeId: 'florist-1',
      floristName: 'Florist Test',
      startedAt: '2026-09-06T07:50:00.000Z',
    })

    await processOrderForProduction({
      order: paidOrder,
      floristEmployeeId: 'florist-1',
      assignmentDate: '2026-09-06',
      assignmentTime: '15:00',
      allowScheduleOverride: false,
      scheduledBranchId: 'Kedamaian',
      shiftStart: '09:00',
      shiftEnd: '17:00',
    })

    expect(mocks.isSupabaseConfigured).toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('start_paid_order_production', {
      p_order_id: paidOrder.id,
      p_expected_revision: 6,
      p_florist_employee_id: 'florist-1',
      p_assignment_date: '2026-09-06',
      p_assignment_time: '15:00',
      p_allow_schedule_override: false,
      p_scheduled_branch_id: 'Kedamaian',
      p_shift_start: '09:00',
      p_shift_end: '17:00',
    })
  })
})
