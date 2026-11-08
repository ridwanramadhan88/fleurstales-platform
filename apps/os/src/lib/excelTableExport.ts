/**
 * Shared table-style Excel export used by the OS download buttons
 * (Pesanan, Ulasan, Pelanggan, Rekap gaji, Absensi, ...).
 *
 * Every export follows the same shape: one header row with Indonesian column
 * titles, one row per record, Rupiah columns formatted as numbers, dates in
 * WIB. Built on the workbook writer used by the Finance reports.
 */
import { zipSync } from 'fflate'
import { cell, downloadFinancePeriodXlsx, header, money, workbookFiles, type WorkbookCell, type WorksheetSpec } from './financePeriodXlsxExport'

export type ExcelColumnKind = 'text' | 'money' | 'number'

export interface ExcelColumn<Row> {
  header: string
  width?: number
  kind?: ExcelColumnKind
  value: (row: Row) => string | number | null | undefined
}

const toCell = (kind: ExcelColumnKind | undefined, value: string | number | null | undefined): WorkbookCell => {
  if (value === null || value === undefined || value === '') return ''
  if (kind === 'money') return typeof value === 'number' && Number.isFinite(value) ? money(value) : cell(String(value))
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : String(value)
  return typeof value === 'number' && Number.isFinite(value) ? value : String(value)
}

export const tableSheet = <Row>(name: string, columns: ExcelColumn<Row>[], rows: Row[]): WorksheetSpec => ({
  // Excel sheet names: max 31 chars, no []:*?/\
  name: name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31),
  widths: columns.map((column) => column.width ?? (column.kind === 'money' ? 14 : 18)),
  rows: [
    columns.map((column) => header(column.header)),
    ...rows.map((row) => columns.map((column) => toCell(column.kind, column.value(row)))),
  ],
})

export const buildTableXlsx = (sheets: WorksheetSpec[]): Uint8Array => zipSync(workbookFiles(sheets), { level: 0 })

export const downloadTableXlsx = (filename: string, sheets: WorksheetSpec[]): void => {
  downloadFinancePeriodXlsx(filename, buildTableXlsx(sheets))
}

const WIB_DATE_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})
const WIB_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })

const parse = (value?: string | null): Date | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "2026-11-08 09:05" in WIB, or the raw value when it is not an ISO timestamp. */
export const wibDateTime = (value?: string | null): string => {
  const date = parse(value)
  return date ? WIB_DATE_TIME.format(date).replace(',', '') : (value ?? '')
}

/** "2026-11-08" in WIB. Plain YYYY-MM-DD values are returned unchanged. */
export const wibDate = (value?: string | null): string => {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = parse(value)
  return date ? WIB_DATE.format(date) : value
}

export const todayWib = (): string => WIB_DATE.format(new Date())

export const yesNo = (value: boolean | undefined | null): string => (value ? 'Ya' : 'Tidak')
