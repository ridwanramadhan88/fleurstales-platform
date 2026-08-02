import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export interface InfoHintProps {
  children: ReactNode
  label?: string
  className?: string
  contentClassName?: string
  align?: 'start' | 'center' | 'end'
}

/**
 * Compact contextual help. Tap/click opens the popover; desktop hover still
 * receives a native title without keeping explanatory copy permanently visible.
 */
export const InfoHint = ({
  children,
  label = 'More information',
  className,
  contentClassName,
  align = 'start',
}: InfoHintProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        title={typeof children === 'string' ? children : label}
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          className,
        )}
      >
        <Info className="size-3.5" strokeWidth={2} />
      </button>
    </PopoverTrigger>
    <PopoverContent
      align={align}
      className={cn('text-xs leading-5 text-muted-foreground', contentClassName)}
    >
      {children}
    </PopoverContent>
  </Popover>
)
