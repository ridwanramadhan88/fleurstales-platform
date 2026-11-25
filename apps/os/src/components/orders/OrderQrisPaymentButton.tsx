import { useEffect, useState, type FC } from 'react'
import { Download, QrCode } from 'lucide-react'
import { AppDialog } from '../ui/app-dialog'
import { bootstrapSharedData } from '../../data/shared/bootstrap'
import { browserSupabaseTokenProvider } from '../../data/shared/supabaseSession'
import { isQrisAmountUpdated, type QrisPayment } from '../../data/shared/qrisPayment'
import { drawQrisCard, formatQrisRupiah, qrisCardFileName, qrisSvg, saveQrisCard } from '../../lib/qrisCard'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

interface QrisOrder {
  id?: string
  orderNumber: string
  customerName?: string
  totalIdr: number
  paidAmountIdr?: number
  paymentStatus: string
  paymentChannel?: 'qris'
  qrisAmountShown?: number
  status: string
}

/** True for an unpaid, open QRIS order. */
export const hasOpenQrisPayment = (order: QrisOrder): boolean =>
  order.paymentChannel === 'qris' && order.paymentStatus === 'unpaid' && !['cancelled', 'failed'].includes(order.status)

/** "QR diperbarui": the bill changed after the customer got the QR. */
export const isOrderQrisUpdated = (order: QrisOrder): boolean =>
  hasOpenQrisPayment(order) &&
  isQrisAmountUpdated({
    orderNumber: order.orderNumber,
    totalIdr: order.totalIdr,
    paidAmountIdr: order.paidAmountIdr ?? 0,
    qrisAmountShown: order.qrisAmountShown,
  })

export const OrderQrisUpdatedBadge: FC<{ order: QrisOrder }> = ({ order }) => {
  const tr = useBilingualCopy()
  if (!isOrderQrisUpdated(order)) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#f684b1]/15 px-2 py-0.5 text-2xs font-semibold text-[#8a2452]" data-testid="qris-updated-badge">
      {tr('QR updated', 'QR diperbarui')}
    </span>
  )
}

/**
 * "QR pembayaran" for an unpaid QRIS order (Owner, Admin, Finance): the
 * order's amount-embedded QR built by the server, downloadable as the locked
 * template to send by WhatsApp. When the bill changed, Admin marks the new
 * QR as sent.
 */
