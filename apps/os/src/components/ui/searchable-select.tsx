/**
 * @file searchable-select.tsx
 * @description A select with a search box, for long lists such as the
 * product catalog. Looks like `SelectTrigger`; typing filters the list by
 * every word in the query (case and accents ignored), arrow keys move,
 * Enter picks.
 */

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export interface SearchableSelectOption {
  id: string
  label: string
}

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const filterSearchableOptions = <T extends SearchableSelectOption>(
  options: T[],
  query: string,
): T[] => {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return options
  return options.filter((option) => {
    const label = normalize(option.label)
    return words.every((word) => label.includes(word))
  })
}

interface SearchableSelectProps {
  id?: string
  value: string
  options: SearchableSelectOption[]
  onValueChange: (value: string) => void
  placeholder: string
  searchPlaceholder: string
  emptyLabel: string
  className?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export const SearchableSelect = ({
  id,
  value,
  options,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  className,
  ...aria
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.id === value)
  const filtered = useMemo(() => filterSearchableOptions(options, query), [options, query])

  const choose = (optionId: string) => {
    onValueChange(optionId)
    setOpen(false)
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[activeIndex]
      if (option) choose(option.id)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setQuery('')
          setActiveIndex(Math.max(0, options.findIndex((option) => option.id === value)))
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          {...aria}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-left text-sm focus:outline-none hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25',
            className,
          )}
        >
          <span className={cn('line-clamp-1', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="mr-1 size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-1.5"
        // Escape closes only this list, not the sheet or dialog around it.
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <label className="flex h-11 items-center gap-2 rounded-lg bg-surface-panel px-3 ring-1 ring-border/60 focus-within:ring-2 focus-within:ring-primary/25">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            onKeyDown={onSearchKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            className="h-full w-full appearance-none border-0 bg-transparent p-0 text-sm shadow-none outline-none ring-0 placeholder:text-muted-foreground focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <div id={listId} role="listbox" className="mt-1.5 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            filtered.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => choose(option.id)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'relative flex min-h-11 w-full items-center rounded-lg px-3 py-2 pr-9 text-left text-sm outline-none',
                  index === activeIndex && 'bg-accent text-accent-foreground',
                )}
              >
                {option.label}
                {option.id === value && <Check className="absolute right-2 size-4" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
