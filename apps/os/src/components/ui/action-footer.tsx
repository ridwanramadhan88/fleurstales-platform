import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const ActionFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 border-t border-border bg-surface-footer pt-5 sm:flex-row sm:items-center sm:justify-end',
      className,
    )}
    {...props}
  />
)
