import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewOrderSheetContainer } from './NewOrderSheetContainer'

const openSheet = (onClose: () => void = () => {}) => {
  render(<NewOrderSheetContainer open onClose={onClose} activeBranch="Kedamaian" />)
  return screen.getByRole('dialog', { name: 'New order' })
}

describe('New Order form', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Saturday 3 Oct 2026, 10:00 in Jakarta.
    vi.setSystemTime(new Date('2026-10-03T03:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('a walk-in pickup asks for no date, time or greeting card', () => {
    const sheet = openSheet()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Walk-in' }))

    expect(within(sheet).getByText(/^Pickup today · \d{2}:\d{2}$/)).toBeInTheDocument()
    expect(sheet.querySelector('#pickupDate')).toBeNull()
    expect(sheet.querySelector('#pickupTime')).toBeNull()
    expect(within(sheet).queryByRole('button', { name: '+ Add greeting card' })).toBeNull()
    expect(sheet.querySelector('#greetingMessage')).toBeNull()

    // Staff can still change the time.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Change' }))
    expect(sheet.querySelector('#pickupDate')).not.toBeNull()
  })

  it('a delivery still shows address, date and time', () => {
    const sheet = openSheet()
    fireEvent.click(within(sheet).getByRole('button', { name: 'WhatsApp' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delivery' }))

    expect(sheet.querySelector('#deliveryAddress')).not.toBeNull()
    expect(sheet.querySelector('#deliveryDate')).not.toBeNull()
    expect(sheet.querySelector('#deliveryTime')).not.toBeNull()
  })

  it('keeps optional parts behind "+ Add" links', () => {
    const sheet = openSheet()
    expect(sheet.querySelector('#orderNote')).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: '+ Add note' }))
    expect(sheet.querySelector('#orderNote')).not.toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: '+ Add greeting card' }))
    expect(sheet.querySelector('#greetingMessage')).not.toBeNull()
  })

  it('shows "Review order" as the primary action even before the form is complete', () => {
    const sheet = openSheet()
    const review = within(sheet).getByRole('button', { name: /^Review order · Rp/ })
    expect(review).toHaveAttribute('type', 'submit')
    expect(review).toHaveClass('bg-primary', 'text-primary-foreground')
    expect(within(sheet).getByRole('button', { name: 'Save draft' })).not.toHaveClass('bg-primary')
  })

  it('clips the footer to the rounded corners of the dialog', () => {
    const sheet = openSheet()
    expect(sheet).toHaveClass('overflow-hidden', 'sm:rounded-2xl')
  })

  it('lets staff search the catalog when picking a product', () => {
    const onClose = vi.fn()
    const sheet = openSheet(onClose)
    fireEvent.click(within(sheet).getByRole('combobox', { name: /Choose a product from catalog/ }))
    expect(screen.getByRole('searchbox', { name: 'Search product' })).toBeInTheDocument()

    // Escape closes the product list only, never the whole form.
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search product' }), { key: 'Escape' })
    expect(screen.queryByRole('searchbox', { name: 'Search product' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})
