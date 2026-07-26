import type {
  CreateInternalOrderInput,
  CustomerBusinessMetric,
  CreateInternalOrderResult,
  CreateStorefrontOrderInput,
  CreateStorefrontOrderResult,
  StorefrontCheckoutQuoteResult,
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
  SharedProductImagesReplaceResult,
  SharedProductVariant,
  SharedSizeGuideLibraryReplaceResult,
  SharedSizeGuideTarget,
  SharedSizeGuideTemplate,
  SharedStoreAdminState,
  SharedStoreReplaceResult,
  SharedStaffAccessProfile,
} from './contracts'
import type {
  BranchRow,
  CustomerAddressRow,
  CustomerRow,
  DeleteCustomerProfileRpcArgs,
  CreateStorefrontOrderRpcArgs,
  Json,
  OccasionRow,
  OrderItemRow,
  OrderPaymentEventRow,
  OrderRow,
  ProductImageRow,
  ProductOccasionRow,
  ProductRow,
  ProductVariantCostRow,
  ProductVariantRow,
  PublicPaymentAccountRow,
  ReplaceCatalogSnapshotRpcArgs,
  SaveCustomerProfileRpcArgs,
  ReplaceProductImagesMetadataRpcArgs,
  ReplaceSizeGuideLibraryRpcArgs,
  SizeGuideTargetRow,
  SizeGuideTemplateRow,
  StoreProfileRow,
  ReplacePublicStoreSnapshotRpcArgs,
  StorefrontPaymentSettingsRow,
  StaffAccessProfileRow,
} from './databaseTypes'
import type {
  CatalogAdminRepository,
  CatalogReadRepository,
  CustomerAdminRepository,
  OrdersAdminRepository,
  StoreAdminRepository,
  StoreReadRepository,
  StorefrontCheckoutRepository,
  StaffAccessRepository,
} from './repositoryContracts'
import { SupabaseHttpClient } from './supabaseHttpClient'
import { normalizeCustomerWhatsappNumber } from './customerIdentityDomain'

const optional = <T>(value: T | null): T | undefined => value ?? undefined


const mapStaffAccessProfile = (row: StaffAccessProfileRow): SharedStaffAccessProfile => ({
  userId: row.user_id,
  employeeId: optional(row.employee_id),
  displayName: row.display_name,
  role: row.role,
  username: optional(row.username),
  email: optional(row.email),
  branchId: optional(row.branch_id),
  isActive: row.is_active,
})

export const createStaffAccessRepository = (client: SupabaseHttpClient): StaffAccessRepository => ({
  async getCurrentProfile() {
    return client.rpc<SharedStaffAccessProfile | null>('get_current_staff_access_profile', {})
  },
  async listProfiles() {
    const rows: StaffAccessProfileRow[] = await client.select('staff_access_profiles', {
      order: [{ column: 'display_name' }],
    })
    return rows.map(mapStaffAccessProfile)
  },
})

const mapOccasion = (row: OccasionRow): SharedOccasion => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  sortOrder: row.sort_order,
  isActive: row.is_active,
})

const mapVariant = (
  row: ProductVariantRow,
  costByVariantId: ReadonlyMap<string, number | null>,
): SharedProductVariant => ({
  id: row.id,
  productId: row.product_id,
  sku: row.sku,
  size: row.size,
  priceIdr: row.price_idr,
  status: row.status,
  sortOrder: row.sort_order,
  ...(costByVariantId.has(row.id) ? { costIdr: costByVariantId.get(row.id) ?? null } : {}),
})

const productImagePublicUrl = (client: SupabaseHttpClient, storagePath: string): string =>
  storagePath.startsWith('demo/')
    ? `/catalog-demo/${storagePath.split('/').pop() ?? ''}`
    : client.storagePublicUrl('product-images', storagePath)

