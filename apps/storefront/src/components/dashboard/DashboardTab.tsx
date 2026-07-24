/**
 * @file DashboardTab.tsx
 * @description Simplified role-based daily workspace.
 */

import type { FC } from 'react'
import type { BranchFilter } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import type { AppNavigationRequest } from '../../config/appNavigation'
import { DashboardHeader } from './DashboardHeader'
import { ModuleShortcuts } from './ModuleShortcuts'
import { RoleFocusNotice } from './RoleFocusNotice'
import { AdminTodayQueue } from './AdminTodayQueue'
import { OverviewCardsContainer } from './OverviewCardsContainer'
import { SelfieAttendanceCard } from '../hr/SelfieAttendanceCard'
import { OwnerAttentionQueue } from './OwnerAttentionQueue'
import { MySchedulePanel } from '../hr/MySchedulePanel'
import { FloristAssignedOrders } from './FloristAssignedOrders'
import { AdminFinishedMetrics } from './AdminFinishedMetrics'

export interface DashboardTabProps {
  activeBranch: BranchFilter
  userRole: UserRole
  greeting: string
  formattedDate: string
  onNavigate: (target: AppNavigationRequest) => void
  onGoToOrders: () => void
  onGoToFinishedOrders: () => void
}

/**
 * Keeps each role focused on its everyday job instead of rendering the same
 * all-purpose dashboard for everyone. No new workflows are introduced here;
 * this only reorders and removes distracting existing sections.
 */
export const DashboardTab: FC<DashboardTabProps> = ({
  activeBranch,
  userRole,
  greeting,
  formattedDate,
  onNavigate,
  onGoToOrders,
  onGoToFinishedOrders,
}) => {
  return (
    <section className="space-y-6 sm:space-y-5 lg:space-y-6">
      <DashboardHeader
        activeBranch={activeBranch}
        formattedDate={formattedDate}
        greeting={greeting}
        userRole={userRole}
        onOpenOrders={onGoToOrders}
      />

      {userRole === 'owner' && (
        <>
          <OverviewCardsContainer />
          <OwnerAttentionQueue onNavigate={onNavigate} />
          <ModuleShortcuts userRole={userRole} onNavigate={onNavigate} />
        </>
      )}

      {userRole === 'admin' && (
        <>
          <SelfieAttendanceCard />
          <MySchedulePanel />
          <AdminFinishedMetrics activeBranch={activeBranch} onOpenFinishedOrders={onGoToFinishedOrders} />
          <AdminTodayQueue activeBranch={activeBranch} onGoToOrders={onGoToOrders} />
          <ModuleShortcuts userRole={userRole} onNavigate={onNavigate} />
        </>
      )}

      {userRole === 'florist' && (
        <>
          <SelfieAttendanceCard />
          <MySchedulePanel />
          <FloristAssignedOrders onGoToOrders={onGoToOrders} />
        </>
      )}

      {(userRole === 'finance' || userRole === 'hr') && (
        <>
          <ModuleShortcuts userRole={userRole} onNavigate={onNavigate} />
          <RoleFocusNotice userRole={userRole} />
        </>
      )}
    </section>
  )
}
