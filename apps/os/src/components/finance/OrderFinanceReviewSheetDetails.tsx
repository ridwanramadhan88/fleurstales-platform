import type { FC } from 'react'
import { AlertTriangle, CheckCircle2, Clock, ImageIcon, MapPin, MessageCircle, Smartphone, Truck, User } from 'lucide-react'
import { SOURCE_LABELS } from '../orders/orderTableLabels'
import { getActualPickupLabel, getDisplayScheduleLabel, getRequestedPickupLabel } from '../orders/orderTableFormatters'
import { formatIdrCurrency } from '../../lib/formatters'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'
import { OrderFinanceReviewProductSummary } from './OrderFinanceReviewProductSummary'
import { OrderPaymentProofFinanceCard } from '../orders/OrderPaymentProofFinanceCard'

type OrderFinanceReviewSheetDetailsProps = Pick<
  OrderFinanceReviewSheetViewModel,
  'order' | 'productDisplay' | 'itemDisplays'
>

const cardClass = 'rounded-2xl bg-surface-card p-4 ring-1 ring-border/60'

const formatVerifiedAt = (value?: string): string => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const OrderFinanceReviewSheetDetails: FC<OrderFinanceReviewSheetDetailsProps> = ({
  order,
  productDisplay,
  itemDisplays,
}) => {
  const paidAmount = order.paidAmountIdr ?? (order.paymentStatus === 'paid' ? order.totalIdr : 0)
  const remainingBalance = Math.max(0, order.totalIdr - paidAmount)
  const difference = paidAmount - order.totalIdr
  const latestPayment = [...(order.paymentHistory ?? [])]
    .filter((event) => event.type === 'payment_received' || event.type === 'payment_status_adjusted')
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  const paymentMethod = latestPayment?.method ?? order.paymentMethod
  const paymentMismatch =
    (order.paymentStatus === 'paid' && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === 'partial' && (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === 'unpaid' && paidAmount > 0)
  const missingProof = paymentMethod === 'transfer' && !order.paymentProofUrl
  const paymentReady = order.paymentStatus === 'paid' && !paymentMismatch && !missingProof
  const differenceLabel = difference === 0
    ? formatIdrCurrency(0)
    : `${difference > 0 ? '+' : '−'}${formatIdrCurrency(Math.abs(difference))}`

  return (
    <div className="space-y-5">
      <section className={cardClass + ' space-y-4'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Bukti transfer</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {paymentMethod === 'transfer' ? 'Bukti pembayaran pelanggan' : 'Pembayaran tunai'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${paymentReady ? 'bg-success/10 text-success ring-1 ring-success/20' : 'bg-warning/10 text-warning ring-1 ring-warning/20'}`}>
            {paymentReady ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {paymentReady ? 'Pembayaran cocok' : 'Perlu diperiksa'}
          </span>
        </div>

        {paymentMethod === 'transfer' ? (
          order.paymentProofUrl ? (
            <OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} />
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-3 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Bukti transfer tidak ditemukan</p>
                <p className="mt-0.5 text-xs text-warning/90">Pesanan belum dapat direkonsiliasi sampai bukti pembayaran tersedia.</p>
              </div>
            </div>
          )
        ) : (
          <div className="rounded-xl bg-surface-panel px-3 py-3 text-sm text-foreground/90">
            Tidak ada bukti transfer untuk pembayaran cash.
          </div>
        )}

        <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Diverifikasi oleh</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{latestPayment?.actorName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Waktu verifikasi</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatVerifiedAt(latestPayment?.occurredAt)}</p>
          </div>
        </div>
      </section>

      <section className={cardClass + ' space-y-4'}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Ringkasan pembayaran</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {paymentMethod === 'transfer' ? 'Bank transfer' : paymentMethod === 'cash' ? 'Cash' : 'Metode pembayaran belum tercatat'}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-2xs font-semibold ${paymentReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
            {paymentReady ? 'Cocok' : 'Tidak cocok'}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-panel p-3">
            <p className="text-xs font-medium text-muted-foreground">Seharusnya</p>
            <p className="mt-1 text-base font-semibold text-foreground">{formatIdrCurrency(order.totalIdr)}</p>
          </div>
          <div className="rounded-xl bg-surface-panel p-3">
            <p className="text-xs font-medium text-muted-foreground">Tercatat dibayar</p>
            <p className="mt-1 text-base font-semibold text-foreground">{formatIdrCurrency(paidAmount)}</p>
          </div>
          <div className={`rounded-xl p-3 ${paymentMismatch ? 'bg-warning/10' : 'bg-success/10'}`}>
            <p className={`text-xs font-medium ${paymentMismatch ? 'text-warning' : 'text-success'}`}>Selisih</p>
            <p className={`mt-1 text-base font-semibold ${paymentMismatch ? 'text-warning' : 'text-success'}`}>{differenceLabel}</p>
          </div>
        </div>

        {order.paymentStatus !== 'paid' && (
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Pembayaran belum lunas</p>
              <p className="mt-0.5 text-xs text-warning/90">Sisa pembayaran {formatIdrCurrency(remainingBalance)}.</p>
            </div>
          </div>
        )}

        {paymentMismatch && order.paymentStatus === 'paid' && (
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-5">Jumlah yang tercatat berbeda dari total pesanan. Periksa sebelum rekonsiliasi.</p>
          </div>
        )}

        {(latestPayment?.reference || latestPayment?.note) && (
          <div className="grid gap-3 border-t border-border/60 pt-3 text-sm sm:grid-cols-2">
            {latestPayment.reference && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Referensi pembayaran</p>
                <p className="mt-1 break-all font-medium text-foreground">{latestPayment.reference}</p>
              </div>
            )}
            {latestPayment.note && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Catatan pembayaran</p>
                <p className="mt-1 text-foreground/90">{latestPayment.note}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
        <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden">
          <span className="flex items-center justify-between gap-3">
            Detail pesanan
            <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Lihat</span>
            <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Tutup</span>
          </span>
        </summary>

        <div className="space-y-5 border-t border-border/60 p-4">
          <OrderFinanceReviewProductSummary order={order} productDisplay={productDisplay} itemDisplays={itemDisplays} />

          {order.finishPhotoUrl && (
            <section className={cardClass + ' space-y-3'}>
              <div className="flex items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><ImageIcon className="size-4" /></span>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Foto hasil selesai</p>
                  <p className="text-sm font-medium text-foreground">Hasil siap pelanggan</p>
                </div>
              </div>
              <a href={order.finishPhotoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-muted/20 ring-1 ring-border/60">
                <img src={order.finishPhotoUrl} alt={`Finished product for ${order.orderNumber}`} className="max-h-[28rem] w-full object-contain" />
              </a>
            </section>
          )}

          <section className={cardClass + ' space-y-4'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><User className="size-4" /></span>
                <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">Florist</p><p className="truncate text-sm font-medium text-foreground/90">{order.florist ?? 'Belum ditugaskan'}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{order.source === 'whatsapp' ? <MessageCircle className="size-4" /> : <Smartphone className="size-4" />}</span>
                <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">Sumber</p><p className="truncate text-sm font-medium text-foreground/90">{SOURCE_LABELS[order.source]}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{order.fulfillment === 'delivery' ? <Truck className="size-4" /> : <MapPin className="size-4" />}</span>
                <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">Fulfillment</p><p className="truncate text-sm font-medium text-foreground/90">{order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Clock className="size-4" /></span>
                <div className="min-w-0 space-y-2">
                  {order.fulfillment === 'pickup' ? (
                    <><div><p className="text-xs font-semibold text-muted-foreground">Requested pickup</p><p className="text-sm font-medium text-foreground/90">{getRequestedPickupLabel(order) ?? '—'}</p></div>{order.status === 'picked_up' && <div><p className="text-xs font-semibold text-muted-foreground">Actual pickup</p><p className="text-sm font-medium text-foreground/90">{getActualPickupLabel(order) ?? '—'}</p></div>}</>
                  ) : (
                    <div><p className="text-xs font-semibold text-muted-foreground">Delivery schedule</p><p className="text-sm font-medium text-foreground/90">{getDisplayScheduleLabel(order) ?? '—'}</p></div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </details>
    </div>
  )
}
