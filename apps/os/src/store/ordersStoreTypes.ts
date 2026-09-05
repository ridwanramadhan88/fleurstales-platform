import type { StateCreator } from 'zustand'
import type {
  BranchId,
  OrderChangeRequestType,
  OrderCustomerSnapshot,
  OrderCustomerProfileSuggestions,
  OrderFulfillment,
  OrderLineItem,
  OrderSource,
  OrderStatus,
  OrderTableRow,
  PaymentMethod,
} from '../types/orders'
import type { NormalPaymentStatus, RefundResult } from '../domain/orderBusinessRules'
import type {
  OrderStatusTransitionResult,
  OrderStatusTransitionSource,
  OrderStatusUndoDescriptor,
} from '../domain/orderBusinessRules'
import type { OrderActor } from '../domain/orderBusinessRules'

export interface AddOrderFromDraftInput {
  branch: BranchId
  customerName: string
  customerId?: string
  customerSnapshot?: OrderCustomerSnapshot
  customerProfileSuggestions?: OrderCustomerProfileSuggestions
  orderType: 'walk_in' | 'admin_created' | 'customer_created'
  fulfillmentType: OrderFulfillment
  depositAmount: number
  /** Shared customer/admin note for special requests or order instructions. */
  orderNote?: string | null
  /** @deprecated Legacy intake alias. Use orderNote. */
  notes?: string | null
  /** Internal orders require an authenticated actor. Public storefront orders omit it. */
  actor?: OrderActor
}

export interface CreateOrderInput extends AddOrderFromDraftInput {
  /** Stable checkout-attempt key used to deduplicate customer-created orders locally and remotely. */
  storefrontIdempotencyKey?: string
  totalIdr: number
  itemsSubtotalIdr?: number
  discountIdr?: number
  deliveryFeeIdr?: number
  paymentMethod?: PaymentMethod
  paymentStatus?: NormalPaymentStatus
  source?: OrderSource
  productName?: string
  productId?: string
  variantId?: string
  items?: OrderLineItem[]
  scheduleLabel?: string
  scheduleDate?: string
  scheduleTime?: string
  greetingMessage?: string
  /** @deprecated Legacy intake alias. Use greetingMessage. */
  giftMessage?: string
  greetingCardName?: string
  deliveryAddress?: string
  deliveryInstructions?: string
  promoCode?: string
  adminHandledEmployeeId?: string
}

export type OrderCommandFailureCode =
  | 'ORDER_NOT_FOUND'
  | 'NOT_PERMITTED'
  | 'REVISION_CONFLICT'
  | 'INVALID_INPUT'
  | 'NO_CHANGE'

export type OrderCommandFailure = {
  allowed: false
  code: OrderCommandFailureCode
  reason: string
  currentRevision?: number
}

export type OrderCommandResult =
  | { allowed: true; order: OrderTableRow }
  | OrderCommandFailure

export interface UpdateOrderDetailsInput {
  orderNumber: string
  expectedRevision: number
  actor: OrderActor
  patch: {
    customerId?: string
    customerSnapshot?: OrderCustomerSnapshot
    customerName?: string
    productName?: string
    florist?: string
    source?: OrderSource
    fulfillment?: OrderFulfillment
    status?: OrderStatus
    paymentStatus?: NormalPaymentStatus
    paymentMethod?: PaymentMethod
    totalIdr?: number
    itemsSubtotalIdr?: number
    discountIdr?: number
    deliveryFeeIdr?: number
    paidAmountIdr?: number
    scheduleDate?: string
    scheduleTime?: string
    scheduleLabel?: string
    orderNote?: string
    /** @deprecated Legacy update alias. Use orderNote. */
    internalNote?: string
    greetingMessage?: string
    /** @deprecated Legacy update alias. Use greetingMessage. */
    giftMessage?: string
    greetingCardName?: string
    deliveryAddress?: string
    deliveryInstructions?: string
  }
}

export type UpdateOrderDetailsResult =
  | { allowed: true; order: OrderTableRow; sentBackForReverification: boolean }
  | {
      allowed: false
      code: OrderCommandFailureCode
      reason: string
      currentRevision?: number
    }

