import { zipSync } from 'fflate'
import {
  cell,
  header,
  money,
  workbookFiles,
  type WorkbookCell,
  type WorksheetSpec,
} from './financePeriodXlsxExport'
import {
  LK_BRAND_BY_BRANCH,
  LK_HEAD_OFFICE_BRANCH,
  LK_SHEET_CODE_BY_BRANCH,
  lkGrowth,
  lkMonthLabel,
  lkTotal,
  type LkExpenseRow,
  type LkReport,
  type LkSalesRow,
} from '../domain/financeLkReportDomain'

const brandOf = (branch: string): string => LK_BRAND_BY_BRANCH[branch] ?? branch
const codeOf = (branch: string): string => LK_SHEET_CODE_BY_BRANCH[branch] ?? branch

const wib = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

const PAYMENT_STATUS_ID: Record<string, string> = {
  unpaid: 'Belum bayar', partial: 'Sebagian', paid: 'Lunas', refund_pending: 'Refund diproses', refunded: 'Direfund',
}
const ORDER_STATUS_ID: Record<string, string> = {
  pending_verification: 'Menunggu konfirmasi', confirmed: 'Dikonfirmasi', processing: 'Diproses', ready: 'Siap',
  delivering: 'Dikirim', delivered: 'Terkirim', picked_up: 'Diambil', cancelled: 'Dibatalkan', failed: 'Gagal',
}

const pnlSheet = (report: LkReport): WorksheetSpec => {
  const branches = report.branches
  const brands = branches.map(brandOf)
  const rows: WorkbookCell[][] = [
    [header(`LAPORAN LABA RUGI — ${lkMonthLabel(report.month).toUpperCase()}`)],
    [cell(`Dibandingkan ${lkMonthLabel(report.previousMonth)} · semua angka dalam Rupiah · * belum dicatat di OS`, 'muted')],
    [],
    [
      header('Akun'),
      ...brands.map((brand) => header(brand)), header('Total'),
      ...brands.map((brand) => header(`${brand} (${lkMonthLabel(report.previousMonth)})`)), header(`Total (${lkMonthLabel(report.previousMonth)})`),
      ...brands.map((brand) => header(`Growth ${brand}`)), header('Growth Total'),
    ],
  ]
  for (const line of report.pnl) {
    if (line.kind === 'section') {
      rows.push([], [header(line.label)])
      continue
    }
    const format = line.kind === 'line' ? 'currency' as const : 'total' as const
    const label = line.notTracked ? `${line.label} *` : line.label
    const current = [...branches.map((branch) => line.current[branch] ?? 0), lkTotal(line.current, branches)]
    const previous = [...branches.map((branch) => line.previous[branch] ?? 0), lkTotal(line.previous, branches)]
    rows.push([
      line.kind === 'line' ? (line.notTracked ? cell(label, 'muted') : label) : header(label),
      ...current.map((value) => cell(value, format)),
      ...previous.map((value) => cell(value, format)),
      ...current.map((value, index) => {
        const growth = lkGrowth(value, previous[index])
        return growth === null ? cell('–', 'muted') : cell(growth, 'percent')
      }),
    ])
  }
  const columns = 1 + (branches.length + 1) * 3
  return { name: 'PNL', rows, widths: [34, ...Array.from({ length: columns - 1 }, () => 18)] }
}

const salesSheet = (name: string, rows: LkSalesRow[]): WorksheetSpec => {
  const totals = rows.reduce((sum, row) => ({
    productSubtotal: sum.productSubtotal + row.productSubtotal, delivery: sum.delivery + row.delivery, discount: sum.discount + row.discount,
    total: sum.total + row.total, paid: sum.paid + row.paid, underpaid: sum.underpaid + row.underpaid, overpaid: sum.overpaid + row.overpaid,
  }), { productSubtotal: 0, delivery: 0, discount: 0, total: 0, paid: 0, underpaid: 0, overpaid: 0 })
  return {
    name,
    widths: [5, 12, 16, 22, 40, 6, 14, 16, 12, 14, 14, 14, 16, 16, 14, 14, 16, 10, 26, 18, 18],
    rows: [
      [
        header('No'), header('Tanggal'), header('No. Pesanan'), header('Nama Pelanggan'), header('Produk'), header('Qty'),
        header('Harga Satuan'), header('Total Produk'), header('Packing *'), header('Money Bouquet *'), header('Ongkir'), header('Diskon'),
        header('Total Pesanan'), header('Dibayar'), header('Kurang Bayar'), header('Lebih Bayar'), header('Status Bayar'),
        header('Metode'), header('Rekening'), header('Kode Rekon Bank'), header('Status Pesanan'),
      ],
      ...rows.map((row, index) => [
        index + 1, wib(row.date), row.orderNumber, row.customer, row.products, row.quantity,
        row.unitPrice === null ? '' : money(row.unitPrice), money(row.productSubtotal), money(row.packing), money(row.moneyBouquet),
        money(row.delivery), money(row.discount), money(row.total), money(row.paid), money(row.underpaid), money(row.overpaid),
        PAYMENT_STATUS_ID[row.paymentStatus] ?? row.paymentStatus, row.paymentMethod, row.account, row.reconCode,
        ORDER_STATUS_ID[row.orderStatus] ?? row.orderStatus,
      ]),
      [
        '', header('TOTAL'), '', '', '', rows.reduce((sum, row) => sum + row.quantity, 0), '',
        cell(totals.productSubtotal, 'total'), cell(0, 'total'), cell(0, 'total'), cell(totals.delivery, 'total'), cell(totals.discount, 'total'),
        cell(totals.total, 'total'), cell(totals.paid, 'total'), cell(totals.underpaid, 'total'), cell(totals.overpaid, 'total'),
      ],
    ],
  }
}