const mapImage = (client: SupabaseHttpClient, row: ProductImageRow): SharedProductImage => ({
  id: row.id,
  productId: row.product_id,
  storagePath: row.storage_path,
  publicUrl: productImagePublicUrl(client, row.storage_path),
  altText: optional(row.alt_text),
  sortOrder: row.sort_order,
  isPrimary: row.is_primary,
  mimeType: row.mime_type,
  byteSize: optional(row.byte_size),
  width: optional(row.width),
  height: optional(row.height),
})

const mapSizeGuideTemplate = (client: SupabaseHttpClient, row: SizeGuideTemplateRow): SharedSizeGuideTemplate => ({
  id: row.id,
  name: row.name,
  storagePath: row.storage_path,
  publicUrl: client.storagePublicUrl('size-guides', row.storage_path),
  mimeType: row.mime_type,
  byteSize: row.byte_size,
  width: row.width,
  height: row.height,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapSizeGuideTarget = (row: SizeGuideTargetRow): SharedSizeGuideTarget | null => {
  if (row.scope === 'product' && row.product_id) {
    return { id: row.id, templateId: row.template_id, scope: 'product', productId: row.product_id }
  }
  if (row.scope === 'product_type' && row.product_type) {
    return { id: row.id, templateId: row.template_id, scope: 'product_type', productType: row.product_type }
  }
  return null
}

const mapProduct = (
  row: ProductRow,
  occasionRows: ProductOccasionRow[],
  variantRows: ProductVariantRow[],
  imageRows: ProductImageRow[],
  costByVariantId: ReadonlyMap<string, number | null>,
  client: SupabaseHttpClient,
): SharedProduct => ({
  id: row.id,
  productCode: row.product_code,
  primaryOccasionId: optional(row.primary_occasion_id),
  occasionIds: occasionRows
    .filter((link) => link.product_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((link) => link.occasion_id),
  material: row.material,
  name: row.name,
  description: optional(row.description),
  productType: optional(row.product_type),
  collectionSeries: optional(row.collection_series),
  pricingType: optional(row.pricing_type),
  orderType: optional(row.order_type),
  isFeatured: row.is_featured,
  isActive: row.is_active,
  promoLabel: optional(row.promo_label),
  originalPriceIdr: optional(row.original_price_idr),
  isCustomizable: row.is_customizable,
  sortOrder: row.sort_order,
  variants: variantRows
    .filter((variant) => variant.product_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((variant) => mapVariant(variant, costByVariantId)),
  images: imageRows
    .filter((image) => image.product_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => mapImage(client, image)),
})

const readCostMap = async (
  client: SupabaseHttpClient,
  includeCosts: boolean,
): Promise<Map<string, number | null>> => {
  if (!includeCosts) return new Map()
  const rows: ProductVariantCostRow[] = await client.select('product_variant_costs')
  return new Map(rows.map((row) => [row.variant_id, row.cost_idr]))
}

export const createCatalogReadRepository = (client: SupabaseHttpClient): CatalogReadRepository => ({
  async listOccasions(options) {
    const rows = await client.select('occasions', {
      filters: options?.includeInactive ? undefined : { is_active: true },
      order: [{ column: 'sort_order' }],
    })
    return rows.map(mapOccasion)
  },

  async listProducts(options) {
    const [products, occasions, variants, images, costByVariantId] = await Promise.all([
      client.select('products', {
        filters: options?.includeInactive ? undefined : { is_active: true },
        order: [{ column: 'sort_order' }, { column: 'name' }],
      }),
      client.select('product_occasions', { order: [{ column: 'sort_order' }] }),
      client.select('product_variants', { order: [{ column: 'sort_order' }] }),
      client.select('product_images', { order: [{ column: 'sort_order' }] }),
      readCostMap(client, options?.includeCosts === true),
    ])
    return products.map((product) => mapProduct(product, occasions, variants, images, costByVariantId, client))
  },

  async getProduct(productId) {
    const [products, occasions, variants, images] = await Promise.all([
      client.select('products', { filters: { id: productId }, limit: 1 }),
      client.select('product_occasions', { filters: { product_id: productId }, order: [{ column: 'sort_order' }] }),
      client.select('product_variants', { filters: { product_id: productId }, order: [{ column: 'sort_order' }] }),
      client.select('product_images', { filters: { product_id: productId }, order: [{ column: 'sort_order' }] }),
    ])
    return products[0] ? mapProduct(products[0], occasions, variants, images, new Map(), client) : null
  },
  async listSizeGuideTemplates() {
    const rows = await client.select('size_guide_templates', { order: [{ column: 'name' }] })
    return rows.map((row) => mapSizeGuideTemplate(client, row))
  },
  async listSizeGuideTargets() {
    const rows = await client.select('size_guide_targets', { order: [{ column: 'created_at' }] })
    return rows.map(mapSizeGuideTarget).filter((row): row is SharedSizeGuideTarget => row !== null)
  },
})

const asJson = (value: unknown): Json => value as Json

export const createCatalogAdminRepository = (client: SupabaseHttpClient): CatalogAdminRepository => {
  const read = createCatalogReadRepository(client)
  return {
    ...read,
    async getAdminState() {
      return client.rpc<SharedCatalogAdminState>('get_catalog_admin_state', {})
    },
    async replaceSnapshot(input) {
      const args: ReplaceCatalogSnapshotRpcArgs = {
        p_base_revision: input.baseRevision,
        p_occasions: asJson(input.occasions),
        p_products: asJson(input.products),
      }
      return client.rpc<SharedCatalogReplaceResult>(
        'replace_catalog_snapshot',
        args as unknown as Record<string, Json>,
      )
    },
    async uploadProductImage(input) {
      await client.uploadStorageObject('product-images', input.image.storagePath, input.blob, {
        upsert: false,
        cacheControl: '31536000',
      })
      return {
        id: input.image.id,
        productId: input.productId,
        storagePath: input.image.storagePath,
        publicUrl: client.storagePublicUrl('product-images', input.image.storagePath),
        altText: input.image.altText,
        sortOrder: input.image.sortOrder,
        isPrimary: input.image.isPrimary,
        mimeType: input.image.mimeType,
        byteSize: input.image.byteSize,
        width: input.image.width,
        height: input.image.height,
      }
    },
    async replaceProductImagesMetadata(input) {
      const args: ReplaceProductImagesMetadataRpcArgs = {
        p_base_revision: input.baseRevision,
        p_product_id: input.productId,
        p_images: asJson(input.images),
      }
      return client.rpc<SharedProductImagesReplaceResult>(
        'replace_product_images_metadata',
        args as unknown as Record<string, Json>,
      )
    },
    async removeProductImageObjects(paths) {
      await client.removeStorageObjects('product-images', paths)
    },
    async uploadSizeGuide(input) {
      await client.uploadStorageObject('size-guides', input.template.storagePath, input.blob, {
        upsert: true,
        cacheControl: '31536000',
      })
      return {
        ...input.template,
        publicUrl: client.storagePublicUrl('size-guides', input.template.storagePath),
      }
    },
    async replaceSizeGuideLibrary(input) {
      const args: ReplaceSizeGuideLibraryRpcArgs = {
        p_templates: asJson(input.templates.map(({ publicUrl: _publicUrl, ...template }) => template)),
        p_targets: asJson(input.targets),
      }
      return client.rpc<SharedSizeGuideLibraryReplaceResult>(
        'replace_size_guide_library',
        args as unknown as Record<string, Json>,
      )
    },
    async removeSizeGuideObjects(paths) {
      await client.removeStorageObjects('size-guides', paths)
    },
  }
}

const parseOpeningHours = (value: Json): SharedBranch['openingHours'] => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const result: SharedBranch['openingHours'] = {}
  for (const [day, raw] of Object.entries(value)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const isOpen = raw.isOpen === true
    const opensAt = typeof raw.opensAt === 'string' ? raw.opensAt : undefined
    const closesAt = typeof raw.closesAt === 'string' ? raw.closesAt : undefined
    result[day] = { isOpen, opensAt, closesAt }
  }
  return result
}

const mapBranch = (row: BranchRow): SharedBranch => ({
  id: row.id,
  name: row.name,
  code: row.code,
  address: row.address,
  phone: row.phone,
  isActive: row.is_active,
  isDefault: row.is_default,
  sortOrder: row.sort_order,
  deliveryFeeIdr: row.delivery_fee_idr,
  openingHours: parseOpeningHours(row.opening_hours),
  latitude: optional(row.latitude),
  longitude: optional(row.longitude),
})

const mapPaymentAccount = (row: PublicPaymentAccountRow): SharedPaymentAccount => ({
  id: row.id,
  bankName: row.bank_name,
  accountNumber: row.account_number,
  accountHolder: row.account_holder,
  type: row.type,
  isActive: row.is_active,
  isDefault: row.is_default,
  displayOrder: row.display_order,
  isCustomerVisible: row.is_customer_visible,
  branchIds: row.branch_ids,
})

export const createStoreReadRepository = (client: SupabaseHttpClient): StoreReadRepository => ({
  async getStoreProfile() {
    const rows = await client.select('store_profile', { filters: { id: 'primary' }, limit: 1 })
    const row: StoreProfileRow | undefined = rows[0]
    if (!row) return null
    return {
      id: row.id,
      storeName: row.store_name,
      legalName: optional(row.legal_name),
      logoUrl: optional(row.logo_url),
      phone: row.phone,
      whatsapp: row.whatsapp,
      email: row.email,
      address: row.address,
      currency: row.currency,
      timezone: row.timezone,
    }
  },

  async listBranches(options) {
    const rows: BranchRow[] = await client.select('branches', {
      select: 'id,name,code,address,phone,is_active,is_default,sort_order,delivery_fee_idr,opening_hours,latitude,longitude,created_at,updated_at',
      filters: options?.includeInactive ? undefined : { is_active: true },
      order: [{ column: 'sort_order' }, { column: 'name' }],
    })
    return rows.map(mapBranch)
  },

  async listPublicPaymentAccounts(options) {
    const filters: Record<string, boolean> = {}
    if (!options?.includeInactive) filters.is_active = true
    if (!options?.includeHidden) filters.is_customer_visible = true
    const rows: PublicPaymentAccountRow[] = await client.select('public_payment_accounts', {
      filters,
      order: [{ column: 'display_order' }],
    })
    return rows
      .filter((row) => !options?.branchId || row.branch_ids.length === 0 || row.branch_ids.includes(options.branchId))
      .map(mapPaymentAccount)
  },

  async getPaymentInstructions() {
    const rows: StorefrontPaymentSettingsRow[] = await client.select('storefront_payment_settings', {
      filters: { id: 'primary' },
      limit: 1,
    })
    return rows[0]?.payment_instructions ?? ''
  },
})


export const createStoreAdminRepository = (client: SupabaseHttpClient): StoreAdminRepository => {
  const read = createStoreReadRepository(client)
  return {
    ...read,
    async getAdminState() {
      return client.rpc<SharedStoreAdminState>('get_store_admin_state', {})
    },
    async replaceSnapshot(input) {
      const args: ReplacePublicStoreSnapshotRpcArgs = {
        p_base_revision: input.baseRevision,
        p_profile: asJson(input.snapshot.profile),
        p_branches: asJson(input.snapshot.branches),
        p_payment_accounts: asJson(input.snapshot.paymentAccounts),
        p_payment_instructions: input.snapshot.paymentInstructions,
      }
      return client.rpc<SharedStoreReplaceResult>(
        'replace_public_store_snapshot',
        args as unknown as Record<string, Json>,
      )
    },
  }
}

const mapCustomer = (row: CustomerRow): SharedCustomer => ({
  id: row.id,
  revision: row.revision,
  name: row.name,
  whatsappNumber: row.whatsapp_number,
  normalizedWhatsappNumber: row.normalized_whatsapp_number,
  email: optional(row.email),
  birthday: optional(row.birthday),
  preferredBranchId: optional(row.preferred_branch_id),
  tags: row.tags,
  notes: optional(row.notes),
  promoCode: optional(row.promo_code),
  createdSource: row.created_source,
  lastOrderAt: optional(row.last_order_at),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapCustomerAddress = (row: CustomerAddressRow): SharedCustomerAddress => ({
  id: row.id,
  customerId: row.customer_id,
  label: optional(row.label),
  recipientName: optional(row.recipient_name),
  whatsappNumber: optional(row.whatsapp_number),
  address: row.address,
  city: optional(row.city),
  postalCode: optional(row.postal_code),
  deliveryNotes: optional(row.delivery_notes),
  isDefault: row.is_default,
})

export const createCustomerAdminRepository = (client: SupabaseHttpClient): CustomerAdminRepository => ({
  async listCustomers() {
    const rows: CustomerRow[] = await client.select('customers', {
      order: [{ column: 'updated_at', ascending: false }, { column: 'name' }],
    })
    return rows.map(mapCustomer)
  },

  async listBusinessMetrics(customerId) {
    return client.rpc<CustomerBusinessMetric[]>('get_customer_business_metrics', { p_customer_id: customerId ?? null })
  },

  async getCustomer(customerId) {
    const rows: CustomerRow[] = await client.select('customers', {
      filters: { id: customerId },
      limit: 1,
    })
    return rows[0] ? mapCustomer(rows[0]) : null
  },

  async listCustomerAddresses(customerId) {
    const rows: CustomerAddressRow[] = await client.select('customer_addresses', {
      filters: { customer_id: customerId },
      order: [{ column: 'is_default', ascending: false }, { column: 'updated_at', ascending: false }],
    })
    return rows.map(mapCustomerAddress)
  },

  async findCustomerByWhatsapp(whatsappNumber) {
    const normalized = normalizeCustomerWhatsappNumber(whatsappNumber)
    if (normalized.length < 8) return null
    const rows: CustomerRow[] = await client.select('customers', {
      filters: { normalized_whatsapp_number: normalized },
      limit: 1,
    })
    return rows[0] ? mapCustomer(rows[0]) : null
  },

  async saveCustomer(customer, baseRevision) {
    const args: SaveCustomerProfileRpcArgs = {
      p_customer: asJson(customer),
      p_base_revision: baseRevision ?? null,
    }
    return client.rpc<SharedCustomer>('save_customer_profile', args as unknown as Record<string, Json>)
  },

  async deleteCustomer(customerId, baseRevision) {
    const args: DeleteCustomerProfileRpcArgs = {
      p_customer_id: customerId,
      p_base_revision: baseRevision,
    }
    await client.rpc('delete_customer_profile', args as unknown as Record<string, Json>)
  },
})


type OrderWithItemsRow = OrderRow & { order_items?: OrderItemRow[]; order_payment_events?: OrderPaymentEventRow[] }

const mapCustomerSuggestions = (value: Json | null): SharedOrder['customerProfileSuggestions'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, Json | undefined>
  const birthday = typeof record.birthday === 'string' ? record.birthday : undefined
  const email = typeof record.email === 'string' ? record.email : undefined
  const preferredBranchId = typeof record.preferredBranchId === 'string' ? record.preferredBranchId : undefined
  return birthday || email || preferredBranchId ? { birthday, email, preferredBranchId } : undefined
}

const mapOrder = (row: OrderWithItemsRow): SharedOrder => ({
  id: row.id,
  orderNumber: row.order_number,
  revision: row.revision,
  storefrontIdempotencyKey: optional(row.storefront_idempotency_key),
  customerId: optional(row.customer_id),
  customerNameSnapshot: row.customer_name_snapshot,
  customerWhatsappSnapshot: optional(row.customer_whatsapp_snapshot),
  customerEmailSnapshot: optional(row.customer_email_snapshot),
  customerProfileSuggestions: mapCustomerSuggestions(row.customer_profile_suggestions),
  source: row.source,
  fulfillment: row.fulfillment,
  status: row.status,
  branchId: row.branch_id,
  totalIdr: row.total_idr,
  itemsSubtotalIdr: row.items_subtotal_idr,
  discountIdr: row.discount_idr,
  deliveryFeeIdr: row.delivery_fee_idr,
  paymentStatus: row.payment_status,
  paymentMethod: optional(row.payment_method),
  paidAmountIdr: row.paid_amount_idr,
  paymentHistory: [...(row.order_payment_events ?? [])]
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id))
    .map((event) => ({
      id: event.id,
      type: event.type,
      amountIdr: event.amount_idr,
      previousPaidAmountIdr: event.previous_paid_amount_idr,
      resultingPaidAmountIdr: event.resulting_paid_amount_idr,
      resultingStatus: event.resulting_status,
      method: optional(event.method),
      reference: optional(event.reference),
      proofId: optional(event.proof_id),
      note: optional(event.note),
      actorId: optional(event.actor_id),
      actorName: event.actor_name,
      occurredAt: event.occurred_at,
      idempotencyKey: event.idempotency_key,
      ledgerTransactionId: optional(event.ledger_transaction_id),
    })),
  refundAmountIdr: optional(row.refund_amount_idr),
  refundReason: optional(row.refund_reason),
  refundInitiatedBy: optional(row.refund_initiated_by),
  refundInitiatedAt: optional(row.refund_initiated_at),
  refundCompletedBy: optional(row.refund_completed_by),
  refundCompletedAt: optional(row.refund_completed_at),
  refundCancelledBy: optional(row.refund_cancelled_by),
  refundCancelledAt: optional(row.refund_cancelled_at),
  refundCancellationReason: optional(row.refund_cancellation_reason),
  scheduleLabel: optional(row.schedule_label),
  scheduleDate: optional(row.schedule_date),
  scheduleTime: optional(row.schedule_time),
  requestedPickupDate: optional(row.requested_pickup_date),
  requestedPickupTime: optional(row.requested_pickup_time),
  actualPickedUpAt: optional(row.actual_picked_up_at),
  orderNote: optional(row.order_note),
  greetingMessage: optional(row.greeting_message),
  greetingCardName: optional(row.greeting_card_name),
  deliveryAddress: optional(row.delivery_address),
  deliveryInstructions: optional(row.delivery_instructions),
  promoCode: optional(row.promo_code),
  floristDisplayName: optional(row.florist_display_name),
  floristAssignedEmployeeId: optional(row.florist_assigned_employee_id),
  floristAssignedAt: optional(row.florist_assigned_at),
  floristAssignedForDate: optional(row.florist_assigned_for_date),
  floristAssignedForTime: optional(row.florist_assigned_for_time),
  floristAssignedByEmployeeId: optional(row.florist_assigned_by_employee_id),
  floristAssignedByName: optional(row.florist_assigned_by_name),
  floristScheduleOverride: row.florist_schedule_override,
  floristScheduleOverrideReason: optional(row.florist_schedule_override_reason),
  floristScheduledBranchId: optional(row.florist_scheduled_branch_id),
  floristAssignedBranchId: optional(row.florist_assigned_branch_id),
  floristScheduledShiftStart: optional(row.florist_scheduled_shift_start),
  floristScheduledShiftEnd: optional(row.florist_scheduled_shift_end),
  processingStartedAt: optional(row.processing_started_at),
  adminHandledEmployeeId: optional(row.admin_handled_employee_id),
  adminHandledByName: optional(row.admin_handled_by_name),
  completedAt: optional(row.completed_at),
  financeVerified: row.finance_verified,
  financeVerifiedBy: optional(row.finance_verified_by),
  financeVerifiedAt: optional(row.finance_verified_at),
  financeVerificationStatus: optional(row.finance_verification_status),
  financeVerificationNote: optional(row.finance_verification_note),
  financeVerificationActor: optional(row.finance_verification_actor),
  financeVerificationAt: optional(row.finance_verification_at),
  financeResubmittedBy: optional(row.finance_resubmitted_by),
  financeResubmittedAt: optional(row.finance_resubmitted_at),
  financeResubmissionNote: optional(row.finance_resubmission_note),
  financeSubmissionRevision: optional(row.finance_submission_revision),
  pendingChangeRequest: row.pending_change_request ?? undefined,
  editUnlocked: row.edit_unlocked,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  items: [...(row.order_items ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((item) => ({
      id: item.id,
      orderId: item.order_id,
      productId: optional(item.product_id),
      variantId: optional(item.variant_id),
      productCodeSnapshot: optional(item.product_code_snapshot),
      productNameSnapshot: item.product_name_snapshot,
      variantSkuSnapshot: optional(item.variant_sku_snapshot),
      variantSizeSnapshot: optional(item.variant_size_snapshot),
      quantity: item.quantity,
      unitPriceIdr: item.unit_price_idr,
    })),
})

export const createOrdersAdminRepository = (client: SupabaseHttpClient): OrdersAdminRepository => ({
  async listOrders(options) {
    const filters: Record<string, string> = {}
    if (options?.branchId) filters.branch_id = options.branchId
    if (options?.customerId) filters.customer_id = options.customerId
    const rows = await client.select('orders', {
      select: '*,order_items(*),order_payment_events(*)',
      filters,
      order: [{ column: 'created_at', ascending: false }],
    }) as unknown as OrderWithItemsRow[]
    return rows.map(mapOrder)
  },

  async getOrder(orderId) {
    const rows = await client.select('orders', {
      select: '*,order_items(*),order_payment_events(*)',
      filters: { id: orderId },
      limit: 1,
    }) as unknown as OrderWithItemsRow[]
    return rows[0] ? mapOrder(rows[0]) : null
  },

  async quoteInternalOrder(input: CreateInternalOrderInput) {
    return client.rpc<StorefrontCheckoutQuoteResult>('quote_internal_order', {
      p_payload: asJson(input),
    })
  },

  async createInternalOrder(input: CreateInternalOrderInput) {
    return client.rpc<CreateInternalOrderResult>('create_internal_order', {
      p_payload: asJson(input),
    })
  },
})

export const createStorefrontCheckoutRepository = (client: SupabaseHttpClient): StorefrontCheckoutRepository => ({
  async quoteOrder(input: CreateStorefrontOrderInput) {
    const args: CreateStorefrontOrderRpcArgs = {
      p_idempotency_key: input.idempotencyKey,
      p_customer: asJson(input.customer),
      p_branch_id: input.branchId,
      p_fulfillment: input.fulfillment,
      p_schedule_date: input.scheduleDate,
      p_schedule_time: input.scheduleTime,
      p_items: asJson(input.items),
      p_delivery_address: input.deliveryAddress ?? null,
      p_delivery_instructions: input.deliveryInstructions ?? null,
      p_order_note: input.orderNote ?? null,
      p_greeting_message: input.greetingMessage ?? null,
      p_greeting_card_name: input.greetingCardName ?? null,
      p_payment_method: input.paymentMethod ?? 'transfer',
      p_promo_code: input.promoCode ?? null,
    }
    return client.rpc<StorefrontCheckoutQuoteResult>('quote_storefront_checkout', args as unknown as Record<string, Json>)
  },

  async createOrder(input: CreateStorefrontOrderInput) {
    const args: CreateStorefrontOrderRpcArgs = {
      p_idempotency_key: input.idempotencyKey,
      p_customer: asJson(input.customer),
      p_branch_id: input.branchId,
      p_fulfillment: input.fulfillment,
      p_schedule_date: input.scheduleDate,
      p_schedule_time: input.scheduleTime,
      p_items: asJson(input.items),
      p_delivery_address: input.deliveryAddress ?? null,
      p_delivery_instructions: input.deliveryInstructions ?? null,
      p_order_note: input.orderNote ?? null,
      p_greeting_message: input.greetingMessage ?? null,
      p_greeting_card_name: input.greetingCardName ?? null,
      p_payment_method: input.paymentMethod ?? 'transfer',
      p_promo_code: input.promoCode ?? null,
    }
    return client.rpc<CreateStorefrontOrderResult>('create_storefront_order', args as unknown as Record<string, Json>)
  },
})
