import { describe, expect, it } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { doesOrderMatchSearch } from './orderTableFilters'

const order = makeOrder({
  orderNumber: 'KDM-2026-0042',
  customerName: 'Ridwan Ramadhan',
  branch: 'Kedamaian',
})

describe('doesOrderMatchSearch', () => {
  it('matches customer WhatsApp and email in addition to visible order fields', () => {
    const input = {
      order,
      productName: 'White Rose Bouquet',
      customerContact: { whatsappNumber: '0812 3456 7890', email: 'ridwan@example.com' },
    }

    expect(doesOrderMatchSearch({ ...input, query: '3456' })).toBe(true)
    expect(doesOrderMatchSearch({ ...input, query: 'ridwan@example.com' })).toBe(true)
    expect(doesOrderMatchSearch({ ...input, query: 'white rose' })).toBe(true)
    expect(doesOrderMatchSearch({ ...input, query: 'not-present' })).toBe(false)
  })

  it('matches daily order numbers typed without dashes', () => {
    const daily = makeOrder({ orderNumber: 'KDM-26-11-26-007', customerName: 'Ani', branch: 'Kedamaian' })
    const input = { order: daily, productName: 'Tulip' }
    expect(doesOrderMatchSearch({ ...input, query: 'kdm261126007' })).toBe(true)
    expect(doesOrderMatchSearch({ ...input, query: 'KDM-26-11-26-007' })).toBe(true)
    expect(doesOrderMatchSearch({ ...input, query: 'kdm261126008' })).toBe(false)
  })
})
