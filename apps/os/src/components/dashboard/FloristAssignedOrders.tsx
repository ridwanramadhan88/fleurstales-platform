import { useMemo, useState } from 'react'
import { Camera, CalendarClock, CheckCircle2, ChevronDown, PackageCheck } from 'lucide-react'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { surfaceCardClass } from '../ui/card'
import { OrderFinishPhotoDialog } from '../orders/OrderFinishPhotoDialog'
import { attachOrderFinishPhoto } from '../../data/orderMediaUpload'
import type { OrderLineItem, OrderTableRow } from '../../types/orders'
import { formatOrderCreatedAtLabel } from '../orders/orderTableScheduleLabels'
import { getOrderUrgency } from '../../domain/orderTimingDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

const scheduleOf = (order: OrderTableRow, fallback: string) =>
  order.scheduleLabel ? formatOrderCreatedAtLabel(order.scheduleLabel) : order.scheduleDate ?? fallback

const byScheduleAsc = (a: OrderTableRow, b: OrderTableRow) =>
  `${a.scheduleDate ?? '9999-12-31'}T${a.scheduleTime ?? '23:59'}`.localeCompare(`${b.scheduleDate ?? '9999-12-31'}T${b.scheduleTime ?? '23:59'}`)

/** Everything a florist needs to make the arrangement, read straight from the order. */
const OrderWorkCard = ({ order, onPhoto }: { order: OrderTableRow; onPhoto: () => void }) => {
  const tr = useBilingualCopy()
  const urgency = getOrderUrgency(order)
  const note = order.orderNote ?? order.internalNote
  const card = order.greetingMessage ?? order.giftMessage
  const items: OrderLineItem[] = order.items?.length
    ? order.items
    : [{ id: 'single', quantity: 1, productName: order.productName, unitPriceIdr: 0 }]

  return (
    <article className="space-y-3 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{order.orderNumber}</span>
        {urgency === 'late' && <span className="rounded-full bg-destructive px-2 py-0.5 text-2xs font-semibold text-white">{tr('Late', 'Telat')}</span>}
        {urgency === 'dueSoon' && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-semibold text-warning">{tr('Due soon', 'Segera')}</span>}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" />
          {order.fulfillment === 'delivery' ? tr('Delivery', 'Antar') : tr('Pickup', 'Ambil')} · {scheduleOf(order, tr('No schedule', 'Belum ada jadwal'))}
        </span>
      </header>

      <p className="text-xs text-muted-foreground">{order.customerName}</p>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-semibold">{item.quantity}×</span>{' '}
            <span className="font-medium">{item.productNameSnapshot ?? item.productName ?? tr('Custom order', 'Pesanan custom')}</span>
            {item.variantSizeSnapshot && <span className="text-muted-foreground"> · {item.variantSizeSnapshot}</span>}
            {item.flowerRecipeSnapshot?.length ? (
              <span className="block text-xs text-muted-foreground">
                {item.flowerRecipeSnapshot.map((flower) => `${flower.quantity} ${flower.flowerName}`).join(' · ')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {note && (
        <div className="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          <p className="text-2xs font-semibold uppercase tracking-wide text-warning">{tr('Note', 'Catatan')}</p>
          <p className="whitespace-pre-line">{note}</p>
        </div>
      )}
      {card && (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Greeting card', 'Kartu ucapan')}</p>
          <p className="whitespace-pre-line">{card}</p>
          {order.greetingCardName && <p className="mt-1 text-xs text-muted-foreground">— {order.greetingCardName}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={onPhoto}
        className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold ${order.finishPhotoUrl ? 'border border-border hover:bg-accent' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
      >
        {order.finishPhotoUrl ? <CheckCircle2 className="size-4 text-success" /> : <Camera className="size-4" />}
        {order.finishPhotoUrl ? tr('Replace finish photo', 'Ganti foto hasil') : tr('Upload finish photo', 'Unggah foto hasil')}
      </button>
    </article>
  )
}

export function FloristAssignedOrders({ hideWhenEmpty = false }: { onGoToOrders?: () => void; hideWhenEmpty?: boolean }) {
  const tr = useBilingualCopy()
  const [showReady, setShowReady] = useState(false)
  const [photoOrder, setPhotoOrder] = useState<OrderTableRow | null>(null)
  const employeeId = useUserStore((state) => state.employeeId)
  const actorName = useUserStore((state) => state.name)
  const orders = useOrdersStore((state) => state.orders)

  const mine = useMemo(() => orders.filter((order) => order.floristAssignedEmployeeId === employeeId), [employeeId, orders])
  const toMake = useMemo(() => mine.filter((order) => order.status === 'processing').sort(byScheduleAsc), [mine])
  const ready = useMemo(() => mine.filter((order) => order.status === 'ready').sort(byScheduleAsc), [mine])

  if (hideWhenEmpty && toMake.length === 0 && ready.length === 0) return null

  return (
    <section className={surfaceCardClass('standard', 'border border-border ring-0')} aria-label={tr('My assigned orders', 'Pesanan saya')}>
      <h2 className="mb-3 text-base font-semibold leading-6">
        {tr('To make', 'Dikerjakan')}{toMake.length ? ` · ${toMake.length}` : ''}
      </h2>

      {toMake.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          <PackageCheck className="size-4" />{tr('No orders to make right now.', 'Belum ada pesanan untuk dikerjakan.')}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {toMake.map((order) => <OrderWorkCard key={order.orderNumber} order={order} onPhoto={() => setPhotoOrder(order)} />)}
        </div>
      )}

      {ready.length > 0 && (
        <div className="mt-3">
          <button type="button" aria-expanded={showReady} onClick={() => setShowReady((value) => !value)} className="flex h-10 w-full items-center justify-between rounded-lg px-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            {tr('Ready', 'Sudah siap')} · {ready.length}
            <ChevronDown className={`size-4 transition ${showReady ? 'rotate-180' : ''}`} />
          </button>
          {showReady && (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {ready.map((order) => (
                <li key={order.orderNumber} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 truncate"><span className="font-semibold">{order.orderNumber}</span> · {order.customerName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{scheduleOf(order, '')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {photoOrder ? (
        <OrderFinishPhotoDialog
          open
          orderId={photoOrder.id ?? ''}
          onCancel={() => setPhotoOrder(null)}
          onUploaded={async (finishPhotoUrl) => {
            await attachOrderFinishPhoto(photoOrder, finishPhotoUrl, actorName)
            setPhotoOrder(null)
          }}
        />
      ) : null}
    </section>
  )
}
