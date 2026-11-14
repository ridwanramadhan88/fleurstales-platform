import { useEffect, useMemo, useState, type FC } from 'react'
import { Download } from 'lucide-react'
import { AppDialog } from '../ui/app-dialog'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useCatalogStore } from '../../store/catalogStore'
import { useCustomerStore } from '../../store/customerStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { canAccessSection } from '../../config/permissions'
import { resolveOrderProductDisplay } from '../../domain/catalogDomain'
import {
  buildOrdersExportSheets,
  filterOrdersForExport,
  ordersExportFilename,
  type OrdersExportStatusScope,
} from '../../domain/ordersExportDomain'
import { downloadTableXlsx } from '../../lib/excelTableExport'
import type { OrderTableRow } from '../../types/orders'

const STATUS_OPTIONS: Array<{ id: OrdersExportStatusScope; en: string; id_: string }> = [
  { id: 'all', en: 'All statuses', id_: 'Semua status' },
  { id: 'active', en: 'Active', id_: 'Aktif (belum selesai)' },
  { id: 'finished', en: 'Finished', id_: 'Selesai' },
  { id: 'cancelled', en: 'Cancelled / failed', id_: 'Dibatalkan / gagal' },
]

const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

interface OrdersExportDialogProps {
  orders: OrderTableRow[]
  branch: string
  defaultRange: { from?: string; to?: string }
  defaultStatus: OrdersExportStatusScope
}

