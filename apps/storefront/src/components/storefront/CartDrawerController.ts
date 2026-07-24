import { useEffect, useMemo, useState } from 'react'
import { calculateOrderTotal, validateVoucherCode } from '../../domain/voucherDomain'
import { buildCustomerMetrics, getOrdersForCustomer } from '../../domain/customerDomain'
import { useDismissableModal } from '../../hooks/useDismissableModal'
import { useCustomerStore } from '../../store/customerStore'
import { useCatalogStore } from '../../store/catalogStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { BankAccountDetail } from '../../types/settings'
import { useVoucherStore } from '../../store/voucherStore'
import type { BranchId, OrderLineItem } from '../../types/orders'
import type { BranchSettings } from '../../types/settings'
import { describeBranchHoursForDate } from '../../domain/branchOpeningHoursDomain'
import { getStorefrontAvailableTimeSlots, isStorefrontDateUnavailable, validateStorefrontCheckoutDetails } from '../../domain/storefrontCheckoutDomain'
import type { CartDrawerProps } from './CartDrawer'
import { generateId } from '../../lib/id'
import type { CreateStorefrontOrderInput } from '../../data/shared/contracts'
import { bootstrapSharedData } from '../../data/shared/bootstrap'
import { resolveStorefrontOrderPricing } from '../../data/shared/orderDomain'
import { resolvedPricingToOrderLineItems } from '../../data/shared/orderLocalAdapter'
import { normalizeWhatsappNumber } from '../../lib/formatters'
import { buildOrderCustomerSnapshot, findCustomerByWhatsapp } from '../../domain/customerIntakeDomain'
import { getCustomerVisiblePaymentAccounts } from '../../domain/settings/paymentMethodSettingsDomain'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type { Voucher } from '../../store/voucherStore'

type CheckoutStep = 'cart' | 'details' | 'review' | 'summary'
type PaymentMethod = 'cash' | 'transfer'


export interface CartDrawerViewModel extends CartDrawerProps {
  step: CheckoutStep
  customerName: string
  whatsappNumber: string
  email: string
  birthday: string
  showBirthdayField: boolean
  branch: BranchId
  activeBranches: BranchSettings[]
  selectedBranch: BranchSettings | null
  availableTimeSlots: string[]
  branchHoursLabel: string
  isDateUnavailable: (date: Date) => boolean
  fulfillment: 'delivery' | 'pickup'
  deliveryDate: string
  deliveryTime: string
  deliveryAddress: string
  orderNote: string
  greetingMessage: string
  greetingCardName: string
  matchedCustomer: CustomerProfile | null
  matchedCustomerSegment: 'vip' | 'regular' | 'new' | null
  eligibleVouchers: Voucher[]
  detailsError: string | null
  voucherCode: string
  appliedVoucherCode: string | null
  voucherMessage: string | null
  paymentMethod: PaymentMethod
  placedOrderNumber: string | null
  bankAccounts: BankAccountDetail[]
  paymentInstructions: string
  itemsTotalIdr: number
  itemCount: number
  deliveryFeeIdr: number
  discountIdr: number
  grandTotalIdr: number
  setStep: (value: CheckoutStep) => void
  setCustomerName: (value: string) => void
  setWhatsappNumber: (value: string) => void
  setEmail: (value: string) => void
  setBirthday: (value: string) => void
  setShowBirthdayField: (value: boolean) => void
  setBranch: (value: BranchId) => void
  handleFulfillmentChange: (value: 'delivery' | 'pickup') => void
  setDeliveryDate: (value: string) => void
  setDeliveryTime: (value: string) => void
  setDeliveryAddress: (value: string) => void
  setOrderNote: (value: string) => void
  setGreetingMessage: (value: string) => void
  setGreetingCardName: (value: string) => void
  setVoucherCode: (value: string) => void
  setVoucherMessage: (value: string | null) => void
  setPaymentMethod: (value: PaymentMethod) => void
  handleApplyVoucher: () => void
  handleApplySuggestedVoucher: (code: string) => void
  handleRemoveVoucher: () => void
  handleContinueFromDetails: () => void
  handleConfirmOrder: () => void
  handleClose: () => void
}

