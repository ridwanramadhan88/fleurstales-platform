/**
 * Phase 11 deterministic end-to-end shared-data scenario.
 * Runs entirely against the portable Phase 10 simulation so the Business OS
 * and Storefront can prove identical domain behavior before Supabase exists.
 */
import type { SharedDataBundleV1 } from './sharedDataBundleTypes'
import { fingerprintSharedDataBundle, validateSharedDataBundle } from './sharedDataBundleDomain'
import { createSharedDataSimulation } from './sharedDataSimulation'

export interface SharedDataParityReport {
  initialFingerprint: string
  publicCatalog: {
    occasionCount: number
    productCount: number
    variantCostExposed: boolean
  }
  adminCatalog: {
    productCount: number
    firstVariantCostIdr: number | null
  }
  store: {
    activeBranchCount: number
    publicPaymentAccountCount: number
    deliveryFeeIdr: number
  }
  initialCustomerLookupId: string | null
  initialOrderSnapshot: {
    orderNumber: string
    productName: string
    unitPriceIdr: number
  }
  checkout: {
    firstOrderNumber: string
    secondOrderNumber: string
    replayDeduplicated: boolean
    replaySameOrder: boolean
    preservedCrmName: boolean
    crmEmailStillEmpty: boolean
    crmBirthdayStillEmpty: boolean
    orderSnapshotUsesSubmittedAlias: boolean
    orderSnapshotUsesSubmittedEmail: boolean
    suggestedEmail: string | null
    suggestedBirthday: string | null
  }
  authoritativeMutation: {
    catalogRevision: number
    storeRevision: number
    orderNumber: string
    lineUnitPriceIdr: number
    deliveryFeeIdr: number
    totalIdr: number
    promoCodeSnapshot: string | null
  }
  finalCounts: {
    customers: number
    orders: number
    orderItems: number
  }
  finalFingerprint: string
}