const expenseSheet = (name: string, rows: LkExpenseRow[]): WorksheetSpec => ({
  name,
  widths: [5, 12, 16, 28, 44, 16, 26, 10, 18],
  rows: [
    [header('No'), header('Tanggal'), header('Kode'), header('Akun'), header('Keterangan'), header('Jumlah'), header('Rekening / Kas'), header('Metode'), header('Referensi')],
    ...rows.map((row, index) => [index + 1, wib(row.date), row.code, row.account, row.description, money(row.amount), row.cashAccount, row.method, row.reference]),
    ['', header('TOTAL'), '', '', '', cell(rows.reduce((sum, row) => sum + row.amount, 0), 'total')],
  ],
})

export const buildFinanceLkXlsx = (report: LkReport, accountLabel: (accountId?: string) => string): Uint8Array => {
  const sheets: WorksheetSpec[] = [pnlSheet(report)]
  for (const branch of report.branches) sheets.push(salesSheet(`SR ${codeOf(branch)}`, report.sales[branch]?.product ?? []))
  for (const branch of report.branches) sheets.push(salesSheet(`SR Cake ${codeOf(branch)}`, report.sales[branch]?.cake ?? []))
  sheets.push(salesSheet('SR Instalasi', []))
  for (const branch of report.branches) sheets.push(expenseSheet(`EXP ${codeOf(branch)}`, report.expenses[branch] ?? []))
  sheets.push({
    name: 'Kas & Rekening',
    widths: [34, 18, 18, 18, 18, 12],
    rows: [
      [header('Rekening / Kas'), header('Saldo Awal'), header('Masuk'), header('Keluar'), header('Saldo Akhir'), header('Transaksi')],
      ...report.accounts.map((account) => [
        accountLabel(account.accountId), money(account.openingBalance), money(account.moneyIn), money(account.moneyOut), money(account.closingBalance), account.transactionCount,
      ]),
      [
        header('TOTAL'),
        cell(report.accounts.reduce((sum, account) => sum + account.openingBalance, 0), 'total'),
        cell(report.accounts.reduce((sum, account) => sum + account.moneyIn, 0), 'total'),
        cell(report.accounts.reduce((sum, account) => sum + account.moneyOut, 0), 'total'),
        cell(report.accounts.reduce((sum, account) => sum + account.closingBalance, 0), 'total'),
      ],
    ],
  })
  sheets.push({
    name: 'Koreksi & Void',
    widths: [12, 22, 40, 16, 10, 40, 20],
    rows: [
      [header('Tanggal'), header('Kode'), header('Keterangan'), header('Nominal'), header('Status'), header('Alasan'), header('Oleh')],
      ...report.corrections.map((row) => [wib(row.date), row.code, row.description, money(row.amount), row.status, row.reason, row.actor]),
    ],
  })
  sheets.push({
    name: 'Catatan',
    widths: [110],
    rows: [
      [header(`Catatan laporan ${lkMonthLabel(report.month)}`)],
      [`Kolom brand: ${report.branches.map((branch) => `${brandOf(branch)} = cabang ${branch}`).join('; ')}. Transaksi tingkat perusahaan masuk ${brandOf(LK_HEAD_OFFICE_BRANCH)} (HO).`],
      ['Penjualan diambil dari pesanan menurut tanggal pesanan (WIB); pesanan batal dan yang belum dibayar sama sekali tidak dihitung.'],
      ['FleurCake = pesanan yang semua produknya berjenis Flower Cake.'],
      ['Retur, beban, pendapatan & pengeluaran lainnya diambil dari ledger Keuangan menurut tanggal transaksi. Transaksi void tidak dihitung (lihat sheet Koreksi & Void).'],
      ['Kurang bayar = pesanan yang sudah selesai tetapi dibayar kurang dari totalnya. Lebih bayar = dibayar melebihi total (setelah pengembalian dana).'],
      ['Setoran modal Owner, transfer antar rekening, saldo awal dan penyesuaian saldo tidak masuk laba rugi.'],
      ['* Belum dicatat di OS: Packing, Money Bouquet, Penjualan Instalasi, Retur Delivery, dan rincian akun HPP/Beban sesuai LK. Akan terisi setelah fitur pencatatannya tersedia.'],
    ],
  })
  return zipSync(workbookFiles(sheets), { level: 0 })
}
