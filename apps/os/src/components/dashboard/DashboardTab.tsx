/**
 * @file DashboardTab.tsx
 * @description Simplified role-based daily workspace.
 */

import type { FC } from 'react'
import type { BranchFilter } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import { toAppTab, toOrders, type AppNavigationRequest } from '../../config/appNavigation'
import { DashboardHeader } from './DashboardHeader'
import { AdminTodayQueue } from './AdminTodayQueue'
import { OverviewCardsContainer } from './OverviewCardsContainer'
import { OwnerAttentionQueue } from './OwnerAttentionQueue'
import { FloristAssignedOrders } from './FloristAssignedOrders'
import { AdminFinishedMetrics } from './AdminFinishedMetrics'
import { MyDayStrip } from './MyDayStrip'
import { FinanceHomeWork, HrHomeWork } from './HomeWorkCards'
import { RevenueTrendCard } from './RevenueTrendCard'

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
    <section className="space-y-6">
      <DashboardHeader
        activeBranch={activeBranch}
        formattedDate={formattedDate}
        greeting={greeting}
        userRole={userRole}
      />

      {/* Each role sees its own work first. */}
      {userRole === 'owner' && (
        <>
          <OverviewCardsContainer />
          <OwnerAttentionQueue onNavigate={onNavigate} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <AdminTodayQueue
              activeBranch={activeBranch}
              onGoToOrders={onGoToOrders}
              onOpenOrder={(orderNumber) => onNavigate(toOrders({ orderNumber }))}
            />
            <RevenueTrendCard activeBranch={activeBranch} onOpenRevenue={() => onNavigate(toAppTab('revenue'))} />
          </div>
        </>
      )}

      {userRole === 'admin' && (
        <>
          <MyDayStrip />
          <AdminTodayQueue
            activeBranch={activeBranch}
            onGoToOrders={onGoToOrders}
            onOpenOrder={(orderNumber) => onNavigate(toOrders({ orderNumber }))}
          />
          <AdminFinishedMetrics activeBranch={activeBranch} onOpenFinishedOrders={onGoToFinishedOrders} />
        </>
      )}

      {userRole === 'florist' && (
        <>
          <MyDayStrip />
          <FloristAssignedOrders onGoToOrders={onGoToOrders} />
        </>
      )}

      {userRole === 'finance' && <FinanceHomeWork onNavigate={onNavigate} />}

      {userRole === 'hr' && <HrHomeWork onNavigate={onNavigate} />}
    </section>
  )
}
