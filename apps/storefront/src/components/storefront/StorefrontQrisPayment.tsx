import { useEffect, useState, type FC } from 'react'
import { Download } from 'lucide-react'
import type { QrisPayment } from '../../data/shared/qrisPayment'
import { drawQrisCard, formatQrisRupiah, qrisCardFileName, qrisSvg, saveQrisCard } from '../../lib/qrisCard'

/**
 * Amount-embedded QRIS for one order (25 Nov 2026): the order's own QR with
 * the exact amount, the unique-code discount, and a download button that
 * saves the locked QRIS template as an image.
 */
export const StorefrontQrisPayment: FC<{
  payment: QrisPayment
  orderNumber: string
  customerName?: string | null
}> = ({ payment, orderNumber, customerName }) => {
  const [svg, setSvg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    qrisSvg(payment.payload).then((value) => { if (active) setSvg(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [payment.payload])

  const download = async () => {
    if (saving) return
    setSaving(true)
    setFailed(false)
    try {
      const blob = await drawQrisCard({
        payload: payment.payload,
        amountIdr: payment.amountIdr,
        branchName: payment.branchName,
        nmid: payment.nmid,
        orderNumber,
        customerName: customerName ?? null,
      })
      await saveQrisCard(blob, qrisCardFileName(orderNumber))
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-white/65 p-4 text-center" data-testid="storefront-qris-payment">
      {payment.amountUpdated && (
        <p role="status" className="w-full rounded-xl bg-[#f684b1]/15 px-3 py-2 sf-type-1 font-medium text-[#8a2452]">
          Nominal diperbarui. Gunakan QR di bawah ini.
        </p>
      )}
      <div
        role="img"
        aria-label={`QRIS ${formatQrisRupiah(payment.amountIdr)}`}
        className="aspect-square w-full max-w-[16rem] rounded-2xl border-[3px] border-[#f9c6da] bg-white p-3 [&>svg]:h-full [&>svg]:w-full"
        // The SVG comes from the local QR library, built from the server's QRIS string.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div>
        <p className="sf-type-1 text-black/55">Bayar tepat</p>
        <p className="text-[2rem] font-semibold leading-tight tabular-nums text-[#db4f8a]">{formatQrisRupiah(payment.amountIdr)}</p>
      </div>
      {payment.uniqueDiscountIdr > 0 && (
        <dl className="grid w-full max-w-[18rem] grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-left sf-type-1">
          <dt className="text-black/55">Total pesanan</dt><dd className="text-right tabular-nums">{formatQrisRupiah(payment.billIdr)}</dd>
          <dt className="text-black/55">Potongan kode unik</dt><dd className="text-right tabular-nums text-[#057640]">−{formatQrisRupiah(payment.uniqueDiscountIdr)}</dd>
        </dl>
      )}
      <p className="sf-type-1 leading-5 text-black/55">Scan dengan aplikasi bank atau e-wallet. Nominal sudah terisi otomatis.</p>
      <button
        type="button"
        onClick={() => void download()}
        disabled={saving}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 sf-type-2 font-medium text-white disabled:opacity-60"
      >
        <Download className="size-4" aria-hidden="true" />
        {saving ? 'Menyiapkan…' : 'Unduh QR'}
      </button>
      {failed && <p role="alert" className="sf-type-1 text-[#b42318]">QR belum bisa diunduh. Coba lagi.</p>}
    </div>
  )
}
