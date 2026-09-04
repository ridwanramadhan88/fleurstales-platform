import type { FC, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, PackageSearch, Search } from 'lucide-react'
import { StorefrontBrand } from '../components/storefront/StorefrontBrand'
import { StorefrontContainer } from '../components/storefront/StorefrontContainer'
import {
  getPublicOrderTracking,
  searchPublicOrderStatus,
  type PublicOrderStatusSummary,
  type PublicOrderTrackingDetails,
} from '../data/orderTracking'
import type { OrderStatus } from '../data/shared/databaseTypes'

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_verification: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  processing: 'Being prepared',
  ready: 'Ready',
  delivering: 'Out for delivery',
  delivered: 'Delivered',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
  failed: 'Needs attention',
}

const DELIVERY_STEPS: OrderStatus[] = ['pending_verification', 'confirmed', 'processing', 'ready', 'delivering', 'delivered']
const PICKUP_STEPS: OrderStatus[] = ['pending_verification', 'confirmed', 'processing', 'ready', 'picked_up']

const displaySchedule = (order: PublicOrderStatusSummary | PublicOrderTrackingDetails): string => {
  const date = order.fulfillment === 'pickup' ? order.requestedPickupDate ?? order.scheduleDate : order.scheduleDate
  const time = order.fulfillment === 'pickup' ? order.requestedPickupTime ?? order.scheduleTime : order.scheduleTime
  return [date, time?.slice(0, 5)].filter(Boolean).join(' · ') || 'Schedule not set'
}

const StatusTimeline: FC<Pick<PublicOrderStatusSummary, 'status' | 'fulfillment'>> = ({ status, fulfillment }) => {
  const steps = fulfillment === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS
  const currentIndex = steps.indexOf(status)
  const terminalIssue = status === 'cancelled' || status === 'failed'

  return (
    <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {steps.map((step, index) => {
        const reached = !terminalIssue && currentIndex >= index
        const current = status === step
        return (
          <li key={step} className={`rounded-2xl border px-3 py-3 ${reached ? 'border-[#00813f]/30 bg-[#00813f]/[0.07]' : 'border-black/10 bg-white/30'}`}>
            <div className="flex items-center gap-2">
              <span className={`flex size-5 items-center justify-center rounded-full border ${reached ? 'border-[#00813f] bg-[#00813f] text-white' : 'border-black/20 text-transparent'}`}>
                {reached ? <Check className="size-3" /> : null}
              </span>
              <span className={`sf-type-1 font-medium ${current ? 'text-black' : 'text-black/60'}`}>{STATUS_LABELS[step]}</span>
            </div>
          </li>
        )
      })}
      {terminalIssue ? (
        <li className="rounded-2xl border border-red-700/20 bg-red-700/[0.06] px-3 py-3 sm:col-span-3 lg:col-span-6">
          <span className="sf-type-1 font-semibold text-red-800">{STATUS_LABELS[status]}</span>
        </li>
      ) : null}
    </ol>
  )
}

interface StorefrontOrderTrackingPageProps {
  trackingId?: string
}

