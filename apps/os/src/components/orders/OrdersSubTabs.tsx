/**
 * @file OrdersSubTabs.tsx
 * @description Primary date range scope control for the Orders view.
 * Exposes three scopes: Today, Tomorrow, and Custom Date Range.
 */

import { useEffect, useState, type FC } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { Calendar } from '../ui/calendar'
import { Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { tabButtonClass } from '../ui/tabs'

/**
 * @description Life cycle identifiers for the Orders tabs.
 */
export type OrdersSubTabId = 'today' | 'future' | 'custom'

/**
 * @description Props for the OrdersSubTabs segmented control.
 */
export interface OrdersSubTabsProps {
  /** Currently active lifecycle tab. */
  activeTab: OrdersSubTabId
  /** Handler fired when the user selects a different lifecycle tab. */
  onTabChange: (tab: OrdersSubTabId) => void
  /** The selected date range for Custom filter. */
  dateRange?: DateRange
  /** Handler fired when the custom date range is modified. */
  onDateRangeChange?: (range: DateRange | undefined) => void
  /** Number of active orders scheduled after today. Finished future-dated
   * records do not keep the waiting-work badge visible. Omitted/zero hides it. */
  futureOrderCount?: number
}

export const OrdersSubTabs: FC<OrdersSubTabsProps> = ({
  activeTab,
  onTabChange,
  dateRange,
  onDateRangeChange,
  futureOrderCount = 0,
}) => {
  const tabs: { id: OrdersSubTabId; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'future', label: 'Future' },
    { id: 'custom', label: 'Custom' },
  ]

  /**
   * @description Controls whether the custom date popover is open.
   */
  const [isCustomPopoverOpen, setIsCustomPopoverOpen] = useState(false)
  /** Draft selection while choosing the start and end dates. The completed range
   * is committed and the popover closes as soon as the end date is selected. */
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(dateRange)

  useEffect(() => {
    if (isCustomPopoverOpen) {
      setDraftRange(dateRange)
    }
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
    {
      label: 'Tomorrow',
      range: { from: addDays(today, 1), to: addDays(today, 1) },
    },
    {
      label: 'Yesterday',
      range: { from: addDays(today, -1), to: addDays(today, -1) },
    },
    {
      label: 'Next week',
      range: { from: addDays(today, 1), to: addDays(today, 7) },
    },
    {
      label: 'Last week',
      range: { from: addDays(today, -7), to: addDays(today, -1) },
    },
    {
      label: 'Last 30 days',
      range: { from: addDays(today, -30), to: today },
    },
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
      className="no-scrollbar -mx-4 w-auto overflow-x-auto px-4 pb-1 scroll-px-4"
    >
      <div className="inline-flex min-w-max items-center gap-1 rounded-full border border-border bg-surface-track p-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab

          if (tab.id === 'custom') {
            return (
              <Popover
                key={tab.id}
                open={isCustomPopoverOpen}
                onOpenChange={setIsCustomPopoverOpen}
              >
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
                          {format(dateRange.from, 'dd MMM')}
                          {dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
                            ? ` - ${format(dateRange.to, 'dd MMM')}`
                            : ''}
                        </>
                      ) : (
                        'Custom'
                      )}
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
                    defaultMonth={draftRange?.from}
                    selected={draftRange}
                    onSelect={(range) => {
                      setDraftRange(range)
                      if (range?.from && range.to) commitCustomRange(range)
                    }}
                    numberOfMonths={1}
                  />
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
                    isActive
                      ? 'bg-surface-selected text-primary-foreground'
                      : 'bg-primary text-primary-foreground'
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
