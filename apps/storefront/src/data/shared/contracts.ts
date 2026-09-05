import type {
  CatalogMaterial,
  CatalogOrderType,
  CatalogVariantStatus,
  CustomerCreatedSource,
  FinanceVerificationStatus,
  Json,
  OrderFulfillment,
  OrderPaymentEventType,
  OrderSource,
  OrderStatus,
  PaymentAccountType,
  PaymentMethod,
  PaymentStatus,
  PricingType,
  StaffRole,
} from './databaseTypes'

export interface SharedOccasion {
  id: string
  name: string
  prefix: string
  sortOrder: number
  isActive: boolean
}

export interface SharedArrangementType {
  name: string
  sortOrder: number
}

export interface SharedArrangementTypesReplaceResult {
  count: number
}

export interface SharedProductVariant {
  id: string
  productId: string
  sku: string
  size: string
  priceIdr: number
  status: CatalogVariantStatus
  sortOrder: number
  /** Only present in authenticated Finance/Owner reads. Never part of the public catalog contract. */
  costIdr?: number | null
}

export interface SharedProductImage {
  id: string
  productId: string
  storagePath: string
  publicUrl: string
  altText?: string
  sortOrder: number
  isPrimary: boolean
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  byteSize?: number
  width?: number
  height?: number
}

export interface SharedProductImageMetadataInput {
  id: string
  storagePath: string
  altText?: string
  sortOrder: number
  isPrimary: boolean
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  byteSize?: number
  width?: number
  height?: number
}

export interface SharedProductImagesReplaceResult {
  revision: number
  productId: string
  imageCount: number
}

export interface SharedSizeGuideTemplate {
  id: string
  name: string
  storagePath: string
  publicUrl: string
  mimeType: 'image/jpeg'
  byteSize: number
  width: 800
  height: 800
  createdAt?: string
  updatedAt?: string
}

export type SharedSizeGuideTarget =
  | { id: string; templateId: string; scope: 'product_type'; productType: string }
  | { id: string; templateId: string; scope: 'product'; productId: string }

export interface SharedSizeGuideLibraryReplaceResult {
  templateCount: number
  targetCount: number
}

export interface SharedProduct {
  id: string
  productCode: string
  primaryOccasionId?: string
  occasionIds: string[]
  material: CatalogMaterial
  name: string
  description?: string
  productType?: string
  collectionSeries?: string
  pricingType?: PricingType
  orderType?: CatalogOrderType
  isFeatured: boolean
  isActive: boolean
  promoLabel?: string
  originalPriceIdr?: number
  isCustomizable: boolean
  sortOrder: number
  variants: SharedProductVariant[]
  images: SharedProductImage[]
}

export interface SharedCatalogAdminState {
  revision: number
  deletedProductCodes: string[]
}

export interface SharedCatalogReplaceResult {
  revision: number
  productCount: number
  occasionCount: number
}

export interface SharedStoreProfile {
  id: 'primary'
  storeName: string
  legalName?: string
  logoUrl?: string
  phone: string
  whatsapp: string
  email: string
  address: string
  currency: 'IDR'
  timezone: 'Asia/Jakarta'
}

export interface BranchDayHours {
  isOpen: boolean
  opensAt?: string
  closesAt?: string
}

export type BranchOpeningHours = Record<string, BranchDayHours>

export interface SharedBranch {
  id: string
  name: string
  code: string
  address: string
  phone: string
  isActive: boolean
  isDefault: boolean
  sortOrder: number
  deliveryFeeIdr: number
  openingHours: BranchOpeningHours
  latitude?: number
  longitude?: number
}

export interface SharedPaymentAccount {
  id: string
  bankName: string
  accountNumber: string
  accountHolder: string
  type: PaymentAccountType
  isActive: boolean
  isDefault: boolean
  displayOrder: number
  isCustomerVisible: boolean
  branchIds: string[]
}

export interface SharedStoreSnapshot {
  profile: SharedStoreProfile
  branches: SharedBranch[]
  paymentAccounts: SharedPaymentAccount[]
  paymentInstructions: string
}