/** "Unduh Excel" button plus the options dialog for the Pesanan export. */
export const OrdersExportButton: FC<OrdersExportDialogProps> = ({ orders, branch, defaultRange, defaultStatus }) => {
  const tr = useBilingualCopy()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(defaultRange.from ?? '')
  const [to, setTo] = useState(defaultRange.to ?? '')
  const [status, setStatus] = useState<OrdersExportStatusScope>(defaultStatus)
  const [fullOrder, setFullOrder] = useState(true)
  const [fullCustomer, setFullCustomer] = useState(true)

  const catalogProducts = useCatalogStore((state) => state.products)
  const customers = useCustomerStore((state) => state.customers)
  const segmentRules = useCustomerStore((state) => state.segmentRules)
  const role = useUserStore((state) => state.role)
  const userName = useUserStore((state) => state.name)
  const permissions = useSettingsStore((state) => state.permissions)
  // E-mail, birthday and CRM notes are customer-directory data.
  const mayExportCustomers = canAccessSection(role, 'customers', permissions)

  useEffect(() => {
    if (!open) return
    setFrom(defaultRange.from ?? '')
    setTo(defaultRange.to ?? '')
    setStatus(defaultStatus)
    // Reset to the screen filters each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const invalidRange = Boolean(from && to && from > to)
  const selected = useMemo(
    () => (invalidRange ? [] : filterOrdersForExport(orders, { branch, from: from || undefined, to: to || undefined, status })),
    [orders, branch, from, to, status, invalidRange],
  )
  const includeCustomer = fullCustomer && mayExportCustomers

  const download = () => {
    if (selected.length === 0) return
    const statusLabel = STATUS_OPTIONS.find((option) => option.id === status)?.id_ ?? status
    const sheets = buildOrdersExportSheets({
      orders: selected,
      allOrders: orders,
      customers,
      segmentRules,
      options: { fullOrder, fullCustomer: includeCustomer },
      lineItemName: (item) => {
        const base = item.productNameSnapshot ?? resolveOrderProductDisplay(catalogProducts, item).name
        return item.variantSizeSnapshot && !base.includes(item.variantSizeSnapshot) ? `${base} (${item.variantSizeSnapshot})` : base
      },
      orderProductName: (order) => resolveOrderProductDisplay(catalogProducts, order).name,
      summary: {
        branchLabel: branch === 'All' ? 'Semua cabang' : branch,
        rangeLabel: from || to ? `${from || 'awal'} s/d ${to || 'akhir'}` : 'Semua tanggal',
        statusLabel,
        exportedBy: userName,
        exportedAt: new Date().toISOString(),
      },
    })
    downloadTableXlsx(ordersExportFilename({ branch, from: from || undefined, to: to || undefined, options: { fullOrder, fullCustomer: includeCustomer } }), sheets)
    setOpen(false)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-accent">
        <Download className="size-4" /> {tr('Download Excel', 'Unduh Excel')}
      </button>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={tr('Download orders', 'Unduh pesanan')}
        description={tr(
          `Excel file for ${branch === 'All' ? 'all branches' : branch}. Dates follow the delivery/pickup date.`,
          `File Excel untuk ${branch === 'All' ? 'semua cabang' : `cabang ${branch}`}. Tanggal mengikuti tanggal kirim/ambil.`,
        )}
      >
        <div className="space-y-4" data-testid="orders-export-dialog">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium">{tr('From date', 'Dari tanggal')}</span>
              <input type="date" aria-label={tr('From date', 'Dari tanggal')} value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium">{tr('To date', 'Sampai tanggal')}</span>
              <input type="date" aria-label={tr('To date', 'Sampai tanggal')} value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} />
            </label>
          </div>
          {invalidRange && <p className="text-xs text-destructive">{tr('The start date is after the end date.', 'Tanggal awal setelah tanggal akhir.')}</p>}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Status</span>
            <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as OrdersExportStatusScope)} className={inputClass}>
              {STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{tr(option.en, option.id_)}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">{tr('Contents', 'Isi file')}</legend>
            <label className="flex items-start gap-3 rounded-2xl border border-border p-3">
              <Checkbox checked={fullOrder} onCheckedChange={(value) => setFullOrder(value === true)} aria-label={tr('Complete order data', 'Data pesanan lengkap')} className="mt-0.5" />
              <span className="text-sm">
                <span className="block font-medium">{tr('Complete order data', 'Data pesanan lengkap')}</span>
                <span className="block text-xs text-muted-foreground">{tr(
                  'Discount, voucher, delivery fee, payment method, Finance verification, admin, florist, address, notes, greeting card, cancellation and refund. Adds Item and Payment sheets.',
                  'Diskon, voucher, ongkir, metode bayar, verifikasi Keuangan, admin, florist, alamat, catatan, kartu ucapan, pembatalan & pengembalian dana. Ditambah sheet Item dan Pembayaran.',
                )}</span>
              </span>
            </label>
            {mayExportCustomers && (
              <label className="flex items-start gap-3 rounded-2xl border border-border p-3">
                <Checkbox checked={fullCustomer} onCheckedChange={(value) => setFullCustomer(value === true)} aria-label={tr('Complete customer data', 'Data pelanggan lengkap')} className="mt-0.5" />
                <span className="text-sm">
                  <span className="block font-medium">{tr('Complete customer data', 'Data pelanggan lengkap')}</span>
                  <span className="block text-xs text-muted-foreground">{tr(
                    'Email, birthday, favourite branch, segment, total orders and spend, tags and notes. Adds a Customers sheet.',
                    'Email, ulang tahun, cabang favorit, segmen, jumlah pesanan & total belanja, tag dan catatan. Ditambah sheet Pelanggan.',
                  )}</span>
                </span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">{tr(
              'Without these options the file has the summary columns: number, dates, branch, status, customer, WhatsApp, products, total and payment.',
              'Tanpa pilihan di atas, file berisi kolom ringkas: nomor, tanggal, cabang, status, pelanggan, WhatsApp, produk, total dan pembayaran.',
            )}</p>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm" role="status">{tr(`${selected.length} orders`, `${selected.length} pesanan`)}</p>
            <Button type="button" onClick={download} disabled={selected.length === 0}>
              <Download className="size-4" /> {tr('Download', 'Unduh')}
            </Button>
          </div>
        </div>
      </AppDialog>
    </>
  )
}
