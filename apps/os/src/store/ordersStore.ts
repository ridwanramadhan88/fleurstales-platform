/**
 * @file ordersStore.ts
 * @description Authoritative Orders command store. Every mutation enforces
 * row-level authorization, optimistic revision checks, durable audit records,
 * and a single revision increment before persistence.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { apiStorage, subscribeToExternalUpdates } from './persistApiStorage'
import type { OrderPaymentEvent, OrderTableRow } from '../types/orders'
import type { AddOrderFromDraftInput, CreateOrderInput, OrdersStoreState } from './ordersStoreTypes'
import {
  BRANCH_CODE_MAP,
  deriveInitialSequences,
  deriveInitialStatus,
  derivePaymentStatus,
  reconcilePaidAmountIdr,
  formatCreatedAtLabel,
  INITIAL_ORDERS,
} from './ordersStoreSeedData'
import { createOrderFinanceActions } from './ordersStoreFinanceActions'
import { createOrderChangeRequestActions } from './ordersStoreChangeRequestActions'
import { buildSingleItemLine, deriveLegacyProductIds } from '../domain/orderLineItemsDomain'
import { generateId } from '../lib/id'
import {
  applyUnlockedEditFinalization,
  authorizeOrderMutation,
  canCreateOrderForBranch,
  cancelOrderRefund,
  completeOrderRefund,
  getAdminHandlerEmployeeId,
  initiateOrderRefund,
  transitionOrderStatus
} from '../domain/orderBusinessRules'
import { useSettingsStore } from './settingsStore'
import { useHrStore } from './hrStore'
import { useUserStore } from './userStore'
import {
  emitOrderAssigned,
  emitOrderCreated,
  emitOrderDelivered,
  emitOrderStatusChanged,
  emitOrderUpdated,
  evaluateOrderPriorityAndEmitAlerts,
} from '../core/events/eventService'
import {
  allocateUniqueOrderNumber,
  normalizeOrderConcurrencyMetadata,
} from '../domain/orderConcurrencyDomain'
import { canEditSection } from '../config/permissions'
import {
  auditOrderCommand,
  finalizeOrderMutation,
  validateOrderCommand,
} from './orderCommandSupport'
import { useAuditLogStore } from './auditLogStore'
import { useFinanceStore } from './financeStore'
import { appendPaymentEvent, buildOrderPaymentEvent } from '../domain/orderPaymentDomain'
import { getFloristAssignmentOptionById, resolveFloristAssignmentMoment } from '../domain/floristAssignmentDomain'
import { isSharedBackendConfigured } from '../api/remoteSession'

export type { AddOrderFromDraftInput, CreateOrderInput, OrdersStoreState } from './ordersStoreTypes'

const ORDERS_PERSIST_NAME = 'orders'
const ORDERS_PERSIST_VERSION = 4

const LEGACY_SEEDED_ORDER_NUMBERS = new Set([
  'KDM-2026-0142','KDM-2026-0143','KDM-2026-0144','PHM-2026-0099',
  'PHM-2026-0100','KDM-2026-0141','PHM-2026-0098','PHM-2026-0096',
  'KDM-2026-0140','PHM-2026-0097','PHM-2026-0095','KDM-2026-0138',
])

const initialOrders = INITIAL_ORDERS.map((order) =>
  normalizeOrderConcurrencyMetadata(order, '2026-01-01T00:00:00.000Z'),
)

const getSessionOrderActor = () => {
  const user = useUserStore.getState()
  return {
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
  }
}

const publicStorefrontActor = {
  employeeId: 'public-storefront',
  name: 'Customer storefront',
  role: 'florist' as const,
}

const postPaymentEventToLedger = ({
  order,
  event,
}: {
  order: OrderTableRow
  event: OrderPaymentEvent
}): { allowed: true; event: OrderPaymentEvent } | { allowed: false; reason: string } => {
  if (event.amountIdr <= 0 || isSharedBackendConfigured()) return { allowed: true, event }
  const finance = useFinanceStore.getState()
  const result = event.type === 'payment_received'
    ? finance.recordOrderPayment({
        orderNumber: order.orderNumber, branch: order.branch, amount: event.amountIdr,
        method: event.method, sourceEventId: event.id, idempotencyKey: event.idempotencyKey,
        actor: event.actorName, occurredAt: event.occurredAt, note: event.note,
      })
    : finance.recordOrderRefund({
        orderNumber: order.orderNumber, branch: order.branch, amount: event.amountIdr,
        method: event.method, sourceEventId: event.id, idempotencyKey: event.idempotencyKey,
        actor: event.actorName, occurredAt: event.occurredAt,
        note: event.note ?? 'Payment correction / reversal',
        status: event.type === 'refund_completed' ? 'verified' : 'pending',
      })
  if (!result.allowed) return { allowed: false, reason: result.reason ?? 'Transaction posting failed.' }
  return { allowed: true, event: { ...event, ledgerTransactionId: result.transactionId } }
}

export const useOrdersStore = create<OrdersStoreState>()(
  persist(
    (set, get) => ({
      orders: initialOrders,
      lastSequence: deriveInitialSequences(initialOrders),

      createOrder: (input: CreateOrderInput) => {
        const storefrontKey = input.storefrontIdempotencyKey?.trim()
        if (storefrontKey) {
          const existing = get().orders.find((order) => order.storefrontIdempotencyKey === storefrontKey)
          if (existing) return existing
        }
        const actor = input.actor ?? getSessionOrderActor()
        const creationDecision = canCreateOrderForBranch({
          actor,
          branch: input.branch,
          orderType: input.orderType,
          permissions: useSettingsStore.getState().permissions,
        })
        if (!creationDecision.allowed) throw new Error(creationDecision.reason)

        const now = new Date()
        const prefix =
          BRANCH_CODE_MAP[input.branch] ??
          useSettingsStore
            .getState()
            .branches.find((branch) => branch.id === input.branch)
            ?.code?.trim()
            .toUpperCase() ??
          'ORD'
        const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(now))
        const yearPrefix = `${prefix}-${year}-`
        const currentYearSequence = get().orders.reduce((highest, order) => {
          if (!order.orderNumber.startsWith(yearPrefix)) return highest
          const sequence = Number(order.orderNumber.slice(yearPrefix.length))
          return Number.isInteger(sequence) && sequence > highest ? sequence : highest
        }, 0)
        const allocation = allocateUniqueOrderNumber({
          prefix,
          year,
          // Sequence is scoped to branch code + year, matching Supabase order_sequences.
          currentSequence: currentYearSequence,
          existingOrderNumbers: get().orders.map((order) => order.orderNumber),
        })

        const status = deriveInitialStatus(input.orderType)
        const isStorefrontOrder = input.orderType === 'customer_created'
        const paymentStatus = isStorefrontOrder
          ? 'unpaid'
          : input.paymentStatus ?? derivePaymentStatus(input.depositAmount, input.totalIdr)
        const initialDepositAmount = isStorefrontOrder
          ? 0
          : Math.max(0, input.depositAmount)
        const items =
          input.items ??
          buildSingleItemLine({
            id: generateId('line'),
            productId: input.productId,
            variantId: input.variantId,
            productName: input.productName,
            totalIdr: input.totalIdr,
          })
        const derivedItemsSubtotalIdr = items.reduce(
          (sum, item) => sum + item.unitPriceIdr * item.quantity,
          0,
        )
        const itemsSubtotalIdr = Math.max(
          0,
          input.itemsSubtotalIdr ?? derivedItemsSubtotalIdr,
        )
        const discountIdr = Math.max(0, input.discountIdr ?? 0)
        const deliveryFeeIdr = Math.max(0, input.deliveryFeeIdr ?? 0)
        const { productId, variantId } = deriveLegacyProductIds(items)
        const auditActor =
          input.orderType === 'customer_created' && !input.actor
            ? publicStorefrontActor
            : {
                employeeId: actor.employeeId ?? 'unknown',
                name: actor.name,
                role: actor.role,
              }

        let newOrder: OrderTableRow = {
          id: generateId('order'),
          revision: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          storefrontIdempotencyKey: storefrontKey,
          orderNumber: allocation.orderNumber,
          customerId: input.customerId,
          customerSnapshot: input.customerSnapshot,
          customerProfileSuggestions: input.customerProfileSuggestions,
          customerName: input.customerName,
          items,
          productName: input.items ? input.productName : items[0].productName,
          productId,
          variantId,
          source:
            input.source ??
            (input.orderType === 'walk_in' ? 'walk_in' : 'whatsapp'),
          fulfillment: input.fulfillmentType,
          status,
          florist: undefined,
          floristAssignedEmployeeId: undefined,
          adminHandledEmployeeId:
            input.adminHandledEmployeeId ?? getAdminHandlerEmployeeId(actor),
          totalIdr: input.totalIdr,
          itemsSubtotalIdr,
          discountIdr,
          deliveryFeeIdr,
          branch: input.branch,
          paymentStatus,
          paymentMethod: input.paymentMethod,
          paidAmountIdr:
            paymentStatus === 'paid'
              ? input.totalIdr
              : initialDepositAmount,
          createdAtLabel: formatCreatedAtLabel(now),
          scheduleLabel: input.scheduleLabel,
          scheduleDate: input.scheduleDate,
          scheduleTime: input.scheduleTime,
          requestedPickupDate: input.fulfillmentType === 'pickup' ? input.scheduleDate : undefined,
          requestedPickupTime: input.fulfillmentType === 'pickup' ? input.scheduleTime : undefined,
          orderNote: input.orderNote ?? input.notes ?? undefined,
          greetingMessage: input.greetingMessage ?? input.giftMessage,
          greetingCardName: input.greetingCardName,
          deliveryAddress: input.deliveryAddress,
          deliveryInstructions: input.deliveryInstructions,
          promoCode: input.promoCode,
          paymentHistory: [],
        }

        const initialPaidAmount = Math.max(0, newOrder.paidAmountIdr ?? 0)
        if (initialPaidAmount > 0) {
          const paymentEvent = buildOrderPaymentEvent({
            order: { ...newOrder, paidAmountIdr: 0, paymentStatus: 'unpaid', paymentHistory: [] },
            resultingStatus: newOrder.paymentStatus,
            resultingPaidAmountIdr: initialPaidAmount,
            actor: auditActor,
            occurredAt: now.toISOString(),
            method: newOrder.paymentMethod,
            note: 'Initial order payment',
            idempotencyKey: `${newOrder.id}:initial-payment`,
          })
          const ledger = useFinanceStore.getState().recordOrderPayment({
            orderNumber: newOrder.orderNumber,
            branch: newOrder.branch,
            amount: paymentEvent.amountIdr,
            method: paymentEvent.method,
            sourceEventId: paymentEvent.id,
            idempotencyKey: paymentEvent.idempotencyKey,
            actor: auditActor.name,
            occurredAt: paymentEvent.occurredAt,
            note: paymentEvent.note,
          })
          if (!ledger.allowed) {
            throw new Error(ledger.reason ?? 'Initial payment could not be posted.')
          }
          newOrder = appendPaymentEvent(newOrder, { ...paymentEvent, ledgerTransactionId: ledger.transactionId })
        }

        set((state) => ({
          orders: [newOrder, ...state.orders],
          lastSequence: {
            ...state.lastSequence,
            [input.branch]: allocation.sequence,
          },
        }))

        useAuditLogStore.getState().append({
          entityType: 'order',
          entityId: newOrder.id!,
          entityLabel: newOrder.orderNumber,
          action: 'order.create',
          outcome: 'succeeded',
          actor: auditActor,
          nextRevision: 1,
          metadata: { source: newOrder.source, branch: newOrder.branch },
        })
        emitOrderCreated(newOrder)
        evaluateOrderPriorityAndEmitAlerts(newOrder)
        return newOrder
      },

      addOrderFromDraft: (input: AddOrderFromDraftInput) =>
        get().createOrder({ ...input, totalIdr: 0 }),

      updateOrderDetails: ({ orderNumber, expectedRevision, actor, patch }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'details',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.details.update',
        })
        if (denied) return denied

        let draftOrder = target!
        if (patch.status && patch.status !== target!.status) {
          const transition = transitionOrderStatus({
            order: target!,
            nextStatus: patch.status,
            actor,
            source: 'edit',
            canEditOrders: true,
            transitionedAt: new Date().toISOString(),
          })
          if (!transition.allowed) {
            auditOrderCommand({
              order: target!,
              actor,
              action: 'order.details.update',
              outcome: 'denied',
              reason: transition.reason,
              previousRevision: expectedRevision,
            })
            return { allowed: false, code: 'INVALID_INPUT', reason: transition.reason }
          }
          draftOrder = transition.order
        }

        const has = (key: keyof typeof patch) =>
          Object.prototype.hasOwnProperty.call(patch, key)
        const nextCustomerName = has('customerName')
          ? patch.customerName?.trim() || target!.customerName
          : target!.customerName
        const nextProductName = has('productName')
          ? patch.productName?.trim() || target!.productName
          : target!.productName
        const nextTotalIdr = has('totalIdr')
          ? Math.max(0, patch.totalIdr ?? 0)
          : target!.totalIdr
        const currentItemsSubtotalIdr =
          target!.itemsSubtotalIdr ??
          (target!.items ?? []).reduce(
            (sum, item) => sum + item.unitPriceIdr * item.quantity,
            0,
          )
        const nextDiscountIdr = has('discountIdr')
          ? Math.max(0, patch.discountIdr ?? 0)
          : target!.discountIdr ?? 0
        const nextDeliveryFeeIdr = has('deliveryFeeIdr')
          ? Math.max(0, patch.deliveryFeeIdr ?? 0)
          : target!.deliveryFeeIdr ?? 0
        const nextItemsSubtotalIdr = has('itemsSubtotalIdr')
          ? Math.max(0, patch.itemsSubtotalIdr ?? 0)
          : has('totalIdr')
            ? Math.max(0, nextTotalIdr + nextDiscountIdr - nextDeliveryFeeIdr)
            : currentItemsSubtotalIdr
        const nextPaymentStatus = patch.paymentStatus ?? target!.paymentStatus
        const nextPaidAmountIdr =
          has('paymentStatus') || has('totalIdr') || has('paidAmountIdr')
            ? reconcilePaidAmountIdr(
                nextPaymentStatus,
                nextTotalIdr,
                target!.paidAmountIdr ?? 0,
                patch.paidAmountIdr,
              )
            : target!.paidAmountIdr

        let floristAssignedEmployeeId = target!.floristAssignedEmployeeId
        if (has('florist')) {
          const matchedEmployee = useHrStore.getState().employees.find(
            (employee) =>
              employee.status === 'active' &&
              employee.systemRole === 'florist' &&
              employee.name.trim().toLowerCase() ===
                (patch.florist ?? '').trim().toLowerCase(),
          )
          floristAssignedEmployeeId = matchedEmployee?.id
        }

        const nextItems = target!.items?.map((item) => {
          if (target!.items?.length !== 1 || item.productId) return item
          const quantity = Math.max(1, item.quantity)
          return {
            ...item,
            ...(has('productName') ? { productName: nextProductName } : {}),
            ...(has('totalIdr') || has('itemsSubtotalIdr')
              ? { unitPriceIdr: Math.round(nextItemsSubtotalIdr / quantity) }
              : {}),
          }
        })

        draftOrder = {
          ...draftOrder,
          ...(has('customerId') ? { customerId: patch.customerId } : {}),
          ...(has('customerSnapshot')
            ? { customerSnapshot: patch.customerSnapshot }
            : {}),
          customerName: nextCustomerName,
          productName: nextProductName,
          items: nextItems,
          ...(has('florist') ? { florist: patch.florist } : {}),
          floristAssignedEmployeeId,
          ...(has('source') ? { source: patch.source ?? target!.source } : {}),
          ...(has('fulfillment')
            ? { fulfillment: patch.fulfillment ?? target!.fulfillment }
            : {}),
          paymentStatus: nextPaymentStatus,
          ...(has('paymentMethod')
            ? { paymentMethod: patch.paymentMethod }
            : {}),
          totalIdr: nextTotalIdr,
          itemsSubtotalIdr: nextItemsSubtotalIdr,
          discountIdr: nextDiscountIdr,
          deliveryFeeIdr: nextDeliveryFeeIdr,
          paidAmountIdr: nextPaidAmountIdr,
          ...(has('scheduleDate') ? { scheduleDate: patch.scheduleDate } : {}),
          ...(has('scheduleTime') ? { scheduleTime: patch.scheduleTime } : {}),
          ...((patch.fulfillment ?? target!.fulfillment) === 'pickup' && (has('scheduleDate') || has('scheduleTime') || has('fulfillment'))
            ? {
                requestedPickupDate: has('scheduleDate') ? patch.scheduleDate : target!.requestedPickupDate ?? target!.scheduleDate,
                requestedPickupTime: has('scheduleTime') ? patch.scheduleTime : target!.requestedPickupTime ?? target!.scheduleTime,
              }
            : {}),
          ...(has('scheduleLabel') ? { scheduleLabel: patch.scheduleLabel } : {}),
          ...(has('orderNote')
            ? { orderNote: patch.orderNote }
            : has('internalNote')
              ? { orderNote: patch.internalNote }
              : {}),
          ...(has('greetingMessage')
            ? { greetingMessage: patch.greetingMessage }
            : has('giftMessage')
              ? { greetingMessage: patch.giftMessage }
              : {}),
          ...(has('greetingCardName')
            ? { greetingCardName: patch.greetingCardName }
            : {}),
          ...(has('deliveryAddress')
            ? { deliveryAddress: patch.deliveryAddress }
            : {}),
          ...(has('deliveryInstructions')
            ? { deliveryInstructions: patch.deliveryInstructions }
            : {}),
        }

        const paymentChanged =
          nextPaymentStatus !== target!.paymentStatus ||
          (nextPaidAmountIdr ?? 0) !== (target!.paidAmountIdr ?? 0)
        if (paymentChanged) {
          const paymentEvent = buildOrderPaymentEvent({
            order: target!,
            resultingStatus: nextPaymentStatus,
            resultingPaidAmountIdr: nextPaidAmountIdr ?? 0,
            actor,
            occurredAt: new Date().toISOString(),
            method: target!.paymentMethod,
            note: 'Payment changed from order details',
          })
          const posted = postPaymentEventToLedger({ order: target!, event: paymentEvent })
          if (!posted.allowed) {
            return { allowed: false, code: 'INVALID_INPUT', reason: posted.reason }
          }
          draftOrder = appendPaymentEvent(draftOrder, posted.event)
        }

        const sentBackForReverification = Boolean(
          target!.editUnlocked && target!.financeVerified,
        )
        if (target!.editUnlocked) draftOrder = applyUnlockedEditFinalization(draftOrder)

        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: draftOrder,
          actor,
          action: 'order.details.update',
          metadata: { fields: Object.keys(patch) },
        })
        set((state) => ({
          orders: state.orders.map((order) =>
            order.orderNumber === orderNumber ? nextOrder : order,
          ),
        }))

        if (patch.status && patch.status !== target!.status) {
          emitOrderStatusChanged(nextOrder, target!.status, patch.status)
          if (patch.status === 'delivered') emitOrderDelivered(nextOrder)
        }
        if (has('florist') && patch.florist !== target!.florist) {
          emitOrderAssigned(nextOrder, target!.florist, patch.florist)
        }
        emitOrderUpdated(nextOrder, `Order details updated by ${actor.name}`)
        evaluateOrderPriorityAndEmitAlerts(nextOrder)
        if (patch.status && patch.status !== target!.status) {
          useHrStore.getState().syncOrderContributionPoints({
            orders: get().orders,
            actor: { name: actor.name, role: actor.role },
          })
        }
        return { allowed: true, order: nextOrder, sentBackForReverification }
      },

      updateOrderStatus: (input) => {
        const target = get().orders.find((order) => order.orderNumber === input.orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor: input.actor,
          expectedRevision: input.expectedRevision,
          kind: 'status',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.status.update',
          nextStatus: input.status,
        })
        if (denied) {
          return denied.code === 'REVISION_CONFLICT'
            ? {
                allowed: false,
                code: 'REVISION_CONFLICT' as const,
                reason: denied.reason,
                currentRevision: denied.currentRevision!,
              }
            : {
                allowed: false,
                code: 'NOT_PERMITTED' as const,
                reason: denied.reason,
              }
        }

        if (target!.status === 'confirmed' && input.status === 'processing' && !target!.floristAssignedEmployeeId) {
          return {
            allowed: false,
            code: 'NOT_PERMITTED' as const,
            reason: 'Assign a scheduled florist before starting Processing.',
          }
        }

        const canEditOrders = canEditSection(
          input.actor.role,
          'orders',
          useSettingsStore.getState().permissions,
        )
        const transition = transitionOrderStatus({
          order: target!,
          nextStatus: input.status,
          actor: input.actor,
          source: input.source,
          canEditOrders:
            canEditOrders ||
            authorizeOrderMutation({
              order: target!,
              actor: input.actor,
              permissions: useSettingsStore.getState().permissions,
              kind: 'status',
            }).allowed,
          transitionedAt: new Date().toISOString(),
          completedAtOverride: input.completedAtOverride,
          undoOf: input.undoOf,
        })
        if (!transition.allowed) {
          auditOrderCommand({
            order: target!,
            actor: input.actor,
            action: 'order.status.update',
            outcome: 'denied',
            reason: transition.reason,
            previousRevision: input.expectedRevision,
          })
          return transition
        }

        const transitionedOrder = transition.nextStatus === 'picked_up'
          ? { ...transition.order, actualPickedUpAt: new Date().toISOString() }
          : transition.previousStatus === 'picked_up'
            ? { ...transition.order, actualPickedUpAt: undefined }
            : transition.order
        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: transitionedOrder,
          actor: input.actor,
          action: 'order.status.update',
          metadata: { previousStatus: transition.previousStatus, nextStatus: transition.nextStatus },
        })
        set((state) => ({
          orders: state.orders.map((order) =>
            order.orderNumber === input.orderNumber ? nextOrder : order,
          ),
        }))
        emitOrderStatusChanged(nextOrder, transition.previousStatus, transition.nextStatus)
        emitOrderUpdated(
          nextOrder,
          input.eventDescription ?? `Status updated by ${input.actor.name}`,
        )
        if (transition.nextStatus === 'delivered') emitOrderDelivered(nextOrder)
        evaluateOrderPriorityAndEmitAlerts(nextOrder)
        useHrStore.getState().syncOrderContributionPoints({
          orders: get().orders,
          actor: { name: input.actor.name, role: input.actor.role },
        })
        return { ...transition, order: nextOrder }
      },

      assignFloristAndStartProcessing: ({ orderNumber, expectedRevision, floristEmployeeId, allowScheduleOverride = false, actor }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'status',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.status.update',
        })
        if (denied) return denied
        const assignmentDenied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'assignment',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.florist.assign_and_process',
        })
        if (assignmentDenied) return assignmentDenied
        if (target!.status === 'processing') {
          return { allowed: false, code: 'NO_CHANGE', reason: 'This order is already Processing.' }
        }
        const hrState = useHrStore.getState()
        const settingsState = useSettingsStore.getState()
        const assignmentMoment = resolveFloristAssignmentMoment(target!)
        const floristOption = getFloristAssignmentOptionById({
          order: target!,
          employees: hrState.employees,
          defaults: hrState.employeeDefaultSchedules,
          overrides: hrState.scheduleOverrides,
          settings: {
            scheduling: settingsState.getSchedulingSettingsForDate(assignmentMoment.date),
            branches: settingsState.branches,
          },
          orders: get().orders,
        }, floristEmployeeId)
        if (!floristOption) {
          return {
            allowed: false,
            code: 'INVALID_INPUT',
            reason: 'Select an active florist employee.',
          }
        }
        if (!floristOption.isRecommended && !allowScheduleOverride) {
          return {
            allowed: false,
            code: 'INVALID_INPUT',
            reason: `${floristOption.scheduleReason} Confirm the schedule override before assigning this florist.`,
          }
        }
        const employee = hrState.employees.find((item) => item.id === floristOption.employeeId)!

        const transition = transitionOrderStatus({
          order: target!,
          nextStatus: 'processing',
          actor,
          source: 'workflow',
          canEditOrders: true,
          transitionedAt: new Date().toISOString(),
        })
        if (!transition.allowed) return { allowed: false, code: 'NOT_PERMITTED', reason: transition.reason }

        const assignedAt = new Date().toISOString()
        const scheduleOverride = !floristOption.isRecommended
        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: {
            ...transition.order,
            florist: employee.name,
            floristAssignedEmployeeId: employee.id,
            floristAssignedAt: assignedAt,
            floristAssignedForDate: assignmentMoment.date,
            floristAssignedForTime: assignmentMoment.time,
            floristAssignedByEmployeeId: actor.employeeId,
            floristAssignedByName: actor.name,
            floristScheduleOverride: scheduleOverride,
            floristScheduleOverrideReason: scheduleOverride ? floristOption.scheduleReason : undefined,
            floristScheduledBranchId: floristOption.branchId,
            floristAssignedBranchId: target!.branch,
            floristScheduledShiftStart: floristOption.shiftStart,
            floristScheduledShiftEnd: floristOption.shiftEnd,
            adminHandledEmployeeId: actor.employeeId ?? target!.adminHandledEmployeeId,
            adminHandledByName: actor.name,
            processingStartedAt: assignedAt,
          },
          actor,
          action: 'order.florist.assign_and_process',
          metadata: {
            floristEmployeeId,
            assignmentDate: assignmentMoment.date,
            assignmentTime: assignmentMoment.time,
            scheduleStatus: floristOption.scheduleStatus,
            scheduleOverride,
            scheduledBranchId: floristOption.branchId,
            assignedBranchId: target!.branch,
          },
        })
        set((state) => ({ orders: state.orders.map((order) => order.orderNumber === orderNumber ? nextOrder : order) }))
        emitOrderAssigned(nextOrder, target!.florist, employee.name)
        emitOrderStatusChanged(nextOrder, target!.status, 'processing')
        emitOrderUpdated(nextOrder, scheduleOverride
          ? `Assigned to ${employee.name} outside the recommended schedule and moved to Processing by ${actor.name}`
          : `Assigned to ${employee.name} and moved to Processing by ${actor.name}`)
        useHrStore.getState().syncOrderContributionPoints({ orders: get().orders, actor: { name: actor.name, role: actor.role } })
        return { allowed: true, order: nextOrder }
      },


      reassignFlorist: ({ orderNumber, expectedRevision, floristEmployeeId, allowScheduleOverride = false, actor }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'assignment',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.florist.reassign',
        })
        if (denied) return denied
        if (!['owner', 'admin'].includes(actor.role)) {
          return { allowed: false, code: 'NOT_PERMITTED', reason: 'Only Admin or Owner can change the assigned florist.' }
        }
        if (['delivered', 'picked_up', 'cancelled', 'failed'].includes(target!.status)) {
          return { allowed: false, code: 'NOT_PERMITTED', reason: 'The florist cannot be changed after an order is closed.' }
        }
        if (target!.floristAssignedEmployeeId === floristEmployeeId) {
          return { allowed: false, code: 'NO_CHANGE', reason: 'This florist is already assigned to the order.' }
        }
        const hrState = useHrStore.getState()
        const settingsState = useSettingsStore.getState()
        const assignmentMoment = resolveFloristAssignmentMoment(target!)
        const floristOption = getFloristAssignmentOptionById({
          order: target!, employees: hrState.employees, defaults: hrState.employeeDefaultSchedules,
          overrides: hrState.scheduleOverrides,
          settings: { scheduling: settingsState.getSchedulingSettingsForDate(assignmentMoment.date), branches: settingsState.branches },
          orders: get().orders,
        }, floristEmployeeId)
        if (!floristOption) return { allowed: false, code: 'INVALID_INPUT', reason: 'Select an active florist employee.' }
        if (!floristOption.isRecommended && !allowScheduleOverride) {
          return { allowed: false, code: 'INVALID_INPUT', reason: `${floristOption.scheduleReason} Confirm the schedule override before assigning this florist.` }
        }
        const employee = hrState.employees.find((item) => item.id === floristOption.employeeId)!
        const previousFlorist = target!.florist
        const assignedAt = new Date().toISOString()
        const scheduleOverride = !floristOption.isRecommended
        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: {
            ...target!, florist: employee.name, floristAssignedEmployeeId: employee.id,
            floristAssignedAt: assignedAt, floristAssignedForDate: assignmentMoment.date,
            floristAssignedForTime: assignmentMoment.time, floristAssignedByEmployeeId: actor.employeeId,
            floristAssignedByName: actor.name, floristScheduleOverride: scheduleOverride,
            floristScheduleOverrideReason: scheduleOverride ? floristOption.scheduleReason : undefined,
            floristScheduledBranchId: floristOption.branchId, floristAssignedBranchId: target!.branch,
            floristScheduledShiftStart: floristOption.shiftStart, floristScheduledShiftEnd: floristOption.shiftEnd,
          },
          actor,
          action: 'order.florist.reassign',
          metadata: { previousFlorist, previousFloristEmployeeId: target!.floristAssignedEmployeeId, floristEmployeeId, scheduleOverride },
        })
        set((state) => ({ orders: state.orders.map((item) => item.orderNumber === orderNumber ? nextOrder : item) }))
        emitOrderAssigned(nextOrder, previousFlorist, employee.name)
        emitOrderUpdated(nextOrder, `Florist changed from ${previousFlorist ?? 'Unassigned'} to ${employee.name} by ${actor.name}`)
        useHrStore.getState().syncOrderContributionPoints({ orders: get().orders, actor: { name: actor.name, role: actor.role } })
        return { allowed: true, order: nextOrder }
      },


      updatePayment: ({
        orderNumber,
        expectedRevision,
        paymentStatus,
        totalIdr,
        paidAmountIdr,
        paymentMethod,
        reference,
        proofId,
        note,
        idempotencyKey,
        actor,
      }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'payment',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.payment.update',
        })
        if (denied) return denied
        const nextTotalIdr = typeof totalIdr === 'number' ? Math.max(0, totalIdr) : target!.totalIdr
        const nextPaidAmountIdr = reconcilePaidAmountIdr(
          paymentStatus,
          nextTotalIdr,
          target!.paidAmountIdr ?? 0,
          paidAmountIdr,
        )
        if (
          paymentStatus === target!.paymentStatus &&
          nextPaidAmountIdr === (target!.paidAmountIdr ?? 0) &&
          (paymentMethod ?? target!.paymentMethod) === target!.paymentMethod &&
          nextTotalIdr === target!.totalIdr
        ) {
          return { allowed: false, code: 'NO_CHANGE', reason: 'Payment details are unchanged.' }
        }
        const occurredAt = new Date().toISOString()
        const paymentEvent = buildOrderPaymentEvent({
          order: target!,
          resultingStatus: paymentStatus,
          resultingPaidAmountIdr: nextPaidAmountIdr,
          actor,
          occurredAt,
          method: paymentMethod ?? target!.paymentMethod,
          reference,
          proofId,
          note,
          idempotencyKey,
        })
        const posted = postPaymentEventToLedger({ order: target!, event: paymentEvent })
        if (!posted.allowed) return { allowed: false, code: 'INVALID_INPUT', reason: posted.reason }

        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: appendPaymentEvent(
            { ...target!, totalIdr: nextTotalIdr, paymentMethod: paymentMethod ?? target!.paymentMethod },
            posted.event,
          ),
          actor,
          action: 'order.payment.update',
          metadata: { paymentStatus, paymentEventId: posted.event.id, ledgerTransactionId: posted.event.ledgerTransactionId },
        })
        set((state) => ({
          orders: state.orders.map((order) =>
            order.orderNumber === orderNumber ? nextOrder : order,
          ),
        }))
        emitOrderUpdated(nextOrder, `Payment updated by ${actor.name}`)
        evaluateOrderPriorityAndEmitAlerts(nextOrder)
        return { allowed: true, order: nextOrder }
      },

      initiateRefund: ({ orderNumber, expectedRevision, actor, reason }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'refund',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.refund.initiate',
        })
        if (denied) return denied
        const result = initiateOrderRefund({
          order: target!,
          actor,
          reason,
          initiatedAt: new Date().toISOString(),
        })
        if (!result.allowed) return result
        const refundStartedAt = result.order.refundInitiatedAt ?? new Date().toISOString()
        const refundEvent: OrderPaymentEvent = {
          ...buildOrderPaymentEvent({
            order: target!,
            resultingStatus: 'refund_pending',
            resultingPaidAmountIdr: target!.paidAmountIdr ?? 0,
            actor,
            occurredAt: refundStartedAt,
            method: target!.paymentMethod,
            note: reason,
            idempotencyKey: `${target!.id ?? target!.orderNumber}:refund-init:${expectedRevision}`,
          }),
          type: 'refund_initiated',
          amountIdr: result.order.refundAmountIdr ?? target!.paidAmountIdr ?? 0,
        }
        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: appendPaymentEvent(result.order, refundEvent),
          actor,
          action: 'order.refund.initiate',
          reason,
          metadata: { paymentEventId: refundEvent.id },
        })
        set((state) => ({
          orders: state.orders.map((order) =>
            order.orderNumber === orderNumber ? nextOrder : order,
          ),
        }))
        emitOrderUpdated(nextOrder, `Refund initiated by ${actor.name}`)
        return { allowed: true, order: nextOrder }
      },

      completeRefund: ({ orderNumber, expectedRevision, actor }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'refund',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.refund.complete',
        })
        if (denied) return denied
        const result = completeOrderRefund({
          order: target!,
          actor,
          completedAt: new Date().toISOString(),
        })
        if (!result.allowed) return result
        const refundCompletedAt = result.order.refundCompletedAt ?? new Date().toISOString()
        const refundEvent: OrderPaymentEvent = {
          ...buildOrderPaymentEvent({
            order: target!,
            resultingStatus: 'refunded',
            resultingPaidAmountIdr: 0,
            actor,
            occurredAt: refundCompletedAt,
            method: target!.paymentMethod,
            note: target!.refundReason,
            idempotencyKey: `${target!.id ?? target!.orderNumber}:refund-complete:${expectedRevision}`,
          }),
          type: 'refund_completed',
          amountIdr: target!.refundAmountIdr ?? target!.paidAmountIdr ?? 0,
        }
        const posted = postPaymentEventToLedger({ order: target!, event: refundEvent })
        if (!posted.allowed) return { allowed: false, code: 'INVALID_INPUT', reason: posted.reason }
        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: appendPaymentEvent(result.order, posted.event),
          actor,
          action: 'order.refund.complete',
          metadata: { paymentEventId: posted.event.id, ledgerTransactionId: posted.event.ledgerTransactionId },
        })
        set((state) => ({
          orders: state.orders.map((order) =>
            order.orderNumber === orderNumber ? nextOrder : order,
          ),
        }))
        emitOrderUpdated(nextOrder, `Refund completed by ${actor.name}`)
        useHrStore.getState().syncOrderContributionPoints({
          orders: get().orders,
          actor: { name: actor.name, role: actor.role },
        })
        return { allowed: true, order: nextOrder }
      },

      cancelRefund: ({ orderNumber, expectedRevision, actor, reason }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'refund',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.refund.cancel',
        })
        if (denied) return denied
        const result = cancelOrderRefund({
          order: target!,
          actor,
          reason,
          cancelledAt: new Date().toISOString(),
        })
        if (!result.allowed) return result
        const cancelledAt = result.order.refundCancelledAt ?? new Date().toISOString()
        const refundEvent: OrderPaymentEvent = {
          ...buildOrderPaymentEvent({
            order: target!,
            resultingStatus: 'paid',
            resultingPaidAmountIdr: target!.paidAmountIdr ?? target!.totalIdr,
            actor,
            occurredAt: cancelledAt,
            method: target!.paymentMethod,
            note: reason,
            idempotencyKey: `${target!.id ?? target!.orderNumber}:refund-cancel:${expectedRevision}`,
          }),
          type: 'refund_cancelled',
          amountIdr: target!.refundAmountIdr ?? target!.paidAmountIdr ?? 0,
        }
        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: appendPaymentEvent(result.order, refundEvent),
          actor,
          action: 'order.refund.cancel',
          reason,
          metadata: { paymentEventId: refundEvent.id },
        })
        set((state) => ({
          orders: state.orders.map((order) => order.orderNumber === orderNumber ? nextOrder : order),
        }))
        emitOrderUpdated(nextOrder, `Refund cancelled by ${actor.name}`)
        return { allowed: true, order: nextOrder }
      },

      setOrderFulfillment: ({ orderNumber, expectedRevision, fulfillment, actor }) => {
        const target = get().orders.find((order) => order.orderNumber === orderNumber)
        const denied = validateOrderCommand({
          order: target,
          actor,
          expectedRevision,
          kind: 'fulfillment',
          permissions: useSettingsStore.getState().permissions,
          action: 'order.fulfillment.update',
        })
        if (denied) return denied
        if (target!.fulfillment === fulfillment) {
          return { allowed: false, code: 'NO_CHANGE', reason: 'Fulfillment is already set to that value.' }
        }
        const nextOrder = finalizeOrderMutation({
          before: target!,
          after: { ...target!, fulfillment },
          actor,
          action: 'order.fulfillment.update',
          metadata: { fulfillment },
        })
        set((state) => ({
          orders: state.orders.map((order) =>
            order.orderNumber === orderNumber ? nextOrder : order,
          ),
        }))
        emitOrderUpdated(nextOrder, `Fulfillment type updated by ${actor.name}`)
        return { allowed: true, order: nextOrder }
      },

      ...createOrderFinanceActions(set, get),
      ...createOrderChangeRequestActions(set, get),
    }),
    {
      name: ORDERS_PERSIST_NAME,
      version: ORDERS_PERSIST_VERSION,
      storage: createJSONStorage(() => apiStorage),
      migrate: (persisted, persistedVersion) => {
        const state = persisted as Partial<OrdersStoreState>
        const sourceOrders = state.orders ?? initialOrders
        const cleanedOrders = persistedVersion < 4
          ? sourceOrders.filter((order) => !LEGACY_SEEDED_ORDER_NUMBERS.has(order.orderNumber))
          : sourceOrders
        const orders = cleanedOrders.map((order) => {
          const normalized = normalizeOrderConcurrencyMetadata(order)
          const legacySnapshot = normalized.customerSnapshot
          return {
            ...normalized,
            customerSnapshot: legacySnapshot
              ? {
                  ...legacySnapshot,
                  customerId: legacySnapshot.customerId ?? normalized.customerId,
                  whatsappNumber:
                    legacySnapshot.whatsappNumber ?? legacySnapshot.phone ?? '',
                }
              : undefined,
            orderNote: normalized.orderNote ?? normalized.internalNote,
            greetingMessage: normalized.greetingMessage ?? normalized.giftMessage,
            paymentHistory: Array.isArray(order.paymentHistory) ? order.paymentHistory : [],
          }
        })
        return {
          ...state,
          orders,
          lastSequence: deriveInitialSequences(orders),
        } as OrdersStoreState
      },
      merge: (persisted, current) => {
        const state = persisted as Partial<OrdersStoreState>
        const orders = (state.orders ?? current.orders).map((order) => {
          const normalized = normalizeOrderConcurrencyMetadata(order)
          const legacySnapshot = normalized.customerSnapshot
          return {
            ...normalized,
            customerSnapshot: legacySnapshot
              ? {
                  ...legacySnapshot,
                  customerId: legacySnapshot.customerId ?? normalized.customerId,
                  whatsappNumber:
                    legacySnapshot.whatsappNumber ?? legacySnapshot.phone ?? '',
                }
              : undefined,
            orderNote: normalized.orderNote ?? normalized.internalNote,
            greetingMessage: normalized.greetingMessage ?? normalized.giftMessage,
          }
        })
        return {
          ...current,
          ...state,
          orders,
          lastSequence: {
            ...deriveInitialSequences(orders),
            ...(state.lastSequence ?? {}),
          },
        }
      },
      partialize: (state) => ({
        orders: state.orders,
        lastSequence: state.lastSequence,
      }) as OrdersStoreState,
    },
  ),
)

subscribeToExternalUpdates(ORDERS_PERSIST_NAME, useOrdersStore)
