import type { FormEventHandler, HTMLAttributes, ReactNode, RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import { BadgeCent, CalendarDays, ClipboardCheck, FileBarChart, UsersRound, WalletCards } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useActiveItemScroll } from '../../hooks/useActiveItemScroll'
import { surfaceCardClass } from '../ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { OverviewStatCard, OverviewStatGrid } from '../ui/overview-card'
import { settingsTabButtonClass, settingsTabTrackClass } from '../settings/SettingsPrimitives'
import type { HrSection } from './HrTabContentController'
import { useUserStore } from '../../store/userStore'


export const PEOPLE_SECTION_META: Record<HrSection, { label: string; description: string; icon: LucideIcon }> = {
  employees: {
    label: 'Employees',
    description: 'Manage staff profiles, roles, and employment status.',
    icon: UsersRound,
  },
  attendance: {
    label: 'Attendance',
    description: 'Review daily attendance, warnings, and corrections.',
    icon: ClipboardCheck,
  },
  scheduling: {
    label: 'Scheduling',
    description: 'Create, review, and publish weekly staff schedules.',
    icon: CalendarDays,
  },
  reports: {
    label: 'Reports',
    description: 'Review workforce performance and operational problems.',
    icon: FileBarChart,
  },
  points: {
    label: 'Points',
    description: 'Review employee points, pending activity, and rules.',
    icon: BadgeCent,
  },
  payroll: {
    label: 'Payroll',
    description: 'Prepare, review, and submit monthly payroll.',
    icon: WalletCards,
  },
}

export const PeoplePageShell = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cn('space-y-5 pb-24 md:pb-6', className)}>{children}</section>
)

export const PeopleTabs = ({
  sections,
  activeSection,
  onChange,
  badges,
}: {
  sections: HrSection[]
  activeSection: HrSection
  onChange: (section: HrSection) => void
  badges?: Partial<Record<HrSection, number>>
}) => {
  const role = useUserStore((state) => state.role)
  const hrGroups: HrSection[][] = [['attendance', 'scheduling'], ['employees', 'reports'], ['payroll', 'points']]
  const groupedSections = role === 'hr'
    ? (hrGroups.find((group) => group.includes(activeSection)) ?? hrGroups[0]).filter((section) => sections.includes(section))
    : sections
  const navRef = useActiveItemScroll<HTMLElement>(activeSection, '[aria-current="page"]')
  return (
    <div className="min-w-0">
      <nav
        ref={navRef as RefObject<HTMLElement>}
        aria-label="People sections"
        className={settingsTabTrackClass({ level: 'primary', className: 'gap-5 scroll-px-1 sm:gap-7' })}
      >
        {groupedSections.map((section) => {
          const meta = PEOPLE_SECTION_META[section]
          const Icon = meta.icon
          return (
            <button
              key={section}
              type="button"
              data-active={activeSection === section ? 'true' : undefined}
              onClick={() => onChange(section)}
              aria-current={activeSection === section ? 'page' : undefined}
              className={settingsTabButtonClass({
                active: activeSection === section,
                level: 'primary',
                className: 'h-10 scroll-mx-1 gap-2 px-0.5 text-[13px] sm:text-sm',
              })}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.9} />
              <span>{meta.label}{badges?.[section] ? ` · ${badges[section]}` : ''}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export const PeoplePageHeader = ({
  section,
  title,
  description,
  action,
  icon,
  className,
}: {
  section?: HrSection
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  icon?: LucideIcon
  className?: string
}) => {
  const meta = section ? PEOPLE_SECTION_META[section] : undefined
  const Icon = icon ?? meta?.icon
  const resolvedTitle = title ?? meta?.label
  const resolvedDescription = description ?? meta?.description

  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/65 text-foreground ring-1 ring-border/70">
            <Icon className="size-[18px]" strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0 pt-0.5">
          <h2 className="font-display text-xl font-semibold leading-tight text-foreground">{resolvedTitle}</h2>
          {resolvedDescription && <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{resolvedDescription}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 sm:pt-0.5">{action}</div>}
    </header>
  )
}

export const PeopleSummaryCard = OverviewStatCard
export const PeopleSummaryGrid = OverviewStatGrid

export const PeopleListCard = ({
  density = 'standard',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { density?: 'dense' | 'standard' }) => (
  <article className={surfaceCardClass(density, cn('shadow-none', className))} {...props} />
)

export const CreateStaffSheet = ({
  open,
  onOpenChange,
  onSubmit,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="mobile-focus-workflow bottom-0 left-0 top-auto flex max-h-[96dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-b-none rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-4 sm:px-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">{children}</div>
        <DialogFooter className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-surface-footer/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:flex sm:justify-end sm:px-5 sm:pb-3">
          {footer}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
)
