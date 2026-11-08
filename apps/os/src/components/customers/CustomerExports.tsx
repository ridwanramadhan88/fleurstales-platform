import { useMemo, useState, type FC } from 'react'
import { ExcelDownloadButton, ExcelExportDialog } from '../ui/excel-export-dialog'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { getStaffReviews, type StaffReview } from '../../data/staffReviews'
import { useOrdersStore } from '../../store/ordersStore'
import { useCatalogStore } from '../../store/catalogStore'
import { useUserStore } from '../../store/userStore'
import { resolveOrderProductDisplay } from '../../domain/catalogDomain'
import { buildReviewsExportSheets, filterReviewsForExport, reviewsExportFilename } from '../../domain/reviewsExportDomain'
import { buildCustomersExportSheets } from '../../domain/customersExportDomain'
import type { EnrichedCustomer } from '../../domain/customerDomain'
import { downloadTableXlsx, todayWib } from '../../lib/excelTableExport'
import { useCanReadStaffReviews } from './useCanReadStaffReviews'

const firstOfMonth = () => `${todayWib().slice(0, 8)}01`

/** Ulasan → Unduh Excel. */
export const ReviewsExportButton: FC = () => {
  const tr = useBilingualCopy()
  const orders = useOrdersStore((state) => state.orders)
  const catalogProducts = useCatalogStore((state) => state.products)
  const userName = useUserStore((state) => state.name)
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reviews, setReviews] = useState<StaffReview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openDialog = () => {
    setFrom(firstOfMonth())
    setTo(todayWib())
    setReviews(null)
    setError(null)
    setOpen(true)
    getStaffReviews()
      .then(setReviews)
      .catch((cause) => {
        console.warn('Review export load failed', cause)
        setReviews([])
        setError(tr('Reviews could not be loaded. Try again.', 'Ulasan gagal dimuat. Coba lagi.'))
      })
  }

  const selected = useMemo(() => filterReviewsForExport(reviews ?? [], { from: from || undefined, to: to || undefined }), [reviews, from, to])

  const download = () => {
    const sheets = buildReviewsExportSheets({
      reviews: selected,
      orders,
      orderProducts: (order) => (order.items?.length
        ? order.items.map((item) => `${item.productNameSnapshot ?? resolveOrderProductDisplay(catalogProducts, item).name} ×${item.quantity}`).join('; ')
        : resolveOrderProductDisplay(catalogProducts, order).name),
      summary: { rangeLabel: from || to ? `${from || 'awal'} s/d ${to || 'akhir'}` : 'Semua tanggal', exportedBy: userName, exportedAt: new Date().toISOString() },
    })
    downloadTableXlsx(reviewsExportFilename(from || undefined, to || undefined), sheets)
    setOpen(false)
  }

  return (
    <>
      <ExcelDownloadButton onClick={openDialog} />
      <ExcelExportDialog
        testId="reviews-export-dialog"
        open={open}
        onOpenChange={setOpen}
        title={tr('Download reviews', 'Unduh ulasan')}
        description={tr('One row per review with the score for each question, plus summaries per question, florist and branch.', 'Satu baris per ulasan dengan nilai tiap pertanyaan, ditambah ringkasan per pertanyaan, florist dan cabang.')}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        loading={reviews === null}
        error={error}
        countLabel={tr(`${selected.length} reviews`, `${selected.length} ulasan`)}
        canDownload={selected.length > 0}
        onDownload={download}
      />
    </>
  )
}

/** Pelanggan → Unduh Excel: the list as filtered on screen. */
export const CustomersExportButton: FC<{ customers: EnrichedCustomer[]; filterLabel: string }> = ({ customers, filterLabel }) => {
  const tr = useBilingualCopy()
  const canReadReviews = useCanReadStaffReviews()
  const userName = useUserStore((state) => state.name)
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const reviews = canReadReviews ? await getStaffReviews().catch((cause) => { console.warn('Review stats skipped in customer export', cause); return undefined }) : undefined
      const sheets = buildCustomersExportSheets({ customers, reviews, summary: { filterLabel, exportedBy: userName, exportedAt: new Date().toISOString() } })
      downloadTableXlsx(`Pelanggan_${todayWib()}.xlsx`, sheets)
    } finally {
      setBusy(false)
    }
  }

  return <ExcelDownloadButton onClick={() => void download()} disabled={busy || customers.length === 0} label={busy ? tr('Preparing…', 'Menyiapkan…') : undefined} />
}
