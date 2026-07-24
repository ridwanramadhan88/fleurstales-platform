import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PayrollDefaultSettings } from '../../types/settings'
import { buildPayrollScheduleForPaymentMonth } from '../../domain/payrollScheduleDomain'
import { MonthPickerField } from '../ui/date-time-field'
import { cn } from '../../lib/utils'

const parseMonthKey = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  return { year, month }
}

const compactDate = (value: string, includeYear = false) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  ...(includeYear ? { year: 'numeric' } : {}),
  timeZone: 'Asia/Jakarta',
}).format(new Date(`${value}T12:00:00+07:00`))

const shiftMonthKey = (monthKey: string, offset: number) => {
  const { year, month } = parseMonthKey(monthKey)
  const shifted = new Date(year, month - 1 + offset, 1)
  return `${shifted.getFullYear()}-${`${shifted.getMonth() + 1}`.padStart(2, '0')}`
}

export const getPeoplePeriodForMonth = (monthKey: string, settings: PayrollDefaultSettings) => {
  const { year, month } = parseMonthKey(monthKey)
  return buildPayrollScheduleForPaymentMonth(year, month, settings)
}

export const formatPeoplePeriod = (monthKey: string, settings: PayrollDefaultSettings) => {
  const period = getPeoplePeriodForMonth(monthKey, settings)
  const startYear = period.periodStart.slice(0, 4)
  const endYear = period.periodEnd.slice(0, 4)
  const crossesYear = startYear !== endYear
  return `${compactDate(period.periodStart, crossesYear)} – ${compactDate(period.periodEnd, crossesYear)}`
}


export const PeoplePeriodNavigation = ({
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  children,
  className,
}: {
  onPrevious: () => void
  onNext: () => void
  previousLabel: string
  nextLabel: string
  children: ReactNode
  className?: string
}) => (
  <div data-people-period-control className={cn('grid w-full max-w-[520px] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2', className)}>
    <button
      type="button"
      aria-label={previousLabel}
      onClick={onPrevious}
      className="inline-flex size-11 items-center justify-center rounded-full border border-border/90 bg-muted/60 text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <ChevronLeft className="size-4" />
    </button>
    {children}
    <button
      type="button"
      aria-label={nextLabel}
      onClick={onNext}
      className="inline-flex size-11 items-center justify-center rounded-full border border-border/90 bg-muted/60 text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <ChevronRight className="size-4" />
    </button>
  </div>
)

export const PeopleMonthPeriodFields = ({
  month,
  onMonthChange,
  settings,
  className,
  monthFieldClassName,
}: {
  month: string
  onMonthChange: (month: string) => void
  settings: PayrollDefaultSettings
  className?: string
  monthFieldClassName?: string
}) => (
  <PeoplePeriodNavigation
    onPrevious={() => onMonthChange(shiftMonthKey(month, -1))}
    onNext={() => onMonthChange(shiftMonthKey(month, 1))}
    previousLabel="Previous month"
    nextLabel="Next month"
    className={className}
  >
    <MonthPickerField
      value={month}
      onChange={onMonthChange}
      secondaryText={`· ${formatPeoplePeriod(month, settings)}`}
      hideIcon
      className={cn('h-11 min-w-0 justify-center rounded-full border border-border/90 bg-muted/60 px-3 text-center text-sm font-medium text-foreground shadow-sm', monthFieldClassName)}
    />
  </PeoplePeriodNavigation>
)
