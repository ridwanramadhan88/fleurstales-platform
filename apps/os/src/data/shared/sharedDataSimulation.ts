/**
 * In-memory Phase 10 shared-data simulator. Both builds can start from the
 * same portable bundle and exercise repository reads/mutations without a
 * Supabase project.
 */
import type {
  CatalogAdminRepository,
  CustomerAdminRepository,
  OrdersAdminRepository,
  StoreAdminRepository,
  StorefrontCheckoutRepository,
} from './repositoryContracts'
import type { CreateStorefrontOrderInput, CreateStorefrontOrderResult, SharedCustomer, SharedOrder, SharedProductImage, SharedSizeGuideTarget, SharedSizeGuideTemplate } from './contracts'
import type { SharedDataBundleV1 } from './sharedDataBundleTypes'
import { fingerprintSharedDataBundle, validateSharedDataBundle } from './sharedDataBundleDomain'
import {
  assertValidCustomerIntake,
  buildCanonicalOrderCustomerSnapshot,
  cleanCustomerBirthday,
  cleanCustomerEmail,
  cleanCustomerName,
  getCanonicalCustomerSuggestions,
  normalizeCustomerWhatsappNumber,
} from './customerIdentityDomain'

export interface SharedDataSimulation {
  getBundle(): SharedDataBundleV1
  getFingerprint(): string
  replaceBundle(bundle: SharedDataBundleV1): void
  subscribe(listener: (bundle: SharedDataBundleV1) => void): () => void
  catalog: CatalogAdminRepository
  store: StoreAdminRepository
  customersAdmin: CustomerAdminRepository
  ordersAdmin: OrdersAdminRepository
  storefrontCheckout: StorefrontCheckoutRepository
}

export interface SharedDataSimulationOptions {
  /** Deterministic clock for parity QA; defaults to the real current time. */
  now?: () => string
  /** Deterministic ID source for parity QA; defaults to crypto/random IDs. */
  idFactory?: (kind: 'customer' | 'order' | 'order_item') => string
}

const clone = <T,>(value: T): T => structuredClone(value)

