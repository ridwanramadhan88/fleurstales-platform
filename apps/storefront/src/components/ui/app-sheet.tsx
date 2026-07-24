import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './sheet'
import { cn } from '../../lib/utils'

interface AppSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  contentClassName?: string
  headerClassName?: string
  hideCloseButton?: boolean
}

export const AppSheet = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'bottom',
  contentClassName,
  headerClassName,
  hideCloseButton = false,
}: AppSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side={side}
      hideCloseButton={hideCloseButton}
      className={cn(
        'flex max-h-[90vh] w-full flex-col overflow-hidden sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0',
        contentClassName,
      )}
    >
      <SheetHeader className={headerClassName}>
        <SheetTitle>{title}</SheetTitle>
        {description ? <SheetDescription>{description}</SheetDescription> : null}
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>
)
