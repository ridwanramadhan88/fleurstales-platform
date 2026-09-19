/**
 * @file OrdersTabHeader.tsx
 * @description Orders page header with the primary action and operational summary.
 */

import type { FC } from 'react'
import { AlertTriangle, CheckCircle2, FilePenLine, Plus, Store, Workflow } from 'lucide-react'
import type { OrdersSubTabId } from './OrdersSubTabs'
import { GuardedAction } from '../ui/guarded-action'
import { InfoHint } from '../ui/info-hint'

const TITLE_BY_SUB_TAB: Record<OrdersSubTabId, string> = {
  today: "Today's Orders",
  future: 'Future Orders',
  custom: 'Custom Date Orders',
}

export interface OrderCounts {
  active: number
  completed: number
  needsAttention: number
}

export interface OrdersTabHeaderProps {
  activeOrdersSubTab: OrdersSubTabId
  orderCounts: OrderCounts
  draftCount: number
  canCreateOrder: boolean
  createOrderBlockedReason?: string
  onNewOrder: () => void
}

const SummaryCard: FC<{
  label: string
  value: number
  tone: 'neutral' | 'success' | 'warning' | 'info'
  icon: FC<{ className?: string }>
}> = ({ label, value, tone, icon: Icon }) => {
  const accentClass = {
    neutral: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    info: 'text-info',
  }[tone]
  // One white card material everywhere — semantics live in the icon/value
  // accent, never in the card fill (matches OverviewStatCard).
  const surfaceClass = 'bg-surface-card ring-border/60'

  return (
    <div className={`min-w-0 rounded-xl p-3 shadow-ios-sm ring-1 sm:rounded-2xl sm:p-4 ${surfaceClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold leading-4 text-muted-foreground">{label}</p>
        <Icon className={`size-3.5 shrink-0 sm:size-4 ${accentClass}`} />
      </div>
      <p className={`mt-0.5 text-lg font-semibold leading-6 tabular-nums sm:mt-1 sm:text-xl ${accentClass}`}>{value}</p>
    </div>
  )
}

export const OrdersTabHeader: FC<OrdersTabHeaderProps> = ({
  activeOrdersSubTab,
  orderCounts,
  draftCount,
  canCreateOrder,
  createOrderBlockedReason,
  onNewOrder,
}) => {
  const needsBranchSelection = Boolean(
    !canCreateOrder && createOrderBlockedReason?.includes('Select a specific branch'),
  )
  const blockedActionLabel = needsBranchSelection ? 'Select branch first' : 'New order unavailable'
  const BlockedIcon = needsBranchSelection ? Store : Plus

  return (
  <section aria-label="Orders overview" className="space-y-3 sm:space-y-4">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
            {TITLE_BY_SUB_TAB[activeOrdersSubTab]}
          </h1>
          <InfoHint label="About this orders view">
            Track workload, drafts, and orders that need attention.
          </InfoHint>
        </div>
      </div>

      {(canCreateOrder || createOrderBlockedReason) && (
        <div data-testid="new-order-action-area" className="w-full sm:w-auto">
          <GuardedAction
            allowed={canCreateOrder}
            reason={createOrderBlockedReason}
            onAction={onNewOrder}
            className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-[18px] text-sm font-semibold shadow-ios-sm transition sm:w-auto ${
              canCreateOrder
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border border-border bg-card text-muted-foreground'
            }`}
          >
            {canCreateOrder ? <Plus className="size-4" /> : <BlockedIcon className="size-4" />}
            <span>{canCreateOrder ? 'New order' : blockedActionLabel}</span>
          </GuardedAction>
        </div>
      )}
    </header>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <SummaryCard label="Active orders" value={orderCounts.active} tone="info" icon={Workflow} />
      <SummaryCard label="Completed" value={orderCounts.completed} tone="success" icon={CheckCircle2} />
      <SummaryCard label="Drafts" value={draftCount} tone="neutral" icon={FilePenLine} />
      <SummaryCard label="Needs attention" value={orderCounts.needsAttention} tone="warning" icon={AlertTriangle} />
    </div>
  </section>
  )
}
