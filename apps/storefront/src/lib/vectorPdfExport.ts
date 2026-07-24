import { jsPDF } from 'jspdf'
import { formatIdrCurrency } from './formatters'
import { getUiLanguage } from '../i18n/uiLanguage'
import { translateUiText } from '../i18n/translateUiText'

/**
 * Native vector PDF exports for Fleurstales.
 *
 * Every visible element is drawn with PDF text, lines, paths and fills. No
 * screenshots, canvas captures or bitmap images are used, so text remains
 * sharp, selectable and searchable at any zoom level.
 */

const C = {
  background: '#F7F7FA',
  card: '#FFFFFF',
  foreground: '#17171B',
  mutedForeground: '#6C6C76',
  muted: '#F0F0F5',
  border: '#E3E3EA',
  primary: '#2A2D32',
  primarySoft: '#F0F1F2',
  success: '#22A95B',
  successSoft: '#ECF9F1',
  warning: '#F59E0B',
  warningSoft: '#FFF7E6',
  destructive: '#EF493F',
  destructiveSoft: '#FFF0EF',
  kedamaianFill: '#ECFDF5',
  kedamaianText: '#064E3B',
  kedamaianBorder: '#A7F3D0',
  pahomanFill: '#EFF6FF',
  pahomanText: '#1E3A8A',
  pahomanBorder: '#BFDBFE',
  offFill: '#3F3F46',
  offText: '#FFFFFF',
} as const

type ColorKey = keyof typeof C

type Pdf = jsPDF

const pdfCopy = (value: string): string => translateUiText(value, getUiLanguage())


const setFill = (pdf: Pdf, color: string) => pdf.setFillColor(color)
const setStroke = (pdf: Pdf, color: string) => pdf.setDrawColor(color)
const setText = (pdf: Pdf, color: string) => pdf.setTextColor(color)

const roundedCard = (
  pdf: Pdf,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: string; border?: string; radius?: number } = {},
) => {
  setFill(pdf, options.fill ?? C.card)
  setStroke(pdf, options.border ?? C.border)
  pdf.setLineWidth(0.8)
  pdf.roundedRect(x, y, width, height, options.radius ?? 12, options.radius ?? 12, 'FD')
}

const labelText = (pdf: Pdf, value: string, x: number, y: number, maxWidth?: number) => {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  setText(pdf, C.mutedForeground)
  pdf.text(pdfCopy(value), x, y, maxWidth ? { maxWidth } : undefined)
}

const bodyText = (
  pdf: Pdf,
  value: string,
  x: number,
  y: number,
  options: { size?: number; weight?: 'normal' | 'bold'; color?: string; maxWidth?: number; align?: 'left' | 'center' | 'right' } = {},
) => {
  pdf.setFont('helvetica', options.weight ?? 'normal')
  pdf.setFontSize(options.size ?? 10)
  setText(pdf, options.color ?? C.foreground)
  pdf.text(pdfCopy(value), x, y, {
    maxWidth: options.maxWidth,
    align: options.align,
  })
}

const splitText = (pdf: Pdf, value: string, maxWidth: number): string[] =>
  pdf.splitTextToSize(pdfCopy(value), maxWidth) as string[]

const pill = (
  pdf: Pdf,
  value: string,
  x: number,
  y: number,
  options: { active?: boolean; fill?: string; text?: string; border?: string; height?: number; paddingX?: number } = {},
): number => {
  const height = options.height ?? 24
  const paddingX = options.paddingX ?? 10
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  const renderedValue = pdfCopy(value)
  const width = pdf.getTextWidth(renderedValue) + paddingX * 2
  setFill(pdf, options.fill ?? (options.active ? C.card : C.muted))
  setStroke(pdf, options.border ?? C.border)
  pdf.setLineWidth(0.6)
  pdf.roundedRect(x, y, width, height, height / 2, height / 2, 'FD')
  setText(pdf, options.text ?? (options.active ? C.foreground : C.mutedForeground))
  pdf.text(renderedValue, x + width / 2, y + height / 2 + 3, { align: 'center' })
  return width
}

const safeFileSave = (pdf: Pdf, filename: string) => {
  pdf.save(filename)
}

