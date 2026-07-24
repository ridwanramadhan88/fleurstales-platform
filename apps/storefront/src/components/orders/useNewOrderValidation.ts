import type { NewOrderFormErrors, NewOrderFormValues } from './useNewOrderForm'
import { isPaymentMethodAllowedForFulfillment } from '../../domain/orderPaymentGateDomain'
import type { BranchSettings } from '../../types/settings'
import { getBranchHoursForDate, isTimeWithinBranchOpeningHours } from '../../domain/branchOpeningHoursDomain'

export const validateNewOrderForm = (
  values: NewOrderFormValues,
  branch?: Pick<BranchSettings, 'openingHours'> | null,
): NewOrderFormErrors => {
  const nextErrors: NewOrderFormErrors = {}

  if (!values.customerName.trim()) {
    nextErrors.customerName = 'Customer name is required.'
  }
  if (!values.customerWhatsappNumber.trim()) {
    nextErrors.customerWhatsappNumber = 'WhatsApp number is required.'
  }

  if (values.orderItemMode === 'catalog') {
    if (!values.orderItemCatalogId) {
      nextErrors.orderItemCatalogId = 'Select a product from the catalog.'
    }
  } else {
    if (!values.orderItemCustomName.trim()) {
      nextErrors.orderItemCustomName = 'Item name is required.'
    }
    if (!values.orderItemCustomPrice.trim()) {
      nextErrors.orderItemCustomPrice = 'Item price is required.'
    }
  }

  if (!values.fulfillmentType) {
    nextErrors.fulfillmentType = 'Choose Delivery or Pickup.'
  }
  if (values.fulfillmentType === 'delivery' && !values.deliveryAddress.trim()) {
    nextErrors.deliveryAddress = 'Delivery address is required for delivery.'
  }
  if (!values.orderType) {
    nextErrors.orderType = 'Select order source.'
  }

  const scheduleDate = values.fulfillmentType === 'delivery' ? values.deliveryDate : values.pickupDate
  const scheduleTime = values.fulfillmentType === 'delivery' ? values.deliveryTime : values.pickupTime
  const dateField = values.fulfillmentType === 'delivery' ? 'deliveryDate' : 'pickupDate'
  const timeField = values.fulfillmentType === 'delivery' ? 'deliveryTime' : 'pickupTime'
  if (values.fulfillmentType && (scheduleDate || scheduleTime)) {
    if (!scheduleDate) nextErrors[dateField] = 'Select a fulfillment date.'
    if (!scheduleTime) nextErrors[timeField] = 'Select a fulfillment time.'
    if (scheduleDate) {
      const hours = getBranchHoursForDate(branch, scheduleDate)
      if (!hours?.isOpen) {
        nextErrors[dateField] = 'This branch is closed on the selected date.'
      } else if (scheduleTime && !isTimeWithinBranchOpeningHours(branch, scheduleDate, scheduleTime)) {
        nextErrors[timeField] = `Choose a time between ${hours.opensAt} and ${hours.closesAt}.`
      }
    }
  }

  if (!values.paymentMethod) {
    nextErrors.paymentMethod = 'Choose a payment method.'
  }
  if (
    values.fulfillmentType &&
    values.paymentMethod &&
    !isPaymentMethodAllowedForFulfillment(values.paymentMethod, values.fulfillmentType)
  ) {
    nextErrors.paymentMethod = 'Delivery orders must be paid by bank transfer.'
  }

  if (values.paymentStatus === 'partial' && !values.depositAmount.trim()) {
    nextErrors.depositAmount = 'Deposit amount is required for partial payments.'
  }

  return nextErrors
}
