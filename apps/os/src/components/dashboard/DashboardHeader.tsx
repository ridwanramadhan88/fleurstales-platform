/**
 * @file DashboardHeader.tsx
 * @description Compact role-specific greeting header for the daily workspace.
 */

import type { FC } from 'react'
import type { UserRole } from '../../store/userStore'

const ROLE_COPY: Record<UserRole, { title: string }> = {
  owner: {
    title: 'Business overview',
  },
  admin: {
    title: "Today's operations",
  },
  finance: {
    title: 'Finance workspace',
  },
  hr: {
    title: 'People & attendance',
  },
  florist: {
    title: 'My work',
  },
  courier: {
    title: 'Tugas antar',
  },
  manager: {
    title: 'Operasional hari ini',
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
      </div>
    </header>
  )
}
