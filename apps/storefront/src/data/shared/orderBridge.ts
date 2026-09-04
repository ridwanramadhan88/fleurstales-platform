import { deriveInitialSequences } from '../../store/ordersStoreSeedData'
import { useOrdersStore } from '../../store/ordersStore'
import type { OrderTableRow } from '../../types/orders'
import { bootstrapSharedData } from './bootstrap'
import { sharedOrderToOrderTableRow } from './orderLocalAdapter'
import { browserSupabaseTokenProvider } from './supabaseSession'
import type { Json } from './databaseTypes'
import { SupabaseHttpError } from './supabaseHttpClient'
import { toast } from '../../hooks/use-toast'

let stopOrderSync: (() => void) | undefined
let syncGeneration = 0
let lastRefreshError: string | undefined

export const getBusinessOsOrdersRefreshError = (): string | undefined => lastRefreshError

interface SaveOrderOperationalStateResult {
  id: string
  revision: number
  updatedAt: string
}

interface OrderWorkflowMetadataRow {
  id: string
  finance_reference_code: string | null
  cancellation_reason: string | null
  cancelled_by: string | null
  cancelled_at: string | null
}

const withWorkflowMetadata = (
  order: OrderTableRow,
  metadata: OrderWorkflowMetadataRow | undefined,
): OrderTableRow => ({
  ...order,
  financeReferenceCode: metadata?.finance_reference_code ?? undefined,
  cancellationReason: metadata?.cancellation_reason ?? undefined,
  cancelledBy: metadata?.cancelled_by ?? undefined,
  cancelledAt: metadata?.cancelled_at ?? undefined,
})

const orderStatePayload = (order: OrderTableRow): Json => ({
  customer_id: order.customerId ?? null,
  customer_name_snapshot: order.customerSnapshot?.name ?? order.customerName,
  customer_whatsapp_snapshot: order.customerSnapshot?.whatsappNumber ?? order.customerSnapshot?.phone ?? null,
  customer_email_snapshot: order.customerSnapshot?.email ?? null,
  customer_profile_suggestions: (order.customerProfileSuggestions as unknown as Json) ?? null,
  source: order.source,
  fulfillment: order.fulfillment,
  status: order.status,
  total_idr: order.totalIdr,
  items_subtotal_idr: order.itemsSubtotalIdr ?? order.items?.reduce((sum, item) => sum + item.unitPriceIdr * item.quantity, 0) ?? order.totalIdr,
  discount_idr: order.discountIdr ?? 0,
  delivery_fee_idr: order.deliveryFeeIdr ?? 0,
  payment_status: order.paymentStatus,
  payment_method: order.paymentMethod ?? null,
  paid_amount_idr: order.paidAmountIdr ?? 0,
  refund_amount_idr: order.refundAmountIdr ?? null,
  refund_reason: order.refundReason ?? null,
  refund_initiated_by: order.refundInitiatedBy ?? null,
  refund_initiated_at: order.refundInitiatedAt ?? null,
  refund_completed_by: order.refundCompletedBy ?? null,
  refund_completed_at: order.refundCompletedAt ?? null,
  refund_cancelled_by: order.refundCancelledBy ?? null,
  refund_cancelled_at: order.refundCancelledAt ?? null,
  refund_cancellation_reason: order.refundCancellationReason ?? null,
  schedule_label: order.scheduleLabel ?? null,
  schedule_date: order.scheduleDate ?? null,
  schedule_time: order.scheduleTime ?? null,
  requested_pickup_date: order.requestedPickupDate ?? null,
  requested_pickup_time: order.requestedPickupTime ?? null,
  actual_picked_up_at: order.actualPickedUpAt ?? null,
  order_note: order.orderNote ?? order.internalNote ?? null,
  greeting_message: order.greetingMessage ?? order.giftMessage ?? null,
  greeting_card_name: order.greetingCardName ?? null,
  delivery_address: order.deliveryAddress ?? null,
  delivery_instructions: order.deliveryInstructions ?? null,
  promo_code: order.promoCode ?? null,
  florist_display_name: order.florist ?? null,
  florist_assigned_employee_id: order.floristAssignedEmployeeId ?? null,
  florist_assigned_at: order.floristAssignedAt ?? null,
  florist_assigned_for_date: order.floristAssignedForDate ?? null,
  florist_assigned_for_time: order.floristAssignedForTime ?? null,
  florist_assigned_by_employee_id: order.floristAssignedByEmployeeId ?? null,
  florist_assigned_by_name: order.floristAssignedByName ?? null,
  florist_schedule_override: order.floristScheduleOverride ?? false,
  florist_schedule_override_reason: order.floristScheduleOverrideReason ?? null,
  florist_scheduled_branch_id: order.floristScheduledBranchId ?? null,
  florist_assigned_branch_id: order.floristAssignedBranchId ?? null,
  florist_scheduled_shift_start: order.floristScheduledShiftStart ?? null,
  florist_scheduled_shift_end: order.floristScheduledShiftEnd ?? null,
  processing_started_at: order.processingStartedAt ?? null,
  admin_handled_employee_id: order.adminHandledEmployeeId ?? null,
  admin_handled_by_name: order.adminHandledByName ?? null,
  completed_at: order.completedAt ?? null,
  finance_verified: order.financeVerified ?? false,
  finance_verified_by: order.financeVerifiedBy ?? null,
  finance_verified_at: order.financeVerifiedAt ?? null,
  finance_verification_status: order.financeVerificationStatus ?? null,
  finance_verification_note: order.financeVerificationNote ?? null,
  finance_verification_actor: order.financeVerificationActor ?? null,
  finance_verification_at: order.financeVerificationAt ?? null,
  finance_resubmitted_by: order.financeResubmittedBy ?? null,
  finance_resubmitted_at: order.financeResubmittedAt ?? null,
  finance_resubmission_note: order.financeResubmissionNote ?? null,
  finance_submission_revision: order.financeSubmissionRevision ?? null,
  pending_change_request: (order.pendingChangeRequest as unknown as Json) ?? null,
  edit_unlocked: order.editUnlocked ?? false,
})

