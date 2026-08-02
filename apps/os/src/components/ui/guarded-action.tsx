import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export interface GuardedActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'onClick' | 'title'> {
  allowed: boolean
  reason?: ReactNode
  onAction: () => void
  popoverAlign?: 'start' | 'center' | 'end'
}

/**
 * Keeps unavailable actions visible without a permanent helper paragraph.
 * The button remains tappable/focusable so the workflow reason can be shown.
 */
export const GuardedAction = ({
  allowed,
  reason,
  onAction,
  popoverAlign = 'center',
  className,
  children,
  type = 'button',
  ...props
}: GuardedActionProps) => {
  const trigger = (
    <button
      {...props}
      type={type}
      aria-disabled={!allowed || undefined}
      disabled={!allowed && !reason}
      title={!allowed && typeof reason === 'string' ? reason : undefined}
      onClick={() => {
        if (allowed) onAction()
      }}
      className={cn(
        className,
        !allowed && reason && 'cursor-help opacity-60',
      )}
    >
      {children}
    </button>
  )

  if (allowed || !reason) return trigger

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={popoverAlign}
        className="text-xs leading-5 text-muted-foreground"
      >
        {reason}
      </PopoverContent>
    </Popover>
  )
}
