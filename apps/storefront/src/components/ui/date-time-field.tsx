import * as React from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

const parseDateValue = (value: string): Date | undefined => {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

const formatDateValue = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const formatDisplayDate = (value: string): string => {
  const date = parseDateValue(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

const MINUTE_STEP = 15

// Every HH:MM slot in 15-minute increments: 00:00, 00:15, ... 23:45
const TIME_SLOTS = Array.from({ length: (24 * 60) / MINUTE_STEP }, (_, index) => {
  const totalMinutes = index * MINUTE_STEP
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
})

export interface DatePickerFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabledDates?: (date: Date) => boolean
  hideIcon?: boolean
}

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  id,
  value,
  onChange,
  placeholder = 'Pick date',
  className,
  disabledDates,
  hideIcon = false,
}) => {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const selectedDate = parseDateValue(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className={cn(
            'flex w-full items-center justify-between border border-border bg-background text-left text-sm text-foreground shadow-none outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {value ? formatDisplayDate(value) : placeholder}
          </span>
          {!hideIcon && <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />} 
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="storefront-date-popover z-[140] w-[min(22rem,calc(100vw-1rem))] rounded-2xl p-2 shadow-xl"
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.blur()
        }}
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) onChange(formatDateValue(date))
            setOpen(false)
          }}
          disabled={disabledDates}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export interface MonthPickerFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  secondaryText?: string
  hideIcon?: boolean
}

const parseMonthValue = (value: string): Date | undefined => {
  if (!/^\d{4}-\d{2}$/.test(value)) return undefined
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return undefined
  return new Date(year, month - 1, 1)
}