const orderItemsPayload = (order: OrderTableRow): Json =>
  [...(order.items ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      id: item.id,
      product_id: item.productId ?? null,
      variant_id: item.variantId ?? null,
      product_code_snapshot: item.productCodeSnapshot ?? null,
      product_name_snapshot: item.productNameSnapshot ?? item.productName ?? 'Custom order',
      variant_sku_snapshot: item.variantSkuSnapshot ?? null,
      variant_size_snapshot: item.variantSizeSnapshot ?? null,
      quantity: item.quantity,
      unit_price_idr: item.unitPriceIdr,
    }))

const paymentEventsPayload = (order: OrderTableRow): Json =>
  [...(order.paymentHistory ?? [])]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    .map((event) => ({
      id: event.id,
      type: event.type,
      amount_idr: event.amountIdr,
      previous_paid_amount_idr: event.previousPaidAmountIdr,
      resulting_paid_amount_idr: event.resultingPaidAmountIdr,
      resulting_status: event.resultingStatus,
      method: event.method ?? null,
      reference: event.reference ?? null,
      proof_id: event.proofId ?? null,
      note: event.note ?? null,
      occurred_at: event.occurredAt,
      idempotency_key: event.idempotencyKey,
      ledger_transaction_id: event.ledgerTransactionId ?? null,
    }))

export const stopBusinessOsOrderBridge = (): void => {
  syncGeneration += 1
  stopOrderSync?.()
  stopOrderSync = undefined
}

/**
 * Loads authoritative Orders after staff sign-in. Runtime mutations are sent
 * through one revision-checked server boundary that compares the requested
 * state with the stored row and enforces role, branch, workflow-lock,
 * assignment, Finance, refund, item, and payment-history constraints.
 */
