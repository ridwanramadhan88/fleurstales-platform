/**
 * @file OrderDetailsPanel.tsx
 * @description Order details drawer shell for a single order.
 */
import { useEffect, useState, type FC } from 'react'
import { OrderActivityTimeline } from './OrderActivityTimeline'
import { OrderDetailsActionsSection } from './OrderDetailsActionsSection'
import { OrderDetailsDeliverySection } from './OrderDetailsDeliverySection'
import { OrderDetailsFinanceSection } from './OrderDetailsFinanceSection'
import { OrderDetailsHeader } from './OrderDetailsHeader'
import { OrderDetailsCurrentFocus } from './OrderDetailsCurrentFocus'
import { OrderDetailsItemsSection } from './OrderDetailsItemsSection'
import { OrderDetailsMetaSection } from './OrderDetailsMetaSection'
import { OrderDetailsNotesSection } from './OrderDetailsNotesSection'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { AppSheet } from '../ui/app-sheet'
import { AssignFloristDialog } from './AssignFloristDialog'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
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
            ['customer', 'Customer & fulfillment'],
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
              <details open className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    Order details
                    <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Show</span>
                    <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Hide</span>
                  </span>
                </summary>
                <div className="space-y-5 border-t border-border/60 p-4">
                  <OrderDetailsItemsSection viewModel={viewModel} />
                  <OrderDetailsMetaSection viewModel={viewModel} />
                </div>
              </details>

              <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    Notes & greeting card
                    <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Show</span>
                    <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Hide</span>
                  </span>
                </summary>
                <div className="border-t border-border/60 p-4">
                  <OrderDetailsNotesSection viewModel={viewModel} />
                </div>
              </details>

              {order.id ? (
                <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                  <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      Customer review
                      <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Show</span>
                      <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Hide</span>
                    </span>
                  </summary>
                  <div className="border-t border-border/60 p-4">
                    <StaffReviewHistory
                      orderId={order.id}
                      title="Customer review"
                      emptyLabel="No review submitted for this order."
                    />
                  </div>
                </details>
              ) : (
                <section className="rounded-2xl bg-surface-card p-4 text-xs text-muted-foreground ring-1 ring-border/60">
                  Review history is unavailable for this legacy order.
                </section>
              )}
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
    <ConfirmActionDialog
      open={viewModel.cancelConfirmOpen}
      onOpenChange={viewModel.onCancelConfirmChange}
      title="Cancel this order?"
      description={`Cancel order for ${order.customerName}? This can be undone from the toast immediately after.`}
      confirmLabel="Cancel order"
      destructive
      onConfirm={viewModel.confirmCancelOrder}
    />
    </>
  )
}
