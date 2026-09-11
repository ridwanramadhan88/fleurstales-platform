/**
 * @file OrdersSubTabs.tsx
 * @description Primary date range scope control for the Orders view.
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
import { getActiveFutureOrderDates } from '../../domain/futureOrderBadgeDomain'

export type OrdersSubTabId = 'today' | 'future' | 'custom'

export interface OrdersSubTabsProps {
  activeTab: OrdersSubTabId
  onTabChange: (tab: OrdersSubTabId) => void
  dateRange?: DateRange
  onDateRangeChange?: (range: DateRange | undefined) => void
  /** Number of active orders whose exact expected fulfillment is still ahead. */
  futureOrderCount?: number
  /** Optional branch-scoped future dates. Falls back to all visible OS order data. */
  futureOrderDates?: string[]
}

export const OrdersSubTabs: FC<OrdersSubTabsProps> = ({
  activeTab,
  onTabChange,
  dateRange,
  onDateRangeChange,
  futureOrderCount = 0,
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

  const tabs: { id: OrdersSubTabId; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'future', label: 'Future' },
    { id: 'custom', label: 'Custom' },
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

  const presetOptions: { label: string; range: DateRange }[] = [
    { label: 'Today', range: { from: today, to: today } },
    { label: 'Tomorrow', range: { from: addDays(today, 1), to: addDays(today, 1) } },
    { label: 'Yesterday', range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { label: 'Next week', range: { from: addDays(today, 1), to: addDays(today, 7) } },
    { label: 'Last week', range: { from: addDays(today, -7), to: addDays(today, -1) } },
    { label: 'Last 30 days', range: { from: addDays(today, -30), to: today } },
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
                      ) : 'Custom'}
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
                    <p className="mt-2 text-2xs text-muted-foreground">Dot = future order scheduled on that date.</p>
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
              {tab.id === 'future' && futureOrderCount > 0 && (
                <span
                  className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-2xs font-semibold ${
                    isActive ? 'bg-surface-selected text-primary-foreground' : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {futureOrderCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
