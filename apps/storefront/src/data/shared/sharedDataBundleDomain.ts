/** Pure validation and deterministic fingerprinting for Phase 10 bundles. */
import { validateSharedStoreSnapshot } from './sharedStoreContract'
import { normalizeCustomerWhatsappNumber } from './customerIdentityDomain'
import { SHARED_DATA_BUNDLE_KIND, SHARED_DATA_BUNDLE_VERSION, type SharedDataBundleV1, type SharedDataBundleValidationResult } from './sharedDataBundleTypes'

const uniqueValues = (values: string[]): boolean => new Set(values).size === values.length

export const stableStringifySharedData = (value: unknown): string => {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit)
    if (!input || typeof input !== 'object') return input
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, visit(item)]),
    )
  }
  return JSON.stringify(visit(value))
}

/** Non-cryptographic integrity fingerprint for parity checks and QA logs. */
export const fingerprintSharedDataBundle = (bundle: SharedDataBundleV1): string => {
  // Export metadata (source app/time/note) is deliberately excluded so two
  // apps with identical domain data produce the same parity fingerprint.
  const canonical = stableStringifySharedData({
    catalog: bundle.catalog,
    store: bundle.store,
    customers: bundle.customers,
    orders: bundle.orders,
  })
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export const validateSharedDataBundle = (bundle: SharedDataBundleV1): SharedDataBundleValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  if (bundle.kind !== SHARED_DATA_BUNDLE_KIND) errors.push('Unsupported shared-data bundle kind.')
  if (bundle.version !== SHARED_DATA_BUNDLE_VERSION) errors.push(`Unsupported shared-data bundle version: ${bundle.version}.`)
  if (!bundle.exportedAt || Number.isNaN(Date.parse(bundle.exportedAt))) errors.push('Bundle exportedAt must be a valid ISO timestamp.')

  const occasionIds = bundle.catalog.occasions.map((occasion) => occasion.id)
  const occasionNames = bundle.catalog.occasions.map((occasion) => occasion.name.toLowerCase())
  if (!uniqueValues(occasionIds)) errors.push('Catalog contains duplicate occasion IDs.')
  if (!uniqueValues(occasionNames)) errors.push('Catalog contains duplicate occasion names.')

  const productIds = bundle.catalog.products.map((product) => product.id)
  const productCodes = bundle.catalog.products.map((product) => product.productCode)
  if (!uniqueValues(productIds)) errors.push('Catalog contains duplicate product IDs.')
  if (!uniqueValues(productCodes)) errors.push('Catalog contains duplicate product codes.')

  const knownOccasions = new Set(occasionIds)
  const allSkus: string[] = []
  const allVariantIds: string[] = []
  for (const product of bundle.catalog.products) {
    if (!product.id.trim() || !product.productCode.trim() || !product.name.trim()) {
      errors.push('Catalog contains a product with missing identity fields.')
    }
    if (product.primaryOccasionId && !knownOccasions.has(product.primaryOccasionId)) {
      errors.push(`Product ${product.productCode} references unknown primary occasion ${product.primaryOccasionId}.`)
    }
    for (const occasionId of product.occasionIds) {
      if (!knownOccasions.has(occasionId)) errors.push(`Product ${product.productCode} references unknown occasion ${occasionId}.`)
    }
    if (product.variants.length === 0) errors.push(`Product ${product.productCode} has no variants.`)
    for (const variant of product.variants) {
      allSkus.push(variant.sku)
      allVariantIds.push(variant.id)
      if (variant.productId !== product.id) errors.push(`Variant ${variant.sku} has the wrong productId.`)
      if (!variant.sku.trim()) errors.push(`Product ${product.productCode} contains an empty SKU.`)
      if (variant.priceIdr < 0) errors.push(`Variant ${variant.sku} has a negative price.`)
    }
  }
  if (!uniqueValues(allSkus)) errors.push('Catalog contains duplicate SKUs.')
  if (!uniqueValues(allVariantIds)) errors.push('Catalog contains duplicate variant IDs.')
  const productCodeSet = new Set(productCodes)
  for (const deletedCode of bundle.catalog.adminState.deletedProductCodes) {
    if (productCodeSet.has(deletedCode)) errors.push(`Deleted product code ${deletedCode} is still active in the Catalog.`)
  }
  if (!uniqueValues(bundle.catalog.adminState.deletedProductCodes)) errors.push('Catalog tombstones contain duplicate product codes.')
  const imageIds = bundle.catalog.products.flatMap((product) => product.images.map((image) => image.id))
  const imagePaths = bundle.catalog.products.flatMap((product) => product.images.map((image) => image.storagePath))
  if (!uniqueValues(imageIds)) errors.push('Catalog contains duplicate image IDs.')
  if (!uniqueValues(imagePaths)) errors.push('Catalog contains duplicate image storage paths.')
  for (const product of bundle.catalog.products) {
    const primaryImages = product.images.filter((image) => image.isPrimary)
    if (product.images.length > 0 && primaryImages.length !== 1) errors.push(`Product ${product.productCode} must have exactly one primary image.`)
    for (const image of product.images) {
      if (image.productId !== product.id) errors.push(`Image ${image.id} has the wrong productId.`)
      if (!image.storagePath.trim()) errors.push(`Image ${image.id} is missing a storage path.`)
      if (image.byteSize !== undefined && image.byteSize > 102400) errors.push(`Image ${image.id} exceeds the 100 KB shared-media limit.`)
    }
  }

  errors.push(...validateSharedStoreSnapshot(bundle.store.snapshot))
  const branchIds = new Set(bundle.store.snapshot.branches.map((branch) => branch.id))

  const customerIds = bundle.customers.customers.map((customer) => customer.id)
  const normalizedNumbers = bundle.customers.customers.map((customer) => customer.normalizedWhatsappNumber)
  if (!uniqueValues(customerIds)) errors.push('CRM contains duplicate customer IDs.')
  if (!uniqueValues(normalizedNumbers)) errors.push('CRM contains duplicate normalized WhatsApp identities.')
  for (const customer of bundle.customers.customers) {
    const normalized = normalizeCustomerWhatsappNumber(customer.whatsappNumber)
    if (normalized !== customer.normalizedWhatsappNumber) {
      errors.push(`Customer ${customer.id} has inconsistent normalized WhatsApp data.`)
    }
    if (customer.preferredBranchId && !branchIds.has(customer.preferredBranchId)) {
      warnings.push(`Customer ${customer.id} references inactive/missing preferred branch ${customer.preferredBranchId}.`)
    }
  }

  const knownCustomers = new Set(customerIds)
  const addressIds = bundle.customers.addresses.map((address) => address.id)
  if (!uniqueValues(addressIds)) errors.push('CRM contains duplicate customer-address IDs.')
  const defaultAddressCount = new Map<string, number>()
  for (const address of bundle.customers.addresses) {
    if (!knownCustomers.has(address.customerId)) errors.push(`Customer address ${address.id} references unknown customer ${address.customerId}.`)
    if (!address.address.trim()) errors.push(`Customer address ${address.id} has an empty address.`)
    if (address.isDefault) defaultAddressCount.set(address.customerId, (defaultAddressCount.get(address.customerId) ?? 0) + 1)
  }
  for (const [customerId, count] of defaultAddressCount) {
    if (count > 1) errors.push(`Customer ${customerId} has more than one default saved address.`)
  }

  const knownProducts = new Set(productIds)
  const knownVariants = new Set(allVariantIds)
  const orderIds = bundle.orders.orders.map((order) => order.id)
  const orderNumbers = bundle.orders.orders.map((order) => order.orderNumber)
  const idempotencyKeys = bundle.orders.orders
    .map((order) => order.storefrontIdempotencyKey)
    .filter((value): value is string => Boolean(value))
  if (!uniqueValues(orderIds)) errors.push('Orders contain duplicate stable IDs.')
  if (!uniqueValues(orderNumbers)) errors.push('Orders contain duplicate order numbers.')
  if (!uniqueValues(idempotencyKeys)) errors.push('Orders contain duplicate Storefront idempotency keys.')

  const orderItemIds: string[] = []
  for (const order of bundle.orders.orders) {
    if (!branchIds.has(order.branchId)) errors.push(`Order ${order.orderNumber} references unknown branch ${order.branchId}.`)
    if (order.customerId && !knownCustomers.has(order.customerId)) {
      warnings.push(`Order ${order.orderNumber} references missing CRM customer ${order.customerId}; historical snapshot remains usable.`)
    }
    if ([order.totalIdr, order.itemsSubtotalIdr, order.discountIdr, order.deliveryFeeIdr, order.paidAmountIdr].some((value) => value < 0)) {
      errors.push(`Order ${order.orderNumber} contains a negative monetary value.`)
    }
    const expectedTotal = Math.max(0, order.itemsSubtotalIdr - order.discountIdr + order.deliveryFeeIdr)
    if (expectedTotal !== order.totalIdr) warnings.push(`Order ${order.orderNumber} total differs from subtotal - discount + delivery snapshot.`)
    const derivedSubtotal = order.items.reduce((sum, item) => sum + item.unitPriceIdr * item.quantity, 0)
    if (derivedSubtotal !== order.itemsSubtotalIdr) {
      warnings.push(`Order ${order.orderNumber} item subtotal differs from the stored subtotal snapshot.`)
    }
    for (const item of order.items) {
      orderItemIds.push(item.id)
      if (item.orderId !== order.id) errors.push(`Order item ${item.id} points to the wrong orderId.`)
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) errors.push(`Order item ${item.id} has an invalid quantity.`)
      if (item.unitPriceIdr < 0) errors.push(`Order item ${item.id} has a negative unit price.`)
      if (item.productId && !knownProducts.has(item.productId)) {
        warnings.push(`Order ${order.orderNumber} references retired/missing product ${item.productId}; snapshot remains usable.`)
      }
      if (item.variantId && !knownVariants.has(item.variantId)) {
        warnings.push(`Order ${order.orderNumber} references retired/missing variant ${item.variantId}; snapshot remains usable.`)
      }
    }
  }
  if (!uniqueValues(orderItemIds)) errors.push('Orders contain duplicate order-item IDs.')

  return { valid: errors.length === 0, errors, warnings }
}