export const StorefrontOrderTrackingPage: FC<StorefrontOrderTrackingPageProps> = ({ trackingId }) => {
  const [details, setDetails] = useState<PublicOrderTrackingDetails | null>(null)
  const [summary, setSummary] = useState<PublicOrderStatusSummary | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(Boolean(trackingId))
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        if (!result) setError('Order not found. Check that you opened the complete tracking link.')
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Could not load this order.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [trackingId])

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault()
    const orderNumber = query.trim()
    if (!orderNumber || searching) return
    setSearching(true)
    setError(null)
    setSummary(null)
    try {
      const result = await searchPublicOrderStatus(orderNumber)
      setSummary(result)
      if (!result) setError('Order number not found.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not search for this order.')
    } finally {
      setSearching(false)
    }
  }

  const scheduleLabel = useMemo(() => details ? displaySchedule(details) : null, [details])

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
            <p className="mt-4 sf-body text-black/60">Use the secure link from Fleurstales for full order details, or search your order number for the latest status only.</p>
          </div>

          {trackingId ? (
            <section className="mt-8">
              {loading ? (
                <div className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-8 sf-body text-black/55">Loading order…</div>
              ) : details ? (
                <div className="space-y-5">
                  <div className="rounded-[var(--sf-radius-card)] border border-black/10 bg-[#eee4cc] p-5 sm:p-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="sf-type-1 uppercase tracking-[0.16em] text-black/45">{details.orderNumber}</p>
                        <h2 className="mt-2 sf-type-5 font-display">{STATUS_LABELS[details.status]}</h2>
                        <p className="mt-2 sf-body text-black/60">{details.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {scheduleLabel}</p>
                      </div>
                      <span className={`w-fit rounded-full px-3 py-1.5 sf-type-1 font-semibold ${details.status === 'cancelled' || details.status === 'failed' ? 'bg-red-800/10 text-red-800' : 'bg-[#00813f]/10 text-[#006f36]'}`}>
                        {STATUS_LABELS[details.status]}
                      </span>
                    </div>
                    <div className="mt-6"><StatusTimeline status={details.status} fulfillment={details.fulfillment} /></div>
                  </div>

                  {details.cancellationReason ? (
                    <div className="rounded-[var(--sf-radius-card)] border border-red-800/15 bg-red-800/[0.05] p-5">
                      <p className="sf-label text-red-900/60">Cancellation reason</p>
                      <p className="mt-2 sf-body text-red-950">{details.cancellationReason}</p>
                    </div>
                  ) : null}

                  <div className="grid gap-5 lg:grid-cols-2">
                    <section className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-5 sm:p-6">
                      <p className="sf-label text-black/45">Customer & fulfillment</p>
                      <dl className="mt-4 space-y-3 sf-body">
                        <div><dt className="text-black/45">Customer</dt><dd className="font-medium">{details.customerName}</dd></div>
                        {details.customerWhatsapp ? <div><dt className="text-black/45">WhatsApp</dt><dd className="font-medium">{details.customerWhatsapp}</dd></div> : null}
                        <div><dt className="text-black/45">Branch</dt><dd className="font-medium">{details.branchName ?? details.branchId}</dd></div>
                        <div><dt className="text-black/45">Schedule</dt><dd className="font-medium">{scheduleLabel}</dd></div>
                        {details.fulfillment === 'delivery' ? (
                          <>
                            <div><dt className="text-black/45">Delivery address</dt><dd className="font-medium">{details.deliveryAddress ?? '—'}</dd></div>
                            {details.deliveryInstructions ? <div><dt className="text-black/45">Delivery note</dt><dd className="font-medium">{details.deliveryInstructions}</dd></div> : null}
                          </>
                        ) : details.branchAddress ? (
                          <div><dt className="text-black/45">Pickup address</dt><dd className="font-medium">{details.branchAddress}</dd></div>
                        ) : null}
                      </dl>
                    </section>

                    <section className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-5 sm:p-6">
                      <p className="sf-label text-black/45">Payment & total</p>
                      <dl className="mt-4 space-y-3 sf-body">
                        <div className="flex justify-between gap-4"><dt className="text-black/45">Payment</dt><dd className="font-medium capitalize">{details.paymentStatus.replace('_', ' ')}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-black/45">Items</dt><dd>{currencyFormatter.format(details.itemsSubtotalIdr)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-black/45">Delivery</dt><dd>{currencyFormatter.format(details.deliveryFeeIdr)}</dd></div>
                        {details.discountIdr > 0 ? <div className="flex justify-between gap-4"><dt className="text-black/45">Discount</dt><dd>-{currencyFormatter.format(details.discountIdr)}</dd></div> : null}
                        <div className="flex justify-between gap-4 border-t border-black/10 pt-3 font-semibold"><dt>Total</dt><dd>{currencyFormatter.format(details.totalIdr)}</dd></div>
                      </dl>
                    </section>
                  </div>

                  <section className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-5 sm:p-6">
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
              ) : null}
            </section>
          ) : null}

          <section className="mt-8 rounded-[var(--sf-radius-card)] border border-black/10 bg-white/35 p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-black/[0.05]"><PackageSearch className="size-5" /></span>
              <div><h2 className="sf-type-4 font-display">Search by order number</h2><p className="mt-1 sf-type-2 text-black/55">This search shows status and schedule only.</p></div>
            </div>
            <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value.toUpperCase())}
                placeholder="e.g. FLR-2026-0001"
                autoComplete="off"
                className="min-h-12 flex-1 rounded-full border border-black/15 bg-[var(--sf-cream)] px-5 sf-body uppercase outline-none focus:border-black/35"
              />
              <button type="submit" disabled={searching || !query.trim()} className="sf-primary-action inline-flex min-h-12 items-center justify-center gap-2 bg-black px-6 text-[#fdf6ee] disabled:opacity-40">
                <Search className="size-4" /> {searching ? 'Searching…' : 'Track order'}
              </button>
            </form>

            {summary ? (
              <div className="mt-5 rounded-2xl bg-[#eee4cc] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="sf-label text-black/45">{summary.orderNumber}</p><p className="mt-1 sf-type-4 font-display">{STATUS_LABELS[summary.status]}</p></div><p className="sf-type-2 text-black/60">{summary.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {displaySchedule(summary)}</p></div>
                <div className="mt-4"><StatusTimeline status={summary.status} fulfillment={summary.fulfillment} /></div>
              </div>
            ) : null}

            {error ? <p className="mt-4 sf-type-2 text-red-800">{error}</p> : null}
          </section>
        </main>
      </StorefrontContainer>
    </div>
  )
}

export default StorefrontOrderTrackingPage