export const useCartDrawerController = (
  props: CartDrawerProps,
): CartDrawerViewModel => {
  const { open, onClose, lines, onOrderPlaced } = props
  const [step, setStep] = useState<CheckoutStep>('cart')
  const [customerName, setCustomerName] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [email, setEmail] = useState('')
  const [birthday, setBirthday] = useState('')
  const [showBirthdayField, setShowBirthdayField] = useState(false)
  const branches = useSettingsStore((state) => state.branches)
  const activeBranches = useMemo(() => branches.filter((item) => item.isActive), [branches])
  const [branch, setBranch] = useState<BranchId>('')
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [greetingMessage, setGreetingMessage] = useState('')
  const [greetingCardName, setGreetingCardName] = useState('')
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [voucherCode, setVoucherCode] = useState('')
  const [appliedVoucherCode, setAppliedVoucherCode] = useState<string | null>(null)
  const [voucherMessage, setVoucherMessage] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer')
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null)
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState(() => generateId('checkout-attempt'))
  const [placedOrderTotals, setPlacedOrderTotals] = useState<{
    itemsTotalIdr: number
    deliveryFeeIdr: number
    discountIdr: number
    grandTotalIdr: number
  } | null>(null)

  const createOrder = useOrdersStore((state) => state.createOrder)
  const catalogProducts = useCatalogStore((state) => state.products)
  const customers = useCustomerStore((state) => state.customers)
  const segmentRules = useCustomerStore((state) => state.segmentRules)
  const allOrders = useOrdersStore((state) => state.orders)
  const createOrUpdateCustomerFromStorefront = useCustomerStore(
    (state) => state.createOrUpdateCustomerFromStorefront,
  )
  const paymentMethodSettings = useSettingsStore((state) => state.paymentMethods)
  const paymentInstructions = useSettingsStore(
    (state) => state.paymentMethods.paymentInstructions,
  )
  const vouchers = useVoucherStore((state) => state.vouchers)

  useDismissableModal(open, onClose)

  const itemsTotalIdr = useMemo(
    () => lines.reduce((sum, line) => sum + line.unitPriceIdr * line.quantity, 0),
    [lines],
  )
  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  )
  const selectedBranch = activeBranches.find((item) => item.id === branch) ?? null
  const bankAccounts = getCustomerVisiblePaymentAccounts(paymentMethodSettings, selectedBranch?.id)
  const availableTimeSlots = getStorefrontAvailableTimeSlots(selectedBranch, deliveryDate)
  const branchHoursLabel = deliveryDate ? describeBranchHoursForDate(selectedBranch, deliveryDate) : 'Select a date to see branch hours.'
  const isDateUnavailable = (date: Date) => isStorefrontDateUnavailable(selectedBranch, date)
  const deliveryFeeIdr = fulfillment === 'delivery' ? (selectedBranch?.deliveryFeeIdr ?? 15_000) : 0

  const matchedCustomer = useMemo<CustomerProfile | null>(() => {
    const normalizedInput = normalizeWhatsappNumber(whatsappNumber)
    if (normalizedInput.length < 8) return null
    return findCustomerByWhatsapp(customers, whatsappNumber)
  }, [customers, whatsappNumber])

  const matchedCustomerSegment = useMemo(() => {
    if (!matchedCustomer) return null
    return buildCustomerMetrics(
      getOrdersForCustomer(matchedCustomer, allOrders),
      segmentRules,
    ).segment
  }, [allOrders, matchedCustomer, segmentRules])

  useEffect(() => {
    if (!matchedCustomer) return
    setCustomerName((current) => current.trim() || matchedCustomer.name)
    setEmail((current) => current.trim() || matchedCustomer.email || '')
    setBirthday((current) => current || matchedCustomer.birthday || '')
    setShowBirthdayField((current) => current || Boolean(matchedCustomer.birthday))
    if (matchedCustomer.preferredBranch && activeBranches.some((item) => item.id === matchedCustomer.preferredBranch)) {
      setBranch(matchedCustomer.preferredBranch)
    }
  }, [activeBranches, matchedCustomer])

  useEffect(() => {
    if (!activeBranches.some((item) => item.id === branch)) {
      setBranch('')
      setDeliveryDate('')
      setDeliveryTime('')
    }
  }, [activeBranches, branch])

  useEffect(() => {
    if (deliveryTime && !availableTimeSlots.includes(deliveryTime)) setDeliveryTime('')
  }, [availableTimeSlots, deliveryTime])

  const eligibleVouchers = useMemo(
    () =>
      vouchers.filter(
        (voucher) =>
          validateVoucherCode(voucher.code, vouchers, {
            orderSubtotalIdr: itemsTotalIdr,
            customer: matchedCustomer,
          }).ok,
      ),
    [itemsTotalIdr, matchedCustomer, vouchers],
  )
  const voucherValidation = appliedVoucherCode
    ? validateVoucherCode(appliedVoucherCode, vouchers, {
        orderSubtotalIdr: itemsTotalIdr,
        customer: matchedCustomer,
      })
    : null
  const discountIdr =
    voucherValidation?.ok && voucherValidation.discountIdr
      ? voucherValidation.discountIdr
      : 0

  const { grandTotalIdr } = calculateOrderTotal({
    itemsTotalIdr,
    discountIdr,
    deliveryFeeIdr,
  })

  const resetForm = () => {
    setStep('cart')
    setCustomerName('')
    setWhatsappNumber('')
    setEmail('')
    setBirthday('')
    setShowBirthdayField(false)
    setBranch('')
    setFulfillment('delivery')
    setDeliveryDate('')
    setDeliveryTime('')
    setDeliveryAddress('')
    setOrderNote('')
    setGreetingMessage('')
    setGreetingCardName('')
    setVoucherCode('')
    setAppliedVoucherCode(null)
    setVoucherMessage(null)
    setPaymentMethod('transfer')
    setPlacedOrderNumber(null)
    setPlacedOrderTotals(null)
    setCheckoutIdempotencyKey(generateId('checkout-attempt'))
  }

  const handleFulfillmentChange = (value: 'delivery' | 'pickup') => {
    setFulfillment(value)
    // Delivery orders must be paid by bank transfer (no cash-on-the-road
    // handling by couriers), so switching to delivery forces the payment
    // method and locks out "cash" until fulfillment changes back to pickup.
    if (value === 'delivery') {
      setPaymentMethod('transfer')
    }
  }

  const applyVoucherCode = (code: string) => {
    const result = validateVoucherCode(code, vouchers, {
      orderSubtotalIdr: itemsTotalIdr,
      customer: matchedCustomer,
    })
    if (!result.ok || !result.voucher) {
      setAppliedVoucherCode(null)
      setVoucherMessage(result.reason ?? 'This voucher code is not valid.')
      return
    }
    setAppliedVoucherCode(result.voucher.code)
    setVoucherMessage(
      `Voucher "${result.voucher.code}" applied — -${result.voucher.percentOff}% off.`,
    )
  }

  const handleApplyVoucher = () => applyVoucherCode(voucherCode)

  const handleApplySuggestedVoucher = (code: string) => {
    setVoucherCode(code)
    applyVoucherCode(code)
  }

  const handleRemoveVoucher = () => {
    setAppliedVoucherCode(null)
    setVoucherCode('')
    setVoucherMessage(null)
  }

  const handleContinueFromDetails = () => {
    const error = validateStorefrontCheckoutDetails({
      customerName,
      whatsappNumber,
      fulfillment,
      deliveryAddress,
      date: deliveryDate,
      time: deliveryTime,
      branch: selectedBranch,
    })
    if (error) {
      setDetailsError(error)
      return
    }
    setDetailsError(null)
    setStep('review')
  }

  const handleConfirmOrder = async () => {
    const validationError = validateStorefrontCheckoutDetails({ customerName, whatsappNumber, fulfillment, deliveryAddress, date: deliveryDate, time: deliveryTime, branch: selectedBranch })
    const paymentError = paymentMethod === 'transfer' && bankAccounts.length === 0
      ? 'Bank transfer is unavailable for this branch.'
      : null
    if (lines.length === 0 || validationError || paymentError) {
      setDetailsError(validationError ?? paymentError)
      setStep('details')
      return
    }

    const checkoutRequest: CreateStorefrontOrderInput = {
      idempotencyKey: checkoutIdempotencyKey,
      customer: {
        name: customerName.trim(),
        whatsappNumber: whatsappNumber.trim(),
        email: email.trim() || undefined,
        birthday: birthday.trim() || undefined,
      },
      branchId: branch,
      fulfillment,
      scheduleDate: deliveryDate,
      scheduleTime: deliveryTime,
      items: lines.map((line) => {
        const product = catalogProducts.find((item) => item.id === line.productId)
        const activeVariants = product?.variants.filter((variant) => variant.status === 'active') ?? []
        const fallbackVariant = activeVariants.length === 1 ? activeVariants[0] : undefined
        const variantId = line.variantId ?? fallbackVariant?.id
        return { productId: line.productId, variantId: variantId ?? '', quantity: line.quantity }
      }),
      deliveryAddress: fulfillment === 'delivery' ? deliveryAddress.trim() || undefined : undefined,
      orderNote: orderNote.trim() || undefined,
      greetingMessage: greetingMessage.trim() || undefined,
      greetingCardName: greetingCardName.trim() || undefined,
      paymentMethod,
      promoCode: appliedVoucherCode ?? undefined,
    }

    let resolved
    try {
      resolved = resolveStorefrontOrderPricing({
        request: checkoutRequest,
        products: catalogProducts,
        branches,
        trustedDiscountIdr: discountIdr,
      })
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'The order could not be validated.')
      setStep('details')
      return
    }

    const shared = bootstrapSharedData()
    if (shared.enabled) {
      try {
        const order = await shared.repositories.checkout.createOrder(checkoutRequest)
        setPlacedOrderTotals({
          itemsTotalIdr: order.itemsSubtotalIdr,
          deliveryFeeIdr: order.deliveryFeeIdr,
          discountIdr: order.discountIdr,
          grandTotalIdr: order.totalIdr,
        })
        setPlacedOrderNumber(order.orderNumber)
        setDetailsError(null)
        onOrderPlaced(order.orderNumber)
        setStep('summary')
      } catch (error) {
        setDetailsError(
          error instanceof Error
            ? error.message
            : 'We could not place your order. Please check your connection and try again.',
        )
      }
      return
    }

    const intake = createOrUpdateCustomerFromStorefront({
      name: customerName.trim(),
      whatsappNumber: whatsappNumber.trim(),
      email: email.trim() || undefined,
      birthday: birthday.trim() || undefined,
      preferredBranch: branch,
      createdSource: 'storefront',
    })
    const savedCustomer = intake.customer

    const items: OrderLineItem[] = resolvedPricingToOrderLineItems(
      resolved,
      () => generateId('line'),
    )
    const productSummary =
      items.length === 1
        ? `${items[0].productNameSnapshot ?? items[0].productName ?? 'Product'} x${items[0].quantity}`
        : `${items[0].productNameSnapshot ?? items[0].productName ?? 'Product'} +${items.length - 1} more`

    const order = createOrder({
      branch,
      storefrontIdempotencyKey: checkoutIdempotencyKey,
      customerId: savedCustomer.id,
      customerSnapshot: buildOrderCustomerSnapshot(savedCustomer, {
        name: customerName,
        whatsappNumber,
        email: email || undefined,
        birthday: birthday || undefined,
        preferredBranch: branch,
      }),
      customerProfileSuggestions: intake.isNew ? undefined : intake.suggestions,
      customerName: customerName.trim() || savedCustomer.name,
      orderType: 'customer_created',
      fulfillmentType: fulfillment,
      depositAmount: 0,
      paymentStatus: 'unpaid',
      orderNote: orderNote.trim() || undefined,
      totalIdr: resolved.totalIdr,
      itemsSubtotalIdr: resolved.itemsSubtotalIdr,
      discountIdr: resolved.discountIdr,
      deliveryFeeIdr: resolved.deliveryFeeIdr,
      paymentMethod,
      source: 'customer_app',
      items,
      productId: items.length === 1 ? items[0].productId : undefined,
      variantId: items.length === 1 ? items[0].variantId : undefined,
      productName: lines.length === 1 ? undefined : productSummary,
      scheduleDate: deliveryDate || undefined,
      scheduleTime: deliveryTime || undefined,
      scheduleLabel: deliveryTime ? `${deliveryDate} · ${deliveryTime}` : undefined,
      greetingMessage: greetingMessage.trim() || undefined,
      greetingCardName: greetingCardName.trim() || undefined,
      deliveryAddress:
        fulfillment === 'delivery' ? deliveryAddress.trim() || undefined : undefined,
      promoCode: appliedVoucherCode ?? undefined,
    })

    setPlacedOrderTotals({
      itemsTotalIdr: resolved.itemsSubtotalIdr,
      deliveryFeeIdr: resolved.deliveryFeeIdr,
      discountIdr: resolved.discountIdr,
      grandTotalIdr: resolved.totalIdr,
    })
    setPlacedOrderNumber(order.orderNumber)
    onOrderPlaced(order.orderNumber)
    setStep('summary')
  }

  const handleClose = () => {
    onClose()
    if (placedOrderNumber) {
      resetForm()
    }
  }

  return {
    ...props,
    step,
    customerName,
    whatsappNumber,
    email,
    birthday,
    showBirthdayField,
    branch,
    activeBranches,
    selectedBranch,
    availableTimeSlots,
    branchHoursLabel,
    isDateUnavailable,
    fulfillment,
    deliveryDate,
    deliveryTime,
    deliveryAddress,
    orderNote,
    greetingMessage,
    greetingCardName,
    matchedCustomer,
    matchedCustomerSegment,
    eligibleVouchers,
    detailsError,
    voucherCode,
    appliedVoucherCode,
    voucherMessage,
    paymentMethod,
    placedOrderNumber,
    bankAccounts,
    paymentInstructions,
    itemsTotalIdr: placedOrderTotals?.itemsTotalIdr ?? itemsTotalIdr,
    itemCount,
    deliveryFeeIdr: placedOrderTotals?.deliveryFeeIdr ?? deliveryFeeIdr,
    discountIdr: placedOrderTotals?.discountIdr ?? discountIdr,
    grandTotalIdr: placedOrderTotals?.grandTotalIdr ?? grandTotalIdr,
    setStep,
    setCustomerName,
    setWhatsappNumber,
    setEmail,
    setBirthday,
    setShowBirthdayField,
    setBranch: (value) => { setBranch(value); setDeliveryDate(''); setDeliveryTime(''); setDetailsError(null) },
    handleFulfillmentChange,
    setDeliveryDate: (value) => { setDeliveryDate(value); setDeliveryTime(''); setDetailsError(null) },
    setDeliveryTime,
    setDeliveryAddress,
    setOrderNote,
    setGreetingMessage,
    setGreetingCardName,
    setVoucherCode,
    setVoucherMessage,
    setPaymentMethod,
    handleApplyVoucher,
    handleApplySuggestedVoucher,
    handleRemoveVoucher,
    handleContinueFromDetails,
    handleConfirmOrder,
    handleClose,
  }
}
