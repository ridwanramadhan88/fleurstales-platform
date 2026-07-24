/**
 * @file OrderDetailsPanel.tsx
 * @description Order details drawer shell for a single order.
 */
import type { FC } from 'react'
import { OrderActivityTimeline } from './OrderActivityTimeline'
import { OrderDetailsActionsSection } from './OrderDetailsActionsSection'
import { OrderDetailsDeliverySection } from './OrderDetailsDeliverySection'
import { OrderDetailsFinanceSection } from './OrderDetailsFinanceSection'
import { OrderDetailsHeader } from './OrderDetailsHeader'
import { OrderDetailsItemsSection } from './OrderDetailsItemsSection'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { AppSheet } from '../ui/app-sheet'
import { AssignFloristDialog } from './AssignFloristDialog'

export const OrderDetailsPanel: FC<OrderDetailsViewModel> = (viewModel) => {
  const { order, onClose, activities, isOrderFuture, showFloristAssignment, floristDialogMode, onCancelFloristAssignment, onFloristAssigned } = viewModel
  return (
    <>
    <AppSheet
      open
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}
      title={<span className="sr-only">Order {order.orderNumber} details</span>}
      side="bottom"
      hideCloseButton
      headerClassName="sr-only"
      contentClassName="max-w-4xl gap-0 overflow-hidden rounded-t-3xl bg-card px-4 pb-3 pt-4 shadow-2xl ring-1 ring-border/70 sm:h-[92vh] sm:max-h-[92vh] sm:px-6 sm:pb-5 sm:pt-5 lg:h-[90vh] lg:max-h-[90vh]"
    >
      <OrderDetailsHeader viewModel={viewModel} />
      <OrderDetailsFinanceSection viewModel={viewModel} />

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6 pt-1 text-sm text-foreground/90">
        <div className="space-y-7 sm:grid sm:grid-cols-5 sm:items-start sm:gap-7 sm:space-y-0">
          <div className="space-y-6 sm:col-span-3">
            <div className="space-y-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Order summary</p>
              <OrderDetailsItemsSection viewModel={viewModel} />
            </div>
            <div className="space-y-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Customer &amp; delivery</p>
              <OrderDetailsDeliverySection viewModel={viewModel} />
            </div>
          </div>

          <div className="space-y-3 sm:col-span-2">
            <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Activity</p>
            <OrderActivityTimeline order={order} fulfillment={order.fulfillment} isOrderFuture={isOrderFuture} activities={activities} />
          </div>
        </div>
      </div>
      <OrderDetailsActionsSection viewModel={viewModel} />
    </AppSheet>
    {showFloristAssignment && <AssignFloristDialog order={order} mode={floristDialogMode ?? 'assign-and-process'} onCancel={onCancelFloristAssignment} onAssigned={onFloristAssigned} />}
    </>
  )
}
