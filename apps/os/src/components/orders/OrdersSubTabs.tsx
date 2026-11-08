/**
 * @file OrdersSubTabs.tsx
 * @description Work views of the Orders list: what needs the Admin, what
 * waits on someone else, what finished today, or any date range.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { Calendar } from '../ui/calendar'
import { Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useUiLanguage } from '../../i18n/uiLanguage'
import type { DateRange } from 'react-day-picker'
import { tabButtonClass } from '../ui/tabs'
import { useOrdersStore } from '../../store/ordersStore'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { getActiveFutureOrderDates } from '../../domain/futureOrderBadgeDomain'

export type OrdersSubTabId = 'action' | 'waiting' | 'done' | 'custom'

export interface OrdersWorkViewCounts {
  action: number
  waiting: number
  done: number
}

export interface OrdersSubTabsProps {
  activeTab: OrdersSubTabId
  onTabChange: (tab: OrdersSubTabId) => void
  dateRange?: DateRange
  onDateRangeChange?: (range: DateRange | undefined) => void
  /** Order counts per work view (branch-scoped). */
  counts?: OrdersWorkViewCounts
  /** Optional branch-scoped future dates. Falls back to all visible OS order data. */
  futureOrderDates?: string[]
}

export const OrdersSubTabs: FC<OrdersSubTabsProps> = ({
  activeTab,
  onTabChange,
  dateRange,
  onDateRangeChange,
  counts,
  futureOrderDates,
}) => {
  const allOrders = useOrdersStore((state) => state.orders)
  const language = useUiLanguage((state) => state.language)
  const dateLocale = language === 'id' ? idLocale : undefined
  const resolvedFutureOrderDates = useMemo(
    () => futureOrderDates ?? getActiveFutureOrderDates(allOrders),
    [allOrders, futureOrderDates],
  )
  const futureDateSet = useMemo(() => new Set(resolvedFutureOrderDates), [resolvedFutureOrderDates])

  const copy = useBilingualCopy()
  const tabs: { id: OrdersSubTabId; label: string; count?: number }[] = [
    { id: 'action', label: copy('Needs action', 'Perlu tindakan'), count: counts?.action },
    { id: 'waiting', label: copy('Waiting on others', 'Menunggu orang lain'), count: counts?.waiting },
    { id: 'done', label: copy('Done today', 'Selesai hari ini'), count: counts?.done },
    { id: 'custom', label: copy('Pick a date', 'Pilih tanggal') },
  ]

  const [isCustomPopoverOpen, setIsCustomPopoverOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(dateRange)

  useEffect(() => {
    if (isCustomPopoverOpen) setDraftRange(dateRange)
  }, [isCustomPopoverOpen, dateRange])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const addDays = (date: Date, days: number) => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
  }

  // No "Today" shortcut: "Today" is already the first tab.
  const presetOptions: { label: string; range: DateRange }[] = [
    { label: copy('Tomorrow', 'Besok'), range: { from: addDays(today, 1), to: addDays(today, 1) } },
    { label: copy('Yesterday', 'Kemarin'), range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { label: copy('Next week', 'Minggu depan'), range: { from: addDays(today, 1), to: addDays(today, 7) } },
    { label: copy('Last week', 'Minggu lalu'), range: { from: addDays(today, -7), to: addDays(today, -1) } },
    { label: copy('Last 30 days', '30 hari terakhir'), range: { from: addDays(today, -30), to: today } },
  ]

  const commitCustomRange = (range: DateRange | undefined) => {
    if (!range?.from || !range.to) return
    setDraftRange(range)
    onDateRangeChange?.(range)
    onTabChange('custom')
    setIsCustomPopoverOpen(false)
  }

  return (
    <nav
      aria-label="Orders lifecycle view"
      className="no-scrollbar -mx-4 w-auto overflow-x-auto px-4 py-1 scroll-px-4 md:mx-0 md:w-full md:overflow-visible md:px-0"
    >
      <div className="inline-flex min-w-max items-center gap-1 rounded-full border border-border bg-surface-track p-1 md:min-w-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab

          if (tab.id === 'custom') {
            return (
              <Popover key={tab.id} open={isCustomPopoverOpen} onOpenChange={setIsCustomPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onTabChange('custom')}
                    data-active={isActive ? 'true' : undefined}
                    className={tabButtonClass({ active: isActive, level: 'secondary', segmented: true, className: 'scroll-mx-4 cursor-pointer gap-1.5' })}
                    role="tab"
                    aria-selected={isActive}
                  >
                    <span>
                      {dateRange?.from ? (
                        <>
                          {format(dateRange.from, 'dd MMM', { locale: dateLocale })}
                          {dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
                            ? ` - ${format(dateRange.to, 'dd MMM', { locale: dateLocale })}`
                            : ''}
                        </>
                      ) : copy('Pick a date', 'Pilih tanggal')}
                    </span>
                    <CalendarIcon className="ml-1 size-3.5 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[21rem] border border-border bg-surface-popover p-3" align="start">
                  <div className="mb-2 grid grid-cols-2 gap-1.5">
                    {presetOptions.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => commitCustomRange(preset.range)}
                        className={`rounded-xs px-2.5 py-2 text-left text-xs font-medium transition ${
                          draftRange?.from?.getTime() === preset.range.from?.getTime() &&
                          draftRange?.to?.getTime() === preset.range.to?.getTime()
                            ? 'bg-surface-selected text-primary-foreground ring-1 ring-primary/30'
                            : 'bg-muted text-foreground hover:bg-card'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <Calendar
                    initialFocus
                    mode="range"
                    className="p-0"
                    defaultMonth={draftRange?.from}
                    selected={draftRange}
                    modifiers={{
                      hasFutureOrder: (date: Date) => {
                        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                        return futureDateSet.has(key)
                      },
                    }}
                    modifiersClassNames={{
                      hasFutureOrder: 'relative after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary aria-selected:after:bg-primary-foreground',
                    }}
                    onSelect={(range) => {
                      setDraftRange(range)
                      if (range?.from && range.to) commitCustomRange(range)
                    }}
                    numberOfMonths={1}
                  />
                  {resolvedFutureOrderDates.length > 0 && (
                    <p className="mt-2 text-2xs text-muted-foreground">{copy('Dot = an order is scheduled on that date.', 'Titik = ada pesanan pada tanggal itu.')}</p>
                  )}
                </PopoverContent>
              </Popover>
            )
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              data-active={isActive ? 'true' : undefined}
              className={tabButtonClass({ active: isActive, level: 'secondary', segmented: true, className: 'scroll-mx-4 cursor-pointer gap-1.5' })}
              role="tab"
              aria-selected={isActive}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold tabular-nums ${
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-foreground/[0.07] text-muted-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
