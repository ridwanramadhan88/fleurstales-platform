/**
 * @file FinanceDateScopeTabs.tsx
 * @description Date range scope control for the Finance order-verification
 * queue, styled identically to Orders' OrdersSubTabs (same pill-segmented-
 * control look) but with a different option set and a different default:
 * Finance's default landing scope is "This week" (Mon–Sun of the current
 * week) rather than "Today" — Finance typically triages a batch of orders
 * that finished over the past few days, not just today's. Kept as its own
 * component (rather than reusing/extending OrdersSubTabs) so the Orders
 * tab's own tab meaning (Today/Future/Custom) isn't disturbed by an
 * unrelated screen's needs.
 */

import { useEffect, useState, type FC } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { Calendar } from '../ui/calendar'
import { Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { tabButtonClass } from '../ui/tabs'

/**
 * @description Scope identifiers for the Finance date tabs.
 */
export type FinanceDateScopeId = 'this_week' | 'today' | 'custom'

/**
 * @description Props for the FinanceDateScopeTabs segmented control.
 */
export interface FinanceDateScopeTabsProps {
  /** Currently active scope tab. */
  activeTab: FinanceDateScopeId
  /** Handler fired when the user selects a different scope tab. */
  onTabChange: (tab: FinanceDateScopeId) => void
  /** The selected date range for the Custom filter. */
  dateRange?: DateRange
  /** Handler fired when the custom date range is modified. */
  onDateRangeChange?: (range: DateRange | undefined) => void
}

/**
 * @description Monday of the week containing `date` (ISO week start),
 * normalized to midnight. `getDay()` returns 0 for Sunday, so Sunday is
 * treated as 6 days after the preceding Monday rather than day 0.
 */
const startOfWeekMonday = (date: Date): Date => {
  const result = new Date(date)
  const day = result.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diffToMonday)
  result.setHours(0, 0, 0, 0)
  return result
}

export const FinanceDateScopeTabs: FC<FinanceDateScopeTabsProps> = ({
  activeTab,
  onTabChange,
  dateRange,
  onDateRangeChange,
}) => {
  const tabs: { id: FinanceDateScopeId; label: string }[] = [
    { id: 'this_week', label: 'This week' },
    { id: 'today', label: 'Today' },
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

  const mondayThisWeek = startOfWeekMonday(today)

  const presetOptions: { label: string; range: DateRange }[] = [
    { label: 'This week', range: { from: mondayThisWeek, to: addDays(mondayThisWeek, 6) } },
    { label: 'Today', range: { from: today, to: today } },
    { label: 'Yesterday', range: { from: addDays(today, -1), to: addDays(today, -1) } },
    {
      label: 'Last week',
      range: { from: addDays(mondayThisWeek, -7), to: addDays(mondayThisWeek, -1) },
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
      aria-label="Finance order verification date scope"
      className="no-scrollbar -mx-4 w-auto overflow-x-auto px-4 pb-1 scroll-px-4"
    >
      <div className="inline-flex min-w-max items-center gap-1 rounded-full border border-border/70 bg-surface-track p-1">
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
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default FinanceDateScopeTabs