export interface SharedStoreAdminState {
  revision: number
  updatedAt?: string
}

export interface SharedStoreReplaceResult {
  revision: number
  branchCount: number
  paymentAccountCount: number
}

export interface SharedCustomer {
  id: string
  revision: number
  name: string
  whatsappNumber: string
  normalizedWhatsappNumber: string
  email?: string
  birthday?: string
  preferredBranchId?: string
  tags: string[]
  notes?: string
  promoCode?: string
  createdSource: CustomerCreatedSource
  lastOrderAt?: string
  createdAt: string
  updatedAt: string
}

export interface SharedCustomerIntakeInput {
  name: string
  whatsappNumber: string
  email?: string
  birthday?: string
  preferredBranchId?: string
}

export interface SharedCustomerProfileSuggestions {
  birthday?: string
  email?: string
  preferredBranchId?: string
}

export interface SharedCustomerIntakeResult {
  customer: SharedCustomer
  isNew: boolean
  suggestions: SharedCustomerProfileSuggestions
}

export interface SharedCustomerAddress {
  id: string
  customerId: string
  label?: string
  recipientName?: string
  whatsappNumber?: string
  address: string
  city?: string
  postalCode?: string
  deliveryNotes?: string
  isDefault: boolean
}

export interface SharedOrderItem {
  id: string
  orderId: string
  productId?: string
  variantId?: string
  productCodeSnapshot?: string
  productNameSnapshot: string
  variantSkuSnapshot?: string
  variantSizeSnapshot?: string
  quantity: number
  unitPriceIdr: number
}

export interface SharedOrderPaymentEvent {
  id: string
  type: OrderPaymentEventType
  amountIdr: number
  previousPaidAmountIdr: number
  resultingPaidAmountIdr: number
  resultingStatus: PaymentStatus
  method?: PaymentMethod
  reference?: string
  proofId?: string
  note?: string
  actorId?: string
  actorName: string
  occurredAt: string
  idempotencyKey: string
  ledgerTransactionId?: string
}

export interface SharedOrder {
  id: string
  orderNumber: string
  revision: number
  storefrontIdempotencyKey?: string
  customerId?: string
  customerNameSnapshot: string
  customerWhatsappSnapshot?: string
  customerEmailSnapshot?: string
  customerProfileSuggestions?: SharedCustomerProfileSuggestions
  source: OrderSource
  fulfillment: OrderFulfillment
  status: OrderStatus
  branchId: string
  totalIdr: number
  itemsSubtotalIdr: number
  discountIdr: number
  deliveryFeeIdr: number
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod
  paidAmountIdr: number
  paymentHistory?: SharedOrderPaymentEvent[]
  refundAmountIdr?: number
  refundReason?: string
  refundInitiatedBy?: string
  refundInitiatedAt?: string
  refundCompletedBy?: string
  refundCompletedAt?: string
  refundCancelledBy?: string
  refundCancelledAt?: string
  refundCancellationReason?: string
  scheduleLabel?: string
  scheduleDate?: string
  scheduleTime?: string
  requestedPickupDate?: string
  requestedPickupTime?: string
  actualPickedUpAt?: string
  finishPhotoUrl?: string
  finishPhotoUploadedBy?: string
  finishPhotoUploadedAt?: string
  paymentProofUrl?: string
  orderNote?: string
  greetingMessage?: string
  greetingCardName?: string
  deliveryAddress?: string
  deliveryInstructions?: string
  promoCode?: string
  floristDisplayName?: string
  floristAssignedEmployeeId?: string
  floristAssignedAt?: string
  floristAssignedForDate?: string
  floristAssignedForTime?: string
  floristAssignedByEmployeeId?: string
  floristAssignedByName?: string
  floristScheduleOverride?: boolean
  floristScheduleOverrideReason?: string
  floristScheduledBranchId?: string
  floristAssignedBranchId?: string
  floristScheduledShiftStart?: string
  floristScheduledShiftEnd?: string
  processingStartedAt?: string
  adminHandledEmployeeId?: string
  adminHandledByName?: string
  completedAt?: string
  financeReferenceCode?: string
  financeVerified?: boolean
  financeVerifiedBy?: string
  financeVerifiedAt?: string
  financeVerificationStatus?: FinanceVerificationStatus
  financeVerificationNote?: string
  financeVerificationActor?: string
  financeVerificationAt?: string
  financeResubmittedBy?: string
  financeResubmittedAt?: string
  financeResubmissionNote?: string
  financeSubmissionRevision?: number
  cancellationReason?: string
  cancelledBy?: string
  cancelledAt?: string
  pendingChangeRequest?: Json
  editUnlocked?: boolean
  createdAt: string
  updatedAt: string
  items: SharedOrderItem[]
}

