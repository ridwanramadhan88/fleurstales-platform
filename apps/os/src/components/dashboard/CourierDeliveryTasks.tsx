import { useMemo, useState, type FC } from 'react'
import { CalendarClock, MapPin, MessageCircle, Phone, PackageCheck, Truck } from 'lucide-react'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { surfaceCardClass } from '../ui/card'
import { toast } from '../../hooks/use-toast'
import { startCourierDelivery } from '../../data/courierDelivery'
import { getCourierTasks, toDialDigits } from '../../domain/deliveryProofDomain'
import { googleMapsUrlForPin, toDeliveryPin } from '../../domain/deliveryDetailsDomain'
import { formatOrderCreatedAtLabel } from '../orders/orderTableScheduleLabels'
import { DeliveryProofDialog } from '../orders/DeliveryProofDialog'
import type { OrderTableRow } from '../../types/orders'

const mapsLinkFor = (order: OrderTableRow): string | null => {
  if (order.deliveryLatitude != null && order.deliveryLongitude != null) {
    const pin = toDeliveryPin(order.deliveryLatitude, order.deliveryLongitude)
    if (pin) return googleMapsUrlForPin(pin)
  }
  return order.deliveryAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`
    : null
}

/** Courier home: assigned deliveries, earliest first, phone-first. */
export const CourierDeliveryTasks: FC = () => {
  const copy = useBilingualCopy()
  const employeeId = useUserStore((state) => state.employeeId)
  const orders = useOrdersStore((state) => state.orders)
  const tasks = useMemo(() => getCourierTasks(orders, employeeId), [orders, employeeId])
  const [busyOrder, setBusyOrder] = useState<string | null>(null)
  const [proofOrder, setProofOrder] = useState<OrderTableRow | null>(null)

  const handleStart = async (order: OrderTableRow) => {
    setBusyOrder(order.orderNumber)
    try {
      await startCourierDelivery(order)
      toast({ title: copy('Delivery started', 'Pengantaran dimulai') })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      toast({
        title: copy('Could not start', 'Gagal memulai'),
        description: message.includes('OUTSTANDING_PAYMENT')
          ? copy('Payment is not complete yet. Contact the admin.', 'Pembayaran belum lunas. Hubungi admin.')
          : message.includes('REVISION_CONFLICT') || message.includes('PT409')
            ? copy('This order just changed. Pull to refresh.', 'Pesanan baru saja berubah. Muat ulang.')
            : copy('Try again.', 'Coba lagi.'),
      })
    } finally {
      setBusyOrder(null)
    }
  }

  return (
    <section className={surfaceCardClass('standard', 'border border-border ring-0')} aria-label={copy('Delivery tasks', 'Tugas antar')}>
      <header className="mb-3">
        <h2 className="text-base font-semibold leading-6">{copy('Delivery tasks', 'Tugas antar')}</h2>
        <p className="text-sm text-muted-foreground">{copy('Earliest schedule first.', 'Jadwal paling awal di atas.')}</p>
      </header>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-7 text-center">
          <PackageCheck className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">{copy('No deliveries right now', 'Belum ada tugas antar')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy('New tasks appear here when the admin assigns you.', 'Tugas baru muncul di sini saat admin menugaskan Anda.')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map(({ order, stage }) => {
            const phone = toDialDigits(order.recipientPhone)
            const maps = mapsLinkFor(order)
            const busy = busyOrder === order.orderNumber
            return (
              <li key={order.orderNumber} className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{order.orderNumber}</span>
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${stage === 'delivering' ? 'bg-primary/10 text-primary ring-primary/30' : 'bg-surface-neutral text-foreground ring-border/80'}`}>
                    {stage === 'delivering' ? copy('On the way', 'Sedang diantar') : copy('Ready to go', 'Siap diantar')}
                  </span>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  {order.scheduleLabel ? formatOrderCreatedAtLabel(order.scheduleLabel) : order.scheduleDate ?? copy('Schedule not set', 'Jadwal belum diatur')}
                </p>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{order.recipientName || order.customerName}</p>
                  {order.deliveryAddress && <p className="text-muted-foreground">{order.deliveryAddress}</p>}
                  {order.deliveryLandmark && <p className="text-muted-foreground">{copy('Landmark', 'Patokan')}: {order.deliveryLandmark}</p>}
                  {order.deliveryInstructions && <p className="text-muted-foreground">{copy('Note', 'Catatan')}: {order.deliveryInstructions}</p>}
                  {order.greetingMessage && (
                    <p className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                      {copy('Greeting card', 'Kartu ucapan')}: {order.greetingMessage}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {maps && (
                    <a href={maps} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent">
                      <MapPin className="size-4" />{copy('Open map', 'Buka peta')}
                    </a>
                  )}
                  {phone && (
                    <>
                      <a href={`tel:+${phone}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent">
                        <Phone className="size-4" />{copy('Call', 'Telepon')}
                      </a>
                      <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent">
                        <MessageCircle className="size-4" />WhatsApp
                      </a>
                    </>
                  )}
                </div>
                {stage === 'ready' ? (
                  <button type="button" disabled={busy} onClick={() => { void handleStart(order) }} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    <Truck className="size-4" />{busy ? copy('Starting…', 'Memulai…') : copy('Start delivery', 'Mulai antar')}
                  </button>
                ) : (
                  <button type="button" onClick={() => setProofOrder(order)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
                    <PackageCheck className="size-4" />{copy('Delivered', 'Terkirim')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {proofOrder && (
        <DeliveryProofDialog
          order={proofOrder}
          open
          onClose={() => setProofOrder(null)}
          onDelivered={() => {
            setProofOrder(null)
            toast({ title: copy('Order delivered', 'Pesanan terkirim') })
          }}
        />
      )}
    </section>
  )
}
