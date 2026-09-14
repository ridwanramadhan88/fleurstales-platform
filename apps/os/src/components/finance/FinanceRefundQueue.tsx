import { useEffect, useMemo, useState, type FC } from 'react'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { useUserStore } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useOrderRuntimeStore } from '../../store/orderRuntimeStore'
import { useSettingsStore } from '../../store/settingsStore'
import { hasActionPermission } from '../../config/actionPermissions'
import { toast } from '../../hooks/use-toast'
import { isSharedBackendConfigured } from '../../api/remoteSession'
import { completeOrderRefundWithAccount } from '../../data/orderRefundCompletion'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { FinanceModuleHeader } from './FinanceModuleHeader'
import { settingsTabButtonClass, settingsTabTrackClass } from '../settings/SettingsPrimitives'
import { consumeFinanceWorkspaceFocus, subscribeFinanceWorkspaceFocus } from './financeWorkspaceNavigation'

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
  const [initialFocus] = useState(() => consumeFinanceWorkspaceFocus('refunds'))
  const [activeTab, setActiveTab] = useState<RefundQueueTab>(initialFocus?.view === 'pending' ? 'pending' : 'pending')
  const [pendingAction, setPendingAction] = useState<{ type: 'complete' | 'cancel'; orderNumber: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [refundAccountId, setRefundAccountId] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const addActivity = useOrderRuntimeStore((state) => state.addActivity)
  const employeeId = useUserStore((state) => state.employeeId)
  const branchId = useUserStore((state) => state.branchId)
  const permissions = useSettingsStore((state) => state.permissions)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const bankAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const canViewRefunds = hasActionPermission(actorRole, 'finance.view_refunds', actionPermissions, permissions)
  const canManageRefunds = hasActionPermission(actorRole, 'finance.approve_refund', actionPermissions, permissions)

  useEffect(() => subscribeFinanceWorkspaceFocus('refunds', () => {
    setActiveTab('pending')
  }), [])

  const activeBankAccounts = useMemo(
    () => bankAccounts
      .filter((account) => account.isActive !== false)
      .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [bankAccounts],
  )
  const defaultBankAccountId = activeBankAccounts[0]?.id ?? ''

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

  const beginCompleteRefund = (order: OrderTableRow) => {
    setActionError(null)
    setRefundAccountId(order.paymentMethod === 'cash' ? 'cash:main' : defaultBankAccountId)
    setPendingAction({ type: 'complete', orderNumber: order.orderNumber })
  }

  const completeRefund = async () => {
    if (!canManageRefunds || !pendingAction || pendingAction.type !== 'complete' || !confirmOrder || actionBusy) return
    if (!refundAccountId) {
      setActionError('Select the account that paid the refund.')
      return
    }

    setActionBusy(true)
    setActionError(null)
    try {
      if (isSharedBackendConfigured()) {
        if (!confirmOrder.id) throw new Error('Order id is missing.')
        await completeOrderRefundWithAccount({
          orderId: confirmOrder.id,
          expectedRevision: confirmOrder.revision ?? 1,
          financeAccountId: refundAccountId,
        })
      } else {
        const result = useOrdersStore.getState().completeRefund({
          orderNumber: pendingAction.orderNumber,
          expectedRevision: confirmOrder.revision ?? 1,
          actor: { employeeId, name: actorName, role: actorRole, branchId },
        })
        if (!result.allowed) throw new Error(result.reason)
      }

      addActivity(pendingAction.orderNumber, {
        kind: 'system',
        description: `Refund completed by ${actorName}`,
        actor: actorName,
      })
      toast({
        title: 'Refund completed',
        description: `${pendingAction.orderNumber} was refunded from the selected account.`,
      })
      setPendingAction(null)
      setRefundAccountId('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Refund could not be completed.')
    } finally {
      setActionBusy(false)
    }
  }

  const cancelRefund = () => {
    if (!canManageRefunds || !pendingAction || pendingAction.type !== 'cancel' || actionBusy) return
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
    <>
      <FinanceModuleHeader
        title="Refund queue"
        description="Track initiated refunds and confirm when funds have been returned."
      />
      <section aria-label="Finance refund queue" className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/60">
      <span className="sr-only">{pendingOrders.length} pending</span>

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
                  {pending && canManageRefunds && (
                    <div className="mt-4 flex min-w-[9.5rem] flex-col items-stretch gap-2 sm:mt-0">
                      <button type="button" onClick={() => beginCompleteRefund(order)} className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm hover:bg-foreground/90">Complete Refund</button>
                      <details className="relative"><summary className="flex h-9 cursor-pointer list-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3.5 text-xs font-semibold text-muted-foreground">More actions</summary><div className="absolute right-0 z-20 mt-1 w-40 rounded-xl bg-surface-popover p-2 shadow-lg ring-1 ring-border"><button type="button" onClick={() => { setActionError(null); setCancelReason(''); setPendingAction({ type: 'cancel', orderNumber: order.orderNumber }) }} className="flex h-11 w-full items-center justify-center rounded-full px-[18px] text-sm font-semibold text-destructive hover:bg-destructive/10">Cancel Refund</button></div></details>
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
          if (!nextOpen && !actionBusy) {
            setPendingAction(null)
            setCancelReason('')
            setRefundAccountId('')
            setActionError(null)
          }
        }}
        title={pendingAction?.type === 'cancel' ? 'Cancel this Refund?' : 'Confirm funds returned?'}
        description={
          pendingAction
            ? pendingAction.type === 'cancel'
              ? `This stops the pending Refund for ${pendingAction.orderNumber} and returns the payment status to Paid. No money moves.`
              : `This records ${formatIdr(confirmOrder?.refundAmountIdr ?? 0)} for ${pendingAction.orderNumber} as returned and removes it from the selected account.`
            : ''
        }
        confirmLabel={actionBusy ? 'Saving…' : pendingAction?.type === 'cancel' ? 'Cancel Refund' : 'Complete Refund'}
        destructive={pendingAction?.type === 'cancel'}
        onConfirm={pendingAction?.type === 'cancel' ? cancelRefund : () => { void completeRefund() }}
      >
        {pendingAction?.type === 'complete' && (
          <label className="block space-y-1.5 text-xs font-medium">
            Paid from account
            <select value={refundAccountId} onChange={(event) => { setRefundAccountId(event.target.value); setActionError(null) }} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm">
              <option value="">Select account</option>
              <option value="cash:main">Cash</option>
              {activeBankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bankName} · {account.accountNumber}</option>)}
            </select>
          </label>
        )}
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
    </>
  )
}