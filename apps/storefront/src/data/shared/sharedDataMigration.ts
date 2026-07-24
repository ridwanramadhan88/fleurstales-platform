/**
 * Converts a portable Phase 10 bundle into row-shaped data matching the
 * prepared Supabase schema. This is data preparation only; it performs no I/O.
 */
import type { SharedDataBundleV1 } from './sharedDataBundleTypes'

export interface SupabaseSharedImportPlan {
  catalog_sync_state: Record<string, unknown>[]
  catalog_product_code_tombstones: Record<string, unknown>[]
  store_sync_state: Record<string, unknown>[]
  order_sequences: Record<string, unknown>[]
  store_profile: Record<string, unknown>[]
  branches: Record<string, unknown>[]
  public_payment_accounts: Record<string, unknown>[]
  storefront_payment_settings: Record<string, unknown>[]
  occasions: Record<string, unknown>[]
  products: Record<string, unknown>[]
  product_occasions: Record<string, unknown>[]
  product_variants: Record<string, unknown>[]
  product_variant_costs: Record<string, unknown>[]
  product_images: Record<string, unknown>[]
  customers: Record<string, unknown>[]
  customer_addresses: Record<string, unknown>[]
  orders: Record<string, unknown>[]
  order_items: Record<string, unknown>[]
}

