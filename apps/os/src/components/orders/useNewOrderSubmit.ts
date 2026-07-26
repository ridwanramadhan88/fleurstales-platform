import { useEffect, useRef } from 'react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import type {
  CustomerIntakeInput,
  CustomerIntakeResult,
  CustomerProfile,
  CustomerProfileSuggestions,
} from '../../store/customerStoreTypes'
import type { CreateOrderInput } from '../../store/ordersStoreTypes'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'
import { buildOrderCustomerSnapshot, getCustomerProfileSuggestions } from '../../domain/customerIntakeDomain'
import { sanitizeCurrency } from '../../lib/formatters'
import type { BranchFilter, BranchId } from '../../types/orders'
import { generateId } from '../../lib/id'
import type { NewOrderFormValues } from './useNewOrderForm'
import { useUserStore } from '../../store/userStore'
import { bootstrapSharedData } from '../../data/shared/bootstrap'
import type { CreateInternalOrderInput, StorefrontCheckoutQuoteResult } from '../../data/shared/contracts'
import { browserSupabaseTokenProvider, getSupabaseAccessToken } from '../../data/shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from '../../data/shared/orderBridge'
import { refreshBusinessOsCustomersFromRemote } from '../../data/shared/customerBridge'

interface CustomerDraft {
  id: string | null
  name: string
  whatsappNumber: string
  lookupKey: string
}

const buildCustomerDraftFromForm = (values: NewOrderFormValues): CustomerDraft => {
  const trimmedName = values.customerName.trim()
  const trimmedWhatsappNumber = values.customerWhatsappNumber.trim()

  return {
    id: null,
    name: trimmedName,
    whatsappNumber: trimmedWhatsappNumber,
    lookupKey: trimmedWhatsappNumber,
  }
}

const formatScheduleLabel = (dateStr: string, timeStr: string): string => {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)

  const isToday = compareDate.getTime() === today.getTime()
  const isTomorrow = compareDate.getTime() === tomorrow.getTime()

  const formattedTime = timeStr ? timeStr.replace(':', '.') : ''

  if (isToday) {
    return `Today${formattedTime ? ` · ${formattedTime}` : ''}`
  }
  if (isTomorrow) {
    return `Tomorrow${formattedTime ? ` · ${formattedTime}` : ''}`
  }

  const formatter = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const formattedDate = formatter.format(date)
  return `${formattedDate}${formattedTime ? ` · ${formattedTime}` : ''}`
}

