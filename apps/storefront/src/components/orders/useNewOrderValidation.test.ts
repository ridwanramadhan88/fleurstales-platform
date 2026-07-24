import { describe, expect, it } from 'vitest'
import { initialNewOrderValues, type NewOrderFormValues } from './useNewOrderForm'
import { validateNewOrderForm } from './useNewOrderValidation'

const validCatalogOrder: NewOrderFormValues = {
  ...initialNewOrderValues,
  customerName: 'Jane Doe',
  customerWhatsappNumber: '081234567890',
  orderItemMode: 'catalog',
  orderItemCatalogId: 'cat_1',
  fulfillmentType: 'pickup',
  orderType: 'walk_in',
  paymentMethod: 'cash',
  paymentStatus: 'paid',
}

describe('validateNewOrderForm', () => {
  it('returns no errors for a fully valid catalog pickup order', () => {
    expect(validateNewOrderForm(validCatalogOrder)).toEqual({})
  })

  it('requires customer name', () => {
    const errors = validateNewOrderForm({ ...validCatalogOrder, customerName: '   ' })
    expect(errors.customerName).toBeDefined()
  })

  it('requires customer phone', () => {
    const errors = validateNewOrderForm({ ...validCatalogOrder, customerWhatsappNumber: '' })
    expect(errors.customerWhatsappNumber).toBeDefined()
  })

  describe('order item mode: catalog', () => {
    it('requires a catalog product to be selected', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        orderItemMode: 'catalog',
        orderItemCatalogId: '',
      })
      expect(errors.orderItemCatalogId).toBeDefined()
    })

    it('does not require custom-item fields in catalog mode', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        orderItemMode: 'catalog',
        orderItemCatalogId: 'cat_1',
        orderItemCustomName: '',
        orderItemCustomPrice: '',
      })
      expect(errors.orderItemCustomName).toBeUndefined()
      expect(errors.orderItemCustomPrice).toBeUndefined()
    })
  })

  describe('order item mode: custom', () => {
    it('requires custom item name and price', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        orderItemMode: 'custom',
        orderItemCustomName: '',
        orderItemCustomPrice: '',
      })
      expect(errors.orderItemCustomName).toBeDefined()
      expect(errors.orderItemCustomPrice).toBeDefined()
    })

    it('passes when custom name and price are provided', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        orderItemMode: 'custom',
        orderItemCustomName: 'Custom Bouquet',
        orderItemCustomPrice: '150.000',
      })
      expect(errors.orderItemCustomName).toBeUndefined()
      expect(errors.orderItemCustomPrice).toBeUndefined()
    })

    it('does not require a catalog id in custom mode', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        orderItemMode: 'custom',
        orderItemCatalogId: '',
        orderItemCustomName: 'Custom Bouquet',
        orderItemCustomPrice: '150.000',
      })
      expect(errors.orderItemCatalogId).toBeUndefined()
    })
  })

  describe('fulfillment', () => {
    it('requires a fulfillment type to be chosen', () => {
      const errors = validateNewOrderForm({ ...validCatalogOrder, fulfillmentType: '' })
      expect(errors.fulfillmentType).toBeDefined()
    })

    it('requires a delivery address when fulfillment is delivery', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        fulfillmentType: 'delivery',
        deliveryAddress: '',
      })
      expect(errors.deliveryAddress).toBeDefined()
    })

    it('does not require a delivery address for pickup', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        fulfillmentType: 'pickup',
        deliveryAddress: '',
      })
      expect(errors.deliveryAddress).toBeUndefined()
    })

    it('passes when a delivery address is provided for delivery', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        fulfillmentType: 'delivery',
        deliveryAddress: 'Jl. Mawar No. 1',
      })
      expect(errors.deliveryAddress).toBeUndefined()
    })
  })

  it('requires an order source/type', () => {
    const errors = validateNewOrderForm({
      ...validCatalogOrder,
      orderType: '' as unknown as NewOrderFormValues['orderType'],
    })
    expect(errors.orderType).toBeDefined()
  })

  it('requires a payment method', () => {
    const errors = validateNewOrderForm({
      ...validCatalogOrder,
      paymentMethod: '',
    })
    expect(errors.paymentMethod).toBeDefined()
  })

  it('rejects cash payment for delivery orders', () => {
    const errors = validateNewOrderForm({
      ...validCatalogOrder,
      fulfillmentType: 'delivery',
      deliveryAddress: 'Jl. Mawar No. 1',
      paymentMethod: 'cash',
    })
    expect(errors.paymentMethod).toBeDefined()
  })

  it('allows transfer payment for delivery orders', () => {
    const errors = validateNewOrderForm({
      ...validCatalogOrder,
      fulfillmentType: 'delivery',
      deliveryAddress: 'Jl. Mawar No. 1',
      paymentMethod: 'transfer',
    })
    expect(errors.paymentMethod).toBeUndefined()
  })

  it('allows cash payment for pickup orders', () => {
    const errors = validateNewOrderForm({
      ...validCatalogOrder,
      fulfillmentType: 'pickup',
      paymentMethod: 'cash',
    })
    expect(errors.paymentMethod).toBeUndefined()
  })

  describe('partial payment', () => {
    it('requires a deposit amount when payment status is partial', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        paymentStatus: 'partial',
        depositAmount: '',
      })
      expect(errors.depositAmount).toBeDefined()
    })

    it('passes when a deposit amount is provided for partial payment', () => {
      const errors = validateNewOrderForm({
        ...validCatalogOrder,
        paymentStatus: 'partial',
        depositAmount: '50.000',
      })
      expect(errors.depositAmount).toBeUndefined()
    })

    it('does not require a deposit amount when fully paid or unpaid', () => {
      const paid = validateNewOrderForm({
        ...validCatalogOrder,
        paymentStatus: 'paid',
        depositAmount: '',
      })
      const unpaid = validateNewOrderForm({
        ...validCatalogOrder,
        paymentStatus: 'unpaid',
        depositAmount: '',
      })
      expect(paid.depositAmount).toBeUndefined()
      expect(unpaid.depositAmount).toBeUndefined()
    })
  })

  it('accumulates multiple errors at once for a mostly-empty form', () => {
    const errors = validateNewOrderForm(initialNewOrderValues)
    expect(Object.keys(errors).length).toBeGreaterThan(1)
    expect(errors.customerName).toBeDefined()
    expect(errors.customerWhatsappNumber).toBeDefined()
    expect(errors.orderItemCatalogId).toBeDefined()
    expect(errors.fulfillmentType).toBeDefined()
    expect(errors.paymentMethod).toBeDefined()
  })
})

describe('branch opening-hour validation', () => {
  const branch = {
    openingHours: {
      monday: { isOpen: true, opensAt: '10:00', closesAt: '17:00' },
      tuesday: { isOpen: false, opensAt: '10:00', closesAt: '17:00' },
      wednesday: { isOpen: true, opensAt: '10:00', closesAt: '17:00' },
      thursday: { isOpen: true, opensAt: '10:00', closesAt: '17:00' },
      friday: { isOpen: true, opensAt: '10:00', closesAt: '17:00' },
      saturday: { isOpen: true, opensAt: '10:00', closesAt: '17:00' },
      sunday: { isOpen: true, opensAt: '10:00', closesAt: '17:00' },
    },
  }

  it('rejects pickup outside branch hours', () => {
    const errors = validateNewOrderForm({ ...validCatalogOrder, pickupDate: '2026-07-13', pickupTime: '18:00' }, branch)
    expect(errors.pickupTime).toContain('10:00')
  })

  it('rejects fulfillment on a closed branch day', () => {
    const errors = validateNewOrderForm({ ...validCatalogOrder, pickupDate: '2026-07-14', pickupTime: '10:00' }, branch)
    expect(errors.pickupDate).toContain('closed')
  })
})
