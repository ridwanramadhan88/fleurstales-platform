import { describe, expect, it } from 'vitest'
import { createRevenueVectorPdf, createScheduleVectorPdf } from './vectorPdfExport'

const pdfBinary = (pdf: ReturnType<typeof createRevenueVectorPdf>): string => {
  const bytes = new Uint8Array(pdf.output('arraybuffer'))
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
}

describe('vector PDF exports', () => {
  it('creates a single-page revenue PDF without bitmap image objects', () => {
    const pdf = createRevenueVectorPdf({
      title: 'Revenue',
      subtitle: 'Confirmed collections',
      scope: 'All branches · 07 Jul - 13 Jul',
      periodLabel: '07 Jul - 13 Jul',
      selectedPeriod: '7d',
      compareMode: 'single',
      compareModeLabels: ['Single view', 'Period vs Previous Period', 'Revenue vs Expense'],
      summaryCards: [
        { label: 'Revenue confirmed', value: 'Rp 1.000.000', helper: 'Finance confirmed' },
        { label: 'Revenue est.', value: 'Rp 1.250.000', helper: 'Confirmed + Rp 250.000 pending' },
        { label: 'Orders confirmed', value: '4', helper: 'Orders in confirmed revenue' },
        { label: 'Avg. order value', value: 'Rp 250.000', helper: 'Per confirmed order' },
      ],
      trendLabel: 'Revenue confirmed, by day',
      trend: [
        { label: '07 Jul', seriesA: 400_000, seriesB: 0 },
        { label: '08 Jul', seriesA: 600_000, seriesB: 0 },
      ],
      seriesALabel: 'Revenue confirmed',
    })

    expect(pdf.getNumberOfPages()).toBe(1)
    expect(pdfBinary(pdf)).not.toContain('/Subtype /Image')
  })

  it('creates a vector weekly schedule with visible branch hours', () => {
    const pdf = createScheduleVectorPdf({
      title: 'Weekly scheduling',
      subtitle: 'Mon 13 Jul - Sun 19 Jul · All branches',
      status: 'Draft',
      dateLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      rows: [
        {
          name: 'Akbar',
          role: 'Admin',
          cells: [
            { kind: 'shift', branch: 'Kedamaian', startTime: '07:30', endTime: '16:30' },
            { kind: 'shift', branch: 'Pahoman', startTime: '10:00', endTime: '19:00' },
            { kind: 'off', label: 'OFF' },
            { kind: 'unassigned' },
            { kind: 'unassigned' },
            { kind: 'unassigned' },
            { kind: 'unassigned' },
          ],
          summaryPrimary: '2 work · 1 OFF',
          summarySecondary: 'KDM 1 · PHM 1',
        },
      ],
      stats: [{ label: 'Staff', value: 1 }],
      coverageWarnings: [],
      suggestions: [],
    })

    expect(pdf.getNumberOfPages()).toBe(1)
    expect(pdfBinary(pdf)).not.toContain('/Subtype /Image')
  })
})
