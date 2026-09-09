/**
 * @file OrderDetailsPanel.tsx
 * @description Order details drawer shell for a single order.
 */
import { useEffect, useState, type FC } from 'react'
import { OrderActivityTimeline } from './OrderActivityTimeline'
import { OrderDetailsActionsSection } from './OrderDetailsActionsSection'
import { OrderDetailsDeliverySection } from './OrderDetailsDeliverySection'
import { OrderDetailsFinanceSection } from './OrderDetailsFinanceSection'
import { OrderDetailsCurrentFocus } from './OrderDetailsCurrentFocus'
import { OrderDetailsHeader } from './OrderDetailsHeader'
import { OrderDetailsItemsSection } from './OrderDetailsItemsSection'
import { OrderDetailsMetaSection } from './OrderDetailsMetaSection'
import { OrderDetailsNotesSection } from './OrderDetailsNotesSection'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { AppSheet } from '../ui/app-sheet'
import { AssignFloristDialog } from './AssignFloristDialog'
import { StaffReviewHistory } from '../customers/StaffReviewHistory'

export const OrderDetailsPanel: FC<OrderDetailsViewModel> = (viewModel) => {
  const { order, onClose, activities, isOrderFuture, showFloristAssignment, floristDialogMode, onCancelFloristAssignment, onFloristAssigned } = viewModel
  const [tab, setTab] = useState<'details' | 'customer' | 'activity'>('details')
  // Back to Details whenever a different order opens (tab memory would
  // otherwise leak one order's reading position into the next).
  useEffect(() => { setTab('details') }, [order.orderNumber])
  return (
    <>
    <AppSheet
      open
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}
      title={<span className="sr-only">Order {order.orderNumber} details</span>}
      side="bottom"
      size="standard"
      hideCloseButton
      headerClassName="sr-only"
      contentClassName="gap-0 overflow-hidden rounded-t-2xl bg-card px-5 pb-4 pt-5 shadow-ios-lg ring-1 ring-border/60 sm:right-auto sm:h-[92vh] sm:max-h-[92vh] sm:px-6 sm:pb-5 sm:pt-5 md:max-w-3xl lg:h-[90vh] lg:max-h-[90vh] lg:max-w-5xl"
    >
      <OrderDetailsHeader viewModel={viewModel} />
      <OrderDetailsCurrentFocus viewModel={viewModel} />
      <OrderDetailsFinanceSection viewModel={viewModel} />

      {/* px-px keeps card strokes off the scrollport clip edge (1px is
          invisible to the eye but saves the outer ring half). */}
      <div className="mt-4 min-h-0 flex-1 px-px overflow-y-auto overflow-x-hidden pb-10 pt-1 text-sm text-foreground/90">
        <div role="tablist" aria-label="Order sections" className="no-scrollbar flex gap-6 overflow-x-auto border-b border-border/60">
          {([
            ['details', 'Details'],
            ['customer', 'Customer'],
            ['activity', 'Activity'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`h-11 shrink-0 border-b-2 px-0.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${
                tab === id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="space-y-8 pt-5">
          {tab === 'details' && (
            <>
              {viewModel.isEditing ? (
                <>
                  <OrderDetailsItemsSection viewModel={viewModel} />
                  <OrderDetailsMetaSection viewModel={viewModel} />
                  <OrderDetailsNotesSection viewModel={viewModel} />
                </>
              ) : (
                <>
                  <details open className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-foreground">
                      Order & items
                      <span className="text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
                      <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
                    </summary>
                    <div className="space-y-5 border-t border-border/50 p-4">
                      <OrderDetailsItemsSection viewModel={viewModel} />
                      <OrderDetailsMetaSection viewModel={viewModel} />
                    </div>
                  </details>

                  <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-foreground">
                      Notes & greeting card
                      <span className="text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
                      <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
                    </summary>
                    <div className="space-y-5 border-t border-border/50 p-4">
                      <OrderDetailsNotesSection viewModel={viewModel} />
                    </div>
                  </details>
                </>
              )}

              <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-foreground">
                  Customer review
                  <span className="text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
                  <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
                </summary>
                <div className="border-t border-border/50 p-4">
                  {order.id ? (
                    <StaffReviewHistory
                      orderId={order.id}
                      title="Customer review"
                      emptyLabel="No review submitted for this order."
                    />
                  ) : (
                    <section className="rounded-2xl bg-surface-card p-4 text-xs text-muted-foreground ring-1 ring-border/60">
                      Review history is unavailable for this legacy order.
                    </section>
                  )}
                </div>
              </details>
            </>
          )}
          {tab === 'customer' && (
            <OrderDetailsDeliverySection viewModel={viewModel} />
          )}
          {tab === 'activity' && (
            <OrderActivityTimeline order={order} fulfillment={order.fulfillment} isOrderFuture={isOrderFuture} activities={activities} />
          )}
        </div>
      </div>
      <OrderDetailsActionsSection viewModel={viewModel} />
    </AppSheet>
    {showFloristAssignment && <AssignFloristDialog order={order} mode={floristDialogMode ?? 'assign-and-process'} onCancel={onCancelFloristAssignment} onAssigned={onFloristAssigned} />}
    </>
  )
}
