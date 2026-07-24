import type {
  CreateStorefrontOrderInput,
  CreateStorefrontOrderResult,
  SharedBranch,
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

export interface OrdersAdminRepository extends OrdersReadRepository {}

export interface StorefrontCheckoutRepository {
  createOrder(input: CreateStorefrontOrderInput): Promise<CreateStorefrontOrderResult>
}
