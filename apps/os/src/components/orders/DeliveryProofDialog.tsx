import { useRef, useState, type ChangeEvent, type FC } from 'react'
import { Camera } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { confirmCourierDelivery } from '../../data/courierDelivery'
import { dataUrlToBlob, prepareUploadedPaymentProof } from '../../domain/paymentProofImageDomain'

interface Props {
  order: OrderTableRow
  open: boolean
  onClose: () => void
  onDelivered: () => void
}

const MAX_SOURCE_FILE_BYTES = 15 * 1024 * 1024

/** Courier: mandatory proof-of-delivery photo, then mark the order delivered. Internal only. */
export const DeliveryProofDialog: FC<Props> = ({ order, open, onClose, onDelivered }) => {
  const copy = useBilingualCopy()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError(copy('That photo is too large. Take a new one.', 'Foto terlalu besar. Ambil foto baru.'))
      return
    }
    try {
      setPreview(await prepareUploadedPaymentProof(file))
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : copy('Could not open that photo.', 'Foto tidak bisa dibuka.'))
    }
  }

  const handleConfirm = async () => {
    if (!preview) {
      setError(copy('Take a photo of the received order first.', 'Ambil foto bukti terima dulu.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await confirmCourierDelivery(order, dataUrlToBlob(preview))
      setPreview(null)
      onDelivered()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(message.includes('DELIVERY_ALREADY_CONFIRMED')
        ? copy('This delivery was already confirmed.', 'Pengantaran ini sudah dikonfirmasi.')
        : copy('Could not send. Check the connection and try again.', 'Gagal mengirim. Periksa koneksi lalu coba lagi.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy('Confirm delivery', 'Konfirmasi selesai diantar')} · {order.orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {copy('Take a photo showing the order was received. It is sent to the admin, who marks the order delivered. Only the shop team can see it.', 'Ambil foto yang menunjukkan pesanan sudah diterima. Foto dikirim ke admin, yang menandai pesanan terkirim. Foto hanya terlihat oleh tim toko.')}
          </p>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { void handleFile(event) }} />
          {preview ? (
            <img src={preview} alt={copy('Proof of delivery preview', 'Pratinjau bukti terima')} className="max-h-72 w-full rounded-xl border border-border object-contain" />
          ) : (
            <button type="button" onClick={() => inputRef.current?.click()} className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted">
              <Camera className="size-7" />
              {copy('Take photo', 'Ambil foto')}
            </button>
          )}
          {preview && (
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-xs font-medium text-primary hover:underline disabled:opacity-50">
              {copy('Retake photo', 'Ambil ulang foto')}
            </button>
          )}
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium disabled:opacity-50">
            {copy('Cancel', 'Batal')}
          </button>
          <button type="button" onClick={() => { void handleConfirm() }} disabled={busy || !preview} className="h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? copy('Sending…', 'Mengirim…') : copy('Send confirmation', 'Kirim konfirmasi')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