function assertQa(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PHASE11_PARITY_FAILED: ${message}`)
}

const deterministicIdFactory = () => {
  let sequence = 0
  return (kind: 'customer' | 'order' | 'order_item'): string => {
    sequence += 1
    const prefix = kind === 'customer' ? 'qa_customer' : kind === 'order' ? 'qa_order' : 'qa_line'
    return `${prefix}_${String(sequence).padStart(2, '0')}`
  }
}

export const runSharedDataParityScenario = async (sourceBundle: SharedDataBundleV1): Promise<SharedDataParityReport> => {
  const initial = structuredClone(sourceBundle)
  const initialValidation = validateSharedDataBundle(initial)
  assertQa(initialValidation.valid, initialValidation.errors.join(' '))

  const fixedNow = '2026-07-24T12:00:00.000Z'
  const simulation = createSharedDataSimulation(initial, {
    now: () => fixedNow,
    idFactory: deterministicIdFactory(),
  })

  const initialFingerprint = fingerprintSharedDataBundle(initial)
  const publicOccasions = await simulation.catalog.listOccasions()
  const publicProducts = await simulation.catalog.listProducts()
  const adminProducts = await simulation.catalog.listProducts({ includeInactive: true, includeCosts: true })
  assertQa(publicProducts.length > 0, 'Public Catalog should contain at least one product.')
  assertQa(adminProducts.length === initial.catalog.products.length, 'Admin Catalog should include the full fixture Catalog.')
  const publicCostExposed = publicProducts.some((product) => product.variants.some((variant) => variant.costIdr !== undefined))
  assertQa(!publicCostExposed, 'Public Catalog exposed a private product cost.')

  const branches = await simulation.store.listBranches()
  const paymentAccounts = await simulation.store.listPublicPaymentAccounts({ branchId: 'Kedamaian' })
  assertQa(branches.length === 1, 'Expected exactly one active fixture branch.')
  assertQa(paymentAccounts.length === 1, 'Expected one customer-visible payment account.')

  const initialCustomer = await simulation.customersAdmin.findCustomerByWhatsapp('+62 812-3456-7890')
  assertQa(initialCustomer?.id === 'cust-fixture', 'Normalized WhatsApp lookup did not resolve the fixture CRM customer.')
  const initialOrder = await simulation.ordersAdmin.getOrder('order-fixture-1')
  assertQa(initialOrder?.items[0]?.unitPriceIdr === 350000, 'Initial historical Order snapshot changed unexpectedly.')

  const firstCheckout = await simulation.storefrontCheckout.createOrder({
    idempotencyKey: 'phase11-new-customer-0001',
    customer: {
      name: 'QA Customer',
      whatsappNumber: '0812 9999 9999',
    },
    branchId: 'Kedamaian',
    fulfillment: 'pickup',
    scheduleDate: '2026-07-26',
    scheduleTime: '12:00',
    items: [{ productId: 'prod-fixture-rose', variantId: 'var-fixture-rose-m', quantity: 1 }],
    paymentMethod: 'transfer',
  })
  assertQa(firstCheckout.orderNumber === 'KDM-2026-0002', 'First simulated checkout did not continue the existing sequence.')
  assertQa(firstCheckout.totalIdr === 350000, 'Pickup checkout total should use authoritative Catalog price with no delivery fee.')

  const secondRequest = {
    idempotencyKey: 'phase11-existing-customer-0002',
    customer: {
      name: 'QA Checkout Alias',
      whatsappNumber: '+62 812 9999 9999',
      email: 'QA@EXAMPLE.COM',
      birthday: '1990-01-02',
    },
    branchId: 'Kedamaian',
    fulfillment: 'delivery' as const,
    scheduleDate: '2026-07-26',
    scheduleTime: '13:00',
    items: [{ productId: 'prod-fixture-rose', variantId: 'var-fixture-rose-m', quantity: 1 }],
    deliveryAddress: 'Phase 11 Delivery Address',
    paymentMethod: 'transfer' as const,
  }
  const secondCheckout = await simulation.storefrontCheckout.createOrder(secondRequest)
  assertQa(secondCheckout.orderNumber === 'KDM-2026-0003', 'Second simulated checkout sequence is incorrect.')
  assertQa(secondCheckout.deliveryFeeIdr === 25000 && secondCheckout.totalIdr === 375000, 'Delivery checkout did not use the shared branch fee.')

  const replay = await simulation.storefrontCheckout.createOrder(secondRequest)
  assertQa(replay.deduplicated, 'Idempotency replay was not deduplicated.')
  assertQa(replay.orderId === secondCheckout.orderId, 'Idempotency replay returned a different Order.')

  const qaCustomer = await simulation.customersAdmin.findCustomerByWhatsapp('6281299999999')
  assertQa(qaCustomer, 'New Storefront customer was not available through CRM lookup.')
  const secondOrder = await simulation.ordersAdmin.getOrder(secondCheckout.orderId)
  assertQa(secondOrder, 'New Storefront Order was not available through the OS Order repository.')
  assertQa(qaCustomer.name === 'QA Customer', 'Existing CRM name was silently overwritten by later checkout input.')
  assertQa(!qaCustomer.email && !qaCustomer.birthday, 'Existing CRM missing fields were silently written instead of suggested.')
  assertQa(secondOrder.customerNameSnapshot === 'QA Checkout Alias', 'Order snapshot did not preserve the submitted checkout name.')
  assertQa(secondOrder.customerEmailSnapshot === 'qa@example.com', 'Order snapshot did not preserve normalized submitted email.')
  assertQa(secondOrder.customerProfileSuggestions?.email === 'qa@example.com', 'Missing CRM email was not surfaced as a suggestion.')
  assertQa(secondOrder.customerProfileSuggestions?.birthday === '1990-01-02', 'Missing CRM birthday was not surfaced as a suggestion.')

  const catalogState = await simulation.catalog.getAdminState()
  const allOccasions = await simulation.catalog.listOccasions({ includeInactive: true })
  const allProducts = await simulation.catalog.listProducts({ includeInactive: true, includeCosts: true })
  const changedProducts = structuredClone(allProducts)
  const changedVariant = changedProducts[0]?.variants[0]
  assertQa(changedVariant, 'Parity fixture is missing its first variant.')
  changedVariant.priceIdr = 375000
  const catalogMutation = await simulation.catalog.replaceSnapshot({
    baseRevision: catalogState.revision,
    occasions: allOccasions,
    products: changedProducts,
  })

  const storeState = await simulation.store.getAdminState()
  const nextStoreSnapshot = structuredClone(simulation.getBundle().store.snapshot)
  nextStoreSnapshot.branches[0].deliveryFeeIdr = 30000
  const storeMutation = await simulation.store.replaceSnapshot({
    baseRevision: storeState.revision,
    snapshot: nextStoreSnapshot,
  })

  const authoritativeCheckout = await simulation.storefrontCheckout.createOrder({
    ...secondRequest,
    idempotencyKey: 'phase11-authoritative-price-0003',
    promoCode: ' phase11 ',
  })
  assertQa(authoritativeCheckout.orderNumber === 'KDM-2026-0004', 'Authoritative checkout sequence is incorrect.')
  assertQa(authoritativeCheckout.itemsSubtotalIdr === 375000, 'Checkout did not re-read the mutated authoritative Catalog price.')
  assertQa(authoritativeCheckout.deliveryFeeIdr === 30000, 'Checkout did not re-read the mutated shared branch delivery fee.')
  assertQa(authoritativeCheckout.totalIdr === 405000, 'Authoritative total is incorrect after Catalog/Store mutation.')
  const authoritativeOrder = await simulation.ordersAdmin.getOrder(authoritativeCheckout.orderId)
  assertQa(authoritativeOrder?.items[0]?.unitPriceIdr === 375000, 'Order item snapshot did not capture the authoritative price.')
  assertQa(authoritativeOrder?.promoCode === 'PHASE11', 'Promo code snapshot was not normalized to uppercase.')

  const finalBundle = simulation.getBundle()
  const finalValidation = validateSharedDataBundle(finalBundle)
  assertQa(finalValidation.valid, finalValidation.errors.join(' '))

  return {
    initialFingerprint,
    publicCatalog: {
      occasionCount: publicOccasions.length,
      productCount: publicProducts.length,
      variantCostExposed: publicCostExposed,
    },
    adminCatalog: {
      productCount: adminProducts.length,
      firstVariantCostIdr: adminProducts[0]?.variants[0]?.costIdr ?? null,
    },
    store: {
      activeBranchCount: branches.length,
      publicPaymentAccountCount: paymentAccounts.length,
      deliveryFeeIdr: branches[0]?.deliveryFeeIdr ?? 0,
    },
    initialCustomerLookupId: initialCustomer?.id ?? null,
    initialOrderSnapshot: {
      orderNumber: initialOrder?.orderNumber ?? '',
      productName: initialOrder?.items[0]?.productNameSnapshot ?? '',
      unitPriceIdr: initialOrder?.items[0]?.unitPriceIdr ?? 0,
    },
    checkout: {
      firstOrderNumber: firstCheckout.orderNumber,
      secondOrderNumber: secondCheckout.orderNumber,
      replayDeduplicated: replay.deduplicated,
      replaySameOrder: replay.orderId === secondCheckout.orderId,
      preservedCrmName: qaCustomer.name === 'QA Customer',
      crmEmailStillEmpty: !qaCustomer.email,
      crmBirthdayStillEmpty: !qaCustomer.birthday,
      orderSnapshotUsesSubmittedAlias: secondOrder.customerNameSnapshot === 'QA Checkout Alias',
      orderSnapshotUsesSubmittedEmail: secondOrder.customerEmailSnapshot === 'qa@example.com',
      suggestedEmail: secondOrder.customerProfileSuggestions?.email ?? null,
      suggestedBirthday: secondOrder.customerProfileSuggestions?.birthday ?? null,
    },
    authoritativeMutation: {
      catalogRevision: catalogMutation.revision,
      storeRevision: storeMutation.revision,
      orderNumber: authoritativeCheckout.orderNumber,
      lineUnitPriceIdr: authoritativeOrder?.items[0]?.unitPriceIdr ?? 0,
      deliveryFeeIdr: authoritativeCheckout.deliveryFeeIdr,
      totalIdr: authoritativeCheckout.totalIdr,
      promoCodeSnapshot: authoritativeOrder?.promoCode ?? null,
    },
    finalCounts: {
      customers: finalBundle.customers.customers.length,
      orders: finalBundle.orders.orders.length,
      orderItems: finalBundle.orders.orders.reduce((sum, order) => sum + order.items.length, 0),
    },
    finalFingerprint: fingerprintSharedDataBundle(finalBundle),
  }
}
