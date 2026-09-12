import type { FC, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, MessageCircle, PackageSearch, Search } from 'lucide-react'
import { StorefrontBrand } from '../components/storefront/StorefrontBrand'
import { StorefrontCompletedReviewSection } from '../components/storefront/StorefrontCompletedReviewSection'
import { StorefrontContainer } from '../components/storefront/StorefrontContainer'
import { StorefrontCopyButton } from '../components/storefront/StorefrontCopyButton'
import { StorefrontOrderStatusBar } from '../components/storefront/StorefrontOrderStatusBar'
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
  confirmed: 'Pesanan dikonfirmasi',
  processing: 'Sedang diproses',
  ready: 'Pesanan siap',
  delivering: 'Dalam pengiriman',
  delivered: 'Pesanan selesai',
  picked_up: 'Pesanan selesai',
  cancelled: 'Pesanan dibatalkan',
  failed: 'Perlu perhatian',
}

const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending_verification: 'Selesaikan pembayaran bila diperlukan. Admin akan mengonfirmasi pesanan sebelum produksi dimulai.',
  confirmed: 'Pesanan sudah dikonfirmasi dan masuk ke jadwal produksi.',
  processing: 'Bunga kamu sedang disiapkan oleh tim Fleurstales.',
  ready: 'Pesanan sudah siap. Foto hasil dan detail pengambilan atau pengiriman tersedia di bawah.',
  delivering: 'Pesanan sedang dalam perjalanan ke alamat tujuan.',
  delivered: 'Pesanan sudah selesai dan diterima.',
  picked_up: 'Pesanan sudah selesai dan telah diambil.',
  cancelled: 'Pesanan ini sudah ditutup. Lihat alasan di bawah atau hubungi Admin bila perlu bantuan.',
  failed: 'Pesanan membutuhkan perhatian. Hubungi Admin untuk bantuan.',
}

const CLOSED_STATUSES: OrderStatus[] = ['cancelled', 'failed']
const COMPLETE_STATUSES: OrderStatus[] = ['delivered', 'picked_up']