export interface StorefrontCheckoutCustomerInput {
  name: string
  whatsappNumber: string
  email?: string
  birthday?: string
}

export interface StorefrontCheckoutItemInput {
  productId: string
  variantId: string
  quantity: number
}

export interface CreateStorefrontOrderInput {
  idempotencyKey: string
  customer: StorefrontCheckoutCustomerInput
  branchId: string
  fulfillment: OrderFulfillment
  scheduleDate: string
  scheduleTime: string
  items: StorefrontCheckoutItemInput[]
  deliveryAddress?: string
  deliveryInstructions?: string
  orderNote?: string
  greetingMessage?: string
  greetingCardName?: string
  paymentMethod?: PaymentMethod
  /** Stored as an order snapshot. Discount remains server/internal-domain derived. */
  promoCode?: string
}

export interface StorefrontCheckoutQuoteResult {
  itemsSubtotalIdr: number
  deliveryFeeIdr: number
  discountIdr: number
  totalIdr: number
  promoCode?: string
  promoAccepted: boolean
  promoMessage?: string
}

export interface CreateInternalOrderItemInput {
  mode: 'catalog' | 'custom'
  productId?: string
  variantId?: string
  productName: string
  quantity: number
  unitPriceIdr?: number
}

export interface CreateInternalOrderInput {
  idempotencyKey: string
  customer: {
    id?: string
    name: string
    whatsappNumber: string
    email?: string
    birthday?: string
    acceptedProfileUpdates?: {
      email?: string
      birthday?: string
      preferredBranchId?: string
    }
  }
  branchId: string
  source: 'whatsapp' | 'walk_in'
  fulfillment: 'delivery' | 'pickup'
  scheduleDate: string
  scheduleTime: string
  items: CreateInternalOrderItemInput[]
  deliveryAddress?: string
  deliveryInstructions?: string
  orderNote?: string
  greetingMessage?: string
  greetingCardName?: string
  paymentMethod?: 'cash' | 'transfer'
  paymentStatus: 'unpaid' | 'partial' | 'paid'
  depositAmountIdr: number
  promoCode?: string
  expectedQuote?: {
    itemsSubtotalIdr: number
    deliveryFeeIdr: number
    discountIdr: number
    totalIdr: number
    promoAccepted: boolean
  }
}

export interface CreateInternalOrderResult {
  orderId: string
  orderNumber: string
  customerId: string
  itemsSubtotalIdr: number
  deliveryFeeIdr: number
  discountIdr: number
  totalIdr: number
  paidAmountIdr: number
  deduplicated: boolean
}

export interface CreateStorefrontOrderResult {
  orderId: string
  orderNumber: string
  /** Present for real Supabase checkout results; local simulation may omit it. */
  publicTrackingId?: string
  customerId: string
  itemsSubtotalIdr: number
  deliveryFeeIdr: number
  discountIdr: number
  totalIdr: number
  deduplicated: boolean
}


export interface CustomerBusinessMetric {
  customerId: string
  lifetimeSpendIdr: number
  orderCount: number
  segment: 'new' | 'regular' | 'vip'
}

export interface SharedStaffAccessProfile {
  userId: string
  employeeId?: string
  displayName: string
  role: StaffRole
  username?: string
  email?: string
  branchId?: string
  isActive: boolean
}
