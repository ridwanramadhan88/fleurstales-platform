import type {
  CreateInternalOrderInput,
  CustomerBusinessMetric,
  CreateInternalOrderResult,
  CreateStorefrontOrderInput,
  CreateStorefrontOrderResult,
  StorefrontCheckoutQuoteResult,
  SharedBranch,
  SharedArrangementType,
  SharedArrangementTypesReplaceResult,
  SharedCatalogAdminState,
  SharedCatalogReplaceResult,
  SharedCustomer,
  SharedCustomerAddress,
  SharedOccasion,
  SharedOrder,
  SharedPaymentAccount,
  SharedProduct,
  SharedProductImage,
  SharedProductImageMetadataInput,
  SharedProductImagesReplaceResult,
  SharedSizeGuideLibraryReplaceResult,
  SharedSizeGuideTarget,
  SharedSizeGuideTemplate,
  SharedStoreProfile,
  SharedStoreAdminState,
  SharedStoreReplaceResult,
  SharedStoreSnapshot,
  SharedStaffAccessProfile,
} from './contracts'

export interface StaffAccessRepository {
  /** Current authenticated Supabase user mapped through staff_access_profiles. */
  getCurrentProfile(): Promise<SharedStaffAccessProfile | null>
  /** Owner-only in the future live backend; RLS remains authoritative. */
  listProfiles(): Promise<SharedStaffAccessProfile[]>
}

export interface CatalogReadRepository {
  listOccasions(options?: { includeInactive?: boolean }): Promise<SharedOccasion[]>
  listArrangementTypes(): Promise<SharedArrangementType[]>
  listProducts(options?: { includeInactive?: boolean; includeCosts?: boolean }): Promise<SharedProduct[]>
  getProduct(productId: string): Promise<SharedProduct | null>
  listSizeGuideTemplates(): Promise<SharedSizeGuideTemplate[]>
  listSizeGuideTargets(): Promise<SharedSizeGuideTarget[]>
}

export interface CatalogAdminRepository extends CatalogReadRepository {
  getAdminState(): Promise<SharedCatalogAdminState>
  replaceSnapshot(input: {
    baseRevision: number
    occasions: SharedOccasion[]
    products: SharedProduct[]
  }): Promise<SharedCatalogReplaceResult>
  replaceArrangementTypes(names: string[]): Promise<SharedArrangementTypesReplaceResult>
  uploadProductImage(input: {
    productId: string
    image: SharedProductImageMetadataInput
    blob: Blob
  }): Promise<SharedProductImage>
  replaceProductImagesMetadata(input: {
    baseRevision: number
    productId: string
    images: SharedProductImageMetadataInput[]
  }): Promise<SharedProductImagesReplaceResult>
  removeProductImageObjects(paths: string[]): Promise<void>
  uploadSizeGuide(input: { template: SharedSizeGuideTemplate; blob: Blob }): Promise<SharedSizeGuideTemplate>
  replaceSizeGuideLibrary(input: {
    templates: SharedSizeGuideTemplate[]
    targets: SharedSizeGuideTarget[]
  }): Promise<SharedSizeGuideLibraryReplaceResult>
  removeSizeGuideObjects(paths: string[]): Promise<void>
}

export interface StoreReadRepository {
  getStoreProfile(): Promise<SharedStoreProfile | null>
  listBranches(options?: { includeInactive?: boolean }): Promise<SharedBranch[]>
  listPublicPaymentAccounts(options?: { branchId?: string; includeInactive?: boolean; includeHidden?: boolean }): Promise<SharedPaymentAccount[]>
  getPaymentInstructions(): Promise<string>
}

export interface StoreAdminRepository extends StoreReadRepository {
  getAdminState(): Promise<SharedStoreAdminState>
  replaceSnapshot(input: {
    baseRevision: number
    snapshot: SharedStoreSnapshot
  }): Promise<SharedStoreReplaceResult>
}

export interface CustomerAdminRepository {
  listCustomers(): Promise<SharedCustomer[]>
  listBusinessMetrics(customerId?: string): Promise<CustomerBusinessMetric[]>
  getCustomer(customerId: string): Promise<SharedCustomer | null>
  listCustomerAddresses(customerId: string): Promise<SharedCustomerAddress[]>
  findCustomerByWhatsapp(whatsappNumber: string): Promise<SharedCustomer | null>
  saveCustomer(customer: SharedCustomer, baseRevision?: number): Promise<SharedCustomer>
  deleteCustomer(customerId: string, baseRevision: number): Promise<void>
}

export interface OrdersReadRepository {
  listOrders(options?: { branchId?: string; customerId?: string }): Promise<SharedOrder[]>
  getOrder(orderId: string): Promise<SharedOrder | null>
}

export interface OrdersAdminRepository extends OrdersReadRepository {
  quoteInternalOrder(input: CreateInternalOrderInput): Promise<StorefrontCheckoutQuoteResult>
  createInternalOrder(input: CreateInternalOrderInput): Promise<CreateInternalOrderResult>
}

export interface StorefrontCheckoutRepository {
  quoteOrder(input: CreateStorefrontOrderInput): Promise<StorefrontCheckoutQuoteResult>
  createOrder(input: CreateStorefrontOrderInput): Promise<CreateStorefrontOrderResult>
}
