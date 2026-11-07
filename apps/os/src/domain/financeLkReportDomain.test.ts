import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import type { OrderTableRow } from '../types/orders'
import { buildLkReport, lkFileName, lkGrowth, lkTotal, previousMonth } from './financeLkReportDomain'
import { buildFinanceLkXlsx } from '../lib/financeLkXlsxExport'

const order = (patch: Partial<OrderTableRow>): OrderTableRow => ({
  orderNumber: 'KDM-2026-0001', customerName: 'Sinta', source: 'whatsapp', fulfillment: 'pickup', status: 'picked_up',
  branch: 'Kedamaian', paymentStatus: 'paid', paymentMethod: 'transfer', createdAtLabel: '', createdAt: '2026-10-10T03:00:00.000Z',
  items: [{ id: 'i1', productId: 'p-bouquet', productNameSnapshot: 'Pink Lily', quantity: 2, unitPriceIdr: 100000 }],
  itemsSubtotalIdr: 200000, discountIdr: 20000, deliveryFeeIdr: 0, totalIdr: 180000, paidAmountIdr: 180000,
  ...patch,
} as OrderTableRow)

const tx = (patch: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: `t-${Math.random()}`, type: 'expense', category: 'supplies', branch: 'Kedamaian', scope: 'branch', amount: 50000, method: 'cash',
  status: 'verified', description: '', actor: 'Finance', createdAt: '2026-10-12T03:00:00.000Z', updatedAt: '2026-10-12T03:00:00.000Z',
  transactionDate: '2026-10-12T03:00:00.000Z', source: 'manual', accountId: 'cash:main',
  ...patch,
})

const orders: OrderTableRow[] = [
  order({}),
  order({ orderNumber: 'PHM-2026-0001', branch: 'Pahoman', items: [{ id: 'i2', productId: 'p-cake', productNameSnapshot: 'Dome Cake', quantity: 1, unitPriceIdr: 300000 }], itemsSubtotalIdr: 300000, discountIdr: 0, deliveryFeeIdr: 25000, totalIdr: 325000, paidAmountIdr: 325000 }),
  order({ orderNumber: 'KDM-2026-0002', status: 'cancelled', paidAmountIdr: 0 }),
  order({ orderNumber: 'KDM-2026-0003', status: 'confirmed', paymentStatus: 'unpaid', paidAmountIdr: 0 }),
  // Completed but short by 30.000 -> kurang bayar.
  order({ orderNumber: 'KDM-2026-0004', items: [{ id: 'i3', productId: 'p-bouquet', quantity: 1, unitPriceIdr: 130000 }], itemsSubtotalIdr: 130000, discountIdr: 0, totalIdr: 130000, paidAmountIdr: 100000, paymentStatus: 'partial' }),
  // Previous month, for growth.
  order({ orderNumber: 'KDM-2026-0000', createdAt: '2026-09-20T03:00:00.000Z', itemsSubtotalIdr: 100000, discountIdr: 0, totalIdr: 100000, paidAmountIdr: 100000 }),
]

const transactions: FinanceTransaction[] = [
  tx({ category: 'supplies', amount: 60000 }),
  tx({ category: 'rent', branch: 'Pahoman', amount: 1000000 }),
  tx({ category: 'payroll', source: 'payroll', branch: 'All', scope: 'company', amount: 2000000 }),
  tx({ category: 'order_refund', source: 'order_refund', type: 'expense', branch: 'Pahoman', amount: 25000, orderNumber: 'PHM-2026-0001' }),
  tx({ category: 'other_income', type: 'income', amount: 15000 }),
  tx({ category: 'owner_deposit', type: 'income', branch: 'All', scope: 'company', amount: 5000000 }),
  tx({ category: 'other', source: 'transfer', transferId: 'tr', amount: 300000 }),
  tx({ category: 'supplies', amount: 999999, status: 'void', voidReason: 'dobel', voidedBy: 'Finance' }),
  tx({ category: 'order_payment', source: 'order_payment', type: 'income', amount: 180000, orderNumber: 'KDM-2026-0001', accountId: 'bank-bca', reference: 'BCA/01' }),
]

