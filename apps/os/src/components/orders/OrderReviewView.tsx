/**
 * @file OrderReviewView.tsx
 * @description The order window while an order still waits for the Admin to
 * confirm it ("Tinjau"). Everything needed to judge the order is open at
 * once: when, how much, how it is paid, the note and greeting card, what was
 * ordered, and where it goes. One main action: confirm and tell the customer.
 */

import { OrderDeliveryDestination } from './OrderDeliveryDestination'
import { useUserStore } from '../../store/userStore'
import type { FC } from 'react'
import { MessageCircle, Package2, X } from 'lucide-react'
import type { OrderSource } from '../../types/orders'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { addDays, getLocalDateString, nowInJakarta } from '../../domain/orderTimingDomain'
import { PRODUCTION_LEAD_MINUTES, getOrderPriority } from '../../domain/orderWorkStageDomain'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { OrderStagePill } from './OrderStagePill'
import { OrderNoteBlock } from './OrderNoteBlock'
import { formatMinutesLeft } from './orderWorkStagePresentation'
import { formatOrderCreatedAtLabel } from './orderTableFormatters'
import { buildWhatsAppLink } from './orderTableWhatsApp'

type Copy = (en: string, id: string) => string

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}`

const sourceLabel = (source: OrderSource, copy: Copy) =>
  source === 'customer_app' ? copy('online shop', 'toko online') : source === 'whatsapp' ? 'WhatsApp' : copy('walk-in', 'datang ke toko')

const scheduleText = (at: Date | null, copy: Copy): string => {
  if (!at) return copy('Not set', 'Belum diatur')
  const now = nowInJakarta()
  const day = getLocalDateString(at)
  if (day === getLocalDateString(now)) return copy(`Today, ${hhmm(at)}`, `Hari ini, ${hhmm(at)}`)
  if (day === getLocalDateString(addDays(now, 1))) return copy(`Tomorrow, ${hhmm(at)}`, `Besok, ${hhmm(at)}`)
  return `${at.getDate()} ${copy(MONTHS_EN[at.getMonth()], MONTHS_ID[at.getMonth()])}, ${hhmm(at)}`
}

const Stat: FC<{ label: string; value: string; sub?: string; subClass?: string }> = ({ label, value, sub, subClass = 'text-muted-foreground' }) => (
  <div className="min-w-0 rounded-2xl bg-muted/60 px-3.5 py-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 truncate text-base font-semibold tabular-nums text-foreground">{value}</dd>
    {sub && <dd className={`mt-0.5 text-xs ${subClass}`}>{sub}</dd>}
  </div>
)

export const OrderReviewView: FC<{ viewModel: OrderDetailsViewModel }> = ({ viewModel }) => {
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
    isCancellable,
    isPendingStorefrontConfirmation,
    storefrontDecisionBusy,
    storefrontPreviewLoading,
    nextStatus,
    setIsEditing,
    onCancelOrder,
    onMoveToNextStatus,
    onOpenStorefrontCancel,
    onOpenStorefrontConfirmPreview,
  } = viewModel

  const priority = getOrderPriority(order)
  const isDelivery = order.fulfillment === 'delivery'
  const deliveryFee = order.deliveryFeeIdr ?? 0
  const discount = order.discountIdr ?? 0
  const method = order.paymentChannel === 'qris' ? 'QRIS' : order.paymentMethod === 'cash' ? copy('Cash', 'Tunai') : order.paymentMethod === 'transfer' ? 'Transfer' : copy('Not chosen', 'Belum dipilih')
  const items = order.items?.length
    ? order.items
    : [{ id: `${order.orderNumber}-line`, productName: productDisplay.name, quantity: 1, unitPriceIdr: order.itemsSubtotalIdr ?? order.totalIdr, flowerRecipeSnapshot: undefined }]
  const busy = storefrontDecisionBusy !== null || storefrontPreviewLoading
  const canConfirm = isPendingStorefrontConfirmation || (canEdit && nextStatus === 'confirmed')
  const canReject = isPendingStorefrontConfirmation || (canEdit && isCancellable)
  const confirm = () => {
    if (isPendingStorefrontConfirmation) void onOpenStorefrontConfirmPreview()
    else onMoveToNextStatus()
  }
  const reject = () => {
    if (isPendingStorefrontConfirmation) onOpenStorefrontCancel()
    else onCancelOrder()
  }
  const urgentSub = priority.urgent && priority.minutesLeft !== null
  const scheduleSub = priority.minutesLeft === null
    ? undefined
    : urgentSub
      ? formatMinutesLeft(priority.minutesLeft + PRODUCTION_LEAD_MINUTES, copy)
      : undefined

  return (
    <>
      <header className="-mx-5 border-b border-border/70 px-5 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <OrderStagePill stage="confirm" order={order} copy={copy} />
            <span className="truncate text-xs text-muted-foreground">
              {`${order.orderNumber} · ${copy('from', 'dari')} ${sourceLabel(order.source, copy)} · ${formatOrderCreatedAtLabel(order.createdAtLabel)}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy('Close', 'Tutup')}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <X className="size-4" />
          </button>
        </div>
        <h2 className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground">{order.customerName}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <Stat
            label={isDelivery ? copy('Delivery', 'Antar') : copy('Pickup', 'Ambil')}
            value={scheduleText(priority.scheduledAt, copy)}
            sub={scheduleSub}
            subClass="font-semibold text-destructive"
          />
          <Stat
            label="Total"
            value={`Rp ${formatter.format(order.totalIdr)}`}
            sub={deliveryFee > 0 ? copy(`Includes delivery Rp ${formatter.format(deliveryFee)}`, `Termasuk ongkir Rp ${formatter.format(deliveryFee)}`) : discount > 0 ? copy(`Discount Rp ${formatter.format(discount)}`, `Diskon Rp ${formatter.format(discount)}`) : undefined}
          />
          <div className="col-span-2 sm:col-span-1">
            <Stat
              label={copy('Payment', 'Pembayaran')}
              value={method}
              sub={order.paymentProofUrl ? copy('Proof attached', 'Bukti terlampir') : copy('Checked after confirming', 'Dicek setelah konfirmasi')}
            />
          </div>
        </dl>
      </header>

      <div className="-mx-5 min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <OrderNoteBlock order={order} />

            <section aria-label={copy('What was ordered', 'Yang dipesan')} className="space-y-3">
              <h3 className="text-[15px] font-semibold text-foreground">{copy('What was ordered', 'Yang dipesan')}</h3>
              <div className="divide-y divide-border/60 rounded-2xl ring-1 ring-border/60">
                {items.map((item, index) => {
                  const display = itemDisplays[item.id] ?? (index === 0 ? productDisplay : undefined)
                  const recipe = item.flowerRecipeSnapshot ?? []
                  return (
                    <div key={item.id} className="flex items-start gap-3.5 p-3">
                      {display?.imageUrl ? (
                        <img src={display.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-border/40" />
                      ) : (
                        <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Package2 className="size-5" /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-base font-semibold leading-6 text-foreground">{display?.name || item.productName || copy('Custom order', 'Pesanan khusus')}</p>
                          <p className="shrink-0 font-semibold tabular-nums text-foreground">Rp {formatter.format(item.unitPriceIdr * item.quantity)}</p>
                        </div>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">{`${item.quantity} × Rp ${formatter.format(item.unitPriceIdr)}`}</p>
                        {recipe.length > 0 && (
                          <p className="mt-1.5 text-[13px] leading-5 text-foreground/80">
                            {recipe.map((flower) => `${flower.flowerName} ${flower.quantity} ${flower.unit === 'bunch' ? 'ikat' : 'tangkai'}`).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <aside aria-label={copy('Customer and destination', 'Pelanggan dan tujuan')} className="flex flex-col gap-4 rounded-2xl bg-muted/60 p-4 lg:w-[300px] lg:shrink-0">
            {isDelivery ? (
              <OrderDeliveryDestination order={order} canEdit={canEditDelivery} />
            ) : (
              <div>
                <p className="text-xs text-muted-foreground">{copy('Pickup at', 'Ambil di')}</p>
                <p className="mt-0.5 text-[15px] font-semibold text-foreground">{order.branch}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">{copy('Ordered by', 'Pemesan')}</p>
              <p className="mt-0.5 text-[15px] font-semibold text-foreground">{order.customerName}</p>
              {customerWhatsappNumber ? (
                <a href={buildWhatsAppLink(customerWhatsappNumber, '')} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <MessageCircle className="size-3.5" />
                  {customerWhatsappNumber}
                </a>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">{copy('No phone number', 'Belum ada nomor HP')}</p>
              )}
            </div>
            <p className="border-t border-border/70 pt-3 text-[13px] leading-5 text-muted-foreground">
              {copy('After confirming, the order moves to the payment step.', 'Setelah dikonfirmasi, pesanan pindah ke langkah konfirmasi pembayaran.')}
            </p>
          </aside>
        </div>
      </div>

      <footer className="safe-area-bottom -mx-5 -mb-4 flex shrink-0 flex-col gap-1.5 border-t border-border/60 bg-surface-footer px-5 pb-3 pt-3 sm:-mx-6 sm:-mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:rounded-b-2xl sm:px-6">
        {canConfirm && (
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center whitespace-nowrap rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90 disabled:opacity-60 sm:order-2 sm:h-11 sm:w-auto"
          >
            {storefrontPreviewLoading ? copy('Preparing…', 'Menyiapkan…') : isPendingStorefrontConfirmation ? copy('Confirm and tell the customer', 'Konfirmasi dan kabari pelanggan') : copy('Confirm order', 'Konfirmasi pesanan')}
          </button>
        )}
        <div className="flex items-center justify-between gap-1 sm:order-1 sm:justify-start">
          {canReject && (
            <button type="button" onClick={reject} disabled={busy} className="inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50">
              {copy('Reject', 'Tolak')}
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => setIsEditing(true)} disabled={busy} className="inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium text-foreground/80 transition hover:bg-muted disabled:opacity-50">
              {copy('Edit details', 'Ubah detail')}
            </button>
          )}
        </div>
      </footer>
    </>
  )
}
