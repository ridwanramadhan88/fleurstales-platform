import type { ChangeEvent, FC } from 'react'
import { useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, Trash2, UploadCloud } from 'lucide-react'
import { getRemainingOrderPaymentIdr } from '../../domain/orderPaymentGateDomain'
import { prepareUploadedPaymentProof, dataUrlToBlob, PAYMENT_PROOF_MAX_BYTES } from '../../domain/paymentProofImageDomain'
import { uploadOrderPaymentProof } from '../../data/orderMediaUpload'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import { getQuickActionLabel } from './orderTableLabels'

interface OrderPaymentGateDialogProps {
  order: OrderTableRow
  nextStatus: OrderStatus
  formatter: Intl.NumberFormat
  onCancel: () => void
  onMarkPaidAndContinue: (paymentProofUrl?: string) => void
}

export const OrderPaymentGateDialog: FC<OrderPaymentGateDialogProps> = ({ order, nextStatus, formatter, onCancel, onMarkPaidAndContinue }) => {
  const remainingIdr = getRemainingOrderPaymentIdr(order)
  const finishingPickup = nextStatus === 'picked_up'
  const requiresProof = order.paymentMethod === 'transfer' && !order.paymentProofUrl
  const [proofUrl, setProofUrl] = useState<string | undefined>(order.paymentProofUrl)
  const [proofPreview, setProofPreview] = useState<string | undefined>(order.paymentProofUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const dataUrl = await prepareUploadedPaymentProof(file)
      setProofPreview(dataUrl)
      const blob = dataUrlToBlob(dataUrl)
      const uploadedUrl = await uploadOrderPaymentProof(order.id ?? order.orderNumber, blob)
      setProofUrl(uploadedUrl)
    } catch (nextError) {
      setProofPreview(undefined)
      setError(nextError instanceof Error ? nextError.message : 'Could not upload bukti transfer.')
    } finally {
      setUploading(false)
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0])
    event.target.value = ''
  }

  const canContinue = order.paymentMethod !== 'transfer' || Boolean(proofUrl)

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Payment required" onClick={(event) => event.stopPropagation()} className="animate-sheet-up w-full rounded-t-2xl bg-card p-5 shadow-ios-lg ring-1 ring-border/60 sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"><AlertTriangle className="size-5" /></span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 text-foreground">{finishingPickup ? 'Finish order' : 'Payment required'}</h3>
            <p className="mt-1 text-sm font-semibold text-foreground"><span>Rp {formatter.format(remainingIdr)}</span><span className="font-normal text-muted-foreground"> remains unpaid.</span></p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finishingPickup ? 'Confirm payment to mark this pickup order as finished.' : `Mark the order as paid before moving it to ${getQuickActionLabel(nextStatus)}.`}</p>
          </div>
        </div>

        {order.paymentMethod === 'transfer' && (
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-medium text-foreground/90">Bukti transfer {requiresProof ? '(required)' : ''}</label>
            {proofPreview ? (
              <div className="relative w-full max-w-[220px] overflow-hidden rounded-xl bg-muted ring-1 ring-border/70">
                <img src={proofPreview} alt="Bukti transfer" className="w-full object-contain" />
                {proofUrl && (
                  <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-success text-white">
                    <Check className="size-3.5" />
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/60 p-2">
                  <button type="button" onClick={() => { setProofPreview(undefined); setProofUrl(undefined) }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-xs font-medium text-destructive shadow-ios-sm hover:bg-white">
                    <Trash2 className="size-3" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                className="flex h-24 w-full max-w-[220px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted text-center hover:border-primary/40 hover:bg-accent/40"
              >
                {uploading ? <UploadCloud className="size-6 animate-pulse text-primary" /> : <Camera className="size-6 text-muted-foreground" />}
                <span className="text-2xs font-medium text-foreground">{uploading ? 'Uploading…' : 'Upload bukti transfer'}</span>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />
            {error && <p className="text-2xs text-destructive" role="alert">{error}</p>}
            <p className="text-2xs text-muted-foreground">Max {PAYMENT_PROOF_MAX_BYTES / 1024} KB after compression, original aspect ratio kept.</p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="order-2 inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium text-muted-foreground hover:bg-muted sm:order-1 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Keep pending</button>
          <button
            type="button"
            onClick={() => onMarkPaidAndContinue(proofUrl)}
            disabled={!canContinue || uploading}
            className="order-1 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-success text-sm font-semibold text-white shadow-ios-sm hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50 sm:order-2 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
          >
            {finishingPickup ? 'Mark paid & finish' : 'Mark paid & continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
