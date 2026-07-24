/**
 * @file DashboardHeader.tsx
 * @description Compact role-specific greeting header for the daily workspace.
 */

import type { FC } from 'react'
import { ArrowRight } from 'lucide-react'
import type { UserRole } from '../../store/userStore'

const ROLE_COPY: Record<UserRole, { title: string; description: string }> = {
  owner: {
    title: 'Business overview',
    description: 'Business health and key actions.',
  },
  admin: {
    title: "Today's operations",
    description: 'Today’s orders and issues.',
  },
  finance: {
    title: 'Finance workspace',
    description: 'Payments, payroll, refunds, and ledger.',
  },
  hr: {
    title: 'People & attendance',
    description: 'Staff, attendance, schedules, and payroll.',
  },
  florist: {
    title: 'My work',
    description: 'Your orders and next task.',
  },
}

export interface DashboardHeaderProps {
  activeBranch: string
  formattedDate: string
  greeting: string
  userRole: UserRole
  onOpenOrders: () => void
}

export const DashboardHeader: FC<DashboardHeaderProps> = ({
  activeBranch,
  formattedDate,
  greeting,
  userRole,
  onOpenOrders,
}) => {
  const copy = ROLE_COPY[userRole]
  const showOrdersAction = userRole === 'owner' || userRole === 'admin'

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">
          {greeting} · {activeBranch} · {formattedDate}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{copy.description}</p>
      </div>

      {showOrdersAction && (
        <button
          type="button"
          onClick={onOpenOrders}
          className="tap-scale inline-flex h-11 w-fit items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <span>View orders</span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </header>
  )
}