export const buildSupabaseSharedImportPlan = (bundle: SharedDataBundleV1): SupabaseSharedImportPlan => ({
  catalog_sync_state: [{ id: 'primary', revision: bundle.catalog.adminState.revision }],
  catalog_product_code_tombstones: bundle.catalog.adminState.deletedProductCodes.map((productCode) => ({ product_code: productCode, deleted_product_id: null })),
  store_sync_state: [{ id: 'primary', revision: bundle.store.adminState.revision, updated_at: bundle.store.adminState.updatedAt ?? bundle.exportedAt }],
  order_sequences: (() => {
    const byKey = new Map<string, { branch_id: string; sequence_year: number; last_sequence: number }>()
    const branchCodeToId = new Map(bundle.store.snapshot.branches.map((branch) => [branch.code.toUpperCase(), branch.id]))
    for (const order of bundle.orders.orders) {
      const match = /^([A-Z0-9]+)-(\d{4})-(\d+)$/.exec(order.orderNumber.toUpperCase())
      if (!match) continue
      const branchId = branchCodeToId.get(match[1]) ?? order.branchId
      const year = Number(match[2])
      const sequence = Number(match[3])
      if (!Number.isInteger(year) || !Number.isInteger(sequence)) continue
      const key = `${branchId}:${year}`
      const current = byKey.get(key)
      if (!current || sequence > current.last_sequence) byKey.set(key, { branch_id: branchId, sequence_year: year, last_sequence: sequence })
    }
    return [...byKey.values()]
  })(),
  store_profile: [{
    id: bundle.store.snapshot.profile.id,
    store_name: bundle.store.snapshot.profile.storeName,
    legal_name: bundle.store.snapshot.profile.legalName ?? null,
    logo_url: bundle.store.snapshot.profile.logoUrl ?? null,
    phone: bundle.store.snapshot.profile.phone,
    whatsapp: bundle.store.snapshot.profile.whatsapp,
    email: bundle.store.snapshot.profile.email,
    address: bundle.store.snapshot.profile.address,
    currency: bundle.store.snapshot.profile.currency,
    timezone: bundle.store.snapshot.profile.timezone,
  }],
  branches: bundle.store.snapshot.branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    phone: branch.phone,
    is_active: branch.isActive,
    is_default: branch.isDefault,
    sort_order: branch.sortOrder,
    delivery_fee_idr: branch.deliveryFeeIdr,
    opening_hours: branch.openingHours,
    latitude: branch.latitude ?? null,
    longitude: branch.longitude ?? null,
  })),
  public_payment_accounts: bundle.store.snapshot.paymentAccounts.map((account) => ({
    id: account.id,
    bank_name: account.bankName,
    account_number: account.accountNumber,
    account_holder: account.accountHolder,
    type: account.type,
    is_active: account.isActive,
    is_default: account.isDefault,
    display_order: account.displayOrder,
    is_customer_visible: account.isCustomerVisible,
    branch_ids: account.branchIds,
  })),
  storefront_payment_settings: [{
    id: 'primary',
    payment_instructions: bundle.store.snapshot.paymentInstructions,
  }],
  occasions: bundle.catalog.occasions.map((occasion) => ({
    id: occasion.id,
    name: occasion.name,
    prefix: occasion.prefix,
    sort_order: occasion.sortOrder,
    is_active: occasion.isActive,
  })),
  products: bundle.catalog.products.map((product) => ({
    id: product.id,
    product_code: product.productCode,
    primary_occasion_id: product.primaryOccasionId ?? null,
    material: product.material,
    name: product.name,
    description: product.description ?? null,
    product_type: product.productType ?? null,
    collection_series: product.collectionSeries ?? null,
    pricing_type: product.pricingType ?? null,
    order_type: product.orderType ?? null,
    is_featured: product.isFeatured,
    is_active: product.isActive,
    promo_label: product.promoLabel ?? null,
    original_price_idr: product.originalPriceIdr ?? null,
    is_customizable: product.isCustomizable,
    sort_order: product.sortOrder,
  })),
  product_occasions: bundle.catalog.products.flatMap((product) =>
    product.occasionIds.map((occasionId, index) => ({
      product_id: product.id,
      occasion_id: occasionId,
      sort_order: index,
    })),
  ),
  product_variants: bundle.catalog.products.flatMap((product) =>
    product.variants.map((variant) => ({
      id: variant.id,
      product_id: product.id,
      sku: variant.sku,
      size: variant.size,
      price_idr: variant.priceIdr,
      status: variant.status,
      sort_order: variant.sortOrder,
    })),
  ),
  product_variant_costs: bundle.catalog.products.flatMap((product) =>
    product.variants
      .filter((variant) => variant.costIdr !== undefined && variant.costIdr !== null)
      .map((variant) => ({ variant_id: variant.id, cost_idr: variant.costIdr })),
  ),
  product_images: bundle.catalog.products.flatMap((product) =>
    product.images.map((image) => ({
      id: image.id,
      product_id: product.id,
      storage_path: image.storagePath,
      alt_text: image.altText ?? null,
      sort_order: image.sortOrder,
      is_primary: image.isPrimary,
      mime_type: image.mimeType,
      byte_size: image.byteSize ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
    })),
  ),
  customers: bundle.customers.customers.map((customer) => ({
    id: customer.id,
    revision: customer.revision,
    name: customer.name,
    whatsapp_number: customer.whatsappNumber,
    normalized_whatsapp_number: customer.normalizedWhatsappNumber,
    email: customer.email ?? null,
    birthday: customer.birthday ?? null,
    preferred_branch_id: customer.preferredBranchId ?? null,
    tags: customer.tags,
    notes: customer.notes ?? null,
    promo_code: customer.promoCode ?? null,
    created_source: customer.createdSource,
    last_order_at: customer.lastOrderAt ?? null,
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  })),
  customer_addresses: bundle.customers.addresses.map((address) => ({
    id: address.id,
    customer_id: address.customerId,
    label: address.label ?? null,
    recipient_name: address.recipientName ?? null,
    whatsapp_number: address.whatsappNumber ?? null,
    address: address.address,
    city: address.city ?? null,
    postal_code: address.postalCode ?? null,
    delivery_notes: address.deliveryNotes ?? null,
    is_default: address.isDefault,
  })),
  orders: bundle.orders.orders.map((order) => ({
    id: order.id,
    order_number: order.orderNumber,
    revision: order.revision,
    storefront_idempotency_key: order.storefrontIdempotencyKey ?? null,
    customer_id: order.customerId ?? null,
    customer_name_snapshot: order.customerNameSnapshot,
    customer_whatsapp_snapshot: order.customerWhatsappSnapshot ?? null,
    customer_email_snapshot: order.customerEmailSnapshot ?? null,
    customer_profile_suggestions: order.customerProfileSuggestions ?? {},
    source: order.source,
    fulfillment: order.fulfillment,
    status: order.status,
    branch_id: order.branchId,
    total_idr: order.totalIdr,
    items_subtotal_idr: order.itemsSubtotalIdr,
    discount_idr: order.discountIdr,
    delivery_fee_idr: order.deliveryFeeIdr,
    payment_status: order.paymentStatus,
    payment_method: order.paymentMethod ?? null,
    paid_amount_idr: order.paidAmountIdr,
    schedule_label: order.scheduleLabel ?? null,
    schedule_date: order.scheduleDate ?? null,
    schedule_time: order.scheduleTime ?? null,
    requested_pickup_date: order.requestedPickupDate ?? null,
    requested_pickup_time: order.requestedPickupTime ?? null,
    actual_picked_up_at: order.actualPickedUpAt ?? null,
    order_note: order.orderNote ?? null,
    greeting_message: order.greetingMessage ?? null,
    greeting_card_name: order.greetingCardName ?? null,
    delivery_address: order.deliveryAddress ?? null,
    delivery_instructions: order.deliveryInstructions ?? null,
    promo_code: order.promoCode ?? null,
    completed_at: order.completedAt ?? null,
    finance_verified: order.financeVerified ?? false,
    finance_verified_by: order.financeVerifiedBy ?? null,
    finance_verified_at: order.financeVerifiedAt ?? null,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  })),
  order_items: bundle.orders.orders.flatMap((order) =>
    order.items.map((item) => ({
      id: item.id,
      order_id: order.id,
      product_id: item.productId ?? null,
      variant_id: item.variantId ?? null,
      product_code_snapshot: item.productCodeSnapshot ?? null,
      product_name_snapshot: item.productNameSnapshot,
      variant_sku_snapshot: item.variantSkuSnapshot ?? null,
      variant_size_snapshot: item.variantSizeSnapshot ?? null,
      quantity: item.quantity,
      unit_price_idr: item.unitPriceIdr,
    })),
  ),
})

export const summarizeSupabaseSharedImportPlan = (plan: SupabaseSharedImportPlan): Record<string, number> =>
  Object.fromEntries(Object.entries(plan).map(([table, rows]) => [table, rows.length]))
