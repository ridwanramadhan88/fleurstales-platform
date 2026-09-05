import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'
import { removeOrderPaymentProof } from './orderMediaUpload'
import { useOrdersStore } from '../store/ordersStore'
import { useFinanceStore } from '../store/financeStore'
import { useUserStore } from '../store/userStore'
import { isSharedBackendConfigured } from '../api/remoteSession'

export interface ProcessPaymentResult {
  orderId: string
  orderNumber: string
  revision: number
  paymentStatus: 'paid'
  paidAmountIdr: number
  financeAccountId: string
  paymentVerifiedAt: string
  ledgerTransactionId?: string
}

export interface ProcessOrderForProductionInput {
  order: OrderTableRow
  financeAccountId: string
  floristEmployeeId: string
  assignmentDate: string
  assignmentTime?: string
  allowScheduleOverride: boolean
  scheduledBranchId?: string
  shiftStart?: string
  shiftEnd?: string
  /** Private `order-payment-proofs` Storage object path. Required for transfer. */
  paymentProofPath?: string
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
    throw new Error('Upload bukti transfer before starting production.')
  }
  const result = useOrdersStore.getState().updatePayment({
    orderNumber: current.orderNumber,
    expectedRevision: current.revision ?? 1,
    paymentStatus: 'paid',
    paidAmountIdr: current.totalIdr,
    totalIdr: current.totalIdr,
    paymentMethod: current.paymentMethod,
    paymentProofUrl: paymentProofPath ?? current.paymentProofUrl,
    note: 'Full payment confirmed before Processing.',
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
  }
}

export const confirmOrderPaymentForProcessing = async (
  order: OrderTableRow,
  financeAccountId: string,
): Promise<ProcessPaymentResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  if (!financeAccountId) throw new Error('Receiving account is required.')

  if (!isSharedBackendConfigured()) {
    return confirmLocalPaymentForProcessing(order, financeAccountId, order.paymentProofUrl)
  }

  const result = await getClient().rpc<ProcessPaymentResult>('confirm_order_payment_for_processing', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
    p_finance_account_id: financeAccountId,
  })
  const refreshed = await refreshBusinessOsOrdersFromRemote()
  if (!refreshed) throw new Error('Payment was saved, but the latest order could not be reloaded.')
  return result
}

export const processOrderForProduction = async (
  input: ProcessOrderForProductionInput,
): Promise<OrderTableRow> => {
  const { order } = input
  if (!order.id) throw new Error('Order id is missing.')
  if (!input.financeAccountId) throw new Error('Receiving account is required.')
  if (order.paymentMethod === 'transfer' && !input.paymentProofPath && !order.paymentProofUrl) {
    throw new Error('Upload bukti transfer before starting production.')
  }

  if (!isSharedBackendConfigured()) {
    const payment = confirmLocalPaymentForProcessing(order, input.financeAccountId, input.paymentProofPath)
    const current = useOrdersStore.getState().orders.find((item) => item.orderNumber === order.orderNumber)
      ?? { ...order, revision: payment.revision, paymentStatus: 'paid' as const, paidAmountIdr: payment.paidAmountIdr }
    const user = useUserStore.getState()
    const result = useOrdersStore.getState().assignFloristAndStartProcessing({
      orderNumber: current.orderNumber,
      expectedRevision: current.revision ?? payment.revision,
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

  const proofPath = input.paymentProofPath ?? order.paymentProofUrl ?? undefined
  const isNewProof = Boolean(input.paymentProofPath && input.paymentProofPath !== order.paymentProofUrl)

  try {
    await getClient().rpc('process_order_for_production_with_proof', {
      p_order_id: order.id,
      p_expected_revision: order.revision ?? 1,
      p_finance_account_id: input.financeAccountId,
      p_florist_employee_id: input.floristEmployeeId,
      p_assignment_date: input.assignmentDate,
      p_assignment_time: input.assignmentTime ?? null,
      p_allow_schedule_override: input.allowScheduleOverride,
      p_scheduled_branch_id: input.scheduledBranchId ?? null,
      p_shift_start: input.shiftStart ?? null,
      p_shift_end: input.shiftEnd ?? null,
      p_payment_proof_path: proofPath ?? null,
    })
  } catch (error) {
    if (isNewProof && proofPath) await removeOrderPaymentProof(proofPath).catch(() => undefined)
    throw error
  }

  const refreshed = await refreshBusinessOsOrdersFromRemote()
  if (!refreshed) throw new Error('Order was processed, but the latest order could not be reloaded.')
  const next = useOrdersStore.getState().orders.find((item) => item.orderNumber === order.orderNumber)
  if (!next) throw new Error('Order was processed, but it is missing from the refreshed Orders list.')
  return next
}
