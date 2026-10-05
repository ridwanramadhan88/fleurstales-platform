/**
 * @file DashboardHeader.tsx
 * @description Compact role-specific greeting header for the daily workspace.
 */

import type { FC } from 'react'
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
}

export const DashboardHeader: FC<DashboardHeaderProps> = ({
  activeBranch,
  formattedDate,
  greeting,
  userRole,
}) => {
  const copy = ROLE_COPY[userRole]

  return (
    // No orders button here: the priority list below already links to all orders.
    <header>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">
          {greeting} · {activeBranch}
          {/* Desktop already shows the date in the top bar. */}
          <span className="md:hidden"> · {formattedDate}</span>
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{copy.description}</p>
      </div>
    </header>
  )
}
