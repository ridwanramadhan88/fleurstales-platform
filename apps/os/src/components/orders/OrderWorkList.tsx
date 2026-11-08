/**
 * @file OrderWorkList.tsx
 * @description The Orders list as one prioritised work list (desktop rows and
 * phone cards). Each row shows when, who, which stage (coloured pill), why it
 * is here now, the amount, and the one next action.
 */

import { Fragment, type FC, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { getLocalDateString, nowInJakarta, addDays } from '../../domain/orderTimingDomain'
import { isOrderFullyPaid, orderHasNote } from '../../domain/orderWorkStageDomain'
import type { OrderWorkRow, OrdersTableViewModel } from './OrdersTableViewController'
import {
  ORDER_WORK_STAGE_STYLE,
  formatMinutesLeft,
  getOrderWorkActionLabel,
  getOrderWorkReason,
  getOrderWorkStageLabel,
} from './orderWorkStagePresentation'

type RowRefSetter = (key: string) => (node: HTMLElement | null) => void
type Copy = (en: string, id: string) => string

interface OrderWorkListProps {
  viewModel: OrdersTableViewModel
  setDesktopRowRef: RowRefSetter
  setCardRef: RowRefSetter
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}`

/** Big time label: "14.00" today, "Besok" tomorrow, "13 Des" later. */
const getTimeLabel = (row: OrderWorkRow, copy: Copy): { main: string; sub: string } => {
  const at = row.priority.scheduledAt
  const kind = row.order.fulfillment === 'delivery' ? copy('Delivery', 'Antar') : copy('Pickup', 'Ambil')
  if (!at) return { main: '—', sub: kind }
  const now = nowInJakarta()
  const day = getLocalDateString(at)
  if (day === getLocalDateString(now)) return { main: hhmm(at), sub: kind }
  if (day === getLocalDateString(addDays(now, 1))) return { main: copy('Tomorrow', 'Besok'), sub: `${kind} ${hhmm(at)}` }
  const month = copy(MONTHS_EN[at.getMonth()], MONTHS_ID[at.getMonth()])
  return { main: `${at.getDate()} ${month}`, sub: `${kind} ${hhmm(at)}` }
}

const getPaymentLine = (order: OrderTableRow, stage: OrderWorkRow['priority']['stage'], copy: Copy): { text: string; className: string } => {
  if (isOrderFullyPaid(order)) return { text: copy('Paid', 'Lunas'), className: 'text-success' }
  if (order.paymentStatus === 'refund_pending' || order.paymentStatus === 'refunded') {
    return { text: order.paymentStatus === 'refunded' ? copy('Refunded', 'Dikembalikan') : copy('Refund pending', 'Menunggu refund'), className: 'text-muted-foreground' }
  }
  if (stage === 'confirm') {
    const method = order.paymentChannel === 'qris' ? 'QRIS' : order.paymentMethod === 'cash' ? copy('Cash', 'Tunai') : order.paymentMethod === 'transfer' ? 'Transfer' : ''
    return { text: method || copy('Not paid', 'Belum dibayar'), className: 'text-muted-foreground' }
  }
  const text = order.paymentStatus === 'partial' ? copy('Part paid', 'Kurang bayar') : copy('Not paid', 'Belum dibayar')
  return { text, className: stage === 'payment' ? 'text-destructive' : 'text-muted-foreground' }
}

const StagePill: FC<{ row: OrderWorkRow; copy: Copy; compact?: boolean }> = ({ row, copy, compact }) => {
  const style = ORDER_WORK_STAGE_STYLE[row.priority.stage]
  const Icon = style.icon
  return (
    <span
      data-stage={row.priority.stage}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold ${style.pillClass} ${compact ? 'h-6 py-0 pl-[3px] pr-2.5 text-xs' : 'h-[30px] py-0 pl-1 pr-3 text-[13px]'}`}
    >
      <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full text-white ${style.dotClass} ${compact ? 'size-[18px]' : 'size-[22px]'}`}>
        <Icon className={compact ? 'size-2.5' : 'size-3'} strokeWidth={2.6} />
      </span>
      <span className="truncate">{getOrderWorkStageLabel(row.priority.stage, row.order, copy)}</span>
    </span>
  )
}

const NoteTag: FC<{ copy: Copy }> = ({ copy }) => (
  <span className="shrink-0 rounded-full bg-[#FFF3C4] px-2 py-0.5 text-[11px] font-semibold text-foreground/80 dark:bg-[#5C4A00] dark:text-[#FFE38A]">
    {copy('Note', 'Catatan')}
  </span>
)

const Divider: FC<{ copy: Copy; className?: string }> = ({ copy, className = '' }) => (
  <div role="separator" className={`bg-muted/60 px-4 py-2 text-xs font-semibold text-muted-foreground ${className}`}>
    {copy('Next', 'Berikutnya')}
  </div>
)

export const OrderWorkList: FC<OrderWorkListProps> = ({ viewModel, setDesktopRowRef, setCardRef }) => {
  const copy = useBilingualCopy()
  const { rows, formatter, emptyStateMessage, getProductName, getNextStatusForOrder, onOpenDetails, onQuickAdvance } = viewModel

  const actionFor = (row: OrderWorkRow) => {
    const { stage } = row.priority
    const canAdvance = stage !== 'confirm' && stage !== 'arranging' && Boolean(getNextStatusForOrder(row.order))
    return {
      label: canAdvance || stage === 'confirm' ? getOrderWorkActionLabel(stage, row.order, copy) : copy('Open', 'Buka'),
      primary: canAdvance || stage === 'confirm',
      run: (event: MouseEvent) => {
        event.stopPropagation()
        if (canAdvance) onQuickAdvance(row.order)
        else onOpenDetails(row.order)
      },
    }
  }

  const openOnKey = (order: OrderTableRow) => (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenDetails(order)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-card px-5 py-8 text-center text-sm text-muted-foreground shadow-ios-sm ring-1 ring-border/60">
        {emptyStateMessage}
      </div>
    )
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-2xl bg-surface-card shadow-ios-sm ring-1 ring-border/60 lg:block">
        <div className="grid grid-cols-[104px_minmax(0,1.5fr)_190px_minmax(0,1.1fr)_112px_148px] gap-4 bg-muted/60 px-5 py-2.5 text-xs font-semibold text-muted-foreground">
          <span>{copy('Time', 'Waktu')}</span>
          <span>{copy('Customer', 'Pelanggan')}</span>
          <span>{copy('Stage', 'Tahap')}</span>
          <span>{copy('Why now', 'Kenapa sekarang')}</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {rows.map((row, index) => {
          const time = getTimeLabel(row, copy)
          const pay = getPaymentLine(row.order, row.priority.stage, copy)
          const action = actionFor(row)
          const showUrgency = row.priority.needsAdmin && row.priority.urgent && row.priority.minutesLeft !== null
          return (
            <Fragment key={row.order.orderNumber}>
              {row.divider && <Divider copy={copy} className="border-t border-border/60" />}
              <div
                ref={setDesktopRowRef(row.order.orderNumber)}
                role="button"
                tabIndex={0}
                aria-label={`${row.order.customerName}, ${getOrderWorkStageLabel(row.priority.stage, row.order, copy)}`}
                onClick={() => onOpenDetails(row.order)}
                onKeyDown={openOnKey(row.order)}
                className={`grid cursor-pointer grid-cols-[104px_minmax(0,1.5fr)_190px_minmax(0,1.1fr)_112px_148px] items-center gap-4 px-5 py-3.5 text-sm transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/35 ${index > 0 && !row.divider ? 'border-t border-border/50' : ''}`}
              >
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold leading-6 tabular-nums text-foreground">{time.main}</div>
                  {showUrgency ? (
                    <span className="mt-1 inline-block rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-white">
                      {formatMinutesLeft(row.priority.minutesLeft ?? 0, copy)}
                    </span>
                  ) : (
                    <div className="mt-0.5 text-xs text-muted-foreground">{time.sub}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-foreground">{row.order.customerName}</span>
                    {orderHasNote(row.order) && <NoteTag copy={copy} />}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{getProductName(row.order)}</div>
                </div>
                <div className="min-w-0"><StagePill row={row} copy={copy} /></div>
                <div className="min-w-0 text-[13px] leading-5 text-foreground/80">{getOrderWorkReason(row.order, row.priority, copy)}</div>
                <div className="text-right">
                  <div className="font-medium tabular-nums text-foreground">Rp {formatter.format(row.order.totalIdr)}</div>
                  <div className={`mt-0.5 text-xs ${pay.className}`}>{pay.text}</div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={action.run}
                    className={`inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full px-[18px] text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${
                      action.primary ? 'bg-primary text-primary-foreground shadow-ios-sm hover:bg-primary/90' : 'bg-muted text-foreground hover:bg-muted/70'
                    }`}
                  >
                    {action.label}
                  </button>
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>

      {/* Phone and tablet */}
      <div className="overflow-hidden rounded-[18px] bg-surface-card shadow-ios-sm ring-1 ring-border/60 lg:hidden">
        {rows.map((row, index) => {
          const time = getTimeLabel(row, copy)
          const action = actionFor(row)
          const showUrgency = row.priority.needsAdmin && row.priority.urgent && row.priority.minutesLeft !== null
          return (
            <Fragment key={row.order.orderNumber}>
              {row.divider && <Divider copy={copy} className="border-y border-border/60" />}
              <div
                ref={setCardRef(row.order.orderNumber)}
                role="button"
                tabIndex={0}
                aria-label={`${row.order.customerName}, ${getOrderWorkStageLabel(row.priority.stage, row.order, copy)}`}
                onClick={() => onOpenDetails(row.order)}
                onKeyDown={openOnKey(row.order)}
                className={`flex cursor-pointer items-start gap-3 px-3.5 py-3 transition active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/35 ${index > 0 && !row.divider ? 'border-t border-border/50' : ''}`}
              >
                <div className="w-[58px] shrink-0">
                  <div className="text-base font-semibold leading-6 tabular-nums text-foreground">{time.main}</div>
                  {showUrgency ? (
                    <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-destructive px-1.5 py-px text-[11px] font-semibold text-white">
                      {formatMinutesLeft(row.priority.minutesLeft ?? 0, copy).replace(/ lagi$| left$/, '')}
                    </span>
                  ) : (
                    <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{time.sub}</div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold text-foreground">{row.order.customerName}</span>
                      {orderHasNote(row.order) && <NoteTag copy={copy} />}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{getProductName(row.order)}</div>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <StagePill row={row} copy={copy} compact />
                    {action.primary ? (
                      <button
                        type="button"
                        onClick={action.run}
                        className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-ios-sm"
                      >
                        {action.label}
                      </button>
                    ) : (
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </>
  )
}
