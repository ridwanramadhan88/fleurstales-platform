/**
 * @file CustomersTabContent.tsx
 * @description CRM Customers tab:
 * - Uses customerStore for base profiles (name, WhatsApp, email, birthday, branch).
 * - Joins with Orders data from ordersStore via customerDomain to compute:
 *   - Lifetime spend
 *   - Order count and recency
 *   - Average order value
 *   - Most used branch
 *   - Segment (New / Regular / VIP)
 * - Search (name / WhatsApp / email) is owned by the main top bar; segment
 *   filters and sort options remain here in CustomerFiltersBar.
 * - Shows per-customer CRM cards and a full profile drawer with order history.
 *
 * Data flow: customerStore + ordersStore (data) → customerDomain (logic) → UI.
 */

import type { FC } from 'react'
import { Ticket } from 'lucide-react'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { CustomerFiltersBar } from './CustomerFiltersBar'
import { CustomerListItem } from './CustomerListItem'
import { CustomerProfileDrawer } from './CustomerProfileDrawer'
import { CustomerVoucherDialogContainer } from './CustomerVoucherDialogContainer'
import { CustomerSegmentRulesSettingsContainer } from './CustomerSegmentRulesSettingsContainer'
import type { CustomersTabContentViewModel } from './CustomersTabContentController'

/**
 * @description Props for the CustomersTabContent component.
 */
export interface CustomersTabContentProps {
  /** Search query owned by the main top bar (name / WhatsApp / email). */
  searchQuery: string
  /** Handler fired when the search query should change (desktop filter bar). */
  onSearchQueryChange: (value: string) => void
}

/**
 * @description Customers CRM tab content.
 */
export const CustomersTabContent: FC<CustomersTabContentViewModel> = ({
  searchQuery,
  onSearchQueryChange,
  segmentFilter,
  sortOption,
  displayed,
  overview,
  formatter,
  avgOrdersPerCustomerLabel,
  selectedEnriched,
  selectedCustomerOrders,
  voucherDialogOpen,
  promoCustomerId,
  onSegmentFilterChange,
  onSortOptionChange,
  onOpenProfile,
  onCloseProfile,
  onOpenVoucherDialog,
  onCloseVoucherDialog,
  pendingRemoveCustomer,
  removeCustomerBlockedReason,
  canRemoveCustomer,
  onAssignPromo,
  onRequestRemoveCustomer,
  onCancelRemoveCustomer,
  onConfirmRemoveCustomer,
}) => {
  return (
    <section className="space-y-4">
      {/* Top CRM summary */}
      <section
        aria-label="Customer CRM overview"
        className="space-y-3"
      >
        <header className="space-y-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
              Customers
            </h1>
          </div>
          <button
            type="button"
            onClick={onOpenVoucherDialog}
            className="tap-scale inline-flex w-full shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-ios-sm hover:bg-primary/90 sm:w-auto rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
          >
            <Ticket className="size-4" />
            Manage vouchers
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <div className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-border/70 sm:p-4">
            <p className="text-xs font-medium text-muted-foreground">Total customers</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{overview.totalCustomers}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-border/70 sm:p-4">
            <p className="text-xs font-medium text-muted-foreground">VIP customers</p>
            <p className="mt-1 text-xl font-semibold text-warning">{overview.vipCount}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-border/70 sm:p-4">
            <p className="text-xs font-medium text-muted-foreground">Lifetime revenue</p>
            <p className="mt-1 break-words text-xl font-semibold text-foreground">Rp {formatter.format(overview.totalLifetimeRevenue)}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-border/70 sm:p-4">
            <p className="text-xs font-medium text-muted-foreground">Avg orders / customer</p>
            <p className="mt-1 text-xl font-semibold text-info">{avgOrdersPerCustomerLabel}</p>
          </div>
        </div>
      </section>

      {/* VIP rule settings */}
      <CustomerSegmentRulesSettingsContainer />

      {/* Filters */}
      <CustomerFiltersBar
        segmentFilter={segmentFilter}
        onSegmentFilterChange={onSegmentFilterChange}
        sortOption={sortOption}
        onSortOptionChange={onSortOptionChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />

      {/* Customer list */}
      <section aria-label="Customer list" className="space-y-3">
        {displayed.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl bg-card px-6 py-8 text-center ring-1 ring-border">
            <p className="text-sm font-semibold leading-5 text-foreground">No customers found</p>
            <p className="text-xs text-muted-foreground">Try adjusting the search or segment filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((item) => (
              <CustomerListItem
                key={item.profile.id}
                customer={item.profile}
                metrics={item.metrics}
                onOpenProfile={() => onOpenProfile(item.profile.id)}
                onAssignPromo={() => onAssignPromo(item.profile.id)}
                onRemove={canRemoveCustomer ? () => onRequestRemoveCustomer(item.profile.id) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {selectedEnriched && (
        <CustomerProfileDrawer
          customer={selectedEnriched.profile}
          metrics={selectedEnriched.metrics}
          orders={selectedCustomerOrders}
          onClose={onCloseProfile}
          onAssignPromo={() => onAssignPromo(selectedEnriched.profile.id)}
        />
      )}


      <ConfirmActionDialog
        open={Boolean(pendingRemoveCustomer)}
        onOpenChange={(open) => { if (!open) onCancelRemoveCustomer() }}
        title="Remove customer?"
        description={pendingRemoveCustomer ? `${pendingRemoveCustomer.profile.name} · WhatsApp ${pendingRemoveCustomer.profile.whatsappNumber} · ${pendingRemoveCustomer.metrics.orderCount} historical orders. Existing orders and customer snapshots will remain unchanged.` : ''}
        confirmLabel="Remove customer"
        destructive
        onConfirm={onConfirmRemoveCustomer}
        disabled={Boolean(removeCustomerBlockedReason)}
      >
        {removeCustomerBlockedReason && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning ring-1 ring-warning/25">{removeCustomerBlockedReason}</p>}
      </ConfirmActionDialog>

      <CustomerVoucherDialogContainer
        open={voucherDialogOpen}
        onClose={onCloseVoucherDialog}
        initialCustomerId={promoCustomerId}
      />
    </section>
  )
}

export default CustomersTabContent