const formatScheduleDate = (value?: string | null): string => {
  if (!value) return ''
  const parsed = new Date(`${value}T00:00:00+07:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(parsed)
}

const displaySchedule = (order: PublicOrderStatusSummary | PublicOrderTrackingDetails): string => {
  const date = order.fulfillment === 'pickup' ? order.requestedPickupDate ?? order.scheduleDate : order.scheduleDate
  const time = order.fulfillment === 'pickup' ? order.requestedPickupTime ?? order.scheduleTime : order.scheduleTime
  return [formatScheduleDate(date), time?.slice(0, 5)].filter(Boolean).join(' · ') || 'Jadwal belum ditentukan'
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
    'Link tracking ini sudah tidak tersedia. Link mungkin salah atau sudah melewati masa aktif 14 hari setelah pesanan selesai atau ditutup.'

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
          setError('Link tracking tidak sesuai dengan nomor pesanan ini.')
          return
        }
        if (legacyRoute) {
          window.history.replaceState({}, '', buildStorefrontTrackingPath(result.orderNumber, trackingId))
        }
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Pesanan belum bisa dimuat.')
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
        setError('Nomor pesanan atau nomor WhatsApp tidak cocok.')
        return
      }
      requestStorefrontNavigation({ path: buildStorefrontTrackingPath(access.orderNumber, access.publicTrackingId) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pesanan belum bisa diverifikasi.')
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
        <StorefrontContainer className="flex min-h-16 items-center justify-between py-3 sm:min-h-20 sm:py-4">
          <a href="/" aria-label="Fleurstales home"><StorefrontBrand showIcon={false} /></a>
          <a href="/shop" className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 sf-type-2 font-medium text-black/60 transition hover:bg-black/[0.04] hover:text-black sm:min-h-11 sm:px-4">
            <ArrowLeft className="size-4" /> Belanja
          </a>
        </StorefrontContainer>
      </header>

      <StorefrontContainer className="py-7 sm:py-10 lg:py-12">
        <main className="mx-auto max-w-4xl">
          <div className="max-w-2xl">
            <p className="sf-label text-black/42">Fleurstales order</p>
            <h1 className="mt-2 font-display text-[2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[2.6rem]">
              Lacak pesanan
            </h1>
            {!trackingId ? (
              <p className="mt-3 max-w-xl sf-body leading-6 text-black/55">
                Masukkan nomor pesanan dan nomor WhatsApp yang sama dengan saat checkout.
              </p>
            ) : null}
          </div>

          {trackingId ? (
            <section className="mt-6 sm:mt-8">
              {loading ? (
                <div className="rounded-[var(--sf-radius-card)] border border-black/10 bg-white/40 p-6 sf-body text-black/55 sm:p-8">
                  Memuat pesanan…
                </div>
              ) : details ? (
                <div className="space-y-4 sm:space-y-5">
                  {isComplete ? (
                    <StorefrontCompletedReviewSection
                      trackingId={trackingId}
                      details={details}
                      onSubmitted={async () => { await loadDetails(trackingId) }}
                    />
                  ) : null}

                  <section className="rounded-[var(--sf-radius-card)] border border-black/10 bg-[#eee4cc] p-4 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="sf-type-1 font-semibold uppercase tracking-[0.14em] text-black/42">{details.orderNumber}</p>
                        <h2 className="mt-1.5 font-display text-[1.65rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-[2rem]">
                          {STATUS_LABELS[details.status]}
                        </h2>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/50 px-3 py-1.5 sf-type-1 font-semibold text-black/52">
                        {details.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {scheduleLabel}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl sf-type-2 leading-6 text-black/56">{STATUS_DESCRIPTIONS[details.status]}</p>
                    <div className="mt-5 border-t border-black/10 pt-4 sm:mt-6 sm:pt-5">
                      <StorefrontOrderStatusBar status={details.status} fulfillment={details.fulfillment} />
                    </div>
                  </section>

                  {details.finishPhotoUrl && details.status !== 'pending_verification' && details.status !== 'confirmed' && details.status !== 'processing' ? (
                    <section className="grid items-center gap-4 rounded-[var(--sf-radius-card)] border border-black/10 bg-white/40 p-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-5">
                      <img
                        src={details.finishPhotoUrl}
                        alt="Foto hasil pesanan"
                        className="mx-auto aspect-[4/5] w-full max-w-[260px] rounded-2xl object-cover shadow-ios-sm ring-1 ring-black/10 sm:max-w-none"
                      />
                      <div className="text-center sm:text-left">
                        <p className="sf-label text-[#006f36]">Foto hasil pesanan</p>
                        <h3 className="mt-1.5 sf-type-4 font-display">Pesanan sudah selesai dibuat 🌸</h3>
                        <p className="mt-2 sf-type-2 leading-6 text-black/50">Foto ini diambil tim Fleurstales setelah rangkaian selesai.</p>
                      </div>
                    </section>
                  ) : null}

                  {details.cancellationReason ? (
                    <section className="rounded-[var(--sf-radius-card)] border border-red-800/15 bg-red-800/[0.05] p-4 sm:p-5">
                      <p className="sf-label text-red-900/60">Alasan pembatalan</p>
                      <p className="mt-2 sf-body text-red-950">{details.cancellationReason}</p>
                    </section>
                  ) : null}

                  {showPaymentInstructions ? (
                    <section className="rounded-[var(--sf-radius-card)] border border-[#00813f]/20 bg-[#00813f]/[0.055] p-4 sm:p-6">
                      <p className="sf-label text-[#006f36]">Selesaikan pembayaran</p>
                      <div className="mt-3 flex items-end justify-between gap-4 border-b border-[#00813f]/15 pb-4">
                        <span className="sf-type-2 text-black/55">Total</span>
                        <strong className="text-[1.75rem] font-medium leading-none sm:text-[2rem]">{currencyFormatter.format(details.totalIdr)}</strong>
                      </div>
                      {details.paymentAccountSnapshot ? (
                        <div className="mt-4 rounded-2xl bg-white/65 p-4">
                          <p className="sf-type-2 font-semibold">{details.paymentAccountSnapshot.bankName}</p>
                          <p className="mt-1 sf-type-1 text-black/50">a.n. {details.paymentAccountSnapshot.accountHolder}</p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[1.45rem] font-medium tabular-nums sm:text-[1.65rem]">{details.paymentAccountSnapshot.accountNumber}</p>
                            <StorefrontCopyButton value={details.paymentAccountSnapshot.accountNumber} label="Salin" />
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
                        <p className="sf-type-2 font-semibold text-[#006f36]">✓ Pembayaran diterima</p>
                        <p className="mt-0.5 sf-type-1 text-black/42">Tidak ada tindakan pembayaran yang diperlukan.</p>
                      </div>
                      <p className="sf-type-3 font-semibold">{currencyFormatter.format(details.totalIdr)}</p>
                    </section>
                  ) : null}

                  <details className="group rounded-[var(--sf-radius-card)] border border-black/10 bg-white/38">
                    <summary className="cursor-pointer list-none px-4 py-4 sf-type-3 font-semibold marker:hidden sm:px-6">
                      <span className="flex items-center justify-between gap-4">
                        Detail pesanan
                        <span className="sf-type-1 text-black/40 group-open:hidden">Lihat</span>
                        <span className="hidden sf-type-1 text-black/40 group-open:inline">Tutup</span>
                      </span>
                    </summary>
                    <div className="space-y-6 border-t border-black/10 p-4 sm:p-6">
                      <div className="grid gap-6 md:grid-cols-2">
                        <section>
                          <p className="sf-label text-black/45">Pelanggan & pemenuhan</p>
                          <dl className="mt-4 space-y-3 sf-type-2">
                            <div><dt className="text-black/42">Pelanggan</dt><dd className="mt-0.5 font-medium">{details.customerName}</dd></div>
                            <div><dt className="text-black/42">Cabang</dt><dd className="mt-0.5 font-medium">{details.branchName ?? details.branchId}</dd></div>
                            <div><dt className="text-black/42">Jadwal</dt><dd className="mt-0.5 font-medium">{scheduleLabel}</dd></div>
                            {details.fulfillment === 'delivery' ? (
                              <>
                                <div><dt className="text-black/42">Alamat pengiriman</dt><dd className="mt-0.5 font-medium">{details.deliveryAddress ?? '—'}</dd></div>
                                {details.deliveryInstructions ? <div><dt className="text-black/42">Catatan pengiriman</dt><dd className="mt-0.5 font-medium">{details.deliveryInstructions}</dd></div> : null}
                              </>
                            ) : details.branchAddress ? <div><dt className="text-black/42">Alamat pickup</dt><dd className="mt-0.5 font-medium">{details.branchAddress}</dd></div> : null}
                          </dl>
                        </section>

                        <section>
                          <p className="sf-label text-black/45">Ringkasan pembayaran</p>
                          <dl className="mt-4 space-y-3 sf-type-2">
                            <div className="flex justify-between gap-4"><dt className="text-black/42">Produk</dt><dd>{currencyFormatter.format(details.itemsSubtotalIdr)}</dd></div>
                            <div className="flex justify-between gap-4"><dt className="text-black/42">Pengiriman</dt><dd>{currencyFormatter.format(details.deliveryFeeIdr)}</dd></div>
                            {details.discountIdr > 0 ? <div className="flex justify-between gap-4"><dt className="text-black/42">Diskon</dt><dd>-{currencyFormatter.format(details.discountIdr)}</dd></div> : null}
                            <div className="flex justify-between gap-4 border-t border-black/10 pt-3 font-semibold"><dt>Total</dt><dd>{currencyFormatter.format(details.totalIdr)}</dd></div>
                          </dl>
                        </section>
                      </div>

                      <section className="border-t border-black/10 pt-5">
                        <p className="sf-label text-black/45">Item</p>
                        <div className="mt-4 divide-y divide-black/10">
                          {details.items.map((item, index) => (
                            <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                              <div>
                                <p className="sf-type-2 font-medium">{item.name}</p>
                                {item.variant ? <p className="mt-0.5 sf-type-1 text-black/45">{item.variant}</p> : null}
                              </div>
                              <div className="text-right">
                                <p className="sf-type-2">×{item.quantity}</p>
                                <p className="mt-0.5 sf-type-1 text-black/50">{currencyFormatter.format(item.unitPriceIdr)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </details>

                  {contactHref ? (
                    <a
                      href={contactHref}
                      target="_blank"
                      rel="noreferrer"
                      className={isComplete
                        ? 'flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-black/12 bg-white/45 px-6 sf-type-2 font-semibold text-black/62 transition hover:bg-white/70 sm:mx-auto sm:max-w-sm'
                        : 'sticky bottom-4 z-20 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00813f] px-6 sf-type-2 font-semibold text-white shadow-lg sm:mx-auto sm:max-w-sm'}
                    >
                      <MessageCircle className="size-4" /> Hubungi Admin
                    </a>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="mt-6 rounded-[var(--sf-radius-card)] border border-black/10 bg-white/42 p-4 sm:mt-8 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-black/[0.05]"><PackageSearch className="size-5" /></span>
                <div>
                  <h2 className="sf-type-4 font-display">Cari pesanan</h2>
                  <p className="mt-1 sf-type-2 text-black/50">Gunakan WhatsApp yang terhubung ke pesanan.</p>
                </div>
              </div>
              <form className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={handleSearch}>
                <label>
                  <span className="mb-2 block sf-type-1 font-semibold text-black/55">Nomor pesanan</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value.toUpperCase())}
                    placeholder="KDM-2026-0010"
                    autoComplete="off"
                    className="min-h-12 w-full rounded-[14px] border border-black/15 bg-[var(--sf-cream)] px-4 text-[16px] uppercase outline-none transition placeholder:text-black/28 focus:border-black/35 sm:text-sm"
                  />
                </label>
                <label>
                  <span className="mb-2 block sf-type-1 font-semibold text-black/55">Nomor WhatsApp</span>
                  <input
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(event.target.value)}
                    placeholder="08xx-xxxx-xxxx"
                    inputMode="tel"
                    autoComplete="tel"
                    className="min-h-12 w-full rounded-[14px] border border-black/15 bg-[var(--sf-cream)] px-4 text-[16px] outline-none transition placeholder:text-black/28 focus:border-black/35 sm:text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={searching || !query.trim() || !whatsapp.trim()}
                  className="sf-primary-action inline-flex min-h-12 w-full items-center justify-center gap-2 bg-black px-6 text-[#fdf6ee] disabled:opacity-40 md:w-auto"
                >
                  <Search className="size-4" /> {searching ? 'Mengecek…' : 'Lacak'}
                </button>
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
