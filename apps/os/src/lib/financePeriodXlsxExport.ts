import { strToU8, zipSync } from 'fflate'
import type {
  FinancePeriodAccountReport,
  FinancePeriodReport,
} from '../domain/financePeriodReportDomain'
import { jakartaMonthKey } from '../domain/financePeriodReportDomain'
import type { FinanceTransaction } from '../store/financeStoreTypes'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const LEGACY_ACCOUNT_ID = 'legacy:unassigned'

type CellFormat = 'header' | 'currency'
type CellValue = string | number | null | undefined
interface StyledCell {
  value: CellValue
  format?: CellFormat
}
type WorkbookCell = CellValue | StyledCell
interface WorksheetSpec {
  name: string
  rows: WorkbookCell[][]
}

const cell = (value: CellValue, format?: CellFormat): StyledCell => ({ value, format })
const money = (value: number): StyledCell => cell(value, 'currency')
const header = (value: string): StyledCell => cell(value, 'header')

const xmlEscape = (value: unknown): string => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const columnName = (index: number): string => {
  let value = index + 1
  let result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

const unwrapCell = (entry: WorkbookCell): StyledCell => {
  if (typeof entry === 'object' && entry !== null && 'value' in entry) return entry
  return { value: entry }
}

const worksheetXml = (rows: WorkbookCell[][]): string => {
  const renderedRows = rows.map((row, rowIndex) => {
    const cells = row.map((entry, columnIndex) => {
      const { value, format } = unwrapCell(entry)
      if (value === null || value === undefined) return ''
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`
      const styleId = format === 'currency' ? 1 : format === 'header' ? 2 : 0
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"${styleId ? ` s="${styleId}"` : ''}><v>${value}</v></c>`
      }
      return `<c r="${ref}" t="inlineStr"${styleId ? ` s="${styleId}"` : ''}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${renderedRows}</sheetData></worksheet>`
}

const workbookFiles = (sheets: WorksheetSpec[]): Record<string, Uint8Array> => {
  const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const sheetEntries = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 2}"/>`).join('')
  const sheetRelationships = sheets.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')

  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${sheetRelationships}</Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;[Red]-#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  }
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = worksheetXml(sheet.rows)
  })
  return Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)]))
}

const transactionSource = (transaction: FinanceTransaction): string => transaction.source ?? 'manual'

export const buildFinancePeriodXlsx = (input: {
  report: FinancePeriodReport
  transactions: FinanceTransaction[]
  accounts?: FinancePeriodAccountReport[]
  accountLabels?: Record<string, string>
  periodStatus?: string
}): Uint8Array => {
  const targetMonth = input.report.periodMonth.slice(0, 7)
  const periodTransactions = input.transactions
    .filter((transaction) => transaction.status === 'verified' && transaction.amount > 0)
    .filter((transaction) => jakartaMonthKey(transaction.transactionDate ?? transaction.createdAt) === targetMonth)
    .sort((a, b) => {
      const dateCompare = (a.transactionDate ?? a.createdAt).localeCompare(b.transactionDate ?? b.createdAt)
      return dateCompare || a.createdAt.localeCompare(b.createdAt)
    })

  const accountLabel = (accountId?: string): string => {
    const id = accountId || LEGACY_ACCOUNT_ID
    return input.accountLabels?.[id] ?? id
  }

  const summaryRows: WorkbookCell[][] = [
    [header('Metric'), header('Value')],
    ['Period', input.report.periodMonth.slice(0, 7)],
    ['Status', input.periodStatus ?? ''],
    ['Opening Balance', money(input.report.openingBalance)],
    ['Operating Money In', money(input.report.operatingMoneyIn)],
    ['Operating Money Out', money(input.report.operatingMoneyOut)],
    ['Operating Net Cash Flow', money(input.report.operatingNetCashFlow)],
    ['Balance Adjustments', money(input.report.balanceAdjustments)],
    ['Internal Transfer Net', money(input.report.internalTransferNet)],
    ['Closing Balance', money(input.report.closingBalance)],
    ['Verified Transactions', input.report.transactionCount],
  ]

  const transactionRows: WorkbookCell[][] = [
    [
      header('Accounting Date'), header('Created At'), header('Transaction Code'), header('Direction'),
      header('Source'), header('Category'), header('Account'), header('Scope / Branch'), header('Method'),
      header('Order Number'), header('Reference'), header('Signed Amount (IDR)'), header('Actor'), header('Note / Description'),
    ],
    ...periodTransactions.map((transaction) => [
      transaction.transactionDate ?? transaction.createdAt,
      transaction.createdAt,
      transaction.transactionCode ?? '',
      transaction.type === 'income' ? 'In' : 'Out',
      transactionSource(transaction),
      transaction.category,
      accountLabel(transaction.accountId),
      (transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')) === 'company' ? 'Company-wide' : transaction.branch,
      transaction.method,
      transaction.orderNumber ?? '',
      transaction.reference ?? '',
      money(transaction.type === 'income' ? transaction.amount : -transaction.amount),
      transaction.actor,
      transaction.note ?? transaction.description,
    ]),
  ]

  const accountRows: WorkbookCell[][] = [
    [header('Account'), header('Opening'), header('Money In'), header('Money Out'), header('Closing'), header('Transactions')],
    ...(input.accounts ?? input.report.accounts).map((account) => [
      accountLabel(account.accountId),
      money(account.openingBalance),
      money(account.moneyIn),
      money(account.moneyOut),
      money(account.closingBalance),
      account.transactionCount,
    ]),
  ]

  const sourceRows: WorkbookCell[][] = [
    [header('Source'), header('Money In'), header('Money Out'), header('Net'), header('Transactions')],
    ...input.report.sources.map((source) => [
      source.label,
      money(source.moneyIn),
      money(source.moneyOut),
      money(source.net),
      source.transactionCount,
    ]),
  ]

  return zipSync(workbookFiles([
    { name: 'Summary', rows: summaryRows },
    { name: 'Transactions', rows: transactionRows },
    { name: 'By Account', rows: accountRows },
    { name: 'By Source', rows: sourceRows },
  ]), { level: 0 })
}

export const downloadFinancePeriodXlsx = (filename: string, workbook: Uint8Array): void => {
  const buffer = new ArrayBuffer(workbook.byteLength)
  new Uint8Array(buffer).set(workbook)
  const blob = new Blob([buffer], { type: XLSX_MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
