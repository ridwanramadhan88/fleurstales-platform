import type { FC, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, MessageCircle, PackageSearch, Search } from 'lucide-react'
import { StorefrontBrand } from '../components/storefront/StorefrontBrand'
import { StorefrontContainer } from '../components/storefront/StorefrontContainer'
import { StorefrontCopyButton } from '../components/storefront/StorefrontCopyButton'
import { StorefrontReviewForm } from '../components/storefront/StorefrontReviewForm'
import {
  getPublicOrderTracking,
  verifyPublicOrderTrackingAccess,
  type PublicOrderStatusSummary,
  type PublicOrderTrackingDetails,
} from '../data/orderTracking'
import { buildStorefrontTrackingPath } from '../data/shared/storefrontCheckoutResult'
import { requestStorefrontNavigation } from '../lib/storefrontNavigation'
import type { OrderStatus } from '../data/shared/databaseTypes'

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_verification: 'Menunggu konfirmasi',
  confirmed: 'Order dikonfirmasi',
  processing: 'Sedang diproses',
  ready: 'Siap',
  delivering: 'Dalam pengiriman',
  delivered: 'Selesai',
  picked_up: 'Selesai',
  cancelled: 'Dibatalkan',
  failed: 'Perlu perhatian',
}

const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending_verification: 'Complete payment if needed. Admin will confirm the order before production starts.',
  confirmed: 'Your order is confirmed and scheduled for production.',
  processing: 'Your flowers are being prepared by the Fleurstales team.',
  ready: 'Your flowers are ready. Check the finished photo and fulfillment details below.',
  delivering: 'Your flowers are on the way to the delivery destination.',
  delivered: 'Your order is complete. We would love to hear how it went.',
  picked_up: 'Your order has been picked up. We would love to hear how it went.',
  cancelled: 'This order has been closed. See the reason below or contact Admin if you need help.',
  failed: 'This order needs attention. Please contact Admin for help.',
}

const DELIVERY_STEPS: OrderStatus[] = ['pending_verification', 'confirmed', 'processing', 'ready', 'delivering', 'delivered']
const PICKUP_STEPS: OrderStatus[] = ['pending_verification', 'confirmed', 'processing', 'ready', 'picked_up']
const CLOSED_STATUSES: OrderStatus[] = ['cancelled', 'failed']
const COMPLETE_STATUSES: OrderStatus[] = ['delivered', 'picked_up']

const displaySchedule = (order: PublicOrderStatusSummary | PublicOrderTrackingDetails): string => {
  const date = order.fulfillment === 'pickup' ? order.requestedPickupDate ?? order.scheduleDate : order.scheduleDate
  const time = order.fulfillment === 'pickup' ? order.requestedPickupTime ?? order.scheduleTime : order.scheduleTime
  return [date, time?.slice(0, 5)].filter(Boolean).join(' · ') || 'Schedule not set'
}

const StatusTimeline: FC<Pick<PublicOrderStatusSummary, 'status' | 'fulfillment'>> = ({ status, fulfillment }) => {
  const steps = fulfillment === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS
  const currentIndex = steps.indexOf(status)
  const terminalIssue = CLOSED_STATUSES.includes(status)

  return (
    <ol className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const reached = !terminalIssue && currentIndex >= index
        const current = status === step
        return (
          <li key={step} className="flex shrink-0 items-center gap-2">
            <span className={`flex size-6 items-center justify-center rounded-full border ${reached ? 'border-[#00813f] bg-[#00813f] text-white' : 'border-black/15 bg-white/30 text-transparent'}`}>
              {reached ? <Check className="size-3" /> : null}
            </span>
            <span className={`sf-type-1 whitespace-nowrap ${current ? 'font-semibold text-black' : 'font-medium text-black/45'}`}>{STATUS_LABELS[step]}</span>
            {index < steps.length - 1 ? <span className="h-px w-5 bg-black/10" aria-hidden /> : null}
          </li>
        )
      })}
      {terminalIssue ? (
        <li className="shrink-0 rounded-full border border-red-700/20 bg-red-700/[0.06] px-3 py-1.5">
          <span className="sf-type-1 font-semibold text-red-800">{STATUS_LABELS[status]}</span>
        </li>
      ) : null}
    </ol>
  )
}

