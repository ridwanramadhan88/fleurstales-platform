import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CartDrawerViewModel } from './CartDrawerController'
import { DetailsStep } from './CartDrawerDetailsStep'
import { ReviewStep } from './CartDrawerReviewStep'

const base = (): CartDrawerViewModel => ({
  open: true,
  onClose: vi.fn(),
  lines: [{ lineId: 'l1', productId: 'p1', name: 'Bouquet', unitPriceIdr: 200_000, quantity: 1 }],
  onIncrement: vi.fn(),
  onDecrement: vi.fn(),
  onOrderPlaced: vi.fn(),
  formatter: new Intl.NumberFormat('id-ID'),
  step: 'details',
  customerName: 'Ibu Sari Wulandari',
  whatsappNumber: '0812-1111-2222',
  email: '',
  birthday: '',
  showBirthdayField: false,
  branch: 'Kedamaian',
  activeBranches: [{ id:'Kedamaian', name:'Kedamaian', code:'KDM', address:'', phone:'', isActive:true, deliveryFeeIdr:15000 }],
  selectedBranch: { id:'Kedamaian', name:'Kedamaian', code:'KDM', address:'', phone:'', isActive:true, deliveryFeeIdr:15000 },
  availableTimeSlots: [],
  branchHoursLabel: 'Select a date to see branch hours.',
  isDateUnavailable: vi.fn(() => false),
  fulfillment: 'pickup',
  deliveryDate: '',
  deliveryTime: '',
  deliveryAddress: '',
  orderNote: '',
  greetingMessage: 'Happy birthday!',
  greetingCardName: 'From Budi',
  matchedCustomer: { id: 'cust-sari', name: 'Ibu Sari Wulandari', whatsappNumber: '0812 1111 2222', normalizedWhatsappNumber: '6281211112222', tags: ['VIP'], preferredBranch: 'Kedamaian' },
  matchedCustomerSegment: 'vip',
  eligibleVouchers: [{ id: 'v1', code: 'VIP10', percentOff: 10, eligibility: 'vip', isActive: true, createdAt: '2026-01-01' }],
  detailsError: null,
  voucherCode: '',
  appliedVoucherCode: null,
  voucherMessage: null,
  paymentMethod: 'transfer',
  placedOrderNumber: null,
  bankAccounts: [],
  paymentInstructions: '',
  itemsTotalIdr: 200_000,
  itemCount: 1,
  deliveryFeeIdr: 0,
  discountIdr: 0,
  grandTotalIdr: 200_000,
  setStep: vi.fn(),
  setCustomerName: vi.fn(),
  setWhatsappNumber: vi.fn(),
  setEmail: vi.fn(),
  setBirthday: vi.fn(),
  setShowBirthdayField: vi.fn(),
  setBranch: vi.fn(),
  handleFulfillmentChange: vi.fn(),
  setDeliveryDate: vi.fn(),
  setDeliveryTime: vi.fn(),
  setDeliveryAddress: vi.fn(),
  setOrderNote: vi.fn(),
  setGreetingMessage: vi.fn(),
  setGreetingCardName: vi.fn(),
  setVoucherCode: vi.fn(),
  setVoucherMessage: vi.fn(),
  setPaymentMethod: vi.fn(),
  handleApplyVoucher: vi.fn(),
  handleApplySuggestedVoucher: vi.fn(),
  handleRemoveVoucher: vi.fn(),
  handleContinueFromDetails: vi.fn(),
  handleConfirmOrder: vi.fn(),
  handleClose: vi.fn(),
})

describe('customer checkout CRM and voucher UI', () => {
  it('shows matched customer name, status, and admin-equivalent greeting fields', () => {
    render(<DetailsStep {...base()} />)
    expect(screen.getByText('Ibu Sari Wulandari')).toBeInTheDocument()
    expect(screen.getByText('VIP')).toBeInTheDocument()
    const greetingMessage = screen.getByLabelText('Card message')
    const greetingCardName = screen.getByLabelText('Name on greeting card')
    expect(greetingMessage).toHaveValue('Happy birthday!')
    expect(greetingCardName).toHaveValue('From Budi')
    expect(
      greetingMessage.compareDocumentPosition(greetingCardName) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows and applies eligible voucher chips on review', async () => {
    const user = userEvent.setup()
    const viewModel = base()
    render(<ReviewStep {...viewModel} />)
    await user.click(screen.getByRole('button', { name: 'VIP10 · 10% off' }))
    expect(viewModel.handleApplySuggestedVoucher).toHaveBeenCalledWith('VIP10')
    expect(screen.getByText('Happy birthday!')).toBeInTheDocument()
    expect(screen.getByText('From Budi')).toBeInTheDocument()
  })
})
