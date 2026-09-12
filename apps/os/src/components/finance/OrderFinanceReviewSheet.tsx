/**
 * @file OrderFinanceReviewSheet.tsx
 * @description Focused Finance reconciliation surface for finished orders.
 */

import { useCallback, useEffect, useState, type FC } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'
import { OrderFinanceReviewSheetHeader } from './OrderFinanceReviewSheetHeader'
import { OrderFinanceReviewSheetDetails } from './OrderFinanceReviewSheetDetails'
import { OrderFinanceReviewSheetTimeline } from './OrderFinanceReviewSheetTimeline'
import { OrderFinanceReviewSheetFooter } from './OrderFinanceReviewSheetFooter'
import { AppSheet } from '../ui/app-sheet'

export interface OrderFinanceReviewSheetProps {
  order: OrderTableRow
  onClose: () => void
  canVerify: boolean
  actorName: string
  userRole: UserRole
}

export const OrderFinanceReviewSheet: FC<OrderFinanceReviewSheetViewModel> = ({
  order,
  onClose,
  canVerify,
  productDisplay,
  itemDisplays,
  actionType,
  actionNote,
  financeReferenceDraft,
  decisionBusy,
  isOrderFuture,
  urgency,
  isPending,
  timelineRows,
  lastIndex,
  onActionNoteChange,
  onCloseAction,
  onStartAction,
  onConfirmAction,
  onVerifyOrder,
}) => {
  const [tab, setTab] = useState<'details' | 'activity'>('details')
  const [sheetOpen, setSheetOpen] = useState(true)
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false)
  const [reconcileCode, setReconcileCode] = useState(financeReferenceDraft === '-' ? '' : financeReferenceDraft)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    setTab('details')
    setSheetOpen(true)
    setReconcileDialogOpen(false)
    setReconcileCode(financeReferenceDraft === '-' ? '' : financeReferenceDraft)
    setShowSuccess(false)
  }, [order.orderNumber])

  const requestClose = useCallback(() => {
    if (decisionBusy || showSuccess) return
    setReconcileDialogOpen(false)
    setSheetOpen(false)
  }, [decisionBusy, showSuccess])

  useEffect(() => {
    if (sheetOpen) return
    const timer = window.setTimeout(onClose, 320)
    return () => window.clearTimeout(timer)
  }, [onClose, sheetOpen])

  const paidAmount = order.paidAmountIdr ?? (order.paymentStatus === 'paid' ? order.totalIdr : 0)
  const hasPaymentMismatch =
    (order.paymentStatus === 'paid' && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === 'partial' && (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === 'unpaid' && paidAmount > 0)
  const hasMissingProof = order.paymentMethod === 'transfer' && !order.paymentProofUrl

  const reconcile = async () => {
    const reconciled = await onVerifyOrder(reconcileCode)
    if (!reconciled) return
    setReconcileDialogOpen(false)
    setShowSuccess(true)
    window.setTimeout(() => {
      setShowSuccess(false)
      setSheetOpen(false)
    }, 900)
  }

  const sendCorrection = async () => {
    const sent = await onConfirmAction()
    if (sent) setSheetOpen(false)
  }

  return (
    <>
      <AppSheet
        open={sheetOpen}
        onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}
        title={<span className="sr-only">Order {order.orderNumber} finance reconciliation</span>}
        side="bottom"
        size="standard"
        hideCloseButton
        headerClassName="sr-only"
        contentClassName="gap-0 overflow-hidden rounded-t-2xl bg-card px-5 pb-4 pt-5 shadow-ios-lg ring-1 ring-border/60 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none sm:right-auto sm:h-[92vh] sm:max-h-[92vh] sm:px-6 sm:pb-5 sm:pt-5 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 md:max-w-3xl lg:h-[90vh] lg:max-h-[90vh] lg:max-w-5xl"
      >
        <OrderFinanceReviewSheetHeader
          order={order}
          onClose={requestClose}
          urgency={urgency}
        />

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-10 px-px pt-0 text-sm text-foreground/90">
          <div role="tablist" aria-label="Finance order sections" className="no-scrollbar flex gap-6 overflow-x-auto border-b border-border/60">
            {([['details', 'Detail'], ['activity', 'Aktivitas']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`h-11 shrink-0 border-b-2 px-0 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${
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
              <OrderFinanceReviewSheetDetails
                order={order}
                productDisplay={productDisplay}
                itemDisplays={itemDisplays}
              />
            )}

            {tab === 'activity' && (
              <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
                <OrderFinanceReviewSheetTimeline
                  order={order}
                  isOrderFuture={isOrderFuture}
                  timelineRows={timelineRows}
                  lastIndex={lastIndex}
                />
              </section>
            )}
          </div>
        </div>

        <OrderFinanceReviewSheetFooter
          canVerify={canVerify}
          isPending={isPending}
          actionType={actionType}
          actionNote={actionNote}
          decisionBusy={decisionBusy}
          onActionNoteChange={onActionNoteChange}
          onCloseAction={onCloseAction}
          onStartAction={onStartAction}
          onConfirmAction={() => { void sendCorrection() }}
          onVerifyOrder={() => setReconcileDialogOpen(true)}
          hasPaymentMismatch={hasPaymentMismatch}
          hasMissingProof={hasMissingProof}
          paymentFullyPaid={order.paymentStatus === 'paid'}
        />
      </AppSheet>

      <DialogPrimitive.Root open={reconcileDialogOpen} onOpenChange={(open) => { if (!decisionBusy) setReconcileDialogOpen(open) }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content
            aria-describedby="finance-reconcile-code-help"
            className="fixed inset-x-0 bottom-0 z-[71] w-full rounded-t-2xl bg-card p-5 shadow-ios-lg ring-1 ring-border/60 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95"
          >
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              Rekonsiliasi Pesanan
            </DialogPrimitive.Title>
            <p id="finance-reconcile-code-help" className="mt-1 text-xs leading-5 text-muted-foreground">
              Kode Rekonsiliasi bersifat opsional. Jika dikosongkan, Transaction Code akan disimpan sebagai “-”.
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-muted-foreground">Kode Rekonsiliasi</span>
              <input
                value={reconcileCode}
                onChange={(event) => setReconcileCode(event.target.value.toUpperCase())}
                maxLength={64}
                autoFocus
                autoComplete="off"
                placeholder="Contoh: TRX-2026-001"
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base font-medium uppercase outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 sm:text-sm"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReconcileDialogOpen(false)}
                disabled={decisionBusy}
                className="h-11 rounded-full border border-border px-[18px] text-sm font-medium disabled:opacity-40"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => { void reconcile() }}
                disabled={decisionBusy}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-success px-[18px] text-sm font-semibold text-white disabled:opacity-50"
              >
                {decisionBusy && <Loader2 className="size-4 animate-spin" />}
                {decisionBusy ? 'Menyimpan…' : 'Simpan & Rekonsiliasi'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={showSuccess}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content
            aria-describedby="finance-reconcile-success-copy"
            className="fixed left-1/2 top-1/2 z-[81] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-6 text-center shadow-ios-lg ring-1 ring-border/60 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          >
            <DialogPrimitive.Title className="sr-only">Rekonsiliasi berhasil</DialogPrimitive.Title>
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="size-7 animate-[pulse_1.2s_ease-in-out_1] motion-reduce:animate-none" />
            </span>
            <p className="mt-4 text-base font-semibold text-foreground">Rekonsiliasi berhasil</p>
            <p id="finance-reconcile-success-copy" className="mt-1 text-sm text-muted-foreground">
              Pembayaran sudah masuk ke Transaksi List.
            </p>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}

export default OrderFinanceReviewSheet
