import { beforeEach, describe, expect, it } from 'vitest'
import { deleteOrderDraft, getOrderDraft, saveOrderDraft } from './orderDraftStore'
import { initialNewOrderValues } from './useNewOrderForm'

describe('explicit order drafts', () => {
  beforeEach(() => window.localStorage.clear())

  it('saves only when explicitly requested and can be resumed', () => {
    const saved = saveOrderDraft({
      branch: 'Kedamaian',
      values: { ...initialNewOrderValues, customerName: 'Ridwan' },
    })

    expect(getOrderDraft(saved.id)?.values.customerName).toBe('Ridwan')
  })

  it('updates the same draft instead of duplicating it', () => {
    const first = saveOrderDraft({
      branch: 'Kedamaian',
      values: { ...initialNewOrderValues, customerName: 'Ridwan' },
    })
    const updated = saveOrderDraft({
      id: first.id,
      branch: 'Kedamaian',
      values: { ...first.values, customerWhatsappNumber: '081234567890' },
    })

    expect(updated.id).toBe(first.id)
    expect(getOrderDraft(first.id)?.values.customerWhatsappNumber).toBe('081234567890')
  })

  it('deletes a saved draft without creating an order', () => {
    const saved = saveOrderDraft({ branch: 'Kedamaian', values: initialNewOrderValues })
    deleteOrderDraft(saved.id)
    expect(getOrderDraft(saved.id)).toBeNull()
  })
})
