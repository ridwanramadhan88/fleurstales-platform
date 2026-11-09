import { useState, type FC } from 'react'
import type { OrderTableRow } from '../../types/orders'
import type { SaveOrderShipmentResult } from '../../data/shared/contracts'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { saveOrderShipment } from '../../data/orderShipment'
import { toast } from '../../hooks/use-toast'
import { useSettingsStore } from '../../store/settingsStore'
import { isValidTrackingUrl } from '../../domain/orderShipmentDomain'

interface Props {
  order: OrderTableRow
  open: boolean
  /** `start`: the order is about to leave; `edit`: correcting a shipment already recorded. */
  mode: 'start' | 'edit'
  onClose: () => void
  onSaved: (result: SaveOrderShipmentResult) => void
}

const fieldClass = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

/** Owner/Admin: how the order is sent, the real cost and the Gojek tracking link. */
export const OrderShipmentDialog: FC<Props> = ({ order, open, mode, onClose, onSaved }) => {
  const copy = useBilingualCopy()
  const hasCourierAccount = useSettingsStore((state) =>
    Boolean(state.branches.find((branch) => branch.id === order.branch)?.courierPaymentAccountId))
  const [provider, setProvider] = useState<'gojek' | 'internal'>(order.deliveryProvider ?? 'gojek')
  const [cost, setCost] = useState(order.deliveryActualCostIdr ? String(order.deliveryActualCostIdr) : '')
  const [trackingUrl, setTrackingUrl] = useState(order.deliveryTrackingUrl ?? '')
  const [courierName, setCourierName] = useState(order.deliveryCourierName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vehicleLabel = order.deliveryVehicle === 'car' ? copy('Car', 'Mobil') : copy('Motorbike', 'Motor')

  const validate = (): string | null => {
    if (provider === 'gojek') {
      const amount = Number(cost.replace(/\D/g, ''))
      if (!Number.isFinite(amount) || amount <= 0) return copy('Enter the real Gojek cost.', 'Isi ongkos asli Gojek.')
      if (trackingUrl.trim() && !isValidTrackingUrl(trackingUrl)) return copy('The tracking link must start with https://', 'Link lacak harus diawali https://')
    }
    return null
  }

  const handleSave = async () => {
    const problem = validate()
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    try {
      const result = await saveOrderShipment(order, provider === 'gojek'
        ? { provider, actualCostIdr: Number(cost.replace(/\D/g, '')), trackingUrl: trackingUrl.trim() || undefined }
        : { provider, courierName: courierName.trim() || undefined })
      if (provider === 'gojek' && !result.financeRecorded) {
        toast({
          title: copy('Shipment saved, cost not booked', 'Pengiriman tersimpan, ongkos belum dicatat'),
          description: result.financeReason === 'COURIER_PAYMENT_ACCOUNT_REQUIRED'
            ? copy('Set the courier payment account in Settings → Branches, then save the shipment again.', 'Atur "Akun bayar kurir" di Pengaturan cabang, lalu simpan pengiriman lagi.')
            : copy('The Finance expense could not be recorded.', 'Pengeluaran di Keuangan belum bisa dicatat.'),
        })
      } else {
        toast({ title: copy('Shipment saved', 'Pengiriman disimpan') })
      }
      onSaved(result)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(message.includes('REVISION_CONFLICT')
        ? copy('This order just changed. Close and open it again.', 'Pesanan baru saja berubah. Tutup lalu buka lagi.')
        : message.includes('FINANCE_PERIOD_CLOSED')
          ? copy('This month in Finance is closed, so the cost cannot be booked.', 'Bulan ini di Keuangan sudah ditutup, ongkos tidak bisa dicatat.')
          : message.includes('ORDER_SHIPMENT_LOCKED')
            ? copy('This order can no longer be changed.', 'Pesanan ini tidak bisa diubah lagi.')
            : copy('Could not save. Try again.', 'Gagal menyimpan. Coba lagi.'))
    } finally {
      setSaving(false)
    }
  }

  const choice = (value: 'gojek' | 'internal', label: string) => (
    <button
      type="button"
      onClick={() => setProvider(value)}
      aria-pressed={provider === value}
      className={`h-11 flex-1 rounded-xl border text-sm font-medium transition ${provider === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground/80 hover:bg-muted'}`}
    >
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'start' ? copy('Send the order', 'Kirim pesanan') : copy('Shipment', 'Pengiriman')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {copy('Customer chose', 'Pelanggan memilih')}: <span className="font-semibold text-foreground">{vehicleLabel}</span>
            {' · '}
            {copy('Fee charged', 'Ongkir ditagih')}: <span className="font-semibold text-foreground">Rp {(order.deliveryFeeIdr ?? 0).toLocaleString('id-ID')}</span>
          </p>
          <div className="flex gap-2">
            {choice('gojek', 'Gojek')}
            {choice('internal', copy('Internal courier', 'Kurir internal'))}
          </div>
          {provider === 'gojek' ? (
            <>
              <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                {copy('Real Gojek cost (IDR)', 'Ongkos asli Gojek (Rp)')}
                <input value={cost} onChange={(event) => setCost(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className={fieldClass} />
              </label>
              <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                {copy('Tracking link (optional)', 'Link lacak (opsional)')}
                <input value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} inputMode="url" placeholder="https://" className={fieldClass} />
              </label>
              {!hasCourierAccount && (
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                  {copy('No courier payment account is set for this branch, so the cost will not be booked in Finance yet.', 'Akun bayar kurir cabang ini belum diatur, jadi ongkos belum akan dicatat di Keuangan.')}
                </p>
              )}
            </>
          ) : (
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              {copy('Courier name (optional)', 'Nama kurir (opsional)')}
              <input value={courierName} onChange={(event) => setCourierName(event.target.value)} maxLength={120} className={fieldClass} />
            </label>
          )}
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium disabled:opacity-50">
            {copy('Cancel', 'Batal')}
          </button>
          <button type="button" onClick={() => { void handleSave() }} disabled={saving} className="h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving ? copy('Saving…', 'Menyimpan…') : mode === 'start' ? copy('Save & start delivery', 'Simpan & mulai kirim') : copy('Save', 'Simpan')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
