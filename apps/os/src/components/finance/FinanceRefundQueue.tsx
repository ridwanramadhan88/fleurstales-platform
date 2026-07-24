import { useMemo, useState, type FC } from 'react'
import { ExternalLink, RotateCcw, ShieldCheck } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { useUserStore } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useOrderRuntimeStore } from '../../store/orderRuntimeStore'
import { toast } from '../../hooks/use-toast'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { settingsTabButtonClass, settingsTabTrackClass } from '../settings/SettingsPrimitives'

type RefundQueueTab = 'pending' | 'completed' | 'all'

interface FinanceRefundQueueProps {
  orders: OrderTableRow[]
  actorName: string
  actorRole: UserRole
  onOpenOrder: (orderNumber: string) => void
}

const formatIdr = (value: number): string => `Rp ${value.toLocaleString('id-ID')}`

const formatTimestamp = (value?: string): string => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

export const FinanceRefundQueue: FC<FinanceRefundQueueProps> = ({
  orders,
  actorName,
  actorRole,
  onOpenOrder,
}) => {
  const [activeTab, setActiveTab] = useState<RefundQueueTab>('pending')
  const [pendingAction, setPendingAction] = useState<{ type: 'complete' | 'cancel'; orderNumber: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const addActivity = useOrderRuntimeStore((state) => state.addActivity)
  const employeeId = useUserStore((state) => state.employeeId)
  const branchId = useUserStore((state) => state.branchId)
  const canViewRefunds = actorRole === 'finance' || actorRole === 'owner'
  const canCompleteRefund = actorRole === 'finance'
  const canCancelRefund = actorRole === 'finance' || actorRole === 'owner'

  const refundOrders = useMemo(
    () => orders.filter((order) => order.paymentStatus === 'refund_pending' || order.paymentStatus === 'refunded'),
    [orders],
  )
  const pendingOrders = refundOrders.filter((order) => order.paymentStatus === 'refund_pending')
  const completedOrders = refundOrders.filter((order) => order.paymentStatus === 'refunded')
  const visibleOrders = activeTab === 'pending'
    ? pendingOrders
    : activeTab === 'completed'
      ? completedOrders
      : refundOrders

  if (!canViewRefunds) return null

  const confirmOrder = pendingAction
    ? orders.find((order) => order.orderNumber === pendingAction.orderNumber)
    : undefined

  const completeRefund = () => {
    if (!pendingAction || pendingAction.type !== 'complete') return
    const result = useOrdersStore.getState().completeRefund({
      orderNumber: pendingAction.orderNumber,
      expectedRevision: confirmOrder?.revision ?? 1,
      actor: { employeeId, name: actorName, role: actorRole, branchId },
    })

    if (!result.allowed) {
      setActionError(result.reason)
      return
    }

    addActivity(pendingAction.orderNumber, {
      kind: 'system',
      description: `Refund completed by ${actorName}`,
      actor: actorName,
    })
    toast({
      title: 'Refund completed',
      description: `${pendingAction.orderNumber} is now recorded as refunded.`,
    })
    setPendingAction(null)
    setActionError(null)
  }

  const cancelRefund = () => {
    if (!pendingAction || pendingAction.type !== 'cancel') return
    const result = useOrdersStore.getState().cancelRefund({
      orderNumber: pendingAction.orderNumber,
      expectedRevision: confirmOrder?.revision ?? 1,
      actor: { employeeId, name: actorName, role: actorRole, branchId },
      reason: cancelReason,
    })
    if (!result.allowed) {
      setActionError(result.reason)
      return
    }
    addActivity(pendingAction.orderNumber, {
      kind: 'system',
      description: `Refund cancelled by ${actorName}: ${cancelReason.trim()}`,
      actor: actorName,
    })
    toast({ title: 'Refund cancelled', description: `${pendingAction.orderNumber} returned to Paid.` })
    setPendingAction(null)
    setCancelReason('')
    setActionError(null)
  }

  return (
    <section aria-label="Finance refund queue" className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/60">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-11 items-center justify-center rounded-full bg-warning/10 text-warning">
              <RotateCcw className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold leading-6 text-foreground">Refund queue</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Track initiated refunds and confirm when funds have been returned.
              </p>
            </div>
          </div>
        </div>

        <span className="sr-only">{pendingOrders.length} pending</span>
      </header>

      <nav aria-label="Refund queue filters" className={settingsTabTrackClass({ level: 'primary', className: 'gap-5 sm:gap-6' })}>
        {([
          ['pending', 'Pending', pendingOrders.length],
          ['completed', 'Completed', completedOrders.length],
          ['all', 'All', refundOrders.length],
        ] as Array<[RefundQueueTab, string, number]>).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-label={`${label} (${count})`}
            onClick={() => setActiveTab(id)}
            className={settingsTabButtonClass({ active: activeTab === id, level: 'primary', className: 'h-9 gap-1.5 px-0.5 text-sm' })}
          >
            {label} <span className="text-xs text-muted-foreground">· {count}</span>
          </button>
        ))}
      </nav>

      {visibleOrders.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-8 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">
            {activeTab === 'pending' ? 'No refunds awaiting completion' : 'No refunds in this view'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Refunds initiated from Order Details will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleOrders.map((order) => {
            const pending = order.paymentStatus === 'refund_pending'
            return (
              <article key={order.orderNumber} className="rounded-xl border border-border/70 bg-background/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenOrder(order.orderNumber)}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        {order.orderNumber}
                        <ExternalLink className="size-3" />
                      </button>
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${pending ? 'bg-info/10 text-info' : 'bg-success/10 text-success'}`}>
                        {pending ? 'Refund pending' : 'Refunded'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-foreground">{order.customerName}</p>
                    <dl className="mt-3 grid gap-x-5 gap-y-2 text-2xs sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="text-muted-foreground">Amount</dt><dd className="font-semibold text-foreground">{formatIdr(order.refundAmountIdr ?? 0)}</dd></div>
                      <div><dt className="text-muted-foreground">Reason</dt><dd className="line-clamp-2 font-medium text-foreground">{order.refundReason ?? '—'}</dd></div>
                      <div><dt className="text-muted-foreground">Initiated by</dt><dd className="font-medium text-foreground">{order.refundInitiatedBy ?? '—'}</dd></div>
                      <div><dt className="text-muted-foreground">Initiated at</dt><dd className="font-medium text-foreground">{formatTimestamp(order.refundInitiatedAt)}</dd></div>
                      {!pending && <div><dt className="text-muted-foreground">Completed by</dt><dd className="font-medium text-foreground">{order.refundCompletedBy ?? '—'}</dd></div>}
                      {!pending && <div><dt className="text-muted-foreground">Completed at</dt><dd className="font-medium text-foreground">{formatTimestamp(order.refundCompletedAt)}</dd></div>}
                    </dl>
                  </div>
                  {pending && (canCompleteRefund || canCancelRefund) && (
                    <div className="mt-4 flex min-w-[9.5rem] flex-col items-stretch gap-2 sm:mt-0">
                      {canCompleteRefund && <button type="button" onClick={() => { setActionError(null); setPendingAction({ type: 'complete', orderNumber: order.orderNumber }) }} className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm hover:bg-foreground/90">Complete Refund</button>}
                      {canCancelRefund && <details className="relative"><summary className="flex cursor-pointer list-none items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap">More actions</summary><div className="absolute right-0 z-20 mt-1 w-40 rounded-xl bg-surface-popover p-2 shadow-lg ring-1 ring-border"><button type="button" onClick={() => { setActionError(null); setCancelReason(''); setPendingAction({ type: 'cancel', orderNumber: order.orderNumber }) }} className="flex h-11 w-full items-center justify-center rounded-full px-[18px] text-sm font-semibold text-destructive hover:bg-destructive/10">Cancel Refund</button></div></details>}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(pendingAction)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingAction(null)
            setCancelReason('')
            setActionError(null)
          }
        }}
        title={pendingAction?.type === 'cancel' ? 'Cancel this Refund?' : 'Confirm funds returned?'}
        description={
          pendingAction
            ? pendingAction.type === 'cancel'
              ? `This stops the pending Refund for ${pendingAction.orderNumber} and returns the payment status to Paid.`
              : `This records ${formatIdr(confirmOrder?.refundAmountIdr ?? 0)} for ${pendingAction.orderNumber} as fully returned and sets the paid amount to zero.`
            : ''
        }
        confirmLabel={pendingAction?.type === 'cancel' ? 'Cancel Refund' : 'Complete Refund'}
        destructive={pendingAction?.type === 'cancel'}
        onConfirm={pendingAction?.type === 'cancel' ? cancelRefund : completeRefund}
      >
        {pendingAction?.type === 'cancel' && <label className="block space-y-1"><span className="text-xs font-medium">Reason</span><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Why is this Refund cancelled?" className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label>}
        <div className="rounded-xl bg-muted/60 p-3 text-xs">
          <p className="text-muted-foreground">Recorded reason</p>
          <p className="mt-1 font-medium text-foreground">{confirmOrder?.refundReason ?? '—'}</p>
        </div>
        {actionError && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {actionError}
          </p>
        )}
      </ConfirmActionDialog>
    </section>
  )
}
