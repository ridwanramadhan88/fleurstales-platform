import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useOrdersStore } from '../../store/ordersStore'
import { useCatalogStore } from '../../store/catalogStore'
import { useCustomerStore } from '../../store/customerStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import type {
  CustomerProfile,
  CustomerProfileSuggestions,
} from '../../store/customerStoreTypes'
import type { BranchFilter } from '../../types/orders'
import {
  buildCustomerMetrics,
  getOrdersForCustomer,
} from '../../domain/customerDomain'
import {
  findCustomerByWhatsapp,
  getCustomerProfileSuggestions,
} from '../../domain/customerIntakeDomain'
import { useDismissableModal } from '../../hooks/useDismissableModal'
import type { NewOrderSheetProps } from './NewOrderSheet'
import {
  type FormStep,
  type NewOrderFormErrors,
  type NewOrderFormValues,
  initialNewOrderValues,
  useNewOrderForm,
} from './useNewOrderForm'
import {
  type CatalogProductOption,
  useNewOrderPricing,
} from './useNewOrderPricing'
import { useNewOrderSubmit } from './useNewOrderSubmit'
import { validateNewOrderForm } from './useNewOrderValidation'
import { type GuideSection, getActiveGuideStep, isGuideFieldFilled, isGuideSectionComplete } from './newOrderGuide'
import { deleteOrderDraft, getOrderDraft, saveOrderDraft } from './orderDraftStore'
import { describeBranchHoursForDate, getBranchHoursForDate, getOpeningHourTimeSlots } from '../../domain/branchOpeningHoursDomain'
import { useVoucherStore } from '../../store/voucherStore'
import { validateVoucherCode } from '../../domain/voucherDomain'

export type {
  FormStep,
  NewOrderFormErrors,
  NewOrderFormValues,
} from './useNewOrderForm'
export type { CatalogProductOption } from './useNewOrderPricing'

export interface NewOrderSheetViewModel {
  open: boolean
  values: NewOrderFormValues
  errors: NewOrderFormErrors
  infoMessage: string | null
  step: FormStep
  branchLabel: string
  deliveryTimeSlots: string[]
  pickupTimeSlots: string[]
  deliveryHoursLabel: string
  pickupHoursLabel: string
  isBranchClosedOnDate: (date: Date) => boolean
  matchedCustomer: CustomerProfile | null
  matchedCustomerSegment: ReturnType<typeof buildCustomerMetrics>['segment'] | null
  customerProfileSuggestions: CustomerProfileSuggestions
  acceptedProfileSuggestions: Partial<CustomerProfileSuggestions>
  showBirthdayFields: boolean
  showPromoField: boolean
  /** The single field key the guided highlight is currently pointing at
   * (e.g. `'customerName'`), or `null` once nothing is left to guide. */
  activeGuideField: string | null
  /** Which of the four workflow section cards should show the moving
   * highlight — the checklist's current section, unless the user has
   * clicked/focused into a different one. */
  activeGuideSection: GuideSection | null
  onSectionFocus: (section: GuideSection) => void
  onGuideFieldFocus: (field: string) => void
  onGuideFieldBlur: () => void
  catalogProductOptions: CatalogProductOption[]
  selectedCatalogProduct: CatalogProduct | null
  estimatedOrderTotalIdr: number
  voucherDiscountIdr: number
  depositValueForReview: number
  paymentStatusLabelForReview: string
  paymentMethodLabelForReview: string
  fulfillmentLabelForReview: string
  catalogPriceFormatter: Intl.NumberFormat
  isFormReady: boolean
  closeConfirmationOpen: boolean
  onClose: () => void
  onContinueEditing: () => void
  onDiscardAndClose: () => void
  onSubmit: (event: FormEvent) => void
  onSaveDraft: () => void
  onFieldChange: ReturnType<typeof useNewOrderForm>['onFieldChange']
  onFieldValueChange: ReturnType<typeof useNewOrderForm>['onFieldValueChange']
  onCurrencyFieldChange: ReturnType<typeof useNewOrderForm>['onCurrencyFieldChange']
  onFulfillmentChange: ReturnType<typeof useNewOrderForm>['onFulfillmentChange']
  onOrderItemModeChange: (mode: 'catalog' | 'custom') => void
  onCatalogProductChange: (value: string) => void
  onOrderTypeChange: (value: NewOrderFormValues['orderType']) => void
  onPaymentMethodChange: (value: NewOrderFormValues['paymentMethod']) => void
  onPaymentStatusChange: (value: NewOrderFormValues['paymentStatus']) => void
  onShowBirthdayFields: () => void
  onShowPromoField: () => void
  onToggleProfileSuggestion: (key: keyof CustomerProfileSuggestions) => void
  onBackToEdit: () => void
}

