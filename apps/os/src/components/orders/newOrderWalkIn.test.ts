import { describe, expect, it } from 'vitest'
import { applyWalkInDefaults, getWalkInPickupSlot } from './newOrderWalkIn'
import { initialNewOrderValues, isWalkInPickup } from './useNewOrderForm'
import { validateNewOrderForm } from './useNewOrderValidation'

const openAllWeek = {
  openingHours: Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      .map((day) => [day, { isOpen: true, opensAt: '09:00', closesAt: '18:00' }]),
  ),
} as never

// Saturday 3 Oct 2026, 14:07 in Jakarta (getters read as Jakarta time).
const NOW = new Date(2026, 9, 3, 14, 7, 0, 0)

describe('walk-in pickup', () => {
  it('starts as a cash pickup, still unpaid, without touching what the user already chose', () => {
    expect(applyWalkInDefaults(initialNewOrderValues)).toMatchObject({
      orderType: 'walk_in', fulfillmentType: 'pickup', paymentMethod: 'cash', paymentStatus: 'unpaid',
    })
    expect(applyWalkInDefaults({ ...initialNewOrderValues, paymentMethod: 'transfer' })).toMatchObject({
      paymentMethod: 'transfer', paymentStatus: 'unpaid',
    })
    expect(applyWalkInDefaults({ ...initialNewOrderValues, fulfillmentType: 'delivery' })).toMatchObject({
      fulfillmentType: 'delivery', paymentMethod: '',
    })
  })

  it('gets the earliest slot the server accepts: 15-minute steps, 45 minutes ahead', () => {
    expect(getWalkInPickupSlot({ branch: openAllWeek, branchId: 'Kedamaian', orders: [], now: NOW }))
      .toEqual({ pickupDate: '2026-10-03', pickupTime: '15:00' })
  })

  it('gets no slot after closing, so staff pick one themselves', () => {
    const late = new Date(2026, 9, 3, 17, 30, 0, 0)
    expect(getWalkInPickupSlot({ branch: openAllWeek, branchId: 'Kedamaian', orders: [], now: late })).toBeNull()
  })

  it('needs no date, time or greeting card from staff', () => {
    const values = {
      ...applyWalkInDefaults({
        ...initialNewOrderValues,
        customerName: 'Rudi',
        customerWhatsappNumber: '0812',
        orderItemCatalogId: 'cat_1',
        orderItemVariantId: 'variant_1',
      }),
      // Filled in by the form, not typed by staff.
      ...getWalkInPickupSlot({ branch: openAllWeek, branchId: 'Kedamaian', orders: [] }),
    }
    expect(isWalkInPickup(values)).toBe(true)
    expect(values.greetingMessage).toBe('')
    expect(validateNewOrderForm(values)).toEqual({})
  })
})

describe('delivery', () => {
  it('still requires address, date and time', () => {
    const errors = validateNewOrderForm({
      ...initialNewOrderValues,
      customerName: 'Dita',
      customerWhatsappNumber: '0812',
      orderItemCatalogId: 'cat_1',
      orderItemVariantId: 'variant_1',
      orderType: 'admin_created',
      fulfillmentType: 'delivery',
      paymentMethod: 'transfer',
    })
    expect(errors.deliveryAddress).toBeDefined()
    expect(errors.deliveryDate).toBeDefined()
    expect(errors.deliveryTime).toBeDefined()
  })
})
