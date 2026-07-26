import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { cn } from '../../lib/utils'

type AppDialogSize = 'compact' | 'standard' | 'wide' | 'workspace'

interface AppDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  hideCloseButton?: boolean
  size?: AppDialogSize
}

const sizeClass: Record<AppDialogSize, string> = {
  compact: 'sm:max-w-xl md:max-w-2xl',
  standard: 'sm:max-w-2xl md:max-w-3xl lg:max-w-4xl',
  wide: 'sm:max-w-3xl md:max-w-4xl lg:max-w-5xl',
  workspace: 'sm:w-[calc(100vw-2rem)] sm:max-w-5xl md:max-w-6xl xl:max-w-7xl',
}

export const AppDialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  contentClassName,
  size = 'standard',
}: AppDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={cn('max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[calc(100dvh-2rem)]', sizeClass[size], contentClassName)}>
      <DialogHeader className={className}>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
)
