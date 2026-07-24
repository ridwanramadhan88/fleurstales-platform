import { describe, expect, it } from 'vitest'
import { getActiveGuideStep, isGuideSectionComplete } from './newOrderGuide'
import { initialNewOrderValues } from './useNewOrderForm'

describe('new order guided priority', () => {
  it('follows customer, items, source, fulfillment, date, time, then payment', () => {
    const values = { ...initialNewOrderValues }

    expect(getActiveGuideStep(values)?.field).toBe('customerName')
    values.customerName = 'Dita'
    expect(getActiveGuideStep(values)?.field).toBe('customerWhatsappNumber')
    values.customerWhatsappNumber = '08123456789'
    expect(getActiveGuideStep(values)?.field).toBe('orderItemCatalogId')
    values.orderItemCatalogId = 'product-1'
    expect(getActiveGuideStep(values)?.field).toBe('orderType')
    values.orderType = 'admin_created'
    expect(getActiveGuideStep(values)?.field).toBe('fulfillmentType')
    values.fulfillmentType = 'pickup'
    expect(getActiveGuideStep(values)?.field).toBe('pickupDate')
    values.pickupDate = '2026-07-11'
    expect(getActiveGuideStep(values)?.field).toBe('pickupTime')
    values.pickupTime = '10:00'
    expect(getActiveGuideStep(values)?.field).toBe('paymentMethod')
    values.paymentMethod = 'transfer'
    expect(getActiveGuideStep(values)).toBeNull()
  })

  it('moves the section guide forward only after every required field in a section is complete', () => {
    const values = { ...initialNewOrderValues, customerName: 'Dita' }
    expect(isGuideSectionComplete('customer', values)).toBe(false)
    values.customerWhatsappNumber = '08123456789'
    expect(isGuideSectionComplete('customer', values)).toBe(true)
    expect(getActiveGuideStep(values)?.section).toBe('items')
  })
})
