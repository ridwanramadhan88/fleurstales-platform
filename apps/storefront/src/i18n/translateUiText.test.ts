import { describe, expect, it } from 'vitest'
import { translateUiText } from './translateUiText'

describe('Rid-reviewed Indonesian UI copy', () => {
  it('keeps common UI actions in English', () => {
    expect(translateUiText('Save', 'id')).toBe('Save')
    expect(translateUiText('Save changes', 'id')).toBe('Save changes')
    expect(translateUiText('Edit', 'id')).toBe('Edit')
    expect(translateUiText('Create pending entry', 'id')).toBe('Create pending entry')
  })

  it('keeps business workflow terms in English', () => {
    expect(translateUiText('Confirmed', 'id')).toBe('Confirmed')
    expect(translateUiText('Rejected', 'id')).toBe('Rejected')
    expect(translateUiText('Not assigned', 'id')).toBe('Not assigned')
  })

  it('uses the reviewed short Indonesian descriptions', () => {
    expect(translateUiText('Waiting for Finance confirmation.', 'id')).toBe('Menunggu Confirm dari Finance.')
    expect(translateUiText('Inventory is disabled.', 'id')).toBe('Inventory nonaktif.')
    expect(translateUiText('Finance rejected this order.', 'id')).toBe('Order di-Reject Finance.')
  })

  it('returns original English when selected', () => {
    expect(translateUiText('Inventory is disabled.', 'en')).toBe('Inventory is disabled.')
  })
})