const report = buildLkReport({
  month: '2026-10',
  branches: ['Kedamaian', 'Pahoman'],
  orders,
  transactions,
  productTypes: { 'p-bouquet': 'Bouquet', 'p-cake': 'Flower Cake' },
  categoryLabel: (category) => category,
  accountLabel: (id) => (id === 'bank-bca' ? 'BCA · 123' : id ?? ''),
})
const line = (key: string) => report.pnl.find((entry) => entry.key === key)!

describe('LK financial report', () => {
  it('builds sales per brand from paid, non-cancelled orders', () => {
    expect(line('sales_product').current).toEqual({ Kedamaian: 330000, Pahoman: 0 })
    expect(line('sales_cake').current).toEqual({ Kedamaian: 0, Pahoman: 300000 })
    expect(line('delivery_cake').current.Pahoman).toBe(25000)
    expect(line('discount').current.Kedamaian).toBe(20000)
    expect(line('refund').current.Pahoman).toBe(25000)
    expect(line('net_revenue').current).toEqual({ Kedamaian: 310000, Pahoman: 300000 })
  })

  it('takes HPP and expenses from the ledger, company rows to the head office, never voids or capital', () => {
    expect(line('hpp_total').current).toEqual({ Kedamaian: 60000, Pahoman: 0 })
    expect(line('expense:payroll').current.Kedamaian).toBe(2000000)
    expect(line('expense:rent').current.Pahoman).toBe(1000000)
    expect(line('expense_total').current).toEqual({ Kedamaian: 2000000, Pahoman: 1000000 })
    expect(line('other_income').current.Kedamaian).toBe(15000)
    expect(line('underpaid').current.Kedamaian).toBe(30000)
    // 310.000 - 60.000 - 2.000.000 + 15.000 - 30.000
    expect(line('net_profit').current.Kedamaian).toBe(-1765000)
    expect(line('net_profit').current.Pahoman).toBe(-700000)
  })

  it('compares with the previous month', () => {
    expect(line('sales_product').previous.Kedamaian).toBe(100000)
    expect(lkGrowth(lkTotal(line('sales_product').current, report.branches), 100000)).toBeCloseTo(2.3)
    expect(lkGrowth(10, 0)).toBeNull()
    expect(previousMonth('2026-01')).toBe('2025-12')
  })

  it('lists sales, expenses and corrections per branch', () => {
    expect(report.sales.Kedamaian.product.map((row) => row.orderNumber)).toEqual(['KDM-2026-0001', 'KDM-2026-0004'])
    expect(report.sales.Pahoman.cake.map((row) => row.orderNumber)).toEqual(['PHM-2026-0001'])
    expect(report.sales.Kedamaian.product[0]).toMatchObject({ account: 'BCA · 123', reconCode: 'BCA/01', products: 'Pink Lily ×2' })
    expect(report.expenses.Kedamaian.map((row) => row.amount)).toEqual([60000, 2000000])
    expect(report.corrections).toEqual([expect.objectContaining({ status: 'Void', reason: 'dobel', amount: 999999 })])
  })

  it('writes the workbook with the LK sheets', () => {
    const files = unzipSync(buildFinanceLkXlsx(report, (id) => id ?? ''))
    const workbook = strFromU8(files['xl/workbook.xml'])
    for (const name of ['PNL', 'SR HO', 'SR Flambo', 'SR Cake HO', 'SR Cake Flambo', 'SR Instalasi', 'EXP HO', 'EXP Flambo', 'Kas &amp; Rekening', 'Koreksi &amp; Void', 'Catatan']) {
      expect(workbook).toContain(`name="${name}"`)
    }
    const pnl = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(pnl).toContain('LAPORAN LABA RUGI — OKTOBER 2026')
    expect(pnl).toContain('Fleurstales')
    expect(pnl).toContain('Fleurstation')
    expect(pnl).toContain('Pendapatan Packing *')
    expect(lkFileName('2026-10')).toBe('LK_Oktober_2026.xlsx')
  })
})