export const useNewOrderSheetController = ({
  open,
  onClose,
  activeBranch,
  draftId,
}: NewOrderSheetProps): NewOrderSheetViewModel => {
  const form = useNewOrderForm(open)
  const baselineValuesRef = useRef<NewOrderFormValues>(initialNewOrderValues)
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false)
  const configuredBranches = useSettingsStore((state) => state.branches)
  const branchForForm: BranchFilter = activeBranch?.trim() ? activeBranch : 'All'
  const createOrder = useOrdersStore((state) => state.createOrder)
  const allProducts = useCatalogStore((state) => state.products)
  const catalogProducts = useMemo(
    () => allProducts.filter((product) => product.isActive),
    [allProducts],
  )

  const customers = useCustomerStore((state) => state.customers)
  const createOrUpdateCustomerFromAdmin = useCustomerStore(
    (state) => state.createOrUpdateCustomerFromAdmin,
  )
  const allOrders = useOrdersStore((state) => state.orders)
  const vouchers = useVoucherStore((state) => state.vouchers)
  const autoVoucherCodeRef = useRef<string | null>(null)
  const [acceptedProfileSuggestions, setAcceptedProfileSuggestions] = useState<
    Partial<CustomerProfileSuggestions>
  >({})

  const matchedCustomer: CustomerProfile | null = useMemo(() => {
    return findCustomerByWhatsapp(customers, form.values.customerWhatsappNumber)
  }, [customers, form.values.customerWhatsappNumber])

  const customerProfileSuggestions = useMemo<CustomerProfileSuggestions>(() => {
    if (!matchedCustomer || branchForForm === 'All') return {}
    return getCustomerProfileSuggestions(matchedCustomer, {
      birthday: form.values.customerBirthday,
      email: form.values.customerEmail,
      preferredBranch: branchForForm,
    })
  }, [
    branchForForm,
    form.values.customerBirthday,
    form.values.customerEmail,
    matchedCustomer,
  ])

  useEffect(() => {
    setAcceptedProfileSuggestions(customerProfileSuggestions)
  }, [
    matchedCustomer?.id,
    customerProfileSuggestions.birthday,
    customerProfileSuggestions.email,
    customerProfileSuggestions.preferredBranchId,
  ])

  const matchedCustomerSegment = useMemo(() => {
    if (!matchedCustomer) return null
    const ordersForCustomer = getOrdersForCustomer(matchedCustomer, allOrders)
    return buildCustomerMetrics(ordersForCustomer).segment
  }, [matchedCustomer, allOrders])

  useEffect(() => {
    if (!matchedCustomer) return

    form.setValues((prev) => ({
      ...prev,
      customerName: prev.customerName.trim() ? prev.customerName : matchedCustomer.name,
      customerEmail: prev.customerEmail.trim() ? prev.customerEmail : matchedCustomer.email ?? '',
      customerBirthday: prev.customerBirthday || matchedCustomer.birthday || '',
      promoCode: prev.promoCode.trim() ? prev.promoCode : matchedCustomer.promoCode ?? '',
    }))

    if (matchedCustomer.birthday) {
      form.setShowBirthdayFields(true)
    }
    if (matchedCustomer.promoCode) {
      form.setShowPromoField(true)
    }
  }, [matchedCustomer])

  useEffect(() => {
    if (!open) return
    const saved = getOrderDraft(draftId)
    const baselineValues = saved?.values ?? initialNewOrderValues
    baselineValuesRef.current = baselineValues
    setCloseConfirmationOpen(false)
    form.resetForm()
    if (saved) {
      form.setValues(saved.values)
      form.setShowBirthdayFields(Boolean(saved.values.customerBirthday))
      form.setShowPromoField(Boolean(saved.values.promoCode))
    }
    // Loading is intentionally keyed to sheet open + selected explicit draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftId])

  const voucherCustomer = useMemo(() => {
    if (!matchedCustomer) return null
    const tags = new Set(matchedCustomer.tags ?? [])
    if (matchedCustomerSegment === 'vip') tags.add('VIP')
    return { id: matchedCustomer.id, tags: [...tags] }
  }, [matchedCustomer, matchedCustomerSegment])

  const pricing = useNewOrderPricing({
    values: form.values,
    catalogProducts,
    vouchers,
    voucherCustomer,
  })

  useEffect(() => {
    if (!matchedCustomer || matchedCustomerSegment !== 'vip') {
      if (autoVoucherCodeRef.current && form.values.promoCode === autoVoucherCodeRef.current) {
        form.onFieldValueChange('promoCode', '')
      }
      autoVoucherCodeRef.current = null
      return
    }

    const eligible = vouchers
      .map((voucher) => ({
        voucher,
        result: validateVoucherCode(voucher.code, vouchers, {
          orderSubtotalIdr: pricing.primaryItemPriceIdr,
          customer: voucherCustomer,
        }),
      }))
      .filter((entry) => entry.result.ok)
      .sort((a, b) => (b.result.discountIdr ?? 0) - (a.result.discountIdr ?? 0))

    const bestCode = eligible[0]?.voucher.code ?? null
    const currentCode = form.values.promoCode.trim().toUpperCase()
    const canAutoReplace = !currentCode || currentCode === autoVoucherCodeRef.current

    if (bestCode && canAutoReplace && currentCode !== bestCode) {
      autoVoucherCodeRef.current = bestCode
      form.onFieldValueChange('promoCode', bestCode)
      form.setShowPromoField(true)
    } else if (!bestCode && autoVoucherCodeRef.current && currentCode === autoVoucherCodeRef.current) {
      autoVoucherCodeRef.current = null
      form.onFieldValueChange('promoCode', '')
    }
  }, [
    matchedCustomer,
    matchedCustomerSegment,
    pricing.primaryItemPriceIdr,
    voucherCustomer,
    vouchers,
    form.values.promoCode,
  ])

  const submit = useNewOrderSubmit({
    values: form.values,
    activeBranch: branchForForm,
    catalogProducts,
    matchedCustomer,
    createOrder,
    createOrUpdateCustomerFromAdmin,
    acceptedProfileSuggestions,
    clearDraft: () => { if (draftId) deleteOrderDraft(draftId) },
    setInfoMessage: form.setInfoMessage,
    onClose,
    setStep: form.setStep,
    voucherDiscountIdr: pricing.voucherDiscountIdr,
  })

  const hasUnsavedChanges = () =>
    JSON.stringify(form.values) !== JSON.stringify(baselineValuesRef.current)

  const discardAndClose = () => {
    setCloseConfirmationOpen(false)
    form.resetForm()
    onClose()
  }

  const requestClose = () => {
    if (hasUnsavedChanges()) {
      setCloseConfirmationOpen(true)
      return
    }
    discardAndClose()
  }

  useDismissableModal(open && !closeConfirmationOpen, requestClose)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()

    const nextErrors = validateNewOrderForm(form.values, selectedBranch)
    if (Object.keys(nextErrors).length > 0) {
      form.setErrors(nextErrors)
      form.setStep('edit')
      return
    }

    if (form.step === 'edit') {
      form.setStep('review')
      return
    }

    submit.createOrderFromForm()
  }

  const branchLabel =
    branchForForm !== 'All' ? branchForForm : 'Kedamaian'
  const selectedBranch = configuredBranches.find((branch) => branch.id === branchLabel) ?? null
  const deliveryTimeSlots = getOpeningHourTimeSlots(selectedBranch, form.values.deliveryDate)
  const pickupTimeSlots = getOpeningHourTimeSlots(selectedBranch, form.values.pickupDate)
  const deliveryHoursLabel = form.values.deliveryDate
    ? describeBranchHoursForDate(selectedBranch, form.values.deliveryDate)
    : 'Select a date to see available hours.'
  const pickupHoursLabel = form.values.pickupDate
    ? describeBranchHoursForDate(selectedBranch, form.values.pickupDate)
    : 'Select a date to see available hours.'
  const isBranchClosedOnDate = (date: Date) => {
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const hours = getBranchHoursForDate(selectedBranch, value)
    return !hours?.isOpen
  }

  const paymentStatusLabelForReview =
    form.values.paymentStatus === 'unpaid'
      ? 'Unpaid'
      : form.values.paymentStatus === 'partial'
        ? 'Partial'
        : form.values.paymentStatus === 'paid'
          ? 'Paid'
          : 'Unspecified'

  const paymentMethodLabelForReview =
    form.values.paymentMethod === 'cash'
      ? 'Cash'
      : form.values.paymentMethod === 'transfer'
        ? 'Transfer'
        : 'Not set'

  const fulfillmentLabelForReview =
    form.values.fulfillmentType === 'delivery'
      ? 'Delivery'
      : form.values.fulfillmentType === 'pickup'
        ? 'Pickup'
        : 'Not set'

  const isFormReady = Object.keys(validateNewOrderForm(form.values, selectedBranch)).length === 0

  const activeGuideStep = useMemo(
    () => getActiveGuideStep(form.values),
    [form.values],
  )
  // The primary accent belongs to the field the user is actively touching. Once that
  // field receives a value, the wrappers below clear focusedField and the
  // primary guide advances to the next missing field *inside the same section*.
  // Crossing a section boundary shows only the dark section ring until the
  // user enters that next section.
  const activeGuideField = form.focusedField
    ?? (activeGuideStep?.section === form.focusedSection ? activeGuideStep.field : null)

  const focusedSectionIsComplete = form.focusedSection
    ? isGuideSectionComplete(form.focusedSection, form.values)
    : true
  const activeGuideSection = form.focusedField && form.focusedSection
    ? form.focusedSection
    : !focusedSectionIsComplete && form.focusedSection
      ? form.focusedSection
      : activeGuideStep?.section ?? (form.values.orderNote.trim() ? null : 'notes')

  // Dropdown/popover libraries restore focus to their trigger after a value
  // is picked. Clear that restored focus on the next frame so the completed
  // control cannot keep a stale primary ring and the guide can advance.
  const advanceAfterDiscreteSelection = () => {
    form.setFocusedField(null)
    window.requestAnimationFrame(() => form.setFocusedField(null))
  }

  const handleSaveDraft = () => {
    saveOrderDraft({ id: draftId, branch: branchForForm, values: form.values })
    baselineValuesRef.current = form.values
    setCloseConfirmationOpen(false)
    form.resetForm()
    onClose()
  }

  return {
    open,
    values: form.values,
    errors: form.errors,
    infoMessage: form.infoMessage,
    step: form.step,
    branchLabel,
    deliveryTimeSlots,
    pickupTimeSlots,
    deliveryHoursLabel,
    pickupHoursLabel,
    isBranchClosedOnDate,
    matchedCustomer,
    matchedCustomerSegment,
    customerProfileSuggestions,
    acceptedProfileSuggestions,
    showBirthdayFields: form.showBirthdayFields,
    showPromoField: form.showPromoField,
    activeGuideField,
    activeGuideSection,
    onSectionFocus: form.setFocusedSection,
    onGuideFieldFocus: (field) => {
      const filled = isGuideFieldFilled(field, form.values)
      if (filled === true && activeGuideStep?.field !== field) {
        form.setFocusedField(null)
        return
      }
      form.setFocusedField(field)
    },
    onGuideFieldBlur: () => form.setFocusedField(null),
    catalogProductOptions: pricing.catalogProductOptions,
    selectedCatalogProduct: pricing.selectedCatalogProduct,
    estimatedOrderTotalIdr: pricing.estimatedOrderTotalIdr,
    voucherDiscountIdr: pricing.voucherDiscountIdr,
    depositValueForReview: pricing.depositValueForReview,
    paymentStatusLabelForReview,
    paymentMethodLabelForReview,
    fulfillmentLabelForReview,
    catalogPriceFormatter: pricing.catalogPriceFormatter,
    isFormReady,
    closeConfirmationOpen,
    onClose: requestClose,
    onContinueEditing: () => setCloseConfirmationOpen(false),
    onDiscardAndClose: discardAndClose,
    onSubmit,
    onSaveDraft: handleSaveDraft,
    onFieldChange: (field) => (event) => {
      form.onFieldChange(field)(event)
      if (event.target.value.trim().length > 0) form.setFocusedField(null)
    },
    onFieldValueChange: (field, value) => {
      form.onFieldValueChange(field, value)
      if (String(value).trim().length > 0) advanceAfterDiscreteSelection()
      if (field === 'deliveryDate') {
        const slots = getOpeningHourTimeSlots(selectedBranch, String(value))
        if (form.values.deliveryTime && !slots.includes(form.values.deliveryTime)) {
          form.onFieldValueChange('deliveryTime', '')
        }
      }
      if (field === 'pickupDate') {
        const slots = getOpeningHourTimeSlots(selectedBranch, String(value))
        if (form.values.pickupTime && !slots.includes(form.values.pickupTime)) {
          form.onFieldValueChange('pickupTime', '')
        }
      }
    },
    onCurrencyFieldChange: (field, value) => {
      form.onCurrencyFieldChange(field, value)
      if (value.trim().length > 0) form.setFocusedField(null)
    },
    onFulfillmentChange: (type) => {
      form.onFulfillmentChange(type)
      form.setFocusedField(null)
    },
    onOrderItemModeChange: (mode) => {
      form.setValues((prev) => ({ ...prev, orderItemMode: mode }))
      form.setFocusedField(null)
      form.setErrors((prev) => ({
        ...prev,
        orderItemCatalogId: mode === 'catalog' ? undefined : prev.orderItemCatalogId,
        orderItemCustomName: mode === 'custom' ? undefined : prev.orderItemCustomName,
        orderItemCustomPrice: mode === 'custom' ? undefined : prev.orderItemCustomPrice,
      }))
    },
    onCatalogProductChange: (value) => {
      form.onFieldValueChange('orderItemCatalogId', value)
      advanceAfterDiscreteSelection()
    },
    onOrderTypeChange: (value) => {
      form.onFieldValueChange('orderType', value)
      advanceAfterDiscreteSelection()
    },
    onPaymentMethodChange: (value) => {
      form.onFieldValueChange('paymentMethod', value)
      advanceAfterDiscreteSelection()
    },
    onPaymentStatusChange: (value) => {
      advanceAfterDiscreteSelection()
      form.setValues((prev) => ({
        ...prev,
        paymentStatus: value,
        depositAmount: value === 'partial' ? prev.depositAmount : '',
      }))
    },
    onShowBirthdayFields: () => form.setShowBirthdayFields(true),
    onShowPromoField: () => form.setShowPromoField(true),
    onToggleProfileSuggestion: (key) => {
      const value = customerProfileSuggestions[key]
      if (!value) return
      setAcceptedProfileSuggestions((current) => {
        if (current[key]) {
          const next = { ...current }
          delete next[key]
          return next
        }
        return { ...current, [key]: value }
      })
    },
    onBackToEdit: () => form.setStep('edit'),
  }
}