export const createSharedDataSimulation = (initialBundle: SharedDataBundleV1, options: SharedDataSimulationOptions = {}): SharedDataSimulation => {
  const initialValidation = validateSharedDataBundle(initialBundle)
  if (!initialValidation.valid) throw new Error(`Invalid simulation bundle: ${initialValidation.errors.join(' ')}`)
  let bundle = clone(initialBundle)
  const now = options.now ?? (() => new Date().toISOString())
  let fallbackIdSequence = 0
  const idFactory = options.idFactory ?? ((kind: 'customer' | 'order' | 'order_item') => {
    fallbackIdSequence += 1
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${fallbackIdSequence.toString(36)}`
    const prefix = kind === 'customer' ? 'cust' : kind === 'order' ? 'order' : 'line'
    return `${prefix}_${random}`
  })
  const listeners = new Set<(value: SharedDataBundleV1) => void>()
  const emit = () => listeners.forEach((listener) => listener(clone(bundle)))
  let sizeGuideTemplates: SharedSizeGuideTemplate[] = []
  let sizeGuideTargets: SharedSizeGuideTarget[] = []
  let arrangementTypes = [...new Set(
    bundle.catalog.products
      .map((product) => product.productType?.trim())
      .filter((value): value is string => Boolean(value)),
  )]

  const catalog: CatalogAdminRepository = {
    async listOccasions(options) {
      const rows = bundle.catalog.occasions
      return clone(options?.includeInactive ? rows : rows.filter((row) => row.isActive))
    },
    async listArrangementTypes() {
      return arrangementTypes.map((name, sortOrder) => ({ name, sortOrder }))
    },
    async listProducts(options) {
      let rows = options?.includeInactive ? bundle.catalog.products : bundle.catalog.products.filter((row) => row.isActive)
      rows = rows.map((product) => ({
        ...product,
        variants: product.variants.map((variant) =>
          options?.includeCosts ? variant : { ...variant, costIdr: undefined }),
      }))
      return clone(rows)
    },
    async getProduct(productId) {
      return clone(bundle.catalog.products.find((row) => row.id === productId) ?? null)
    },
    async listSizeGuideTemplates() { return clone(sizeGuideTemplates) },
    async listSizeGuideTargets() { return clone(sizeGuideTargets) },
    async getAdminState() {
      return clone(bundle.catalog.adminState)
    },
    async replaceSnapshot(input) {
      if (input.baseRevision !== bundle.catalog.adminState.revision) {
        throw new Error(`CATALOG_CONFLICT: expected revision ${input.baseRevision}, current revision ${bundle.catalog.adminState.revision}.`)
      }
      bundle.catalog = {
        ...bundle.catalog,
        adminState: {
          ...bundle.catalog.adminState,
          revision: bundle.catalog.adminState.revision + 1,
        },
        occasions: clone(input.occasions),
        products: clone(input.products),
      }
      emit()
      return {
        revision: bundle.catalog.adminState.revision,
        productCount: bundle.catalog.products.length,
        occasionCount: bundle.catalog.occasions.length,
      }
    },
    async replaceArrangementTypes(names) {
      arrangementTypes = [...names]
      return { count: arrangementTypes.length }
    },
    async uploadProductImage(input) {
      const image: SharedProductImage = {
        ...input.image,
        productId: input.productId,
        publicUrl: `local-simulation://${input.image.storagePath}`,
      }
      return clone(image)
    },
    async replaceProductImagesMetadata(input) {
      if (input.baseRevision !== bundle.catalog.adminState.revision) {
        throw new Error(`CATALOG_CONFLICT: expected revision ${input.baseRevision}, current revision ${bundle.catalog.adminState.revision}.`)
      }
      const product = bundle.catalog.products.find((row) => row.id === input.productId)
      if (!product) throw new Error('Product not found.')
      product.images = input.images.map((image) => ({
        ...image,
        productId: input.productId,
        publicUrl: `local-simulation://${image.storagePath}`,
      }))
      bundle.catalog.adminState.revision += 1
      emit()
      return { revision: bundle.catalog.adminState.revision, productId: input.productId, imageCount: input.images.length }
    },
    async removeProductImageObjects() {
      // In-memory simulation has no binary object store.
    },
    async uploadSizeGuide(input) {
      return clone({ ...input.template, publicUrl: `local-simulation://${input.template.storagePath}` })
    },
    async replaceSizeGuideLibrary(input) {
      sizeGuideTemplates = clone(input.templates)
      sizeGuideTargets = clone(input.targets)
      return { templateCount: sizeGuideTemplates.length, targetCount: sizeGuideTargets.length }
    },
    async removeSizeGuideObjects() {
      // In-memory simulation has no binary object store.
    },
  }

  const store: StoreAdminRepository = {
    async getStoreProfile() { return clone(bundle.store.snapshot.profile) },
    async listBranches(options) {
      const rows = bundle.store.snapshot.branches
      return clone(options?.includeInactive ? rows : rows.filter((row) => row.isActive))
    },
    async listPublicPaymentAccounts(options) {
      return clone(bundle.store.snapshot.paymentAccounts.filter((account) =>
        (options?.includeInactive || account.isActive)
        && (options?.includeHidden || account.isCustomerVisible)
        && (!options?.branchId || account.branchIds.length === 0 || account.branchIds.includes(options.branchId)),
      ))
    },
    async getPaymentInstructions() { return bundle.store.snapshot.paymentInstructions },
    async getAdminState() { return clone(bundle.store.adminState) },
    async replaceSnapshot(input) {
      if (input.baseRevision !== bundle.store.adminState.revision) {
        throw new Error(`STORE_CONFLICT: expected revision ${input.baseRevision}, current revision ${bundle.store.adminState.revision}.`)
      }
      bundle.store = {
        adminState: { revision: bundle.store.adminState.revision + 1, updatedAt: now() },
        snapshot: clone(input.snapshot),
      }
      emit()
      return {
        revision: bundle.store.adminState.revision,
        branchCount: bundle.store.snapshot.branches.length,
        paymentAccountCount: bundle.store.snapshot.paymentAccounts.length,
      }
    },
  }

  const customersAdmin: CustomerAdminRepository = {
    async listCustomers() { return clone(bundle.customers.customers) },
    async listBusinessMetrics(customerId) {
      const customers = customerId
        ? bundle.customers.customers.filter((row) => row.id === customerId)
        : bundle.customers.customers
      return clone(customers.map((customer) => {
        const verified = bundle.orders.orders.filter((order) =>
          order.customerId === customer.id
          && order.financeVerified === true
          && (order.paymentStatus === 'paid' || order.paymentStatus === 'partial')
          && order.status !== 'cancelled'
          && order.status !== 'failed'
        )
        const lifetimeSpendIdr = verified.reduce((sum, order) => sum + (order.paidAmountIdr ?? order.totalIdr), 0)
        const orderCount = verified.filter((order) => order.status === 'delivered' || order.status === 'picked_up').length
        return {
          customerId: customer.id,
          lifetimeSpendIdr,
          orderCount,
          segment: orderCount === 0 ? 'new' : lifetimeSpendIdr >= 1_000_000 || orderCount >= 5 ? 'vip' : 'regular',
        }
      }))
    },
    async getCustomer(customerId) { return clone(bundle.customers.customers.find((row) => row.id === customerId) ?? null) },
    async listCustomerAddresses(customerId) { return clone(bundle.customers.addresses.filter((row) => row.customerId === customerId)) },
    async findCustomerByWhatsapp(whatsappNumber) {
      const normalized = normalizeCustomerWhatsappNumber(whatsappNumber)
      return clone(bundle.customers.customers.find((row) => row.normalizedWhatsappNumber === normalized) ?? null)
    },
    async saveCustomer(customer, baseRevision) {
      const existingIndex = bundle.customers.customers.findIndex((row) => row.id === customer.id)
      const duplicate = bundle.customers.customers.find((row) =>
        row.id !== customer.id && row.normalizedWhatsappNumber === customer.normalizedWhatsappNumber,
      )
      if (duplicate) throw new Error('CUSTOMER_DUPLICATE_WHATSAPP')
      let saved: SharedCustomer
      if (existingIndex >= 0) {
        const existing = bundle.customers.customers[existingIndex]
        if (baseRevision !== undefined && baseRevision !== existing.revision) {
          throw new Error(`CUSTOMER_CONFLICT: expected revision ${baseRevision}, current revision ${existing.revision}.`)
        }
        saved = { ...clone(customer), revision: existing.revision + 1, updatedAt: now() }
        bundle.customers.customers[existingIndex] = saved
      } else {
        saved = { ...clone(customer), revision: Math.max(1, customer.revision), createdAt: customer.createdAt || now(), updatedAt: now() }
        bundle.customers.customers.unshift(saved)
      }
      emit()
      return clone(saved)
    },
    async deleteCustomer(customerId, baseRevision) {
      const existing = bundle.customers.customers.find((row) => row.id === customerId)
      if (!existing) return
      if (existing.revision !== baseRevision) throw new Error(`CUSTOMER_CONFLICT: expected revision ${baseRevision}, current revision ${existing.revision}.`)
      bundle.customers.customers = bundle.customers.customers.filter((row) => row.id !== customerId)
      bundle.customers.addresses = bundle.customers.addresses.filter((row) => row.customerId !== customerId)
      emit()
    },
  }

  let storefrontCheckout: StorefrontCheckoutRepository

  const ordersAdmin: OrdersAdminRepository = {
    async listOrders(options) {
      return clone(bundle.orders.orders.filter((order) =>
        (!options?.branchId || order.branchId === options.branchId)
        && (!options?.customerId || order.customerId === options.customerId),
      ))
    },
    async getOrder(orderId) {
      return clone(bundle.orders.orders.find((row) => row.id === orderId) ?? null)
    },
    async quoteInternalOrder(input) {
      const branch = bundle.store.snapshot.branches.find((row) => row.id === input.branchId && row.isActive)
      if (!branch) throw new Error('Selected branch is unavailable.')
      const itemsSubtotalIdr = input.items.reduce((sum, item) => {
        if (item.mode === 'catalog') {
          const product = bundle.catalog.products.find((row) => row.id === item.productId && row.isActive)
          const variant = product?.variants.find((row) => row.id === item.variantId && row.status === 'active')
          if (!product || !variant) throw new Error('A selected product or variant is unavailable.')
          return sum + variant.priceIdr * item.quantity
        }
        if (!(item.unitPriceIdr && item.unitPriceIdr > 0)) throw new Error('Custom item price is required.')
        return sum + item.unitPriceIdr * item.quantity
      }, 0)
      const deliveryFeeIdr = input.fulfillment === 'delivery' ? branch.deliveryFeeIdr : 0
      return {
        itemsSubtotalIdr,
        deliveryFeeIdr,
        discountIdr: 0,
        totalIdr: itemsSubtotalIdr + deliveryFeeIdr,
        promoCode: input.promoCode?.trim().toUpperCase() || undefined,
        promoAccepted: false,
        ...(input.promoCode ? { promoMessage: 'Voucher validation requires Supabase.' } : {}),
      }
    },
    async createInternalOrder(input) {
      if (input.items.some((item) => item.mode !== 'catalog' || !item.productId || !item.variantId)) {
        throw new Error('The dependency-free simulator supports catalog-backed internal items only.')
      }
      const created = await storefrontCheckout.createOrder({
        idempotencyKey: input.idempotencyKey,
        customer: input.customer,
        branchId: input.branchId,
        fulfillment: input.fulfillment,
        scheduleDate: input.scheduleDate,
        scheduleTime: input.scheduleTime,
        items: input.items.map((item) => ({ productId: item.productId!, variantId: item.variantId!, quantity: item.quantity })),
        deliveryAddress: input.deliveryAddress,
        deliveryInstructions: input.deliveryInstructions,
        orderNote: input.orderNote,
        greetingMessage: input.greetingMessage,
        greetingCardName: input.greetingCardName,
        paymentMethod: input.paymentMethod,
        promoCode: input.promoCode,
      })
      const order = bundle.orders.orders.find((row) => row.id === created.orderId)
      const paidAmountIdr = Math.max(0, Math.min(input.depositAmountIdr, created.totalIdr))
      if (order) {
        order.source = input.source
        order.paidAmountIdr = paidAmountIdr
        order.paymentStatus = paidAmountIdr >= order.totalIdr ? 'paid' : paidAmountIdr > 0 ? 'partial' : 'unpaid'
        order.updatedAt = now()
        emit()
      }
      return { ...created, paidAmountIdr }
    },
  }

  const jakartaDateParts = (iso: string): { date: string; year: number } => {
    const date = new Date(iso)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return { date: `${values.year}-${values.month}-${values.day}`, year: Number(values.year) }
  }

  const weekdayForDate = (date: string): string =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(`${date}T12:00:00.000Z`))
      .toLowerCase()

  const allocateOrderNumber = (branchId: string, at: string): string => {
    const branch = bundle.store.snapshot.branches.find((row) => row.id === branchId)
    if (!branch) throw new Error('Selected branch is unavailable.')
    const { year } = jakartaDateParts(at)
    const prefix = `${branch.code.toUpperCase()}-${year}-`
    const lastSequence = bundle.orders.orders.reduce((max, order) => {
      if (!order.orderNumber.toUpperCase().startsWith(prefix)) return max
      const sequence = Number(order.orderNumber.slice(prefix.length))
      return Number.isInteger(sequence) ? Math.max(max, sequence) : max
    }, 0)
    return `${prefix}${String(lastSequence + 1).padStart(4, '0')}`
  }

  const buildExistingOrderResult = (order: SharedOrder): CreateStorefrontOrderResult => ({
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId ?? '',
    itemsSubtotalIdr: order.itemsSubtotalIdr,
    deliveryFeeIdr: order.deliveryFeeIdr,
    discountIdr: order.discountIdr,
    totalIdr: order.totalIdr,
    deduplicated: true,
  })

  storefrontCheckout = {
    async quoteOrder(input) {
      assertValidCustomerIntake(input.customer)
      const branch = bundle.store.snapshot.branches.find((row) => row.id === input.branchId && row.isActive)
      if (!branch) throw new Error('Selected branch is unavailable.')
      const resolved = input.items.map((requested) => {
        const product = bundle.catalog.products.find((row) => row.id === requested.productId && row.isActive)
        const variant = product?.variants.find((row) => row.id === requested.variantId && row.status === 'active')
        if (!product || !variant) throw new Error('A selected product or variant is unavailable.')
        return variant.priceIdr * requested.quantity
      })
      const itemsSubtotalIdr = resolved.reduce((sum, amount) => sum + amount, 0)
      const deliveryFeeIdr = input.fulfillment === 'delivery' ? branch.deliveryFeeIdr : 0
      const promoCode = input.promoCode?.trim().toUpperCase()
      return {
        itemsSubtotalIdr,
        deliveryFeeIdr,
        discountIdr: 0,
        totalIdr: itemsSubtotalIdr + deliveryFeeIdr,
        ...(promoCode ? { promoCode, promoAccepted: false, promoMessage: 'Voucher validation requires Supabase.' } : { promoAccepted: false }),
      }
    },
    async createOrder(input: CreateStorefrontOrderInput) {
      const idempotencyKey = input.idempotencyKey.trim()
      if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
        throw new Error('A valid checkout idempotency key is required.')
      }
      const duplicate = bundle.orders.orders.find((order) => order.storefrontIdempotencyKey === idempotencyKey)
      if (duplicate) return buildExistingOrderResult(duplicate)

      assertValidCustomerIntake(input.customer)
      if (input.fulfillment !== 'delivery' && input.fulfillment !== 'pickup') throw new Error('Invalid fulfillment type.')
      const paymentMethod = input.paymentMethod ?? 'transfer'
      if (paymentMethod !== 'transfer' && paymentMethod !== 'cash') throw new Error('Invalid payment method.')
      if (input.fulfillment === 'delivery' && !input.deliveryAddress?.trim()) throw new Error('Delivery address is required.')
      if (input.fulfillment === 'delivery' && paymentMethod === 'cash') throw new Error('Cash payment is only available for pickup orders.')

      const branch = bundle.store.snapshot.branches.find((row) => row.id === input.branchId && row.isActive)
      if (!branch) throw new Error('Selected branch is unavailable.')
      if (!input.scheduleDate || !input.scheduleTime) throw new Error('Schedule date and time are required.')
      const current = now()
      const jakarta = jakartaDateParts(current)
      if (input.scheduleDate < jakarta.date) throw new Error('Schedule date cannot be in the past.')

      if (paymentMethod === 'transfer') {
        const transferAvailable = bundle.store.snapshot.paymentAccounts.some((account) =>
          account.isActive
          && account.isCustomerVisible
          && (account.branchIds.length === 0 || account.branchIds.includes(branch.id)),
        )
        if (!transferAvailable) throw new Error('Bank transfer is unavailable for this branch.')
      }

      const weekday = weekdayForDate(input.scheduleDate)
      const hours = branch.openingHours[weekday]
      if (!hours?.isOpen) throw new Error('Selected branch is closed on this date.')
      if (!hours.opensAt || !hours.closesAt || input.scheduleTime < hours.opensAt || input.scheduleTime > hours.closesAt) {
        throw new Error('Selected time is outside branch opening hours.')
      }
      if (input.items.length < 1 || input.items.length > 20) throw new Error('Order must contain between 1 and 20 items.')

      const resolvedItems = input.items.map((requested) => {
        if (!Number.isInteger(requested.quantity) || requested.quantity < 1 || requested.quantity > 99) {
          throw new Error('Item quantity must be between 1 and 99.')
        }
        const product = bundle.catalog.products.find((row) => row.id === requested.productId && row.isActive)
        if (!product) throw new Error('A selected product is unavailable.')
        const variant = product.variants.find((row) => row.id === requested.variantId && row.productId === product.id && row.status === 'active')
        if (!variant) throw new Error('A selected product variant is unavailable.')
        return { product, variant, quantity: requested.quantity }
      })

      const itemsSubtotalIdr = resolvedItems.reduce((sum, row) => sum + row.variant.priceIdr * row.quantity, 0)
      const deliveryFeeIdr = input.fulfillment === 'delivery' ? branch.deliveryFeeIdr : 0
      const totalIdr = itemsSubtotalIdr + deliveryFeeIdr

      const normalizedWhatsappNumber = normalizeCustomerWhatsappNumber(input.customer.whatsappNumber)
      const customerName = cleanCustomerName(input.customer.name)
      const customerEmail = cleanCustomerEmail(input.customer.email)
      const customerBirthday = cleanCustomerBirthday(input.customer.birthday)
      let customer = bundle.customers.customers.find((row) => row.normalizedWhatsappNumber === normalizedWhatsappNumber)
      let suggestions = {}

      if (!customer) {
        customer = {
          id: idFactory('customer'),
          revision: 1,
          name: customerName,
          whatsappNumber: input.customer.whatsappNumber.trim() || normalizedWhatsappNumber,
          normalizedWhatsappNumber,
          ...(customerEmail ? { email: customerEmail } : {}),
          ...(customerBirthday ? { birthday: customerBirthday } : {}),
          preferredBranchId: branch.id,
          tags: [],
          createdSource: 'storefront',
          lastOrderAt: current,
          createdAt: current,
          updatedAt: current,
        }
        bundle.customers.customers.unshift(customer)
      } else {
        suggestions = getCanonicalCustomerSuggestions(customer, {
          email: customerEmail,
          birthday: customerBirthday,
          preferredBranchId: branch.id,
        })
        customer = { ...customer, lastOrderAt: current, updatedAt: current }
        const index = bundle.customers.customers.findIndex((row) => row.id === customer!.id)
        bundle.customers.customers[index] = customer
      }

      const customerSnapshot = buildCanonicalOrderCustomerSnapshot(customer, {
        ...input.customer,
        preferredBranchId: branch.id,
      })
      const orderId = idFactory('order')
      const orderNumber = allocateOrderNumber(branch.id, current)
      const order: SharedOrder = {
        id: orderId,
        orderNumber,
        revision: 1,
        storefrontIdempotencyKey: idempotencyKey,
        customerId: customer.id,
        customerNameSnapshot: customerSnapshot.name,
        customerWhatsappSnapshot: customerSnapshot.whatsappNumber,
        ...(customerSnapshot.email ? { customerEmailSnapshot: customerSnapshot.email } : {}),
        ...(Object.keys(suggestions).length ? { customerProfileSuggestions: suggestions } : {}),
        source: 'customer_app',
        fulfillment: input.fulfillment,
        status: 'pending_verification',
        branchId: branch.id,
        totalIdr,
        itemsSubtotalIdr,
        discountIdr: 0,
        deliveryFeeIdr,
        paymentStatus: 'unpaid',
        paymentMethod,
        paidAmountIdr: 0,
        scheduleLabel: `${input.scheduleDate} · ${input.scheduleTime}`,
        scheduleDate: input.scheduleDate,
        scheduleTime: input.scheduleTime,
        ...(input.fulfillment === 'pickup' ? { requestedPickupDate: input.scheduleDate, requestedPickupTime: input.scheduleTime } : {}),
        ...(input.orderNote?.trim() ? { orderNote: input.orderNote.trim() } : {}),
        ...(input.greetingMessage?.trim() ? { greetingMessage: input.greetingMessage.trim() } : {}),
        ...(input.greetingCardName?.trim() ? { greetingCardName: input.greetingCardName.trim() } : {}),
        ...(input.fulfillment === 'delivery' && input.deliveryAddress?.trim() ? { deliveryAddress: input.deliveryAddress.trim() } : {}),
        ...(input.fulfillment === 'delivery' && input.deliveryInstructions?.trim() ? { deliveryInstructions: input.deliveryInstructions.trim() } : {}),
        ...(input.promoCode?.trim() ? { promoCode: input.promoCode.trim().toUpperCase() } : {}),
        createdAt: current,
        updatedAt: current,
        items: resolvedItems.map(({ product, variant, quantity }) => ({
          id: idFactory('order_item'),
          orderId,
          productId: product.id,
          variantId: variant.id,
          productCodeSnapshot: product.productCode,
          productNameSnapshot: product.name,
          variantSkuSnapshot: variant.sku,
          variantSizeSnapshot: variant.size,
          quantity,
          unitPriceIdr: variant.priceIdr,
        })),
      }

      bundle.orders.orders.unshift(order)
      const validation = validateSharedDataBundle(bundle)
      if (!validation.valid) throw new Error(`Simulation produced invalid shared data: ${validation.errors.join(' ')}`)
      emit()
      return {
        orderId,
        orderNumber,
        customerId: customer.id,
        itemsSubtotalIdr,
        deliveryFeeIdr,
        discountIdr: 0,
        totalIdr,
        deduplicated: false,
      }
    },
  }

  return {
    getBundle: () => clone(bundle),
    getFingerprint: () => fingerprintSharedDataBundle(bundle),
    replaceBundle(next) {
      const validation = validateSharedDataBundle(next)
      if (!validation.valid) throw new Error(`Invalid simulation bundle: ${validation.errors.join(' ')}`)
      bundle = clone(next)
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    catalog,
    store,
    customersAdmin,
    ordersAdmin,
    storefrontCheckout,
  }
}