export const refreshBusinessOsOrdersFromRemote = async (): Promise<boolean> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) {
    lastRefreshError = 'Supabase is not configured.'
    return false
  }

  try {
    const [orders, workflowRows] = await Promise.all([
      shared.repositories.ordersAdmin.listOrders(),
      shared.repositories.client.select('orders', {
        select: 'id,finance_reference_code,cancellation_reason,cancelled_by,cancelled_at',
      }) as unknown as Promise<OrderWorkflowMetadataRow[]>,
    ])
    const workflowById = new Map(workflowRows.map((row) => [row.id, row]))
    const mapped = orders.map((order) =>
      withWorkflowMetadata(sharedOrderToOrderTableRow(order), workflowById.get(order.id)),
    )
    useOrdersStore.setState((state) => ({
      ...state,
      orders: mapped,
      lastSequence: deriveInitialSequences(mapped),
    }))

    stopBusinessOsOrderBridge()
    const generation = syncGeneration
    const confirmedRevisions = new Map(mapped.map((order) => [order.id ?? order.orderNumber, order.revision ?? 1]))
    const inFlight = new Set<string>()

    const refreshConflictedOrder = async (id: string): Promise<void> => {
      const [remote, metadataRows] = await Promise.all([
        shared.repositories.ordersAdmin.getOrder(id),
        shared.repositories.client.select('orders', {
          select: 'id,finance_reference_code,cancellation_reason,cancelled_by,cancelled_at',
          filters: { id },
          limit: 1,
        }) as unknown as Promise<OrderWorkflowMetadataRow[]>,
      ])
      if (!remote || generation !== syncGeneration) return
      const mappedRemote = withWorkflowMetadata(sharedOrderToOrderTableRow(remote), metadataRows[0])
      confirmedRevisions.set(id, mappedRemote.revision ?? 1)
      useOrdersStore.setState((state) => ({
        ...state,
        orders: state.orders.map((order) => (order.id ?? order.orderNumber) === id ? mappedRemote : order),
      }))
    }

    const flushOrder = async (id: string): Promise<void> => {
      if (inFlight.has(id) || generation !== syncGeneration) return
      inFlight.add(id)
      try {
        while (generation === syncGeneration) {
          const order = useOrdersStore.getState().orders.find((candidate) => (candidate.id ?? candidate.orderNumber) === id)
          if (!order) return

          const localRevision = order.revision ?? 1
          const expectedRevision = confirmedRevisions.get(id)
          if (expectedRevision === undefined || localRevision <= expectedRevision) return

          try {
            const result = await shared.repositories.client.rpc<SaveOrderOperationalStateResult>(
              'save_order_operational_state',
              {
                p_order_id: id,
                p_expected_revision: expectedRevision,
                p_next_revision: expectedRevision + 1,
                p_state: orderStatePayload(order),
                p_items: orderItemsPayload(order),
                p_payment_events: paymentEventsPayload(order),
              },
            )
            confirmedRevisions.set(id, result.revision)
            lastRefreshError = undefined
          } catch (error) {
            const isConflict = error instanceof SupabaseHttpError && (
              error.message.includes('REVISION_CONFLICT:order') ||
              (typeof error.payload === 'object' && error.payload !== null && 'code' in error.payload && error.payload.code === '40001')
            )
            const message = error instanceof Error ? error.message : 'The order change was rejected.'

            // A stale or rejected mutation is never retried against a newer
            // revision. Pull the authoritative row instead of last-write-wins.
            await refreshConflictedOrder(id).catch(() => undefined)
            if (isConflict) {
              void shared.repositories.client.rpc('record_mutation_conflict', {
                p_action: 'order.save',
                p_entity_type: 'order',
                p_entity_id: id,
                p_expected_revision: expectedRevision,
                p_observed_revision: confirmedRevisions.get(id),
              }).catch(() => undefined)
              lastRefreshError = 'Order changed elsewhere. The latest order was reloaded.'
              toast({
                title: 'Order changed elsewhere',
                description: 'The latest order was reloaded. Reapply your change and save again.',
              })
            } else {
              lastRefreshError = message
              toast({
                title: 'Order not saved',
                description: message,
              })
            }
            return
          }
        }
      } finally {
        inFlight.delete(id)
      }
    }

    stopOrderSync = useOrdersStore.subscribe((state) => {
      for (const order of state.orders) {
        const id = order.id ?? order.orderNumber
        const localRevision = order.revision ?? 1
        const confirmed = confirmedRevisions.get(id)
        if (confirmed !== undefined && localRevision > confirmed) void flushOrder(id)
      }
    })
    lastRefreshError = undefined
    return true
  } catch (error) {
    // Keep local operational data visible if remote read is temporarily unavailable.
    lastRefreshError = error instanceof Error ? error.message : 'Order synchronization failed.'
    return false
  }
}
