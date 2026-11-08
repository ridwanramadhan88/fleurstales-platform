/**
 * @file OrderProcessView.tsx
 * @description The order window once an order is confirmed ("Proses"): a
 * five-step track (payment, florist, arranging, hand-over, done), the
 * current step open with its one next action, and a quiet summary with the
 * note and greeting card always visible. Every action reuses the existing
 * flows (payment confirmation, florist assignment, finish photo, WhatsApp
 * notices), so only the layout is new.
 */

import { OrderDeliveryDestination } from './OrderDeliveryDestination'
import { useUserStore } from '../../store/userStore'
import { useEffect, useState, type FC } from 'react'
import { Check, MessageCircle, Package2, X } from 'lucide-react'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { addDays, getLocalDateString, nowInJakarta } from '../../domain/orderTimingDomain'
import { getOrderPriority, isOrderFullyPaid, type OrderWorkStage } from '../../domain/orderWorkStageDomain'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { OrderStagePill } from './OrderStagePill'
import { OrderNoteBlock } from './OrderNoteBlock'
import { OrderMoreActionsMenu, hasOrderMoreActions } from './OrderMoreActionsMenu'
import { OrderPaymentProofButton, canViewPaymentProof } from './OrderPaymentProofButton'
import { formatMinutesLeft } from './orderWorkStagePresentation'
import { buildWhatsAppLink } from './orderTableWhatsApp'
import { StaffReviewHistory } from '../customers/StaffReviewHistory'

