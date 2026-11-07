import type { FinanceTransaction } from '../store/financeStoreTypes'
import type { OrderTableRow } from '../types/orders'
import { buildFinancePeriodReport, jakartaMonthKey, type FinancePeriodAccountReport } from './financePeriodReportDomain'

/**
 * Monthly financial report in the company's LK layout (LK_<Bulan>_<Tahun>.xlsx):
 * PNL per brand with the previous month and growth, a sales report per branch,
 * an expense book per branch, cash per account, and the corrections/voids list.
 *
 * Basis (written into the workbook's notes sheet):
 * - Sales come from orders by order date (WIB), excluding cancelled orders and
 *   orders with nothing paid. FleurCake = every item is a Flower Cake product.
 * - Refunds, expenses and other income come from the Finance ledger by
 *   transaction date; only posted rows count (voided rows never do).
 * - Company-wide ledger rows belong to the head office (Kedamaian/Fleurstales).
 * - Packing, Money Bouquet, installation sales and the detailed HPP/Beban
 *   accounts are not recorded in the OS yet: those lines stay 0 and are marked.
 */

export const LK_BRAND_BY_BRANCH: Record<string, string> = {
  Kedamaian: 'Fleurstales',
  Pahoman: 'Fleurstation',
}
export const LK_HEAD_OFFICE_BRANCH = 'Kedamaian'
export const LK_SHEET_CODE_BY_BRANCH: Record<string, string> = { Kedamaian: 'HO', Pahoman: 'Flambo' }

const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export const lkMonthLabel = (month: string): string => {
  const [year, monthIndex] = month.split('-').map(Number)
  return `${MONTH_NAMES_ID[(monthIndex || 1) - 1]} ${year}`
}

export const lkFileName = (month: string): string => {
  const [year, monthIndex] = month.split('-').map(Number)
  return `LK_${MONTH_NAMES_ID[(monthIndex || 1) - 1]}_${year}.xlsx`
}