const createCustomPdf = (width: number, height: number, title: string): Pdf => {
  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [width, height],
    compress: true,
    putOnlyUsedFonts: true,
  })
  pdf.setProperties({
    title: pdfCopy(title),
    subject: pdfCopy('Fleurstales operational report'),
    author: 'Fleurstales',
    creator: 'Fleurstales OS',
  })
  setFill(pdf, C.background)
  pdf.rect(0, 0, width, height, 'F')
  return pdf
}

const formatAxisIdr = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`
  if (abs >= 1_000) return `${Math.round(value / 1_000)}rb`
  return String(Math.round(value))
}

const linePath = (
  pdf: Pdf,
  points: Array<{ x: number; y: number }>,
  color: string,
  width = 2,
) => {
  if (points.length < 2) return
  setStroke(pdf, color)
  pdf.setLineWidth(width)
  const relative = points.slice(1).map((point, index) => [
    point.x - points[index].x,
    point.y - points[index].y,
  ] as [number, number])
  pdf.lines(relative, points[0].x, points[0].y, [1, 1], 'S', false)
  points.forEach((point) => {
    setFill(pdf, color)
    pdf.circle(point.x, point.y, 2.3, 'F')
  })
}

const areaPath = (
  pdf: Pdf,
  points: Array<{ x: number; y: number }>,
  baselineY: number,
  fill: string,
) => {
  if (points.length < 2) return
  const polygon = [
    ...points,
    { x: points[points.length - 1].x, y: baselineY },
    { x: points[0].x, y: baselineY },
  ]
  const relative = polygon.slice(1).map((point, index) => [
    point.x - polygon[index].x,
    point.y - polygon[index].y,
  ] as [number, number])
  setFill(pdf, fill)
  setStroke(pdf, fill)
  pdf.lines(relative, polygon[0].x, polygon[0].y, [1, 1], 'F', true)
}

export interface VectorTrendPoint {
  label: string
  seriesA: number
  seriesB: number
}

export type VectorRevenueCompareMode = 'single' | 'period_vs_period' | 'income_expense' | 'branch_vs_branch'

export interface VectorRevenuePdfInput {
  title: string
  subtitle: string
  scope: string
  periodLabel: string
  selectedPeriod: string
  compareMode: VectorRevenueCompareMode
  compareModeLabels: string[]
  summaryCards: Array<{
    label: string
    value: string
    helper: string
    tone?: 'default' | 'success' | 'danger'
  }>
  compareCards?: Array<{
    label: string
    value: string
    helper: string
    badge?: string
    tone?: 'primary' | 'success' | 'danger' | 'default'
  }>
  trendLabel: string
  trend: VectorTrendPoint[]
  seriesALabel: string
  seriesBLabel?: string
  detailedAnalysis?: {
    branchRevenue: Array<{ branch: string; totalIdr: number; orderCount: number }>
    topCustomers: Array<{ customerName: string; totalIdr: number; orderCount: number }>
    paymentBreakdown: Array<{ status: string; totalIdr: number; count: number }>
    sourceBreakdown: Array<{ source: string; totalIdr: number; count: number }>
  }
}

const drawSummaryCard = (
  pdf: Pdf,
  card: VectorRevenuePdfInput['summaryCards'][number],
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  roundedCard(pdf, x, y, width, height)
  labelText(pdf, card.label, x + 18, y + 24, width - 36)
  bodyText(pdf, card.value, x + 18, y + 72, {
    size: 25,
    weight: 'bold',
    color: card.tone === 'danger' ? C.destructive : card.tone === 'success' ? C.success : C.foreground,
    maxWidth: width - 36,
  })
  const helperLines = splitText(pdf, card.helper, width - 36).slice(0, 2)
  helperLines.forEach((line, index) => {
    bodyText(pdf, line, x + 18, y + height - 34 + index * 13, {
      size: 10,
      color: C.mutedForeground,
      maxWidth: width - 36,
    })
  })
}

const drawCompareCard = (
  pdf: Pdf,
  card: NonNullable<VectorRevenuePdfInput['compareCards']>[number],
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  roundedCard(pdf, x, y, width, height)
  labelText(pdf, card.label.toUpperCase(), x + 16, y + 23, width - 48)
  if (card.badge) {
    const tone = card.tone === 'success' ? { fill: C.successSoft, text: C.success } : { fill: C.primarySoft, text: C.primary }
    const badgeWidth = pill(pdf, card.badge, x + width - 44, y + 11, { fill: tone.fill, text: tone.text, border: tone.fill, height: 20, paddingX: 7 })
    // Keep the badge aligned to the right even if the text width changes.
    if (badgeWidth !== 28) {
      setFill(pdf, C.card)
      pdf.rect(x + width - 50, y + 8, 50, 28, 'F')
      pill(pdf, card.badge, x + width - badgeWidth - 14, y + 11, { fill: tone.fill, text: tone.text, border: tone.fill, height: 20, paddingX: 7 })
    }
  }
  bodyText(pdf, card.value, x + 16, y + 64, {
    size: 21,
    weight: 'bold',
    color: card.tone === 'danger' ? C.destructive : card.tone === 'success' ? C.success : C.foreground,
    maxWidth: width - 32,
  })
  const helperLines = splitText(pdf, card.helper, width - 32).slice(0, 2)
  helperLines.forEach((line, index) => bodyText(pdf, line, x + 16, y + height - 28 + index * 12, { size: 9, color: C.mutedForeground }))
}

const drawRevenueChart = (
  pdf: Pdf,
  input: VectorRevenuePdfInput,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const chartLeft = x + 48
  const chartTop = y + 18
  const chartWidth = width - 66
  const chartHeight = height - 54
  const baselineY = chartTop + chartHeight
  const allValues = input.trend.flatMap((point) => [point.seriesA, input.compareMode === 'single' ? 0 : point.seriesB])
  const maxValue = Math.max(1, ...allValues)
  const minValue = Math.min(0, ...allValues)
  const range = Math.max(1, maxValue - minValue)

  for (let line = 0; line <= 4; line += 1) {
    const ratio = line / 4
    const lineY = chartTop + chartHeight * ratio
    setStroke(pdf, C.border)
    pdf.setLineWidth(0.6)
    pdf.setLineDashPattern([4, 4], 0)
    pdf.line(chartLeft, lineY, chartLeft + chartWidth, lineY)
    pdf.setLineDashPattern([], 0)
    const value = maxValue - range * ratio
    bodyText(pdf, formatAxisIdr(value), chartLeft - 8, lineY + 3, {
      size: 8,
      color: C.mutedForeground,
      align: 'right',
    })
  }

  if (input.trend.length === 0) {
    bodyText(pdf, 'No data recorded in this period.', chartLeft + chartWidth / 2, chartTop + chartHeight / 2, {
      size: 10,
      color: C.mutedForeground,
      align: 'center',
    })
    return
  }

  const xAt = (index: number) => input.trend.length === 1
    ? chartLeft + chartWidth / 2
    : chartLeft + (chartWidth * index) / (input.trend.length - 1)
  const yAt = (value: number) => chartTop + ((maxValue - value) / range) * chartHeight

  const seriesA = input.trend.map((point, index) => ({ x: xAt(index), y: yAt(point.seriesA) }))
  areaPath(pdf, seriesA, baselineY, '#E9F4FF')
  linePath(pdf, seriesA, C.primary, 2.2)

  if (input.compareMode !== 'single') {
    const seriesB = input.trend.map((point, index) => ({ x: xAt(index), y: yAt(point.seriesB) }))
    areaPath(pdf, seriesB, baselineY, '#EAF8F0')
    linePath(pdf, seriesB, C.success, 2.2)
  }

  const maxLabels = 8
  const labelStep = Math.max(1, Math.ceil(input.trend.length / maxLabels))
  input.trend.forEach((point, index) => {
    if (index % labelStep !== 0 && index !== input.trend.length - 1) return
    bodyText(pdf, point.label, xAt(index), baselineY + 17, {
      size: 8,
      color: C.mutedForeground,
      align: 'center',
    })
  })
}

const drawAnalysisBarList = (
  pdf: Pdf,
  title: string,
  rows: Array<{ label: string; value: number; suffix: string; color?: string }>,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  roundedCard(pdf, x, y, width, height)
  labelText(pdf, title, x + 16, y + 22)
  const maxValue = Math.max(1, ...rows.map((row) => row.value))
  if (!rows.length) {
    bodyText(pdf, 'No data yet.', x + 16, y + 50, { size: 10, color: C.mutedForeground })
    return
  }
  rows.slice(0, 5).forEach((row, index) => {
    const rowY = y + 48 + index * 32
    bodyText(pdf, row.label, x + 16, rowY, { size: 9, weight: 'bold', maxWidth: width * 0.52 })
    bodyText(pdf, `${formatIdrCurrency(row.value)} · ${row.suffix}`, x + width - 16, rowY, {
      size: 8,
      color: C.mutedForeground,
      align: 'right',
    })
    setFill(pdf, C.muted)
    pdf.roundedRect(x + 16, rowY + 8, width - 32, 6, 3, 3, 'F')
    setFill(pdf, row.color ?? C.primary)
    pdf.roundedRect(x + 16, rowY + 8, ((width - 32) * row.value) / maxValue, 6, 3, 3, 'F')
  })
}

export const createRevenueVectorPdf = (input: VectorRevenuePdfInput): Pdf => {
  const pageWidth = 1200
  const showCompare = input.compareMode !== 'single' && Boolean(input.compareCards?.length)
  const analysisHeight = input.detailedAnalysis ? 460 : 0
  const pageHeight = 72 + 154 + 24 + 382 + (showCompare ? 132 : 0) + analysisHeight + 52
  const pdf = createCustomPdf(pageWidth, pageHeight, input.title)
  const margin = 28
  let y = 30

  bodyText(pdf, input.title, margin, y + 18, { size: 21, weight: 'bold' })
  bodyText(pdf, input.subtitle, margin, y + 40, { size: 10, color: C.mutedForeground, maxWidth: 760 })
  pill(pdf, input.scope, pageWidth - margin - 150, y + 4, { active: true, fill: C.card, text: C.foreground, border: C.border, height: 28 })
  y += 68

  const summaryGap = 14
  const summaryWidth = (pageWidth - margin * 2 - summaryGap * 3) / 4
  input.summaryCards.slice(0, 4).forEach((card, index) => {
    drawSummaryCard(pdf, card, margin + index * (summaryWidth + summaryGap), y, summaryWidth, 142)
  })
  y += 166

  const trendCardHeight = showCompare ? 490 : 358
  roundedCard(pdf, margin, y, pageWidth - margin * 2, trendCardHeight)
  labelText(pdf, 'Revenue trend', margin + 20, y + 26)
  bodyText(pdf, input.trendLabel, margin + 20, y + 47, { size: 10, color: C.mutedForeground, maxWidth: 620 })

  let periodX = pageWidth - margin - 250
  ;['7d', '14d', '30d', 'Custom'].forEach((label) => {
    const active = input.selectedPeriod === label
    periodX += pill(pdf, label, periodX, y + 15, { active, height: 25, paddingX: 10 }) + 5
  })

  let modeX = margin + 20
  input.compareModeLabels.forEach((label) => {
    const normalized = label.toLowerCase()
    const active = (
      (input.compareMode === 'single' && normalized.includes('single')) ||
      (input.compareMode === 'period_vs_period' && normalized.includes('previous')) ||
      (input.compareMode === 'income_expense' && normalized.includes('expense')) ||
      (input.compareMode === 'branch_vs_branch' && normalized.includes('branch'))
    )
    modeX += pill(pdf, label, modeX, y + 64, { active, height: 27, paddingX: 12 }) + 6
  })

  let chartY = y + 108
  if (showCompare && input.compareCards) {
    const compareGap = 10
    const compareWidth = (pageWidth - margin * 2 - 40 - compareGap * 2) / 3
    input.compareCards.slice(0, 3).forEach((card, index) => {
      drawCompareCard(pdf, card, margin + 20 + index * (compareWidth + compareGap), y + 106, compareWidth, 112)
    })
    chartY = y + 230
  }
  drawRevenueChart(pdf, input, margin + 20, chartY, pageWidth - margin * 2 - 40, 215)

  const legendY = y + trendCardHeight - 24
  setFill(pdf, C.primary)
  pdf.circle(margin + 28, legendY - 3, 4, 'F')
  bodyText(pdf, input.seriesALabel, margin + 39, legendY, { size: 9, color: C.mutedForeground })
  if (input.compareMode !== 'single' && input.seriesBLabel) {
    const firstWidth = pdf.getTextWidth(input.seriesALabel)
    setFill(pdf, C.success)
    pdf.circle(margin + 58 + firstWidth, legendY - 3, 4, 'F')
    bodyText(pdf, input.seriesBLabel, margin + 69 + firstWidth, legendY, { size: 9, color: C.mutedForeground })
  }
  y += trendCardHeight + 24

  if (input.detailedAnalysis) {
    bodyText(pdf, 'Detailed analysis', margin, y + 16, { size: 14, weight: 'bold' })
    bodyText(pdf, 'Branches, customers, payment status, and order sources', margin, y + 34, { size: 9, color: C.mutedForeground })
    y += 50
    const gap = 14
    const cardWidth = (pageWidth - margin * 2 - gap) / 2
    const cardHeight = 188
    drawAnalysisBarList(
      pdf,
      'Branch comparison',
      input.detailedAnalysis.branchRevenue.map((item) => ({ label: item.branch, value: item.totalIdr, suffix: `${item.orderCount} orders` })),
      margin,
      y,
      cardWidth,
      cardHeight,
    )
    drawAnalysisBarList(
      pdf,
      'Top customers',
      input.detailedAnalysis.topCustomers.map((item) => ({ label: item.customerName, value: item.totalIdr, suffix: `${item.orderCount} orders` })),
      margin + cardWidth + gap,
      y,
      cardWidth,
      cardHeight,
    )
    y += cardHeight + gap
    drawAnalysisBarList(
      pdf,
      'Payment status',
      input.detailedAnalysis.paymentBreakdown.map((item) => ({ label: item.status, value: item.totalIdr, suffix: String(item.count), color: item.status === 'paid' ? C.success : item.status === 'unpaid' ? C.destructive : C.warning })),
      margin,
      y,
      cardWidth,
      cardHeight,
    )
    drawAnalysisBarList(
      pdf,
      'Revenue by source',
      input.detailedAnalysis.sourceBreakdown.map((item) => ({ label: item.source, value: item.totalIdr, suffix: String(item.count), color: C.primary })),
      margin + cardWidth + gap,
      y,
      cardWidth,
      cardHeight,
    )
  }

  bodyText(pdf, `Generated by Fleurstales OS · ${new Date().toLocaleString(getUiLanguage() === 'id' ? 'id-ID' : 'en-GB')}`, margin, pageHeight - 22, {
    size: 8,
    color: C.mutedForeground,
  })
  return pdf
}

export const downloadRevenueVectorPdf = (input: VectorRevenuePdfInput, filename: string): void => {
  safeFileSave(createRevenueVectorPdf(input), filename)
}

export type VectorScheduleCell =
  | { kind: 'unassigned' }
  | { kind: 'off'; label: 'OFF' | 'WFH' }
  | { kind: 'shift'; branch: string; startTime: string; endTime: string }

export interface VectorScheduleRow {
  name: string
  role: string
  cells: VectorScheduleCell[]
  summaryPrimary: string
  summarySecondary: string
  warning?: string
}

export interface VectorSchedulePdfInput {
  title: string
  subtitle: string
  status: string
  dateLabels: string[]
  rows: VectorScheduleRow[]
  stats: Array<{ label: string; value: number }>
  coverageWarnings: Array<{ title: string; detail: string }>
  suggestions: Array<{ title: string; detail: string }>
  revisions?: Array<{ title: string; detail: string; actor: string }>
}

const scheduleCellColors = (cell: VectorScheduleCell) => {
  if (cell.kind === 'unassigned') return { fill: C.muted, text: C.mutedForeground, border: C.border }
  if (cell.kind === 'off') return { fill: C.offFill, text: C.offText, border: C.offFill }
  if (cell.branch === 'Kedamaian') return { fill: C.kedamaianFill, text: C.kedamaianText, border: C.kedamaianBorder }
  return { fill: C.pahomanFill, text: C.pahomanText, border: C.pahomanBorder }
}

const drawScheduleTable = (
  pdf: Pdf,
  input: VectorSchedulePdfInput,
  x: number,
  y: number,
  width: number,
): number => {
  const employeeWidth = 144
  const summaryWidth = 128
  const dayWidth = (width - employeeWidth - summaryWidth) / input.dateLabels.length
  const headerHeight = 34
  const rowHeight = 48
  const tableHeight = headerHeight + input.rows.length * rowHeight

  roundedCard(pdf, x, y, width, tableHeight, { radius: 10 })
  setFill(pdf, C.muted)
  pdf.roundedRect(x, y, width, headerHeight, 10, 10, 'F')
  pdf.rect(x, y + 12, width, headerHeight - 12, 'F')

  bodyText(pdf, 'Employee', x + 12, y + 21, { size: 9, weight: 'bold' })
  input.dateLabels.forEach((label, index) => {
    bodyText(pdf, label, x + employeeWidth + index * dayWidth + dayWidth / 2, y + 21, {
      size: 8,
      weight: 'bold',
      align: 'center',
      maxWidth: dayWidth - 8,
    })
  })
  bodyText(pdf, 'Summary', x + width - summaryWidth + 10, y + 21, { size: 9, weight: 'bold' })

  input.rows.forEach((row, rowIndex) => {
    const rowY = y + headerHeight + rowIndex * rowHeight
    setStroke(pdf, C.border)
    pdf.setLineWidth(0.6)
    pdf.line(x, rowY, x + width, rowY)
    bodyText(pdf, row.name, x + 12, rowY + 20, { size: 9.5, weight: 'bold', maxWidth: employeeWidth - 20 })
    bodyText(pdf, row.role, x + 12, rowY + 34, { size: 8, color: C.mutedForeground, maxWidth: employeeWidth - 20 })

    row.cells.forEach((cell, cellIndex) => {
      const cellX = x + employeeWidth + cellIndex * dayWidth + 4
      const cellY = rowY + 6
      const cellWidth = dayWidth - 8
      const cellHeight = rowHeight - 12
      const tone = scheduleCellColors(cell)
      setFill(pdf, tone.fill)
      setStroke(pdf, tone.border)
      pdf.setLineWidth(0.5)
      pdf.roundedRect(cellX, cellY, cellWidth, cellHeight, 6, 6, 'FD')
      if (cell.kind === 'unassigned') {
        bodyText(pdf, 'Not assigned', cellX + cellWidth / 2, cellY + cellHeight / 2 + 3, {
          size: 8,
          weight: 'bold',
          color: tone.text,
          align: 'center',
          maxWidth: cellWidth - 8,
        })
      } else if (cell.kind === 'off') {
        bodyText(pdf, cell.label, cellX + cellWidth / 2, cellY + cellHeight / 2 + 3, {
          size: 9,
          weight: 'bold',
          color: tone.text,
          align: 'center',
        })
      } else {
        bodyText(pdf, cell.branch, cellX + cellWidth / 2, cellY + 14, {
          size: 8.5,
          weight: 'bold',
          color: tone.text,
          align: 'center',
          maxWidth: cellWidth - 6,
        })
        bodyText(pdf, `${cell.startTime}-${cell.endTime}`, cellX + cellWidth / 2, cellY + 28, {
          size: 8,
          weight: 'bold',
          color: tone.text,
          align: 'center',
          maxWidth: cellWidth - 6,
        })
      }
    })

    const summaryX = x + width - summaryWidth + 10
    bodyText(pdf, row.summaryPrimary, summaryX, rowY + 19, { size: 8.5, weight: 'bold', maxWidth: summaryWidth - 18 })
    bodyText(pdf, row.summarySecondary, summaryX, rowY + 32, { size: 8, color: C.mutedForeground, maxWidth: summaryWidth - 18 })
    if (row.warning) bodyText(pdf, row.warning, summaryX, rowY + 43, { size: 7.5, color: C.warning, maxWidth: summaryWidth - 18 })
  })

  return tableHeight
}

const drawCompactListCard = (
  pdf: Pdf,
  title: string,
  rows: Array<{ title: string; detail: string }>,
  x: number,
  y: number,
  width: number,
  minHeight: number,
  tone: 'warning' | 'neutral',
): number => {
  const rowHeight = 34
  const height = Math.max(minHeight, 46 + Math.min(rows.length, 10) * rowHeight)
  roundedCard(pdf, x, y, width, height)
  labelText(pdf, title, x + 14, y + 22)
  if (!rows.length) {
    bodyText(pdf, tone === 'warning' ? 'Minimum coverage is met.' : 'No suggestions needed.', x + 14, y + 48, { size: 9, color: C.mutedForeground })
  } else {
    rows.slice(0, 10).forEach((row, index) => {
      const rowY = y + 45 + index * rowHeight
      setFill(pdf, tone === 'warning' ? C.warningSoft : C.muted)
      pdf.roundedRect(x + 12, rowY - 14, width - 24, 28, 6, 6, 'F')
      bodyText(pdf, row.title, x + 20, rowY - 1, { size: 8.5, weight: 'bold', maxWidth: width - 40 })
      bodyText(pdf, row.detail, x + 20, rowY + 10, { size: 7.5, color: C.mutedForeground, maxWidth: width - 40 })
    })
  }
  return height
}

export const createScheduleVectorPdf = (input: VectorSchedulePdfInput): Pdf => {
  const pageWidth = 1180
  const margin = 24
  const statsHeight = 58
  const tableHeight = 34 + input.rows.length * 48
  const lowerRows = Math.max(input.coverageWarnings.length, input.suggestions.length, 1)
  const lowerHeight = Math.max(118, 46 + Math.min(lowerRows, 10) * 34)
  const revisionsHeight = input.revisions?.length ? Math.max(92, 42 + Math.min(input.revisions.length, 8) * 28) : 0
  const pageHeight = 94 + statsHeight + 18 + tableHeight + 18 + lowerHeight + (revisionsHeight ? 18 + revisionsHeight : 0) + 42
  const pdf = createCustomPdf(pageWidth, pageHeight, input.title)
  let y = 28

  bodyText(pdf, input.title, margin, y + 18, { size: 20, weight: 'bold' })
  bodyText(pdf, input.subtitle, margin, y + 39, { size: 10, color: C.mutedForeground, maxWidth: 760 })
  pill(pdf, input.status, pageWidth - margin - 105, y + 6, {
    active: true,
    fill: input.status === 'Published' ? C.successSoft : input.status === 'Revision needed' ? C.warningSoft : C.muted,
    text: input.status === 'Published' ? C.success : input.status === 'Revision needed' ? C.warning : C.mutedForeground,
    border: input.status === 'Published' ? C.successSoft : input.status === 'Revision needed' ? C.warningSoft : C.border,
    height: 26,
  })
  y += 66

  const statsGap = 10
  const statWidth = (pageWidth - margin * 2 - statsGap * Math.max(0, input.stats.length - 1)) / input.stats.length
  input.stats.forEach((stat, index) => {
    roundedCard(pdf, margin + index * (statWidth + statsGap), y, statWidth, statsHeight, { radius: 9 })
    bodyText(pdf, String(stat.value), margin + index * (statWidth + statsGap) + 12, y + 28, { size: 18, weight: 'bold' })
    bodyText(pdf, stat.label, margin + index * (statWidth + statsGap) + 12, y + 45, { size: 8, color: C.mutedForeground, maxWidth: statWidth - 24 })
  })
  y += statsHeight + 18

  y += drawScheduleTable(pdf, input, margin, y, pageWidth - margin * 2) + 18

  const listGap = 14
  const listWidth = (pageWidth - margin * 2 - listGap) / 2
  const leftHeight = drawCompactListCard(pdf, 'Coverage warnings', input.coverageWarnings, margin, y, listWidth, lowerHeight, 'warning')
  const rightHeight = drawCompactListCard(pdf, 'Assignment suggestions', input.suggestions, margin + listWidth + listGap, y, listWidth, lowerHeight, 'neutral')
  y += Math.max(leftHeight, rightHeight)

  if (input.revisions?.length) {
    y += 18
    roundedCard(pdf, margin, y, pageWidth - margin * 2, revisionsHeight)
    labelText(pdf, 'Schedule revision history', margin + 14, y + 22)
    input.revisions.slice(0, 8).forEach((revision, index) => {
      const rowY = y + 48 + index * 28
      bodyText(pdf, revision.title, margin + 16, rowY, { size: 8.5, weight: 'bold', maxWidth: 390 })
      bodyText(pdf, revision.detail, margin + 410, rowY, { size: 8, color: C.mutedForeground, maxWidth: 520 })
      bodyText(pdf, revision.actor, pageWidth - margin - 14, rowY, { size: 8, color: C.mutedForeground, align: 'right' })
    })
  }

  bodyText(pdf, `Generated by Fleurstales OS · ${new Date().toLocaleString(getUiLanguage() === 'id' ? 'id-ID' : 'en-GB')}`, margin, pageHeight - 20, {
    size: 8,
    color: C.mutedForeground,
  })
  return pdf
}

export const downloadScheduleVectorPdf = (input: VectorSchedulePdfInput, filename: string): void => {
  safeFileSave(createScheduleVectorPdf(input), filename)
}

/** Internal palette exported only for visual regression fixtures. */
export const VECTOR_PDF_COLORS: Record<ColorKey, string> = C