type Copy = (en: string, id: string) => string
type Step = 1 | 2 | 3 | 4 | 5

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}`

/** Which of the five steps the order is on. */
export const getProcessStep = (stage: OrderWorkStage): Step => {
  switch (stage) {
    case 'payment': return 1
    case 'assign': return 2
    case 'arranging':
    case 'photo_in': return 3
    case 'handover':
    case 'delivering': return 4
    default: return 5
  }
}

const whenText = (at: Date | null, copy: Copy): string => {
  if (!at) return copy('No time set', 'Belum ada jam')
  const now = nowInJakarta()
  const day = getLocalDateString(at)
  if (day === getLocalDateString(now)) return hhmm(at)
  if (day === getLocalDateString(addDays(now, 1))) return copy(`Tomorrow ${hhmm(at)}`, `Besok ${hhmm(at)}`)
  return `${at.getDate()} ${copy(MONTHS_EN[at.getMonth()], MONTHS_ID[at.getMonth()])} ${hhmm(at)}`
}

export const OrderProcessView: FC<{ viewModel: OrderDetailsViewModel; onShowFullDetails: () => void }> = ({ viewModel, onShowFullDetails }) => {
  const copy = useBilingualCopy()
  const role = useUserStore((state) => state.role)
  const canEditDelivery = role === 'owner' || role === 'admin'
  const {
    order,
    formatter,
    onClose,
    itemDisplays,
    productDisplay,
    customerWhatsappNumber,
    canEdit,
    nextStatus,
    currentUserRole,
    onMoveToNextStatus,
    onOpenFloristReassignment,
    onOpenReviewRequest,
  } = viewModel

  const priority = getOrderPriority(order)
  const stage = priority.stage
  const current = getProcessStep(stage)
  const [viewStep, setViewStep] = useState<Step>(current)
  useEffect(() => { setViewStep(current) }, [current, order.orderNumber])

  const isDelivery = order.fulfillment === 'delivery'
  const paid = isOrderFullyPaid(order)
  const method = order.paymentChannel === 'qris' ? 'QRIS' : order.paymentMethod === 'cash' ? copy('Cash', 'Tunai') : order.paymentMethod === 'transfer' ? 'Transfer' : copy('Not chosen', 'Belum dipilih')
  const florist = order.florist?.trim()
  const canAct = canEdit && Boolean(nextStatus)
  const isFinished = order.status === 'delivered' || order.status === 'picked_up'
  const items = order.items?.length
    ? order.items
    : [{ id: `${order.orderNumber}-line`, productName: productDisplay.name, quantity: 1, unitPriceIdr: order.itemsSubtotalIdr ?? order.totalIdr, flowerRecipeSnapshot: undefined }]
  const recipe = items.flatMap((item) => item.flowerRecipeSnapshot ?? [])
  const productLine = items.map((item, index) => {
    const display = itemDisplays[item.id] ?? (index === 0 ? productDisplay : undefined)
    return `${item.quantity > 1 ? `${item.quantity}× ` : ''}${display?.name || item.productName || copy('Custom order', 'Pesanan khusus')}`
  }).join(', ')

  const handoverLabel = isDelivery ? copy('Send', 'Kirim') : copy('Hand over', 'Serahkan')
  const steps: Array<{ n: Step; title: string; short?: string; sub: string }> = [
    { n: 1, title: copy('Payment', 'Pembayaran'), short: copy('Pay', 'Bayar'), sub: paid ? copy(`Paid, ${method}`, `Lunas, ${method}`) : copy('Not paid yet', 'Belum lunas') },
    { n: 2, title: copy('Florist', 'Perangkai'), sub: florist ?? copy('Not chosen', 'Belum dipilih') },
    { n: 3, title: copy('Arranging', 'Dirangkai'), sub: current > 3 ? copy('Ready', 'Siap') : order.finishPhotoUrl ? copy('Photo in', 'Foto masuk') : current === 3 ? copy('In progress', 'Sedang dikerjakan') : '' },
    { n: 4, title: handoverLabel, sub: `${isDelivery ? copy('Delivery', 'Antar') : copy('Pickup', 'Ambil')} ${whenText(priority.scheduledAt, copy)}` },
    { n: 5, title: copy('Done', 'Selesai'), sub: isFinished ? (order.status === 'picked_up' ? copy('Picked up', 'Sudah diambil') : copy('Delivered', 'Terkirim')) : copy('Ask for a review', 'Minta ulasan') },
  ]

  // The one next action, with the label of what it does (existing flows behind onMoveToNextStatus).
  const primaryLabel = (() => {
    switch (stage) {
      case 'payment': return 'Konfirmasi Pembayaran'
      case 'assign': return copy('Assign & start', 'Tugaskan & mulai')
      case 'arranging':
      case 'photo_in': return copy('Mark ready', 'Tandai siap')
      case 'handover': return isDelivery ? copy('Start delivery', 'Mulai kirim') : copy('Complete pickup', 'Sudah diambil')
      case 'delivering': return copy('Mark delivered', 'Tandai terkirim')
      default: return ''
    }
  })()
  const showReviewRequest = isFinished && Boolean(order.id)

  const urgent = priority.needsAdmin && priority.urgent && priority.minutesLeft !== null

  return (
    <>
      <header className="-mx-5 px-5 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <OrderStagePill stage={stage} order={order} copy={copy} />
            <span className="truncate text-xs text-muted-foreground">{order.orderNumber}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasOrderMoreActions(viewModel) && <OrderMoreActionsMenu viewModel={viewModel} />}
            <button
              type="button"
              onClick={onClose}
              aria-label={copy('Close', 'Tutup')}
              className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold tracking-tight text-foreground">{order.customerName}</h2>
            <p className="mt-0.5 truncate text-[15px] text-foreground/80">{productLine}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-base font-semibold tabular-nums text-foreground">
              {`${isDelivery ? copy('Delivery', 'Antar') : copy('Pickup', 'Ambil')} ${whenText(priority.scheduledAt, copy)}`}
            </p>
            {urgent && (
              <span className="mt-0.5 inline-block rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-white">
                {formatMinutesLeft(priority.minutesLeft ?? 0, copy)}
              </span>
            )}
          </div>
        </div>

        <ol aria-label={copy(`Step ${current} of 5`, `Langkah ${current} dari 5`)} className="mt-4 grid grid-cols-5">
          {steps.map((step) => {
            const done = step.n < current || (step.n === 5 && isFinished)
            const isCurrent = step.n === current && !done
            const reachable = step.n <= current
            const selected = step.n === viewStep
            return (
              <li key={step.n} className="flex min-w-0 flex-col gap-2">
                <div aria-hidden="true" className="flex items-center">
                  <span
                    className={`flex size-[22px] shrink-0 items-center justify-center rounded-full ${
                      done ? 'bg-primary text-primary-foreground' : isCurrent ? 'shadow-[inset_0_0_0_6px_hsl(var(--primary))]' : 'shadow-[inset_0_0_0_2px_hsl(var(--border))]'
                    }`}
                  >
                    {done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  {step.n < 5 && <span className={`mx-1.5 h-0.5 flex-1 rounded-full ${step.n < current ? 'bg-primary' : 'bg-border'}`} />}
                </div>
                <button
                  type="button"
                  disabled={!reachable}
                  aria-pressed={selected}
                  onClick={() => setViewStep(step.n)}
                  className={`min-w-0 border-b-2 pb-3 pr-2 text-left transition disabled:cursor-default ${selected ? 'border-foreground' : 'border-transparent'}`}
                >
                  <span className={`block truncate text-[13px] sm:text-sm ${isCurrent || selected ? 'font-semibold' : 'font-medium'} ${reachable ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.short ? <><span className="sm:hidden">{step.short}</span><span className="hidden sm:inline">{step.title}</span></> : step.title}
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{step.sub}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </header>

      <div className="-mx-5 min-h-0 flex-1 overflow-y-auto border-t border-border/60 px-5 pb-6 pt-5 sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <section aria-label={steps[viewStep - 1].title} className="flex min-w-0 flex-1 flex-col gap-4">
            {viewStep === 1 && (
              paid ? (
                <>
                  <h3 className="text-xl font-semibold text-foreground">{copy('Paid in full', 'Pembayaran lunas')}</h3>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 p-4">
                    <div>
                      <p className="text-lg font-semibold tabular-nums text-foreground">Rp {formatter.format(order.paidAmountIdr ?? order.totalIdr)}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{method}</p>
                    </div>
                    {order.paymentProofUrl && canViewPaymentProof(currentUserRole, order) && (
                      <OrderPaymentProofButton paymentProofPath={order.paymentProofUrl} />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{copy('Record the payment', 'Catat pembayaran')}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {copy(
                        `Bill Rp ${formatter.format(order.totalIdr)}, ${method}. Attach the proof for transfer or QRIS. The order is made once it is paid.`,
                        `Tagihan Rp ${formatter.format(order.totalIdr)}, ${method}. Lampirkan bukti untuk transfer atau QRIS. Pesanan dirangkai setelah lunas.`,
                      )}
                    </p>
                  </div>
                  {(order.paidAmountIdr ?? 0) > 0 && (
                    <p className="rounded-2xl bg-muted/60 p-4 text-sm text-foreground">
                      {copy(`Paid so far Rp ${formatter.format(order.paidAmountIdr ?? 0)}`, `Sudah dibayar Rp ${formatter.format(order.paidAmountIdr ?? 0)}`)}
                    </p>
                  )}
                </>
              )
            )}

            {viewStep === 2 && (
              <>
                <h3 className="text-xl font-semibold text-foreground">
                  {florist ? copy(`Arranged by ${florist}`, `Dirangkai oleh ${florist}`) : copy('Choose the florist', 'Pilih perangkai')}
                </h3>
                <div className="divide-y divide-border/60 rounded-2xl ring-1 ring-border/60">
                  {items.map((item, index) => {
                    const display = itemDisplays[item.id] ?? (index === 0 ? productDisplay : undefined)
                    return (
                      <div key={item.id} className="flex items-center gap-3.5 p-3">
                        {display?.imageUrl ? (
                          <img src={display.imageUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-border/40" />
                        ) : (
                          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Package2 className="size-5" /></span>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{display?.name || item.productName}</p>
                          <p className="text-[13px] text-muted-foreground">{`${item.quantity} ×`}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {florist && canEdit && current < 5 && (
                  <button type="button" onClick={onOpenFloristReassignment} className="inline-flex h-10 w-fit items-center rounded-full bg-muted px-4 text-sm font-medium text-foreground transition hover:bg-muted/70">
                    {copy('Change florist', 'Ganti perangkai')}
                  </button>
                )}
              </>
            )}

            {viewStep === 3 && (
              <>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {order.finishPhotoUrl ? copy('Finished', 'Selesai dirangkai') : copy('Being arranged', 'Sedang dirangkai')}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.finishPhotoUrl
                      ? copy('The florist uploaded the finish photo.', 'Perangkai sudah mengunggah foto hasil.')
                      : florist
                        ? copy(`Waiting for ${florist}'s finish photo. You can also add it yourself.`, `Menunggu foto hasil dari ${florist}. Admin juga bisa mengunggahnya.`)
                        : copy('Waiting for the finish photo.', 'Menunggu foto hasil.')}
                  </p>
                </div>
                {order.finishPhotoUrl && (
                  <img src={order.finishPhotoUrl} alt={copy('Finish photo', 'Foto hasil')} className="max-h-[340px] w-full rounded-2xl object-cover ring-1 ring-border/50 sm:w-auto sm:max-w-[420px]" />
                )}
              </>
            )}

            {viewStep === 4 && (
              <>
                <h3 className="text-xl font-semibold text-foreground">
                  {order.status === 'delivering'
                    ? copy('On the way', 'Sedang diantar')
                    : isDelivery
                      ? copy('Send the order', 'Kirim pesanan')
                      : copy('Hand over to the customer', 'Serahkan ke pelanggan')}
                </h3>
                <div className="rounded-2xl bg-muted/60 p-4 text-sm">
                  {isDelivery ? (
                    <OrderDeliveryDestination order={order} canEdit={canEditDelivery} />
                  ) : (
                    <p className="text-foreground">{copy(`Picked up at ${order.branch}.`, `Diambil di ${order.branch}.`)}</p>
                  )}
                </div>
                {current === 4 && (
                  <p className="text-[13px] text-muted-foreground">
                    {copy('The customer gets the WhatsApp notice in the next step.', 'Pesan WhatsApp untuk pelanggan disiapkan setelah tombol ditekan.')}
                  </p>
                )}
              </>
            )}

            {viewStep === 5 && (
              <>
                <h3 className="text-xl font-semibold text-foreground">{isFinished ? copy('Order finished', 'Pesanan selesai') : copy('Done', 'Selesai')}</h3>
                {showReviewRequest ? (
                  <>
                    <button type="button" onClick={onOpenReviewRequest} className="inline-flex h-10 w-fit items-center gap-2 rounded-full bg-success px-4 text-sm font-semibold text-white shadow-ios-sm">
                      <MessageCircle className="size-3.5" />
                      {copy('Send review request', 'Kirim permintaan ulasan')}
                    </button>
                    <StaffReviewHistory orderId={order.id as string} title={copy('Customer review', 'Ulasan pelanggan')} emptyLabel={copy('No review yet.', 'Belum ada ulasan.')} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{copy('Opens once the order is delivered or picked up.', 'Terbuka setelah pesanan terkirim atau diambil.')}</p>
                )}
              </>
            )}
          </section>

          <aside aria-label={copy('Summary', 'Ringkasan')} className="flex flex-col gap-4 lg:w-[300px] lg:shrink-0">
            <OrderNoteBlock order={order} compact />
            {recipe.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">{copy('Recipe', 'Resep')}</p>
                <p className="mt-0.5 text-sm leading-6 text-foreground">
                  {recipe.map((flower) => `${flower.flowerName} ${flower.quantity} ${flower.unit === 'bunch' ? 'ikat' : 'tangkai'}`).join(', ')}
                </p>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 border-t border-border/60 pt-4 text-sm">
              <dt className="text-muted-foreground">{copy('Payment', 'Bayar')}</dt>
              <dd className={`text-right font-semibold ${paid ? 'text-success' : 'text-destructive'}`}>{paid ? copy('Paid', 'Lunas') : copy('Not paid', 'Belum lunas')}</dd>
              {viewStep !== 1 && paid && order.paymentProofUrl && canViewPaymentProof(currentUserRole, order) && (
                <dd className="col-span-2 -mt-1 flex justify-end"><OrderPaymentProofButton paymentProofPath={order.paymentProofUrl} /></dd>
              )}
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-right font-medium tabular-nums text-foreground">Rp {formatter.format(order.totalIdr)}</dd>
              <dt className="text-muted-foreground">{copy('Florist', 'Perangkai')}</dt>
              <dd className="truncate text-right font-medium text-foreground">{florist ?? '—'}</dd>
              <dt className="text-muted-foreground">{copy('Customer', 'Pelanggan')}</dt>
              <dd className="text-right">
                {customerWhatsappNumber ? (
                  <a href={buildWhatsAppLink(customerWhatsappNumber, '')} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{customerWhatsappNumber}</a>
                ) : '—'}
              </dd>
            </dl>
          </aside>
        </div>
      </div>

      <footer className="safe-area-bottom -mx-5 -mb-4 flex shrink-0 flex-col gap-1.5 border-t border-border/60 bg-surface-footer px-5 pb-3 pt-3 sm:-mx-6 sm:-mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:rounded-b-2xl sm:px-6">
        {canAct && primaryLabel && (
          <button
            type="button"
            onClick={onMoveToNextStatus}
            className="inline-flex h-12 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90 sm:order-2 sm:h-11 sm:w-auto"
          >
            {primaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onShowFullDetails}
          className="inline-flex h-11 w-fit items-center whitespace-nowrap rounded-full px-4 text-sm font-medium text-foreground/80 transition hover:bg-muted sm:order-1"
        >
          {copy('Full details', 'Detail lengkap')}
        </button>
      </footer>
    </>
  )
}