const formatMonthValue = (date: Date): string =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`

const formatDisplayMonth = (value: string): string => {
  const date = parseMonthValue(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date)
}

/** Month selector using the same solid product popover surface as date fields, without day cells. */
export const MonthPickerField: React.FC<MonthPickerFieldProps> = ({
  id,
  value,
  onChange,
  placeholder = 'Pick month',
  className,
  secondaryText,
  hideIcon = false,
}) => {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const selectedMonth = parseMonthValue(value)
  const [visibleYear, setVisibleYear] = React.useState(() => selectedMonth?.getFullYear() ?? new Date().getFullYear())

  React.useEffect(() => {
    if (open) setVisibleYear(selectedMonth?.getFullYear() ?? new Date().getFullYear())
  }, [open, selectedMonth?.getFullYear()])

  const monthNames = React.useMemo(
    () => Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(2020, month, 1))),
    [],
  )

  const chooseMonth = (monthIndex: number) => {
    onChange(`${visibleYear}-${`${monthIndex + 1}`.padStart(2, '0')}`)
    setOpen(false)
  }

  const chooseCurrentMonth = () => {
    const now = new Date()
    onChange(formatMonthValue(now))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-label={`Select month: ${value ? formatDisplayMonth(value) : placeholder}`}
          className={cn(
            'flex w-full items-center justify-between border border-border bg-background text-left text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="min-w-0 truncate">
            <span className="font-medium text-foreground">{value ? formatDisplayMonth(value) : placeholder}</span>
            {secondaryText && <span className="ml-2 text-muted-foreground">{secondaryText}</span>}
          </span>
          {!hideIcon && <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[140] w-[min(20rem,calc(100vw-2rem))] p-4"
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.blur()
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-label="Previous year" onClick={() => setVisibleYear((year) => year - 1)} className="inline-flex size-11 items-center justify-center rounded-full bg-card ring-1 ring-border hover:bg-accent"><ChevronLeft className="size-4" /></button>
          <p className="text-base font-semibold tabular-nums">{visibleYear}</p>
          <button type="button" aria-label="Next year" onClick={() => setVisibleYear((year) => year + 1)} className="inline-flex size-11 items-center justify-center rounded-full bg-card ring-1 ring-border hover:bg-accent"><ChevronRight className="size-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {monthNames.map((label, monthIndex) => {
            const active = selectedMonth?.getFullYear() === visibleYear && selectedMonth.getMonth() === monthIndex
            return <button key={label} type="button" onClick={() => chooseMonth(monthIndex)} aria-pressed={active} className={cn('min-h-10 rounded-xl px-2 text-sm font-medium ring-1 ring-border transition-colors hover:bg-accent', active ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-foreground')}>{label}</button>
          })}
        </div>
        <div className="mt-4 border-t border-border pt-3 text-right">
          <button type="button" onClick={chooseCurrentMonth} className="text-sm font-semibold text-primary hover:bg-accent rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">This month</button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export interface TimeSelectFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  allowedSlots?: string[]
  disabled?: boolean
  hideIcon?: boolean
}

/** Row height (px) for each slot in the scroll wheel. Keep in sync with the inline style below. */
const WHEEL_ROW_HEIGHT = 48
const WHEEL_VISIBLE_ROWS = 5
const WHEEL_PADDING_ROWS = Math.floor(WHEEL_VISIBLE_ROWS / 2)

/**
 * A single-column "slot machine" style scroll wheel for picking a time
 * in fixed 15-minute increments (00:00, 00:15, 00:30, ... 23:45). Snaps to
 * the nearest row on scroll and centers the selected value.
 */
const TimeScrollWheel: React.FC<{
  highlighted: string
  onHighlight: (value: string) => void
  onCommit: (value: string) => void
  slots: string[]
}> = ({ highlighted, onHighlight, onCommit, slots }) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = React.useRef<number | undefined>(undefined)

  const highlightedIndex = Math.max(0, slots.indexOf(highlighted))

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTop = highlightedIndex * WHEEL_ROW_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return

    window.clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = window.setTimeout(() => {
      const index = Math.round(container.scrollTop / WHEEL_ROW_HEIGHT)
      const clamped = Math.min(Math.max(index, 0), slots.length - 1)
      const nextValue = slots[clamped]
      const targetTop = clamped * WHEEL_ROW_HEIGHT
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: targetTop, behavior: 'smooth' })
      } else {
        container.scrollTop = targetTop
      }
      if (nextValue !== highlighted) onHighlight(nextValue)
    }, 120)
  }

  React.useEffect(() => () => window.clearTimeout(scrollTimeoutRef.current), [])

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 rounded-sm bg-surface-panel ring-1 ring-border/70"
        style={{ height: WHEEL_ROW_HEIGHT }}
      />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative z-10 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: WHEEL_ROW_HEIGHT * WHEEL_VISIBLE_ROWS, scrollSnapType: 'y mandatory' }}
        role="listbox"
        aria-label="Time"
      >
        <div style={{ height: WHEEL_ROW_HEIGHT * WHEEL_PADDING_ROWS }} aria-hidden="true" />
        {slots.map((slot) => {
          const isHighlighted = slot === highlighted
          return (
            <button
              key={slot}
              type="button"
              role="option"
              aria-selected={isHighlighted}
              onClick={() => {
                onHighlight(slot)
                onCommit(slot)
              }}
              className={cn(
                'flex w-full items-center justify-center text-center font-medium tabular-nums transition',
                isHighlighted ? 'text-xl text-foreground' : 'text-base text-muted-foreground hover:text-foreground',
              )}
              style={{ height: WHEEL_ROW_HEIGHT, scrollSnapAlign: 'center' }}
            >
              {slot}
            </button>
          )
        })}
        <div style={{ height: WHEEL_ROW_HEIGHT * WHEEL_PADDING_ROWS }} aria-hidden="true" />
      </div>
    </div>
  )
}

export const TimeSelectField: React.FC<TimeSelectFieldProps> = ({
  id,
  value,
  onChange,
  placeholder = 'Pick time',
  className,
  allowedSlots,
  disabled = false,
  hideIcon = false,
}) => {
  const [open, setOpen] = React.useState(false)
  const [draftValue, setDraftValue] = React.useState(value)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const slots = allowedSlots ?? TIME_SLOTS
  const fallback = slots[0] ?? ''
  const selected = value && slots.includes(value) ? value : fallback
  const displayValue = value ? selected : placeholder

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftValue(selected)
    if (!nextOpen && open && draftValue && draftValue !== value) {
      onChange(draftValue)
    }
    setOpen(nextOpen)
  }

  const handleCommit = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled || slots.length === 0}
          className={cn(
            'flex w-full items-center justify-between border border-border bg-background text-left text-sm text-foreground shadow-none outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap',
            !value && 'text-muted-foreground',
            (disabled || slots.length === 0) && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          <span className="truncate tabular-nums">{displayValue}</span>
          {!hideIcon && <Clock className="size-4 shrink-0 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="storefront-time-popover z-[140] w-[min(18rem,calc(100vw-1rem))] rounded-2xl p-2.5 shadow-xl"
        align="end"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.blur()
        }}
      >
        <TimeScrollWheel highlighted={draftValue || selected} onHighlight={setDraftValue} onCommit={handleCommit} slots={slots} />
      </PopoverContent>
    </Popover>
  )
}