export const useNewOrderSubmit = ({
  open,
  values,
  activeBranch,
  catalogProducts,
  matchedCustomer,
  createOrder,
  createOrUpdateCustomerFromAdmin,
  acceptedProfileSuggestions,
  clearDraft,
  setInfoMessage,
  onClose,
  setStep,
  voucherDiscountIdr,
  authoritativeDeliveryFeeIdr,
  serverQuote,
}: {
  open: boolean
  values: NewOrderFormValues
  activeBranch: BranchFilter
  catalogProducts: CatalogProduct[]
  matchedCustomer: CustomerProfile | null
  createOrder: (input: CreateOrderInput) => unknown
  createOrUpdateCustomerFromAdmin: (input: CustomerIntakeInput) => CustomerIntakeResult
  acceptedProfileSuggestions: Partial<CustomerProfileSuggestions>
  clearDraft: () => void
  setInfoMessage: (message: string | null) => void
  onClose: () => void
  setStep: (step: 'edit' | 'review') => void
  voucherDiscountIdr: number
  authoritativeDeliveryFeeIdr: number
  serverQuote: StorefrontCheckoutQuoteResult | null
}) => {
  const employeeId = useUserStore((state) => state.employeeId)
  const actorName = useUserStore((state) => state.name)
  const actorRole = useUserStore((state) => state.role)
  const actorBranchId = useUserStore((state) => state.branchId)
  const actor = {
    employeeId,
    name: actorName,
    role: actorRole,
    branchId: actorBranchId,
  }

  const internalOrderIdempotencyKey = useRef(`internal:${generateId('order-attempt')}:${Date.now()}`)
  useEffect(() => {
    if (open) internalOrderIdempotencyKey.current = `internal:${generateId('order-attempt')}:${Date.now()}`
  }, [open])

  const buildPrimaryOrderItemPayload = () => {
    if (values.orderItemMode === 'catalog') {
      const product =
        catalogProducts.find(
          (item) => item.id === values.orderItemCatalogId,
        ) ?? null

      const activeVariants = product?.variants.filter((variant) => variant.status === 'active') ?? []
      const exactVariant = activeVariants.find((variant) => variant.id === values.orderItemVariantId)
      if (!exactVariant) throw new Error('Select the product size or variant before creating the order.')
      return {
        mode: 'catalog' as const,
        catalog_product_id: product?.id ?? values.orderItemCatalogId,
        catalog_product_code: product?.productId,
        catalog_variant_id: exactVariant?.id,
        catalog_variant_sku: exactVariant?.sku,
        catalog_variant_size: exactVariant?.size,
        name: product?.name ?? 'Catalog item',
        unit_price_idr: exactVariant?.price ?? (product ? getDisplayPriceIdr(product) : 0),
      }
    }

    const customPriceValue = sanitizeCurrency(values.orderItemCustomPrice)

    return {
      mode: 'custom' as const,
      name: values.orderItemCustomName.trim(),
      unit_price_idr: customPriceValue,
    }
  }

  const buildRemoteOrderInput = (expectedQuote?: StorefrontCheckoutQuoteResult | null): CreateInternalOrderInput => {
    if (activeBranch === 'All') throw new Error('Select a branch before creating an order.')
    const branchForOrder: BranchId = activeBranch
    const customerDraft = buildCustomerDraftFromForm(values)
    const primaryOrderItem = buildPrimaryOrderItemPayload()
    const trimmedEmail = values.customerEmail.trim()
    const trimmedBirthday = values.customerBirthday.trim()
    const trimmedPromoCode = values.promoCode.trim()
    return {
      idempotencyKey: internalOrderIdempotencyKey.current,
      customer: {
        id: matchedCustomer?.id,
        name: customerDraft.name,
        whatsappNumber: customerDraft.whatsappNumber,
        email: trimmedEmail || undefined,
        birthday: trimmedBirthday || undefined,
        acceptedProfileUpdates: matchedCustomer ? {
          email: acceptedProfileSuggestions.email,
          birthday: acceptedProfileSuggestions.birthday,
          preferredBranchId: acceptedProfileSuggestions.preferredBranchId,
        } : undefined,
      },
      branchId: branchForOrder,
      source: values.orderType === 'walk_in' ? 'walk_in' : 'whatsapp',
      fulfillment: values.fulfillmentType as 'delivery' | 'pickup',
      scheduleDate: values.fulfillmentType === 'delivery' ? values.deliveryDate : values.pickupDate,
      scheduleTime: values.fulfillmentType === 'delivery' ? values.deliveryTime : values.pickupTime,
      items: [{
        mode: primaryOrderItem.mode,
        productId: primaryOrderItem.mode === 'catalog' ? primaryOrderItem.catalog_product_id : undefined,
        variantId: primaryOrderItem.mode === 'catalog' ? primaryOrderItem.catalog_variant_id : undefined,
        productName: primaryOrderItem.name,
        quantity: 1,
        unitPriceIdr: primaryOrderItem.unit_price_idr,
      }],
      deliveryAddress: values.fulfillmentType === 'delivery' ? values.deliveryAddress.trim() || undefined : undefined,
      deliveryInstructions: values.fulfillmentType === 'delivery' ? values.deliveryInstructions.trim() || undefined : undefined,
      orderNote: values.orderNote.trim() || undefined,
      greetingMessage: values.greetingMessage.trim() || undefined,
      greetingCardName: values.greetingCardName.trim() || undefined,
      paymentMethod: values.paymentMethod || undefined,
      paymentStatus: values.paymentStatus || 'unpaid',
      depositAmountIdr: sanitizeCurrency(values.depositAmount),
      promoCode: trimmedPromoCode || undefined,
      expectedQuote: expectedQuote ? {
        itemsSubtotalIdr: expectedQuote.itemsSubtotalIdr,
        deliveryFeeIdr: expectedQuote.deliveryFeeIdr,
        discountIdr: expectedQuote.discountIdr,
        totalIdr: expectedQuote.totalIdr,
        promoAccepted: expectedQuote.promoAccepted,
      } : undefined,
    }
  }

  const quoteOrderFromForm = async (): Promise<StorefrontCheckoutQuoteResult | null> => {
    const shared = bootstrapSharedData(browserSupabaseTokenProvider)
    if (!shared.enabled || !getSupabaseAccessToken()) return null
    return shared.repositories.ordersAdmin.quoteInternalOrder(buildRemoteOrderInput())
  }

  const createOrderFromForm = async () => {
    if (activeBranch === 'All') throw new Error('Select a branch before creating an order.')
    const branchForOrder: BranchId = activeBranch

    const deliveryFeeValue =
      values.fulfillmentType === 'delivery'
        ? Math.max(0, Math.round(authoritativeDeliveryFeeIdr))
        : 0
    const depositValue = sanitizeCurrency(values.depositAmount)

    const customerDraft = buildCustomerDraftFromForm(values)
    const primaryOrderItem = buildPrimaryOrderItemPayload()

    const trimmedEmail = values.customerEmail.trim()
    const trimmedBirthday = values.customerBirthday.trim()
    const trimmedPromoCode = values.promoCode.trim()

    const itemTotalIdr = primaryOrderItem.unit_price_idr
    const totalOrderIdr = Math.max(0, itemTotalIdr - voucherDiscountIdr + deliveryFeeValue)

    const payload = {
      customer_id: matchedCustomer?.id ?? null,
      customer_lookup_key: customerDraft.lookupKey,
      customer: {
        id: matchedCustomer?.id ?? null,
        name: customerDraft.name,
        whatsappNumber: customerDraft.whatsappNumber,
      },
      branch: branchForOrder,
      order_type: values.orderType,
      fulfillment_type: values.fulfillmentType,
      items: [primaryOrderItem],
      delivery_address:
        values.fulfillmentType === 'delivery'
          ? values.deliveryAddress.trim()
          : null,
      delivery_instructions:
        values.fulfillmentType === 'delivery' &&
        values.deliveryInstructions.trim().length > 0
          ? values.deliveryInstructions.trim()
          : null,
      delivery_fee: deliveryFeeValue,
      gift_message:
        values.greetingMessage.trim().length > 0
          ? values.greetingMessage.trim()
          : null,
      greeting_card_name:
        values.greetingCardName.trim().length > 0
          ? values.greetingCardName.trim()
          : null,
      payment_method: values.paymentMethod || null,
      payment_status: values.paymentStatus || 'unpaid',
      deposit_amount: depositValue,
      orderNote: values.orderNote.trim().length > 0 ? values.orderNote.trim() : null,
      delivery_date:
        values.fulfillmentType === 'delivery' && values.deliveryDate
          ? values.deliveryDate
          : null,
      delivery_time:
        values.fulfillmentType === 'delivery' && values.deliveryTime
          ? values.deliveryTime
          : null,
      pickup_date:
        values.fulfillmentType === 'pickup' && values.pickupDate
          ? values.pickupDate
          : null,
      pickup_time:
        values.fulfillmentType === 'pickup' && values.pickupTime
          ? values.pickupTime
          : null,
    }

    const dateToUse =
      values.fulfillmentType === 'delivery'
        ? values.deliveryDate
        : values.pickupDate
    const timeToUse =
      values.fulfillmentType === 'delivery'
        ? values.deliveryTime
        : values.pickupTime
    const calculatedScheduleLabel = formatScheduleLabel(dateToUse, timeToUse)

    const shared = bootstrapSharedData(browserSupabaseTokenProvider)
    if (shared.enabled && getSupabaseAccessToken()) {
      const result = await shared.repositories.ordersAdmin.createInternalOrder(buildRemoteOrderInput(serverQuote))
      await Promise.all([
        refreshBusinessOsOrdersFromRemote(),
        refreshBusinessOsCustomersFromRemote(),
      ])
      clearDraft()
      setInfoMessage(`Order ${result.orderNumber} created and synchronized.`)
      onClose()
      setStep('edit')
      return result
    }

    const intake = createOrUpdateCustomerFromAdmin({
      name: customerDraft.name,
      whatsappNumber: customerDraft.whatsappNumber,
      email: trimmedEmail || undefined,
      birthday: trimmedBirthday || undefined,
      preferredBranch: branchForOrder,
      promoCode: trimmedPromoCode || undefined,
      createdSource: 'admin',
      acceptedSuggestions: matchedCustomer ? acceptedProfileSuggestions : undefined,
    })
    const savedCustomer: CustomerProfile = intake.customer

    createOrder({
      branch: branchForOrder,
      actor,
      customerId: savedCustomer.id,
      customerSnapshot: buildOrderCustomerSnapshot(savedCustomer, {
        name: customerDraft.name,
        whatsappNumber: customerDraft.whatsappNumber,
        email: trimmedEmail || undefined,
        birthday: trimmedBirthday || undefined,
        preferredBranch: branchForOrder,
      }),
      customerProfileSuggestions: intake.isNew
        ? undefined
        : getCustomerProfileSuggestions(savedCustomer, {
            email: trimmedEmail || undefined,
            birthday: trimmedBirthday || undefined,
            preferredBranch: branchForOrder,
          }),
      customerName: customerDraft.name || savedCustomer.name,
      orderType: values.orderType as 'walk_in' | 'admin_created',
      fulfillmentType: values.fulfillmentType as 'delivery' | 'pickup',
      depositAmount: depositValue,
      orderNote: values.orderNote.trim().length > 0 ? values.orderNote.trim() : null,
      totalIdr: totalOrderIdr,
      itemsSubtotalIdr: itemTotalIdr,
      discountIdr: voucherDiscountIdr,
      deliveryFeeIdr: deliveryFeeValue,
      paymentMethod: values.paymentMethod || undefined,
      paymentStatus: values.paymentStatus,
      source: values.orderType === 'walk_in' ? 'walk_in' : 'whatsapp',
      scheduleLabel: calculatedScheduleLabel || undefined,
      scheduleDate: dateToUse || undefined,
      scheduleTime: timeToUse || undefined,
      greetingMessage: payload.gift_message ?? undefined,
      greetingCardName: payload.greeting_card_name ?? undefined,
      deliveryAddress: payload.delivery_address ?? undefined,
      deliveryInstructions: payload.delivery_instructions ?? undefined,
      promoCode: trimmedPromoCode || undefined,
      productId:
        primaryOrderItem.mode === 'catalog'
          ? primaryOrderItem.catalog_product_id
          : undefined,
      productName:
        primaryOrderItem.mode === 'custom' ? primaryOrderItem.name : undefined,
      items: [
        {
          id: generateId('line'),
          productId:
            primaryOrderItem.mode === 'catalog'
              ? primaryOrderItem.catalog_product_id
              : undefined,
          variantId:
            primaryOrderItem.mode === 'catalog'
              ? primaryOrderItem.catalog_variant_id
              : undefined,
          productName: primaryOrderItem.name,
          productCodeSnapshot:
            primaryOrderItem.mode === 'catalog'
              ? primaryOrderItem.catalog_product_code
              : undefined,
          productNameSnapshot: primaryOrderItem.name,
          variantSkuSnapshot:
            primaryOrderItem.mode === 'catalog'
              ? primaryOrderItem.catalog_variant_sku
              : undefined,
          variantSizeSnapshot:
            primaryOrderItem.mode === 'catalog'
              ? primaryOrderItem.catalog_variant_size
              : undefined,
          quantity: 1,
          unitPriceIdr: primaryOrderItem.unit_price_idr,
        },
      ],
    })

    clearDraft()
    setInfoMessage(
      'Order created in offline/demo mode.',
    )
    onClose()
    setStep('edit')
  }

  return { createOrderFromForm, quoteOrderFromForm }
}
