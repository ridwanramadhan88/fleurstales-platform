import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CustomersTabContentViewModel } from './CustomersTabContentController'

vi.mock('./CustomerSegmentRulesSettingsContainer', () => ({ CustomerSegmentRulesSettingsContainer: () => <div>Segment settings</div> }))
vi.mock('./CustomerFiltersBar', () => ({ CustomerFiltersBar: () => <div>Customer filters</div> }))
vi.mock('./CustomerListItem', () => ({ CustomerListItem: () => <div>Customer row</div> }))
vi.mock('./CustomerProfileDrawer', () => ({ CustomerProfileDrawer: () => <div>Customer drawer</div> }))
vi.mock('./CustomerVoucherDialogContainer', () => ({ CustomerVoucherDialogContainer: () => <div>Voucher dialog</div> }))
vi.mock('./ReviewPromoSettings', () => ({ ReviewPromoSettings: () => <button type="button">Review &amp; promo</button> }))
vi.mock('./StaffReviewHistory', () => ({ StaffReviewHistory: () => <div>Submitted customer reviews</div> }))
vi.mock('../ui/confirm-action-dialog', () => ({ ConfirmActionDialog: () => null }))

import { CustomersTabContent } from './CustomersTabContent'

const viewModel = {
  searchQuery: '',
  onSearchQueryChange: vi.fn(),
  segmentFilter: 'all',
  sortOption: 'recent',
  displayed: [],
  overview: { totalCustomers: 5, vipCount: 1, totalLifetimeRevenue: 3_034_000 },
  formatter: new Intl.NumberFormat('id-ID'),
  avgOrdersPerCustomerLabel: '1.2',
  selectedEnriched: null,
  selectedCustomerOrders: [],
  voucherDialogOpen: false,
  promoCustomerId: null,
  canEditCustomerWorkspace: true,
  onSegmentFilterChange: vi.fn(),
  onSortOptionChange: vi.fn(),
  onOpenProfile: vi.fn(),
  onCloseProfile: vi.fn(),
  onOpenVoucherDialog: vi.fn(),
  onCloseVoucherDialog: vi.fn(),
  pendingRemoveCustomer: null,
  removeCustomerBlockedReason: null,
  canRemoveCustomer: false,
  onAssignPromo: vi.fn(),
  onRequestRemoveCustomer: vi.fn(),
  onCancelRemoveCustomer: vi.fn(),
  onConfirmRemoveCustomer: vi.fn(),
} as unknown as CustomersTabContentViewModel

describe('Customers workspace tabs', () => {
  it('keeps customer management and review management in dedicated sub-tabs', async () => {
    const user = userEvent.setup()
    render(<CustomersTabContent {...viewModel} />)

    expect(screen.getByRole('button', { name: 'Manage vouchers' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review & promo' })).not.toBeInTheDocument()
    expect(screen.queryByText('Submitted customer reviews')).not.toBeInTheDocument()
    expect(screen.getByText('Segment settings')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Customer Review' }))

    expect(screen.getByText('Submitted customer reviews')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review & promo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manage vouchers' })).not.toBeInTheDocument()
    expect(screen.queryByText('Segment settings')).not.toBeInTheDocument()
  })
})
