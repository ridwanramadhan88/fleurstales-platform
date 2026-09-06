import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { isSupabaseConfigured } from './shared/supabaseConfig'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'
import { useOrdersStore } from '../store/ordersStore'
import { useFinanceStore } from '../store/financeStore'
import { useUserStore } from '../store/userStore'

export interface ProcessPaymentResult {
  orderId: string
  orderNumber: string
  revision: number
  paymentStatus: 'paid'
  paidAmountIdr: number
  financeAccountId: string
  paymentVerifiedAt: string
  ledgerTransactionId?: string
  paymentProofPath?: string | null
}

interface ProcessProductionResult {
  orderId: string
  orderNumber: string
  revision: number
  status: 'processing'
  floristEmployeeId: string
  floristName: string
  startedAt: string
}

export interface ProcessOrderForProductionInput {
  order: OrderTableRow
  floristEmployeeId: string
  assignmentDate: string
  assignmentTime?: string
  allowScheduleOverride: boolean
  scheduledBranchId?: string
  shiftStart?: string
  shiftEnd?: string
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

const confirmLocalPaymentForProcessing = (
  order: OrderTableRow,
  financeAccountId: string,
  paymentProofPath?: string,
): ProcessPaymentResult => {
  const current = useOrdersStore.getState().orders.find((item) => item.orderNumber === order.orderNumber) ?? order
  const user = useUserStore.getState()
  const actor = {
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
  }
  if (current.paymentMethod === 'transfer' && !paymentProofPath && !current.paymentProofUrl) {
    throw new Error('Upload bukti transfer before confirming payment.')
  }
  const result = useOrdersStore.getState().updatePayment({
    orderNumber: current.orderNumber,
    expectedRevision: current.revision ?? 1,
    paymentStatus: 'paid',
    paidAmountIdr: current.totalIdr,
    totalIdr: current.totalIdr,
    paymentMethod: current.paymentMethod,
    paymentProofUrl: paymentProofPath ?? current.paymentProofUrl,
    note: 'Full payment confirmed by admin.',
    idempotencyKey: `process-payment:${current.id ?? current.orderNumber}:${current.revision ?? 1}`,
    actor,
  })
  if (!result.allowed) throw new Error(result.reason)

  const paymentEvent = [...(result.order.paymentHistory ?? [])]
    .reverse()
    .find((event) => event.type === 'payment_received' && event.ledgerTransactionId)
  if (paymentEvent?.ledgerTransactionId) {
    useFinanceStore.setState((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === paymentEvent.ledgerTransactionId
          ? {
              ...transaction,
              accountId: financeAccountId,
              status: 'verified' as const,
              transactionDate: paymentEvent.occurredAt,
              updatedAt: new Date().toISOString(),
            }
          : transaction,
      ),
    }))
  }

  return {
    orderId: result.order.id ?? current.id ?? current.orderNumber,
    orderNumber: result.order.orderNumber,
    revision: result.order.revision ?? (current.revision ?? 1) + 1,
    paymentStatus: 'paid',
    paidAmountIdr: result.order.paidAmountIdr ?? result.order.totalIdr,
    financeAccountId,
    paymentVerifiedAt: paymentEvent?.occurredAt ?? new Date().toISOString(),
    ledgerTransactionId: paymentEvent?.ledgerTransactionId,
    paymentProofPath: paymentProofPath ?? current.paymentProofUrl,
  }
}

export const confirmOrderPaymentForProcessing = async (
  order: OrderTableRow,
  financeAccountId: string,
  paymentProofPath?: string,
): Promise<ProcessPaymentResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  if (!financeAccountId) throw new Error('Receiving account is required.')

  if (!isSupabaseConfigured()) {
    return confirmLocalPaymentForProcessing(order, financeAccountId, paymentProofPath ?? order.paymentProofUrl)
  }

  const result = await getClient().rpc<ProcessPaymentResult>('confirm_order_payment_with_proof', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
    p_finance_account_id: financeAccountId,
    p_payment_proof_path: paymentProofPath ?? order.paymentProofUrl ?? null,
  })

  // The RPC is the commit boundary. A later refresh problem must not make the
  // UI treat an already-confirmed payment as failed or delete its proof.
  await refreshBusinessOsOrdersFromRemote().catch(() => false)
  return result
}

export const processOrderForProduction = async (
  input: ProcessOrderForProductionInput,
): Promise<OrderTableRow> => {
  const { order } = input
  if (!order.id) throw new Error('Order id is missing.')
  if (order.paymentStatus !== 'paid' || (order.paidAmountIdr ?? 0) < order.totalIdr) {
    throw new Error('Confirm payment before starting production.')
  }
  if (order.paymentMethod === 'transfer' && !order.paymentProofUrl) {
    throw new Error('Bukti transfer is missing. Confirm payment first.')
  }

  if (!isSupabaseConfigured()) {
    const current = useOrdersStore.getState().orders.find((item) => item.orderNumber === order.orderNumber) ?? order
    const user = useUserStore.getState()
    const result = useOrdersStore.getState().assignFloristAndStartProcessing({
      orderNumber: current.orderNumber,
      expectedRevision: current.revision ?? 1,
      floristEmployeeId: input.floristEmployeeId,
      allowScheduleOverride: input.allowScheduleOverride,
      actor: {
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
      },
    })
    if (!result.allowed) throw new Error(result.reason)
    return result.order
  }

  const command = await getClient().rpc<ProcessProductionResult>('start_paid_order_production', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
    p_florist_employee_id: input.floristEmployeeId,
    p_assignment_date: input.assignmentDate,
    p_assignment_time: input.assignmentTime ?? null,
    p_allow_schedule_override: input.allowScheduleOverride,
    p_scheduled_branch_id: input.scheduledBranchId ?? null,
    p_shift_start: input.shiftStart ?? null,
    p_shift_end: input.shiftEnd ?? null,
  })

  const refreshed = await refreshBusinessOsOrdersFromRemote()
  if (refreshed) {
    const next = useOrdersStore.getState().orders.find((item) => item.orderNumber === order.orderNumber)
    if (next) return next
  }

  return {
    ...order,
    revision: command.revision,
    status: 'processing',
    florist: command.floristName,
    floristAssignedEmployeeId: command.floristEmployeeId,
    floristAssignedAt: command.startedAt,
    floristAssignedForDate: input.assignmentDate,
    floristAssignedForTime: input.assignmentTime,
    floristScheduleOverride: input.allowScheduleOverride,
    floristScheduledBranchId: input.scheduledBranchId,
    floristScheduledShiftStart: input.shiftStart,
    floristScheduledShiftEnd: input.shiftEnd,
    processingStartedAt: command.startedAt,
    updatedAt: command.startedAt,
  }
}
