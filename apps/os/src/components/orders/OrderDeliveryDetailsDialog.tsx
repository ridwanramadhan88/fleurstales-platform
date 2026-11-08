import { useState, type FC } from 'react'
import type { OrderTableRow } from '../../types/orders'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { DeliveryPinPicker } from './DeliveryPinPicker'
import {
  LANDMARK_MAX_LENGTH,
  isValidRecipientPhone,
  toDeliveryPin,
  type DeliveryPin,
} from '../../domain/deliveryDetailsDomain'
import { saveOrderDeliveryDetails } from '../../data/orderDeliveryDetails'
import { toast } from '../../hooks/use-toast'
import { useSettingsStore } from '../../store/settingsStore'

interface Props {
  order: OrderTableRow
  open: boolean
  onClose: () => void
}

const fieldClass = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

/** Owner/Admin: correct the recipient, address, pin and landmark of a delivery. */
export const OrderDeliveryDetailsDialog: FC<Props> = ({ order, open, onClose }) => {
  const copy = useBilingualCopy()
  const branchLocation = useSettingsStore((state) => state.branches.find((branch) => branch.id === order.branch)?.location)
  const [address, setAddress] = useState(order.deliveryAddress ?? '')
  const [recipientName, setRecipientName] = useState(order.recipientName ?? order.customerName ?? '')
  const [recipientPhone, setRecipientPhone] = useState(order.recipientPhone ?? order.customerSnapshot?.whatsappNumber ?? '')
  const [pin, setPin] = useState<DeliveryPin | null>(
    typeof order.deliveryLatitude === 'number' && typeof order.deliveryLongitude === 'number'
      ? toDeliveryPin(order.deliveryLatitude, order.deliveryLongitude)
      : null,
  )
  const [landmark, setLandmark] = useState(order.deliveryLandmark ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = (): string | null => {
    if (!address.trim()) return copy('Add the delivery address.', 'Isi alamat antar.')
    if (!recipientName.trim()) return copy('Add the recipient name.', 'Isi nama penerima.')
    if (!isValidRecipientPhone(recipientPhone)) return copy('Enter a valid recipient WhatsApp number.', 'Isi nomor WhatsApp penerima yang valid.')
    if (!pin) return copy('Set the delivery pin.', 'Pasang pin lokasi antar.')
    if (!landmark.trim()) return copy('Add a landmark or house detail.', 'Isi patokan atau detail rumah.')
    return null
  }

  const handleSave = async () => {
    const problem = validate()
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    try {
      await saveOrderDeliveryDetails(order, {
        address: address.trim(),
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        latitude: pin?.latitude,
        longitude: pin?.longitude,
        landmark: landmark.trim(),
      })
      toast({ title: copy('Delivery details saved', 'Detail pengiriman disimpan') })
      onClose()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(message.includes('REVISION_CONFLICT')
        ? copy('This order just changed. Close and open it again.', 'Pesanan baru saja berubah. Tutup lalu buka lagi.')
        : message.includes('ORDER_DELIVERY_LOCKED')
          ? copy('Finished orders cannot be changed.', 'Pesanan yang sudah selesai tidak bisa diubah.')
          : copy('Could not save. Try again.', 'Gagal menyimpan. Coba lagi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy('Delivery details', 'Detail pengiriman')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              {copy('Recipient name', 'Nama penerima')}
              <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} className={fieldClass} />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              {copy('Recipient WhatsApp', 'WhatsApp penerima')}
              <input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} inputMode="tel" className={fieldClass} />
            </label>
          </div>
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            {copy('Address', 'Alamat')}
            <textarea
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">{copy('Delivery pin', 'Pin lokasi antar')}</span>
            <DeliveryPinPicker value={pin} onChange={setPin} center={branchLocation} />
          </div>
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            {copy('Landmark & house detail', 'Patokan & detail rumah')}
            <textarea
              value={landmark}
              maxLength={LANDMARK_MAX_LENGTH}
              onChange={(event) => setLandmark(event.target.value)}
              className="min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium disabled:opacity-50">
            {copy('Cancel', 'Batal')}
          </button>
          <button type="button" onClick={() => { void handleSave() }} disabled={saving} className="h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving ? copy('Saving…', 'Menyimpan…') : copy('Save', 'Simpan')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
