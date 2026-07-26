import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './sheet'
import { cn } from '../../lib/utils'

type AppSheetSize = 'compact' | 'standard' | 'wide' | 'workspace'

interface AppSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right' | 'responsiveRight'
  contentClassName?: string
  headerClassName?: string
  hideCloseButton?: boolean
  size?: AppSheetSize
}

const centeredSizeClass: Record<AppSheetSize, string> = {
  compact: 'sm:max-w-2xl',
  standard: 'sm:max-w-3xl md:max-w-4xl',
  wide: 'sm:max-w-4xl md:max-w-5xl lg:max-w-6xl',
  workspace: 'sm:max-w-5xl md:max-w-6xl xl:max-w-7xl',
}

const drawerSizeClass: Record<AppSheetSize, string> = {
  compact: 'sm:w-[min(34rem,88vw)] md:w-[min(38rem,72vw)]',
  standard: 'sm:w-[min(40rem,88vw)] md:w-[min(44rem,72vw)]',
  wide: 'sm:w-[min(46rem,90vw)] md:w-[min(52rem,76vw)] lg:w-[min(56rem,68vw)]',
  workspace: 'sm:w-[min(56rem,92vw)] md:w-[min(64rem,84vw)] lg:w-[min(72rem,76vw)]',
}

const responsiveDrawerSizeClass: Record<AppSheetSize, string> = {
  compact: 'md:w-[min(38rem,72vw)]',
  standard: 'md:w-[min(44rem,72vw)]',
  wide: 'md:w-[min(52rem,76vw)] lg:w-[min(56rem,68vw)]',
  workspace: 'md:w-[min(64rem,84vw)] lg:w-[min(72rem,76vw)]',
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
  size = 'standard',
}: AppSheetProps) => {
  const isDrawer = side === 'left' || side === 'right'
  const isResponsiveDrawer = side === 'responsiveRight'
  const responsiveClass = isDrawer
    ? drawerSizeClass[size]
    : isResponsiveDrawer
      ? responsiveDrawerSizeClass[size]
      : side === 'bottom'
      ? cn(
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:data-[state=closed]:[--tw-exit-translate-y:0] sm:data-[state=open]:[--tw-enter-translate-y:0]',
          centeredSizeClass[size],
        )
      : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        hideCloseButton={hideCloseButton}
        className={cn(
          'flex max-h-[94dvh] w-full flex-col overflow-hidden',
          isDrawer && 'max-h-dvh rounded-none',
          isResponsiveDrawer && 'md:max-h-dvh md:rounded-none',
          responsiveClass,
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
}
