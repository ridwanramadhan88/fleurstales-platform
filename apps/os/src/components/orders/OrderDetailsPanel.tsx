/**
 * @file OrderDetailsPanel.tsx
 * @description Order details drawer shell for a single order.
 */
import { useEffect, useMemo, useState, type FC } from 'react'
import { MessageCircle } from 'lucide-react'
import { OrderActivityTimeline } from './OrderActivityTimeline'
import { OrderDetailsActionsSection } from './OrderDetailsActionsSection'
import { OrderDetailsContextTab } from './OrderDetailsContextTab'
import { OrderDetailsDeliverySection } from './OrderDetailsDeliverySection'
import { OrderDetailsFinanceSection } from './OrderDetailsFinanceSection'
import { OrderDetailsHeader } from './OrderDetailsHeader'
import { OrderDetailsItemsSection } from './OrderDetailsItemsSection'
import { OrderDetailsMetaSection } from './OrderDetailsMetaSection'
import { OrderDetailsNotesSection } from './OrderDetailsNotesSection'
import { OrderStatusStepper } from './OrderStatusStepper'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import {
  getOrderDetailContextLabel,
  getOrderDetailContextTab,
  shouldShowAdminLifecycle,
  type OrderDetailContextTab,
} from './orderDetailsContext'
import { AppSheet } from '../ui/app-sheet'
import { AssignFloristDialog } from './AssignFloristDialog'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { StaffReviewHistory } from '../customers/StaffReviewHistory'

type OrderDetailTab = OrderDetailContextTab | 'details' | 'activity'

export const OrderDetailsPanel: FC<OrderDetailsViewModel> = (viewModel) => {
  const {
    order,
    onClose,
    activities,
    isOrderFuture,
    currentUserRole,
    canVerifyThisOrder,
    canCompleteRefund,
    canCancelRefund,
    isEditing,
    showFloristAssignment,
    floristDialogMode,
    onCancelFloristAssignment,
    onFloristAssigned,
    onOpenReviewRequest,
  } = viewModel

  const financeActionable = canVerifyThisOrder || canCompleteRefund || canCancelRefund
  const contextTab = useMemo(
    () => getOrderDetailContextTab({ order, role: currentUserRole, financeActionable }),
    [order.status, currentUserRole, financeActionable],
  )
  const defaultTab: OrderDetailTab = contextTab ?? 'details'
  const [tab, setTab] = useState<OrderDetailTab>(defaultTab)
  const showLifecycle = shouldShowAdminLifecycle(currentUserRole, order.status)
  const isFinished = order.status === 'delivered' || order.status === 'picked_up'

  // Each order opens on the role-relevant work tab. When the current work is
  // completed (for example Delivered or Finance reconciled), fall back to Details.
  useEffect(() => { setTab(defaultTab) }, [order.orderNumber, defaultTab])
  useEffect(() => { if (isEditing) setTab('details') }, [isEditing])

  const tabs = useMemo<Array<[OrderDetailTab, string]>>(() => {
    const items: Array<[OrderDetailTab, string]> = []
    if (contextTab) items.push([contextTab, getOrderDetailContextLabel(contextTab)])
    items.push(['details', 'Details'], ['activity', 'Activity'])
    return items
  }, [contextTab])

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

        {/* Keep the lifecycle indicator only for Admin while the order is actively
            moving through the operational pipeline. Activity owns the history. */}
        {showLifecycle && (
          <div className="mb-2">
            <OrderStatusStepper
              fulfillment={order.fulfillment}
              isOrderFuture={isOrderFuture}
              status={order.status}
            />
          </div>
        )}

        <div className="mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-px pb-10 pt-1 text-sm text-foreground/90">
          <div role="tablist" aria-label="Order sections" className="no-scrollbar flex gap-6 overflow-x-auto border-b border-border/60">
            {tabs.map(([id, label]) => (
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

          <div role="tabpanel" className="space-y-6 pt-5">
            {contextTab && tab === contextTab && (
              <OrderDetailsContextTab viewModel={viewModel} context={contextTab} />
            )}

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
                      Customer & fulfillment
                      <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Show</span>
                      <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Hide</span>
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-border/60 p-4">
                    <OrderDetailsDeliverySection viewModel={viewModel} />
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
                  <div className="space-y-4 border-t border-border/60 p-4">
                    <OrderDetailsNotesSection viewModel={viewModel} />
                  </div>
                </details>

                {contextTab !== 'finance' && ['finance', 'owner', 'admin'].includes(currentUserRole) && (
                  <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                    <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden">
                      <span className="flex items-center justify-between gap-3">
                        Finance
                        <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Show</span>
                        <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Hide</span>
                      </span>
                    </summary>
                    <div className="border-t border-border/60 p-4">
                      <OrderDetailsFinanceSection viewModel={viewModel} mode="content" />
                    </div>
                  </details>
                )}

                {isFinished && order.id && (
                  <details open className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
                    <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden">
                      <span className="flex items-center justify-between gap-3">
                        Customer review
                        <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Show</span>
                        <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Hide</span>
                      </span>
                    </summary>
                    <div className="space-y-4 border-t border-border/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">Request or resend the completed-order review link.</p>
                        <button
                          type="button"
                          onClick={onOpenReviewRequest}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-success px-4 text-xs font-semibold text-white shadow-ios-sm transition hover:brightness-95"
                        >
                          <MessageCircle className="size-3.5" />
                          Send review request
                        </button>
                      </div>
                      <StaffReviewHistory
                        orderId={order.id}
                        title="Customer review"
                        emptyLabel="No review submitted for this order."
                      />
                    </div>
                  </details>
                )}

                {isFinished && !order.id && (
                  <section className="rounded-2xl bg-surface-card p-4 text-xs text-muted-foreground ring-1 ring-border/60">
                    Review history is unavailable for this legacy order.
                  </section>
                )}
              </>
            )}

            {tab === 'activity' && (
              <OrderActivityTimeline
                order={order}
                fulfillment={order.fulfillment}
                isOrderFuture={isOrderFuture}
                activities={activities}
              />
            )}
          </div>
        </div>

        <OrderDetailsActionsSection viewModel={viewModel} />
      </AppSheet>

      {/* Modal state must stay mounted regardless of the selected content tab. */}
      <OrderDetailsFinanceSection viewModel={viewModel} mode="dialogs" />

      {showFloristAssignment && (
        <AssignFloristDialog
          order={order}
          mode={floristDialogMode ?? 'assign-and-process'}
          onCancel={onCancelFloristAssignment}
          onAssigned={onFloristAssigned}
        />
      )}

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
