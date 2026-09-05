import { useMemo, useRef, useState, type ChangeEvent, type FC } from 'react'
import { CreditCard, ImagePlus, Trash2 } from 'lucide-react'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import { useSettingsStore } from '../../store/settingsStore'
import { confirmOrderPaymentForProcessing } from '../../data/orderPaymentProcessing'
import { removeOrderPaymentProof, uploadOrderPaymentProof } from '../../data/orderMediaUpload'
import { dataUrlToBlob, PAYMENT_PROOF_MAX_BYTES, prepareUploadedPaymentProof } from '../../domain/paymentProofImageDomain'
import { toast } from '../../hooks/use-toast'
import { AppDialog } from '../ui/app-dialog'
import { getQuickActionLabel } from './orderTableLabels'

interface OrderPaymentGateDialogProps {
  order: OrderTableRow
  nextStatus: OrderStatus
  formatter: Intl.NumberFormat
  onCancel: () => void
  onMarkPaidAndContinue: () => void
}

export const OrderPaymentGateDialog: FC<OrderPaymentGateDialogProps> = ({
  order,
  nextStatus,
  formatter,
  onCancel,
  onMarkPaidAndContinue,
}) => {
  const configuredPaymentAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const proofInputRef = useRef<HTMLInputElement>(null)
  const eligiblePaymentAccounts = useMemo(
    () => configuredPaymentAccounts
      .filter((account) =>
        account.isActive !== false
        && (account.branchIds?.length === 0 || account.branchIds?.includes(order.branch)),
      )
      .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [configuredPaymentAccounts, order.branch],
  )
  const [financeAccountId, setFinanceAccountId] = useState(
    order.paymentMethod === 'cash' ? 'cash:main' : eligiblePaymentAccounts[0]?.id ?? '',
  )
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null)
  const [proofPreparing, setProofPreparing] = useState(false)
  const [paymentProofError, setPaymentProofError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleProofInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProofPreparing(true)
    setPaymentProofError(null)
    try {
      setPaymentProofPreview(await prepareUploadedPaymentProof(file))
    } catch (error) {
      setPaymentProofPreview(null)
      setPaymentProofError(error instanceof Error ? error.message : 'Could not prepare bukti transfer.')
    } finally {
      setProofPreparing(false)
    }
  }

  const confirmPayment = async () => {
    if (busy || proofPreparing) return
    if (order.paymentMethod !== 'cash' && order.paymentMethod !== 'transfer') {
      toast({ title: 'Payment method required', description: 'Set Cash or Transfer before confirming payment.', variant: 'destructive' })
      return
    }
    if (order.paymentMethod === 'transfer' && !financeAccountId) {
      toast({ title: 'Receiving account required', description: 'Select the account that received this payment.', variant: 'destructive' })
      return
    }
    if (order.paymentMethod === 'transfer' && !paymentProofPreview && !order.paymentProofUrl) {
      toast({ title: 'Bukti transfer required', description: 'Upload bukti transfer before confirming PAID.', variant: 'destructive' })
      return
    }

    setBusy(true)
    let uploadedProofPath: string | undefined
    try {
      if (order.paymentMethod === 'transfer' && paymentProofPreview) {
        uploadedProofPath = await uploadOrderPaymentProof(order.id ?? order.orderNumber, dataUrlToBlob(paymentProofPreview))
      }
      await confirmOrderPaymentForProcessing(
        order,
        order.paymentMethod === 'cash' ? 'cash:main' : financeAccountId,
        uploadedProofPath ?? order.paymentProofUrl,
      )
      toast({
        title: 'Payment confirmed',
        description: `${order.orderNumber} is PAID. Process Order is now available to assign a florist.`,
      })
      onMarkPaidAndContinue()
    } catch (error) {
      if (uploadedProofPath) await removeOrderPaymentProof(uploadedProofPath).catch(() => undefined)
      toast({
        title: 'Payment was not confirmed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const proofReady = order.paymentMethod !== 'transfer' || Boolean(paymentProofPreview || order.paymentProofUrl)
  const accountReady = order.paymentMethod === 'cash' || (order.paymentMethod === 'transfer' && Boolean(financeAccountId))

  return (
    <AppDialog
      open
      onOpenChange={(open) => { if (!open && !busy) onCancel() }}
      size="compact"
      title="Konfirmasi Pembayaran"
      description="Select receiving account and attach bukti transfer. This marks the order PAID only; florist assignment stays in Process Order."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CreditCard className="size-5" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{order.orderNumber}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Rp {formatter.format(order.totalIdr)} · {order.paymentMethod === 'cash' ? 'Cash' : order.paymentMethod === 'transfer' ? 'Transfer' : 'Payment method not set'}</p>
            <p className="mt-1 text-2xs text-muted-foreground">After payment is confirmed, {getQuickActionLabel(nextStatus)} becomes available.</p>
          </div>
        </div>

        {order.paymentMethod === 'transfer' ? (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Received into</span>
              <select
                value={financeAccountId}
                onChange={(event) => setFinanceAccountId(event.target.value)}
                className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40"
              >
                <option value="">Select receiving account</option>
                {eligiblePaymentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.bankName} · {account.accountNumber}</option>
                ))}
              </select>
              {eligiblePaymentAccounts.length === 0 && <p className="text-xs text-destructive">No active payment account is available for this branch. Configure one in Settings first.</p>}
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Bukti transfer</span>
              {paymentProofPreview ? (
                <div className="flex items-start gap-3 rounded-xl bg-background p-3 ring-1 ring-border/70">
                  <img src={paymentProofPreview} alt="Bukti transfer preview" className="h-20 w-20 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-success">Ready to upload</p>
                    <p className="mt-1 text-2xs text-muted-foreground">The private Finance proof is uploaded only when Confirm PAID is clicked.</p>
                  </div>
                  <button type="button" onClick={() => setPaymentProofPreview(null)} className="flex size-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10" aria-label="Remove payment proof"><Trash2 className="size-4" /></button>
                </div>
              ) : order.paymentProofUrl ? (
                <div className="rounded-xl bg-success/5 p-3 text-xs text-success ring-1 ring-success/20">A private payment proof is already attached to this order.</div>
              ) : (
                <button type="button" onClick={() => proofInputRef.current?.click()} disabled={proofPreparing} className="flex h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/70 text-xs font-semibold hover:border-primary/40 disabled:opacity-50">
                  <ImagePlus className="size-4" /> {proofPreparing ? 'Preparing…' : 'Upload bukti transfer'}
                </button>
              )}
              <input ref={proofInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void handleProofInput(event) }} />
              {paymentProofError && <p className="text-2xs text-destructive">{paymentProofError}</p>}
              <p className="text-2xs text-muted-foreground">Private Finance evidence · max {PAYMENT_PROOF_MAX_BYTES / 1024} KB after compression.</p>
            </div>
          </div>
        ) : order.paymentMethod === 'cash' ? (
          <div className="rounded-xl bg-surface-panel p-3 text-sm ring-1 ring-border/60">
            <span className="text-muted-foreground">Receiving account: </span><strong>Cash</strong>
          </div>
        ) : (
          <div className="rounded-xl bg-destructive/8 p-3 text-xs text-destructive ring-1 ring-destructive/20">Set the payment method on the order before confirming payment.</div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onCancel} disabled={busy} className="h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
          <button
            type="button"
            onClick={() => { void confirmPayment() }}
            disabled={busy || proofPreparing || !proofReady || !accountReady || (order.paymentMethod !== 'cash' && order.paymentMethod !== 'transfer')}
            className="h-11 rounded-full bg-success px-[18px] text-sm font-semibold text-white shadow-ios-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Confirming…' : 'Confirm PAID'}
          </button>
        </div>
      </div>
    </AppDialog>
  )
}