export const OrderQrisPaymentButton: FC<{ order: QrisOrder; canMarkSent: boolean }> = ({ order, canMarkSent }) => {
  const tr = useBilingualCopy()
  const [open, setOpen] = useState(false)
  const [payment, setPayment] = useState<QrisPayment | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'saving' | 'marking'>('idle')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  const repository = shared.enabled ? shared.repositories.ordersAdmin : null

  useEffect(() => {
    if (!open || !repository || !order.id) return
    let active = true
    setState('loading')
    setMessage(null)
    repository.getOrderQrisPayment(order.id)
      .then(async (result) => {
        if (!active) return
        setPayment(result)
        setSvg(result ? await qrisSvg(result.payload) : null)
      })
      .catch(() => { if (active) setMessage({ text: tr('The QR could not be loaded. Try again.', 'QR tidak bisa dimuat. Coba lagi.'), error: true }) })
      .finally(() => { if (active) setState('idle') })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id, order.totalIdr, order.paidAmountIdr, order.qrisAmountShown])

  if (!hasOpenQrisPayment(order) || !repository || !order.id) return null

  const download = async () => {
    if (!payment || state !== 'idle') return
    setState('saving')
    setMessage(null)
    try {
      const blob = await drawQrisCard({
        payload: payment.payload,
        amountIdr: payment.amountIdr,
        branchName: payment.branchName,
        nmid: payment.nmid,
        orderNumber: order.orderNumber,
        customerName: order.customerName ?? null,
      })
      await saveQrisCard(blob, qrisCardFileName(order.orderNumber))
    } catch {
      setMessage({ text: tr('The QR could not be saved. Try again.', 'QR tidak bisa disimpan. Coba lagi.'), error: true })
    } finally {
      setState('idle')
    }
  }

  const markSent = async () => {
    if (!order.id || state !== 'idle') return
    setState('marking')
    setMessage(null)
    try {
      await repository.markOrderQrisSent(order.id)
      setPayment((current) => (current ? { ...current, amountUpdated: false } : current))
      setMessage({ text: tr('Marked as sent.', 'Ditandai sudah dikirim.'), error: false })
    } catch {
      setMessage({ text: tr('Could not save. Try again.', 'Tidak bisa disimpan. Coba lagi.'), error: true })
    } finally {
      setState('idle')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-xs font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <QrCode className="size-3.5" aria-hidden="true" />
        {tr('Payment QR', 'QR pembayaran')}
      </button>
      {open && (
        <AppDialog open onOpenChange={(next) => { if (!next && state === 'idle') setOpen(false) }} size="compact" title={tr('Payment QR', 'QR pembayaran')}>
          <div className="space-y-4" data-testid="order-qris-payment">
            {state === 'loading' && !payment && <p className="text-sm text-muted-foreground">{tr('Loading…', 'Memuat…')}</p>}
            {state !== 'loading' && !payment && !message && (
              <p className="text-sm text-muted-foreground">{tr('No QRIS payment is open for this order.', 'Tidak ada pembayaran QRIS yang terbuka untuk pesanan ini.')}</p>
            )}
            {payment && (
              <>
                {payment.amountUpdated && (
                  <div className="space-y-2 rounded-xl bg-[#f684b1]/15 p-3 text-sm text-[#8a2452]" data-testid="order-qris-updated">
                    <p>{tr('The bill changed after the customer got the QR. Send this new QR.', 'Tagihan berubah setelah pelanggan menerima QR. Kirim QR baru ini.')}</p>
                    {canMarkSent && (
                      <button type="button" disabled={state !== 'idle'} onClick={() => void markSent()} className="h-9 rounded-full bg-[#8a2452] px-3.5 text-xs font-semibold text-white disabled:opacity-60">
                        {tr('New QR sent', 'QR baru sudah dikirim')}
                      </button>
                    )}
                  </div>
                )}
                <div
                  role="img"
                  aria-label={`QRIS ${formatQrisRupiah(payment.amountIdr)}`}
                  className="mx-auto aspect-square w-full max-w-[15rem] rounded-2xl border-[3px] border-[#f9c6da] bg-white p-3 [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
                />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{tr('Amount to pay', 'Total bayar')}</p>
                  <p className="text-2xl font-semibold tabular-nums text-[#db4f8a]">{formatQrisRupiah(payment.amountIdr)}</p>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{tr('Order total', 'Total pesanan')}</dt><dd className="text-right tabular-nums">{formatQrisRupiah(payment.billIdr)}</dd>
                  <dt className="text-muted-foreground">{tr('Unique-code discount', 'Potongan kode unik')}</dt><dd className="text-right tabular-nums">−{formatQrisRupiah(payment.uniqueDiscountIdr)}</dd>
                  <dt className="text-muted-foreground">NMID</dt><dd className="text-right tabular-nums">{payment.nmid}</dd>
                </dl>
                <button type="button" disabled={state !== 'idle'} onClick={() => void download()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-60">
                  <Download className="size-4" aria-hidden="true" />
                  {state === 'saving' ? tr('Preparing…', 'Menyiapkan…') : tr('Download QR', 'Unduh QR')}
                </button>
              </>
            )}
            {message && <p role={message.error ? 'alert' : 'status'} className={`text-xs ${message.error ? 'text-destructive' : 'text-success'}`}>{message.text}</p>}
          </div>
        </AppDialog>
      )}
    </>
  )
}
