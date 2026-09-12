/**
 * @file OrderDetailsPanel.tsx
 * @description Order details drawer shell for a single order.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import { MessageCircle } from 'lucide-react'
import { useUiLanguage } from '../../i18n/uiLanguage'
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
import { OrderActionSuccessOverlay, type OrderActionSuccessKind } from './OrderActionSuccessOverlay'
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
import type { OrderTableRow } from '../../types/orders'

type OrderDetailTab = OrderDetailContextTab | 'details' | 'activity'

type SuccessTransition = {
  kind: OrderActionSuccessKind
  subtitle?: string
}

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
    actionModal,
  } = viewModel
  const language = useUiLanguage((state) => state.language)

  const financeActionable = canVerifyThisOrder || canCompleteRefund || canCancelRefund
  const contextTab = useMemo(
    () => getOrderDetailContextTab({ order, role: currentUserRole, financeActionable }),
    [order.status, currentUserRole, financeActionable],
  )
  const defaultTab: OrderDetailTab = contextTab ?? 'details'
  const [tab, setTab] = useState<OrderDetailTab>(defaultTab)
  const [successTransition, setSuccessTransition] = useState<SuccessTransition | null>(null)
  const [sheetOpen, setSheetOpen] = useState(true)
  const previousStatusRef = useRef(order.status)
  const showLifecycle = shouldShowAdminLifecycle(currentUserRole, order.status)
  const isFinished = order.status === 'delivered' || order.status === 'picked_up'

  const requestClose = useCallback(() => {
    setSheetOpen(false)
  }, [])

  useEffect(() => {
    if (sheetOpen) return undefined
    const timeout = window.setTimeout(() => onClose(), 320)
    return () => window.clearTimeout(timeout)
  }, [onClose, sheetOpen])

  const panelViewModel = useMemo<OrderDetailsViewModel>(
    () => ({ ...viewModel, onClose: requestClose }),
    [requestClose, viewModel],
  )

  // Each order opens on the role-relevant work tab. When the current work is
  // completed (for example Delivered or Finance reconciled), fall back to Details.
  useEffect(() => { setTab(defaultTab) }, [order.orderNumber, defaultTab])
  useEffect(() => { if (isEditing) setTab('details') }, [isEditing])

  // A terminal transition is only celebrated when the order actually changed
  // into its finished state. Reopening the review action later does not replay it.
  useEffect(() => {
    const previousStatus = previousStatusRef.current
    previousStatusRef.current = order.status
    const wasFinished = previousStatus === 'delivered' || previousStatus === 'picked_up'
    if (!wasFinished && isFinished && actionModal === 'review') {
      setSuccessTransition({
        kind: 'completed',
        subtitle: order.status === 'picked_up' ? 'Sudah diambil' : 'Terkirim',
      })
    }
  }, [actionModal, isFinished, order.status])

  const handleFloristAssigned = useCallback((assignedOrder: OrderTableRow) => {
    const startedProduction = floristDialogMode === 'assign-and-process'
    onFloristAssigned(assignedOrder)
    if (startedProduction) {
      setSuccessTransition({
        kind: 'processing',
        subtitle: assignedOrder.florist ? `Ditugaskan ke ${assignedOrder.florist}` : undefined,
      })
    }
  }, [floristDialogMode, onFloristAssigned])

  const handleSuccessComplete = useCallback(() => {
    const kind = successTransition?.kind
    setSuccessTransition(null)
    if (kind === 'processing') requestClose()
  }, [requestClose, successTransition?.kind])

  const tabs = useMemo<Array<[OrderDetailTab, string]>>(() => {
    const items: Array<[OrderDetailTab, string]> = []
    if (contextTab) items.push([contextTab, getOrderDetailContextLabel(contextTab, language)])
    items.push(['details', 'Details'], ['activity', 'Activity'])
    return items
  }, [contextTab, language])

  const lifecycle = showLifecycle ? (
    <OrderStatusStepper
      fulfillment={order.fulfillment}
      isOrderFuture={isOrderFuture}
      status={order.status}
    />
  ) : undefined

  return (
    <>
      <AppSheet
        open={sheetOpen}
        onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}
        title={<span className="sr-only">Order {order.orderNumber} details</span>}
        side="bottom"
        size="standard"
        hideCloseButton
        headerClassName="sr-only"
        contentClassName="gap-0 overflow-hidden rounded-t-2xl bg-card px-5 pb-4 pt-5 shadow-ios-lg ring-1 ring-border/60 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none sm:right-auto sm:h-[92vh] sm:max-h-[92vh] sm:px-6 sm:pb-5 sm:pt-5 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 md:max-w-3xl lg:h-[90vh] lg:max-h-[90vh] lg:max-w-5xl"
      >
        <OrderDetailsHeader viewModel={panelViewModel} progress={lifecycle} />

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-10 px-px pt-0 text-sm text-foreground/90">
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

          <div role="tabpanel" className="space-y-8 pb-2 pt-5">
            {contextTab && tab === contextTab && (
              <OrderDetailsContextTab viewModel={panelViewModel} context={contextTab} />
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
                    <div className="[&_.size-16]:!size-20">
                      <OrderDetailsItemsSection viewModel={panelViewModel} />
                    </div>
                    <OrderDetailsMetaSection viewModel={panelViewModel} />
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
                    <OrderDetailsDeliverySection viewModel={panelViewModel} />
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
                    <OrderDetailsNotesSection viewModel={panelViewModel} />
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
                      <OrderDetailsFinanceSection viewModel={panelViewModel} mode="content" />
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

        <OrderDetailsActionsSection viewModel={panelViewModel} />
      </AppSheet>

      {/* Modal state must stay mounted regardless of the selected content tab. */}
      <OrderDetailsFinanceSection viewModel={panelViewModel} mode="dialogs" />

      {showFloristAssignment && (
        <AssignFloristDialog
          order={order}
          mode={floristDialogMode ?? 'assign-and-process'}
          onCancel={onCancelFloristAssignment}
          onAssigned={handleFloristAssigned}
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

      {successTransition && (
        <OrderActionSuccessOverlay
          kind={successTransition.kind}
          subtitle={successTransition.subtitle}
          onComplete={handleSuccessComplete}
        />
      )}
    </>
  )
}