const normalizeWhatsappForLink = (value?: string | null): string => {
  const digits = (value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

const productSummary = (details: PublicOrderTrackingDetails): string => {
  const first = details.items[0]?.name ?? 'order'
  return details.items.length > 1 ? `${first} +${details.items.length - 1} item` : first
}

const buildContactAdminHref = (details: PublicOrderTrackingDetails): string | null => {
  const number = normalizeWhatsappForLink(details.contactWhatsapp)
  if (!number) return null
  const message = `Halo ka, mau tanya untuk orderan ${details.orderNumber} - ${productSummary(details)} atas nama ${details.customerName}`
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

interface StorefrontOrderTrackingPageProps {
  trackingId?: string
  orderNumber?: string
  legacyRoute?: boolean
}

export const StorefrontOrderTrackingPage: FC<StorefrontOrderTrackingPageProps> = ({
  trackingId,
  orderNumber,
  legacyRoute = false,
}) => {
  const [details, setDetails] = useState<PublicOrderTrackingDetails | null>(null)
  const [query, setQuery] = useState(orderNumber ?? '')
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(Boolean(trackingId))
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const TRACKING_LINK_UNAVAILABLE_MESSAGE =
    'This tracking link is no longer available. It may be incorrect, or it may have expired (links remain available for 14 days after the order is completed or closed).'

  const loadDetails = async (id: string) => {
    const result = await getPublicOrderTracking(id)
    setDetails(result)
    if (!result) throw new Error(TRACKING_LINK_UNAVAILABLE_MESSAGE)
    return result
  }

  useEffect(() => {
    if (!trackingId) {
      setDetails(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void getPublicOrderTracking(trackingId)
      .then((result) => {
        if (!active) return
        setDetails(result)
        if (!result) {
          setError(TRACKING_LINK_UNAVAILABLE_MESSAGE)
          return
        }
        if (orderNumber && result.orderNumber.toUpperCase() !== orderNumber.toUpperCase()) {
          setDetails(null)
          setError('The secure tracking link does not match this order number.')
          return
        }
        if (legacyRoute) {
          window.history.replaceState({}, '', buildStorefrontTrackingPath(result.orderNumber, trackingId))
        }
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Could not load this order.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [legacyRoute, orderNumber, trackingId])

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedOrder = query.trim().toUpperCase()
    if (!normalizedOrder || !whatsapp.trim() || searching) return
    setSearching(true)
    setError(null)
    try {
      const access = await verifyPublicOrderTrackingAccess(normalizedOrder, whatsapp)
      if (!access) {
        setError('Order number or WhatsApp number does not match.')
        return
      }
      requestStorefrontNavigation({ path: buildStorefrontTrackingPath(access.orderNumber, access.publicTrackingId) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify this order.')
    } finally {
      setSearching(false)
    }
  }

  const scheduleLabel = useMemo(() => details ? displaySchedule(details) : null, [details])
  const contactHref = useMemo(() => details ? buildContactAdminHref(details) : null, [details])
  const showPaymentInstructions = Boolean(
    details
      && details.paymentStatus !== 'paid'
      && !CLOSED_STATUSES.includes(details.status),
  )
  const isComplete = Boolean(details && COMPLETE_STATUSES.includes(details.status))

  return (
    <div className="storefront-font min-h-screen bg-[var(--sf-cream)] text-black" data-no-translate>
      <header className="border-b border-black/10">
        <StorefrontContainer className="flex min-h-20 items-center justify-between py-4">
          <a href="/" aria-label="Fleurstales home"><StorefrontBrand showIcon={false} /></a>
          <a href="/shop" className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 sf-type-2 font-medium hover:bg-black/[0.04]">
            <ArrowLeft className="size-4" /> Back to shop
          </a>
        </StorefrontContainer>
      </header>

      <StorefrontContainer className="py-10 sm:py-14 lg:py-16">
        <main className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <p className="sf-label text-black/45">Order tracking</p>
            <h1 className="mt-3 sf-page-title font-display">Track your Fleurstales order</h1>
            {!trackingId && <p className="mt-4 sf-body text-black/60">Enter your order number and the same WhatsApp number used at checkout.</p>}
          </div>

          {trackingId ? (
            <section className="mt-8">
              {loading ? (
                <div className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-8 sf-body text-black/55">Loading order…</div>
              ) : details ? (
                <div className="space-y-5">
                  <div className="rounded-[var(--sf-radius-card)] border border-black/10 bg-[#eee4cc] p-5 sm:p-7">
                    <div>
                      <p className="sf-type-1 uppercase tracking-[0.16em] text-black/45">{details.orderNumber}</p>
                      <h2 className="mt-2 sf-type-5 font-display">{STATUS_LABELS[details.status]}</h2>
                      <p className="mt-2 sf-body text-black/60">{STATUS_DESCRIPTIONS[details.status]}</p>
                      <p className="mt-3 sf-type-2 font-medium text-black/55">{details.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {scheduleLabel}</p>
                    </div>
                    <div className="mt-6 border-t border-black/10 pt-4"><StatusTimeline status={details.status} fulfillment={details.fulfillment} /></div>
                  </div>

                  {details.finishPhotoUrl && details.status !== 'pending_verification' && details.status !== 'confirmed' && details.status !== 'processing' ? (
                    <div className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-5 sm:p-6">
                      <img
                        src={details.finishPhotoUrl}
                        alt="Order finish photo"
                        className="mx-auto aspect-[4/5] w-full max-w-[320px] rounded-2xl object-cover shadow-ios-sm ring-1 ring-border"
                      />
                      <p className="mt-3 text-center sf-type-2 text-black/60">Pesanan sudah selesai dibuat 🌸</p>
                    </div>
                  ) : null}

                  {details.cancellationReason ? (
                    <div className="rounded-[var(--sf-radius-card)] border border-red-800/15 bg-red-800/[0.05] p-5">
                      <p className="sf-label text-red-900/60">Cancellation reason</p>
                      <p className="mt-2 sf-body text-red-950">{details.cancellationReason}</p>
                    </div>
                  ) : null}

                  {showPaymentInstructions ? (
                    <section className="rounded-[var(--sf-radius-card)] border border-[#00813f]/20 bg-[#00813f]/[0.055] p-5 sm:p-6">
                      <p className="sf-label text-[#006f36]">Selesaikan pembayaran</p>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-[#00813f]/15 pb-4">
                        <span className="sf-type-2 text-black/55">Total</span>
                        <strong className="text-[2rem] font-medium leading-none">{currencyFormatter.format(details.totalIdr)}</strong>
                      </div>
                      {details.paymentAccountSnapshot ? (
                        <div className="mt-4 rounded-2xl bg-white/60 p-4">
                          <p className="sf-type-2 font-semibold">{details.paymentAccountSnapshot.bankName}</p>
                          <p className="mt-1 sf-type-1 text-black/50">a.n. {details.paymentAccountSnapshot.accountHolder}</p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="text-[1.65rem] font-medium tabular-nums">{details.paymentAccountSnapshot.accountNumber}</p>
                            <StorefrontCopyButton value={details.paymentAccountSnapshot.accountNumber} label="Copy" />
                          </div>
                        </div>
                      ) : (
                        <p className="mt-4 sf-type-2 text-black/60">Hubungi Admin untuk detail rekening pembayaran.</p>
                      )}
                      <p className="mt-4 sf-type-2 leading-6 text-black/58">Admin akan memverifikasi pembayaran sebelum produksi dimulai.</p>
                    </section>
                  ) : details.paymentStatus === 'paid' ? (
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#00813f]/15 bg-[#00813f]/[0.04] px-4 py-3">
                      <div>
                        <p className="sf-type-2 font-semibold text-[#006f36]">✓ Payment received</p>
                        <p className="mt-0.5 sf-type-1 text-black/45">No action needed from you.</p>
                      </div>
                      <p className="sf-type-3 font-semibold">{currencyFormatter.format(details.totalIdr)}</p>
                    </section>
                  ) : null}

                  {isComplete ? (
                    <section className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/45 p-5 sm:p-7">
                      <p className="sf-label text-[#00813f]">Pesanan selesai</p>
                      <h2 className="mt-2 sf-type-5 font-display">How was your order?</h2>
                      {details.reviewSubmitted ? (
                        <div className="mt-5 rounded-2xl bg-[#eee4cc] p-4 sm:p-5">
                          <p className="sf-type-3 font-semibold">Terima kasih untuk review-nya.</p>
                          {details.reviewReward ? (
                            <p className="mt-2 sf-type-2 leading-6 text-black/60">
                              {details.reviewReward.status === 'available'
                                ? `Promo ${Number(details.reviewReward.percentOff)}% untuk order berikutnya sudah aktif. Minimum order ${currencyFormatter.format(details.reviewReward.minOrderIdr)}.`
                                : 'Promo review ini sudah dipakai di order berikutnya.'}
                            </p>
                          ) : null}
                          {details.review?.note ? <p className="mt-3 sf-type-2 italic text-black/58">“{details.review.note}”</p> : null}
                        </div>
                      ) : trackingId ? (
                        <StorefrontReviewForm
                          trackingId={trackingId}
                          details={details}
                          onSubmitted={async () => { await loadDetails(trackingId) }}
                        />
                      ) : null}
                    </section>
                  ) : null}

                  <details className="group rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35">
                    <summary className="cursor-pointer list-none px-5 py-4 sf-type-3 font-semibold marker:hidden sm:px-6">
                      <span className="flex items-center justify-between gap-4">
                        Order details
                        <span className="sf-type-1 text-black/40 group-open:hidden">Show</span>
                        <span className="hidden sf-type-1 text-black/40 group-open:inline">Hide</span>
                      </span>
                    </summary>
                    <div className="space-y-6 border-t border-black/10 p-5 sm:p-6">
                      <div className="grid gap-6 lg:grid-cols-2">
                        <section>
                          <p className="sf-label text-black/45">Customer & fulfillment</p>
                          <dl className="mt-4 space-y-3 sf-body">
                            <div><dt className="text-black/45">Customer</dt><dd className="font-medium">{details.customerName}</dd></div>
                            <div><dt className="text-black/45">Branch</dt><dd className="font-medium">{details.branchName ?? details.branchId}</dd></div>
                            <div><dt className="text-black/45">Schedule</dt><dd className="font-medium">{scheduleLabel}</dd></div>
                            {details.fulfillment === 'delivery' ? (
                              <>
                                <div><dt className="text-black/45">Delivery address</dt><dd className="font-medium">{details.deliveryAddress ?? '—'}</dd></div>
                                {details.deliveryInstructions ? <div><dt className="text-black/45">Delivery note</dt><dd className="font-medium">{details.deliveryInstructions}</dd></div> : null}
                              </>
                            ) : details.branchAddress ? <div><dt className="text-black/45">Pickup address</dt><dd className="font-medium">{details.branchAddress}</dd></div> : null}
                          </dl>
                        </section>

                        <section>
                          <p className="sf-label text-black/45">Order total</p>
                          <dl className="mt-4 space-y-3 sf-body">
                            <div className="flex justify-between gap-4"><dt className="text-black/45">Items</dt><dd>{currencyFormatter.format(details.itemsSubtotalIdr)}</dd></div>
                            <div className="flex justify-between gap-4"><dt className="text-black/45">Delivery</dt><dd>{currencyFormatter.format(details.deliveryFeeIdr)}</dd></div>
                            {details.discountIdr > 0 ? <div className="flex justify-between gap-4"><dt className="text-black/45">Discount</dt><dd>-{currencyFormatter.format(details.discountIdr)}</dd></div> : null}
                            <div className="flex justify-between gap-4 border-t border-black/10 pt-3 font-semibold"><dt>Total</dt><dd>{currencyFormatter.format(details.totalIdr)}</dd></div>
                          </dl>
                        </section>
                      </div>

                      <section className="border-t border-black/10 pt-5">
                        <p className="sf-label text-black/45">Items</p>
                        <div className="mt-4 divide-y divide-black/10">
                          {details.items.map((item, index) => (
                            <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                              <div><p className="sf-body font-medium">{item.name}</p>{item.variant ? <p className="mt-0.5 sf-type-1 text-black/45">{item.variant}</p> : null}</div>
                              <div className="text-right"><p className="sf-type-2">×{item.quantity}</p><p className="mt-0.5 sf-type-1 text-black/50">{currencyFormatter.format(item.unitPriceIdr)}</p></div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </details>

                  {contactHref ? (
                    <a href={contactHref} target="_blank" rel="noreferrer" className="sticky bottom-4 z-20 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00813f] px-6 sf-type-2 font-semibold text-white shadow-lg sm:mx-auto sm:max-w-sm">
                      <MessageCircle className="size-4" /> Contact Admin
                    </a>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="mt-8 rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-5 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-black/[0.05]"><PackageSearch className="size-5" /></span>
                <div><h2 className="sf-type-4 font-display">Track Order</h2><p className="mt-1 sf-type-2 text-black/55">Use the WhatsApp number attached to the order.</p></div>
              </div>
              <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleSearch}>
                <input value={query} onChange={(event) => setQuery(event.target.value.toUpperCase())} placeholder="KDM-2026-0010" autoComplete="off" className="min-h-12 rounded-full border border-black/15 bg-[var(--sf-cream)] px-5 sf-body uppercase outline-none focus:border-black/35" />
                <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="08xx-xxxx-xxxx" inputMode="tel" autoComplete="tel" className="min-h-12 rounded-full border border-black/15 bg-[var(--sf-cream)] px-5 sf-body outline-none focus:border-black/35" />
                <button type="submit" disabled={searching || !query.trim() || !whatsapp.trim()} className="sf-primary-action inline-flex min-h-12 items-center justify-center gap-2 bg-black px-6 text-[#fdf6ee] disabled:opacity-40"><Search className="size-4" /> {searching ? 'Checking…' : 'Track'}</button>
              </form>
              {error ? <p className="mt-4 sf-type-2 text-red-800">{error}</p> : null}
            </section>
          )}

          {trackingId && error ? <p className="mt-5 rounded-2xl bg-red-800/[0.06] p-4 sf-type-2 text-red-800">{error}</p> : null}
        </main>
      </StorefrontContainer>
    </div>
  )
}

export default StorefrontOrderTrackingPage
