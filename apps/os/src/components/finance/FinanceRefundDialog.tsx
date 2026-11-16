/**
 * @file FinanceRefundDialog.tsx
 * @description Finish or cancel one pending refund. "Complete" records the
 * money leaving the chosen account; "cancel" stops the refund and returns the
 * order to Paid without moving money.
 */

import { useEffect, useState, type FC } from 'react'
import type { OrderTableRow } from '../../types/orders'
import { useUserStore } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useOrderRuntimeStore } from '../../store/orderRuntimeStore'
import { toast } from '../../hooks/use-toast'
import { completeOrderRefundWithAccount } from '../../data/orderRefundCompletion'
import { isServerAuthoritative } from '../../data/serverAuthority'
import { formatIdrCurrency } from '../../lib/formatters'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { CASH_ACCOUNT_ID, useFinanceAccounts } from './useFinanceAccounts'

export type FinanceRefundAction = { type: 'complete' | 'cancel'; order: OrderTableRow }

export const FinanceRefundDialog: FC<{
  action: FinanceRefundAction | null
  onClose: () => void
  /** Lets "complete" switch to "cancel" — the rare path lives inside the dialog. */
  onChangeAction?: (action: FinanceRefundAction) => void
}> = ({ action, onClose, onChangeAction }) => {
  const tr = useBilingualCopy()
  const actorName = useUserStore((state) => state.name)
  const actorRole = useUserStore((state) => state.role)
  const employeeId = useUserStore((state) => state.employeeId)
  const branchId = useUserStore((state) => state.branchId)
  const addActivity = useOrderRuntimeStore((state) => state.addActivity)
  const { options, bankAccounts } = useFinanceAccounts()
  const [accountId, setAccountId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!action) return
    setAccountId(action.order.paymentMethod === 'cash' ? CASH_ACCOUNT_ID : bankAccounts[0]?.id ?? '')
    setReason('')
    setError(null)
    // Reset when a different refund opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.type, action?.order.orderNumber])

  const order = action?.order
  const actor = { employeeId, name: actorName, role: actorRole, branchId }

  const complete = async () => {
    if (!order || busy) return
    if (!accountId) {
      setError(tr('Select the account that paid the refund.', 'Pilih rekening yang membayar pengembalian dana.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Production completes refunds server-side; the offline prototype uses the local store.
      if (isServerAuthoritative()) {
        if (!order.id) throw new Error('Order id is missing.')
        await completeOrderRefundWithAccount({ orderId: order.id, expectedRevision: order.revision ?? 1, financeAccountId: accountId })
      } else {
        const result = useOrdersStore.getState().completeRefund({ orderNumber: order.orderNumber, expectedRevision: order.revision ?? 1, actor })
        if (!result.allowed) throw new Error(result.reason)
      }
      addActivity(order.orderNumber, { kind: 'system', description: `Refund completed by ${actorName}`, actor: actorName })
      toast({ title: tr('Refund completed', 'Dana sudah dikembalikan'), description: order.orderNumber })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('The refund was not completed.', 'Pengembalian dana gagal diselesaikan.'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    if (!order || busy) return
    const result = useOrdersStore.getState().cancelRefund({ orderNumber: order.orderNumber, expectedRevision: order.revision ?? 1, actor, reason })
    if (!result.allowed) {
      setError(result.reason ?? tr('The refund was not cancelled.', 'Pengembalian dana gagal dibatalkan.'))
      return
    }
    addActivity(order.orderNumber, { kind: 'system', description: `Refund cancelled by ${actorName}: ${reason.trim()}`, actor: actorName })
    toast({ title: tr('Refund cancelled', 'Pengembalian dana dibatalkan'), description: order.orderNumber })
    onClose()
  }

  const isCancel = action?.type === 'cancel'

  return (
    <ConfirmActionDialog
      open={Boolean(action)}
      onOpenChange={(open) => { if (!open && !busy) onClose() }}
      title={isCancel ? tr('Cancel this refund?', 'Batalkan pengembalian dana ini?') : tr('Money returned to the customer?', 'Uang sudah dikembalikan?')}
      description={order
        ? isCancel
          ? tr(`${order.orderNumber} goes back to Paid. No money moves.`, `${order.orderNumber} kembali ke Lunas. Tidak ada uang yang bergerak.`)
          : tr(`${formatIdrCurrency(order.refundAmountIdr ?? 0)} for ${order.orderNumber} is recorded as paid out from the account below.`, `${formatIdrCurrency(order.refundAmountIdr ?? 0)} untuk ${order.orderNumber} dicatat keluar dari rekening di bawah.`)
        : ''}
      confirmLabel={busy ? tr('Saving…', 'Menyimpan…') : isCancel ? tr('Cancel refund', 'Batalkan pengembalian dana') : tr('Complete refund', 'Selesaikan pengembalian dana')}
      cancelLabel={tr('Back', 'Kembali')}
      destructive={isCancel}
      disabled={busy || (isCancel && reason.trim().length < 3)}
      onConfirm={isCancel ? cancel : () => { void complete() }}
    >
      {!isCancel && (
        <label className="block space-y-1.5 text-xs font-medium">
          {tr('Paid from', 'Dibayar dari')}
          <select aria-label="Refund account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setError(null) }} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm">
            <option value="">{tr('Select account', 'Pilih rekening')}</option>
            {options.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
        </label>
      )}
      {isCancel && (
        <label className="block space-y-1">
          <span className="text-xs font-medium">{tr('Reason', 'Alasan')}</span>
          <textarea aria-label="Cancel refund reason" value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm" />
        </label>
      )}
      {order?.refundReason && (
        <p className="rounded-xl bg-muted/60 p-3 text-xs">
          <span className="text-muted-foreground">{tr('Refund reason', 'Alasan pengembalian dana')}: </span>
          <span className="font-medium text-foreground">{order.refundReason}</span>
        </p>
      )}
      {!isCancel && order && order.status !== 'cancelled' && onChangeAction && (
        <button type="button" onClick={() => onChangeAction({ type: 'cancel', order })} className="text-xs font-semibold text-destructive underline-offset-2 hover:underline">
          {tr('Cancel this refund instead', 'Batalkan pengembalian dana ini')}
        </button>
      )}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
    </ConfirmActionDialog>
  )
}