export interface UpdateOrderStatusInput {
  orderNumber: string
  expectedRevision: number
  status: OrderStatus
  actor: OrderActor
  source: OrderStatusTransitionSource
  completedAtOverride?: string
  undoOf?: OrderStatusUndoDescriptor
  eventDescription?: string
}

export type UpdateOrderStatusResult =
  | OrderStatusTransitionResult
  | {
      allowed: false
      code: 'REVISION_CONFLICT'
      reason: string
      currentRevision: number
    }


export interface ReassignFloristInput {
  orderNumber: string
  expectedRevision: number
  floristEmployeeId: string
  allowScheduleOverride?: boolean
  actor: OrderActor
}

export interface AssignFloristAndStartProcessingInput {
  orderNumber: string
  expectedRevision: number
  floristEmployeeId: string
  allowScheduleOverride?: boolean
  actor: OrderActor
}


export interface UpdatePaymentInput {
  orderNumber: string
  expectedRevision: number
  paymentStatus: NormalPaymentStatus
  totalIdr?: number
  paidAmountIdr?: number
  paymentMethod?: PaymentMethod
  reference?: string
  proofId?: string
  /** Private `order-payment-proofs` Storage object path. */
  paymentProofUrl?: string
  note?: string
  idempotencyKey?: string
  actor: OrderActor
}

export interface SetOrderFinishPhotoInput {
  orderNumber: string
  expectedRevision: number
  finishPhotoUrl: string
  finishPhotoUploadedBy: string
  actor: OrderActor
}

export interface SetOrderFulfillmentInput {
  orderNumber: string
  expectedRevision: number
  fulfillment: OrderFulfillment
  actor: OrderActor
}

export interface FinanceOrderDecisionInput {
  orderNumber: string
  expectedRevision: number
  actor: OrderActor
  note?: string
}

export interface OrdersStoreState {
  orders: OrderTableRow[]
  lastSequence: Record<BranchId, number>
  createOrder: (input: CreateOrderInput) => OrderTableRow
  addOrderFromDraft: (input: AddOrderFromDraftInput) => OrderTableRow
  updateOrderDetails: (input: UpdateOrderDetailsInput) => UpdateOrderDetailsResult
  updateOrderStatus: (input: UpdateOrderStatusInput) => UpdateOrderStatusResult
  assignFloristAndStartProcessing: (input: AssignFloristAndStartProcessingInput) => OrderCommandResult
  reassignFlorist: (input: ReassignFloristInput) => OrderCommandResult
  updatePayment: (input: UpdatePaymentInput) => OrderCommandResult
  setOrderFinishPhoto: (input: SetOrderFinishPhotoInput) => OrderCommandResult
  initiateRefund: (params: {
    orderNumber: string
    expectedRevision: number
    actor: OrderActor
    reason: string
  }) => RefundResult | OrderCommandResult
  completeRefund: (params: {
    orderNumber: string
    expectedRevision: number
    actor: OrderActor
  }) => RefundResult | OrderCommandResult
  cancelRefund: (params: {
    orderNumber: string
    expectedRevision: number
    actor: OrderActor
    reason: string
  }) => RefundResult | OrderCommandResult
  setOrderFulfillment: (input: SetOrderFulfillmentInput) => OrderCommandResult
  finalizeUnlockedEdit: (params: {
    orderNumber: string
    expectedRevision: number
    actor: OrderActor
  }) => OrderCommandResult
  verifyOrderFinance: (input: FinanceOrderDecisionInput) => OrderCommandResult
  rejectOrderFinance: (input: FinanceOrderDecisionInput) => OrderCommandResult
  markOrderForFinanceReview: (input: FinanceOrderDecisionInput) => OrderCommandResult
  resubmitOrderFinance: (input: FinanceOrderDecisionInput) => OrderCommandResult
  submitChangeRequest: (params: {
    orderNumber: string
    expectedRevision: number
    type: OrderChangeRequestType
    reason: string
    actor: OrderActor
  }) => OrderCommandResult
  approveChangeRequest: (input: FinanceOrderDecisionInput) => OrderCommandResult
  rejectChangeRequest: (input: FinanceOrderDecisionInput) => OrderCommandResult
}

export type OrdersStoreSet = Parameters<StateCreator<OrdersStoreState>>[0]
export type OrdersStoreGet = Parameters<StateCreator<OrdersStoreState>>[1]