export const previousMonth = (month: string): string => {
  const [year, monthIndex] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthIndex - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export type LkLineKind = 'line' | 'subtotal' | 'total' | 'section'

export interface LkPnlLine {
  key: string
  label: string
  kind: LkLineKind
  /** Value per branch id for the selected month. */
  current: Record<string, number>
  previous: Record<string, number>
  /** Line exists in the LK but its data is not recorded in the OS yet. */
  notTracked?: boolean
}

export interface LkSalesRow {
  date: string
  orderNumber: string
  customer: string
  products: string
  quantity: number
  unitPrice: number | null
  productSubtotal: number
  packing: number
  moneyBouquet: number
  delivery: number
  discount: number
  total: number
  paid: number
  underpaid: number
  overpaid: number
  paymentStatus: string
  paymentMethod: string
  account: string
  reconCode: string
  orderStatus: string
}

export interface LkExpenseRow {
  date: string
  code: string
  account: string
  description: string
  amount: number
  cashAccount: string
  method: string
  reference: string
}

export interface LkCorrectionRow {
  date: string
  code: string
  description: string
  amount: number
  status: 'Void' | 'Diedit'
  reason: string
  actor: string
}

export interface LkReport {
  month: string
  previousMonth: string
  branches: string[]
  pnl: LkPnlLine[]
  sales: Record<string, { product: LkSalesRow[]; cake: LkSalesRow[] }>
  expenses: Record<string, LkExpenseRow[]>
  accounts: FinancePeriodAccountReport[]
  corrections: LkCorrectionRow[]
}

export interface LkReportInput {
  month: string
  branches: string[]
  orders: OrderTableRow[]
  transactions: FinanceTransaction[]
  /** productId -> catalogue product type (e.g. "Flower Cake"). */
  productTypes: Record<string, string>
  categoryLabel: (category: string) => string
  accountLabel: (accountId?: string) => string
}

// Ledger categories that move into the PNL (everything else is capital or
// internal: owner deposits, transfers, opening balances, adjustments).
const OTHER_INCOME_CATEGORIES = new Set(['other_income', 'reimbursement_received'])
const WALK_IN_CATEGORY = 'walk_in_sale'
const HPP_CATEGORIES = new Set(['supplies'])
const EXPENSE_LABELS: Record<string, string> = {
  payroll: 'Gaji karyawan',
  rent: 'Sewa',
  utilities: 'Listrik, air & internet',
  other: 'Beban lainnya',
}
const NON_PNL_SOURCES = new Set(['transfer', 'opening_balance', 'adjustment'])
const COMPLETED_STATUSES = new Set(['delivered', 'picked_up'])

const txDate = (transaction: FinanceTransaction): string => transaction.transactionDate ?? transaction.createdAt
const isPosted = (transaction: FinanceTransaction): boolean => transaction.status === 'verified' && transaction.amount > 0

export const lkBranchOfTransaction = (transaction: FinanceTransaction, branches: string[]): string => {
  const company = (transaction.scope ?? (transaction.branch === 'All' ? 'company' : 'branch')) === 'company'
  if (company || !branches.includes(transaction.branch)) return branches.includes(LK_HEAD_OFFICE_BRANCH) ? LK_HEAD_OFFICE_BRANCH : branches[0]
  return transaction.branch
}

export const isFleurCakeOrder = (order: OrderTableRow, productTypes: Record<string, string>): boolean => {
  const items = order.items ?? []
  if (items.length === 0) return false
  return items.every((item) => /cake/i.test(productTypes[item.productId ?? ''] ?? ''))
}

const orderDate = (order: OrderTableRow): string => order.createdAt ?? ''
const countsAsSale = (order: OrderTableRow): boolean => order.status !== 'cancelled' && (order.paidAmountIdr ?? 0) > 0
const productSubtotal = (order: OrderTableRow): number =>
  order.itemsSubtotalIdr ?? (order.items ?? []).reduce((sum, item) => sum + item.unitPriceIdr * item.quantity, 0)
const underpaid = (order: OrderTableRow): number =>
  COMPLETED_STATUSES.has(order.status) ? Math.max(0, order.totalIdr - (order.paidAmountIdr ?? 0)) : 0
const overpaid = (order: OrderTableRow): number =>
  Math.max(0, (order.paidAmountIdr ?? 0) - (order.refundAmountIdr ?? 0) - order.totalIdr)

interface MonthFigures {
  values: Map<string, Record<string, number>>
  expenseLines: Map<string, string>
}

const add = (figures: MonthFigures, key: string, branch: string, amount: number) => {
  const row = figures.values.get(key) ?? {}
  row[branch] = (row[branch] ?? 0) + amount
  figures.values.set(key, row)
}

const monthFigures = (input: LkReportInput, month: string): MonthFigures => {
  const figures: MonthFigures = { values: new Map(), expenseLines: new Map() }
  for (const order of input.orders) {
    if (!countsAsSale(order) || jakartaMonthKey(orderDate(order)) !== month) continue
    if (!input.branches.includes(order.branch)) continue
    const cake = isFleurCakeOrder(order, input.productTypes)
    add(figures, cake ? 'sales_cake' : 'sales_product', order.branch, productSubtotal(order))
    add(figures, cake ? 'delivery_cake' : 'delivery_product', order.branch, order.deliveryFeeIdr ?? 0)
    add(figures, 'discount', order.branch, order.discountIdr ?? 0)
    add(figures, 'overpaid', order.branch, overpaid(order))
    add(figures, 'underpaid', order.branch, underpaid(order))
  }
  for (const transaction of input.transactions) {
    if (!isPosted(transaction) || jakartaMonthKey(txDate(transaction)) !== month) continue
    const source = transaction.source ?? 'manual'
    if (NON_PNL_SOURCES.has(source) || source === 'order_payment') continue
    const branch = lkBranchOfTransaction(transaction, input.branches)
    const category = String(transaction.category)
    if (source === 'order_refund') {
      add(figures, 'refund', branch, transaction.amount)
    } else if (transaction.type === 'income') {
      if (category === WALK_IN_CATEGORY) add(figures, 'sales_walk_in', branch, transaction.amount)
      else if (OTHER_INCOME_CATEGORIES.has(category) || category.startsWith('custom:')) add(figures, 'other_income', branch, transaction.amount)
      // owner_deposit and other capital movements stay out of the PNL.
    } else if (HPP_CATEGORIES.has(category)) {
      add(figures, 'hpp_supplies', branch, transaction.amount)
    } else {
      const key = `expense:${category}`
      figures.expenseLines.set(key, EXPENSE_LABELS[category] ?? input.categoryLabel(category))
      add(figures, key, branch, transaction.amount)
    }
  }
  return figures
}

const sumRows = (rows: Record<string, number>[], branches: string[], signs: number[] = []): Record<string, number> =>
  Object.fromEntries(branches.map((branch) => [branch, rows.reduce((sum, row, index) => sum + (signs[index] ?? 1) * (row[branch] ?? 0), 0)]))

export const buildLkReport = (input: LkReportInput): LkReport => {
  const month = input.month.slice(0, 7)
  const prev = previousMonth(month)
  const current = monthFigures(input, month)
  const previous = monthFigures(input, prev)
  const branches = input.branches
  const value = (figures: MonthFigures, key: string) => Object.fromEntries(branches.map((branch) => [branch, figures.values.get(key)?.[branch] ?? 0]))
  const zero = Object.fromEntries(branches.map((branch) => [branch, 0]))

  const lines: LkPnlLine[] = []
  const line = (key: string, label: string, opts: { kind?: LkLineKind; notTracked?: boolean } = {}) => {
    const entry: LkPnlLine = { key, label, kind: opts.kind ?? 'line', current: opts.notTracked ? { ...zero } : value(current, key), previous: opts.notTracked ? { ...zero } : value(previous, key), notTracked: opts.notTracked }
    lines.push(entry)
    return entry
  }
  const computed = (key: string, label: string, kind: LkLineKind, parts: LkPnlLine[], signs: number[]) => {
    const entry: LkPnlLine = {
      key, label, kind,
      current: sumRows(parts.map((part) => part.current), branches, signs),
      previous: sumRows(parts.map((part) => part.previous), branches, signs),
    }
    lines.push(entry)
    return entry
  }
  const section = (label: string) => lines.push({ key: `section:${label}`, label, kind: 'section', current: {}, previous: {} })

  section('PENDAPATAN')
  const revenue = [
    line('sales_product', 'Penjualan Produk'),
    line('sales_walk_in', 'Penjualan langsung (walk-in)'),
    line('sales_installation', 'Penjualan Instalasi', { notTracked: true }),
    line('sales_cake', 'Penjualan FleurCake'),
    line('packing', 'Pendapatan Packing', { notTracked: true }),
    line('delivery_product', 'Pendapatan Delivery Produk'),
    line('delivery_cake', 'Pendapatan Delivery FleurCake'),
  ]
  const grossRevenue = computed('gross_revenue', 'Total Pendapatan', 'subtotal', revenue, revenue.map(() => 1))
  const refund = line('refund', 'Retur Penjualan')
  const deliveryReturn = line('delivery_return', 'Retur Delivery', { notTracked: true })
  const discount = line('discount', 'Diskon Penjualan')
  const netRevenue = computed('net_revenue', 'PENDAPATAN BERSIH', 'total', [grossRevenue, refund, deliveryReturn, discount], [1, -1, -1, -1])

  section('HARGA POKOK PENJUALAN (HPP)')
  const hpp = [line('hpp_supplies', 'Bahan & perlengkapan (Supplies)')]
  const hppTotal = computed('hpp_total', 'TOTAL HPP', 'subtotal', hpp, [1])
  const grossProfit = computed('gross_profit', 'LABA KOTOR', 'total', [netRevenue, hppTotal], [1, -1])

  section('BEBAN OPERASIONAL')
  const expenseKeys = [...new Set([...current.expenseLines.keys(), ...previous.expenseLines.keys()])]
    .sort((a, b) => (a === 'expense:payroll' ? -1 : b === 'expense:payroll' ? 1 : a.localeCompare(b)))
  const expenses = expenseKeys.map((key) => line(key, current.expenseLines.get(key) ?? previous.expenseLines.get(key) ?? key))
  const expenseTotal = computed('expense_total', 'TOTAL BEBAN', 'subtotal', expenses, expenses.map(() => 1))
  const operatingProfit = computed('operating_profit', 'LABA OPERASIONAL', 'total', [grossProfit, expenseTotal], [1, -1])

  section('PENDAPATAN LAINNYA')
  const otherIncome = [
    line('money_bouquet_income', 'Uang Money Bouquet', { notTracked: true }),
    line('overpaid', 'Lebih bayar'),
    line('other_income', 'Pendapatan lainnya'),
  ]
  const otherIncomeTotal = computed('other_income_total', 'Total Pendapatan Lainnya', 'subtotal', otherIncome, otherIncome.map(() => 1))

  section('PENGELUARAN LAINNYA')
  const otherExpense = [
    line('money_bouquet_deposit', 'Deposit Money Bouquet', { notTracked: true }),
    line('underpaid', 'Kurang bayar'),
  ]
  const otherExpenseTotal = computed('other_expense_total', 'Total Pengeluaran Lainnya', 'subtotal', otherExpense, otherExpense.map(() => 1))
  computed('net_profit', 'LABA BERSIH', 'total', [operatingProfit, otherIncomeTotal, otherExpenseTotal], [1, 1, -1])

  const sales: LkReport['sales'] = Object.fromEntries(branches.map((branch) => [branch, { product: [] as LkSalesRow[], cake: [] as LkSalesRow[] }]))
  for (const order of [...input.orders].sort((a, b) => orderDate(a).localeCompare(orderDate(b)))) {
    if (!countsAsSale(order) || jakartaMonthKey(orderDate(order)) !== month || !sales[order.branch]) continue
    const items = order.items ?? []
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0)
    const lastPayment = [...(order.paymentHistory ?? [])].reverse().find((event) => event.type === 'payment_received')
    const ledgerPayment = input.transactions
      .filter((transaction) => transaction.source === 'order_payment' && transaction.orderNumber === order.orderNumber && transaction.status === 'verified')
      .sort((a, b) => txDate(b).localeCompare(txDate(a)))[0]
    const row: LkSalesRow = {
      date: orderDate(order),
      orderNumber: order.orderNumber,
      customer: order.customerName,
      products: items.map((item) => `${item.productNameSnapshot ?? item.productName ?? 'Produk'}${item.variantSizeSnapshot ? ` (${item.variantSizeSnapshot})` : ''} ×${item.quantity}`).join(', ') || (order.productName ?? ''),
      quantity,
      unitPrice: items.length === 1 ? items[0].unitPriceIdr : null,
      productSubtotal: productSubtotal(order),
      packing: 0,
      moneyBouquet: 0,
      delivery: order.deliveryFeeIdr ?? 0,
      discount: order.discountIdr ?? 0,
      total: order.totalIdr,
      paid: order.paidAmountIdr ?? 0,
      underpaid: underpaid(order),
      overpaid: overpaid(order),
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentChannel === 'qris' ? 'QRIS' : order.paymentMethod === 'cash' ? 'Tunai' : order.paymentMethod === 'transfer' ? 'Transfer' : '',
      account: ledgerPayment ? input.accountLabel(ledgerPayment.accountId) : '',
      reconCode: order.financeReferenceCode ?? ledgerPayment?.reference ?? lastPayment?.reference ?? '',
      orderStatus: order.status,
    }
    sales[order.branch][isFleurCakeOrder(order, input.productTypes) ? 'cake' : 'product'].push(row)
  }

  const expensesByBranch: LkReport['expenses'] = Object.fromEntries(branches.map((branch) => [branch, [] as LkExpenseRow[]]))
  const monthRows = input.transactions
    .filter((transaction) => jakartaMonthKey(txDate(transaction)) === month)
    .sort((a, b) => txDate(a).localeCompare(txDate(b)))
  for (const transaction of monthRows) {
    const source = transaction.source ?? 'manual'
    if (!isPosted(transaction) || transaction.type !== 'expense' || NON_PNL_SOURCES.has(source) || source === 'order_refund') continue
    expensesByBranch[lkBranchOfTransaction(transaction, branches)]?.push({
      date: txDate(transaction),
      code: transaction.transactionCode ?? '',
      account: HPP_CATEGORIES.has(String(transaction.category)) ? 'HPP · Supplies' : EXPENSE_LABELS[String(transaction.category)] ?? input.categoryLabel(String(transaction.category)),
      description: [transaction.name, transaction.note ?? transaction.description].filter(Boolean).join(' — '),
      amount: transaction.amount,
      cashAccount: input.accountLabel(transaction.accountId),
      method: transaction.method === 'cash' ? 'Tunai' : 'Transfer',
      reference: transaction.reference ?? '',
    })
  }

  const corrections: LkCorrectionRow[] = monthRows
    .filter((transaction) => transaction.status === 'void' || (transaction.editHistory ?? []).some((record) => record.kind !== 'void'))
    .map((transaction) => {
      const voided = transaction.status === 'void'
      const lastEdit = [...(transaction.editHistory ?? [])].reverse().find((record) => voided ? record.kind === 'void' : record.kind !== 'void')
      return {
        date: txDate(transaction),
        code: transaction.transactionCode ?? transaction.id,
        description: [transaction.orderNumber, transaction.name ?? transaction.description].filter(Boolean).join(' · '),
        amount: transaction.amount,
        status: voided ? 'Void' as const : 'Diedit' as const,
        reason: (voided ? transaction.voidReason : lastEdit?.reason) ?? '',
        actor: (voided ? transaction.voidedBy : lastEdit?.editedBy) ?? '',
      }
    })

  return {
    month,
    previousMonth: prev,
    branches,
    pnl: lines,
    sales,
    expenses: expensesByBranch,
    accounts: buildFinancePeriodReport(input.transactions, `${month}-01`).accounts,
    corrections,
  }
}

export const lkTotal = (values: Record<string, number>, branches: string[]): number =>
  branches.reduce((sum, branch) => sum + (values[branch] ?? 0), 0)

/** Growth as a fraction (0.12 = 12%); null when last month was 0. */
export const lkGrowth = (current: number, previous: number): number | null =>
  previous === 0 ? null : (current - previous) / Math.abs(previous)
