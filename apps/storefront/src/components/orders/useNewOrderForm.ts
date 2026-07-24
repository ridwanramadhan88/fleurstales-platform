import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { formatIdrInput } from '../../lib/formatters'
import type { GuideSection } from './newOrderGuide'

export interface NewOrderFormValues {
  customerName: string
  customerWhatsappNumber: string
  customerEmail: string
  customerBirthday: string
  promoCode: string
  orderItemMode: 'catalog' | 'custom'
  orderItemCatalogId: string
  orderItemCustomName: string
  orderItemCustomPrice: string
  orderType: '' | 'walk_in' | 'admin_created'
  fulfillmentType: '' | 'delivery' | 'pickup'
  deliveryDate: string
  deliveryTime: string
  pickupDate: string
  pickupTime: string
  deliveryAddress: string
  deliveryInstructions: string
  deliveryFee: string
  greetingMessage: string
  greetingCardName: string
  paymentMethod: '' | 'cash' | 'transfer'
  paymentStatus: 'unpaid' | 'partial' | 'paid'
  depositAmount: string
  orderNote: string
}

export type NewOrderFormErrors = Partial<Record<keyof NewOrderFormValues, string>>
export type FormStep = 'edit' | 'review'

export const initialNewOrderValues: NewOrderFormValues = {
  customerName: '',
  customerWhatsappNumber: '',
  customerEmail: '',
  customerBirthday: '',
  promoCode: '',
  orderItemMode: 'catalog',
  orderItemCatalogId: '',
  orderItemCustomName: '',
  orderItemCustomPrice: '',
  orderType: '',
  fulfillmentType: '',
  deliveryDate: '',
  deliveryTime: '',
  pickupDate: '',
  pickupTime: '',
  deliveryAddress: '',
  deliveryInstructions: '',
  deliveryFee: '',
  greetingMessage: '',
  greetingCardName: '',
  paymentMethod: '',
  paymentStatus: 'unpaid',
  depositAmount: '',
  orderNote: '',
}

export const useNewOrderForm = (open: boolean) => {
  const [values, setValues] = useState<NewOrderFormValues>(initialNewOrderValues)
  const [errors, setErrors] = useState<NewOrderFormErrors>({})
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [step, setStep] = useState<FormStep>('edit')
  const [showBirthdayFields, setShowBirthdayFields] = useState(false)
  const [showPromoField, setShowPromoField] = useState(false)
  // Which section card the guided highlight rests on. `null` means "let the
  // workflow checklist decide" (see newOrderGuide.ts); clicking/focusing a
  // field sets this explicitly so the highlight follows the user instead of
  // forcing the checklist order.
  const [focusedSection, setFocusedSection] = useState<GuideSection | null>('customer')
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Fresh sheet open = fresh guide, always start from step 1's highlight.
  useEffect(() => {
    if (open) {
      setFocusedSection('customer')
      setFocusedField(null)
    }
  }, [open])

  const resetForm = () => {
    setValues(initialNewOrderValues)
    setErrors({})
    setInfoMessage(null)
    setStep('edit')
    setShowBirthdayFields(false)
    setShowPromoField(false)
    setFocusedSection('customer')
    setFocusedField(null)
  }


  useEffect(() => {
    if (!infoMessage) return

    const id = window.setTimeout(() => setInfoMessage(null), 3500)
    return () => window.clearTimeout(id)
  }, [infoMessage])

  const onFieldChange =
    <K extends keyof NewOrderFormValues>(field: K) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const { value } = event.target
      setValues((prev) => ({ ...prev, [field]: value as NewOrderFormValues[K] }))
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }

  const onFieldValueChange = <K extends keyof NewOrderFormValues>(
    field: K,
    value: NewOrderFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const onCurrencyFieldChange = (
    field: 'orderItemCustomPrice' | 'deliveryFee' | 'depositAmount',
    value: string,
  ) => {
    onFieldValueChange(field, formatIdrInput(value))
  }

  const onFulfillmentChange = (type: 'delivery' | 'pickup') => {
    setValues((prev) => ({
      ...prev,
      fulfillmentType: type,
      // Delivery orders must be paid by bank transfer (no cash-on-the-road
      // handling by couriers), so switching to delivery forces the payment
      // method and locks out "cash" until fulfillment changes back.
      paymentMethod: type === 'delivery' ? 'transfer' : prev.paymentMethod,
    }))
    setErrors((prev) => ({
      ...prev,
      fulfillmentType: undefined,
      deliveryAddress: type === 'pickup' ? undefined : prev.deliveryAddress,
    }))
  }

  const resetToEdit = () => setStep('edit')

  return {
    values,
    setValues,
    errors,
    setErrors,
    infoMessage,
    setInfoMessage,
    step,
    setStep,
    showBirthdayFields,
    setShowBirthdayFields,
    showPromoField,
    setShowPromoField,
    focusedSection,
    setFocusedSection,
    focusedField,
    setFocusedField,
    resetForm,
    onFieldChange,
    onFieldValueChange,
    onCurrencyFieldChange,
    onFulfillmentChange,
    resetToEdit,
  }
}
