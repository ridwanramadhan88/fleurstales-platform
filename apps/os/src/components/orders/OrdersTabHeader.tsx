/**
 * @file OrdersTabHeader.tsx
 * @description Orders page header with the primary action and operational summary.
 */

import type { FC } from 'react'
import { AlertTriangle, CheckCircle2, FilePenLine, Plus, Workflow } from 'lucide-react'
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
  const surfaceClass = {
    neutral: 'bg-card ring-border',
    success: 'bg-surface-success ring-success/25',
    warning: 'bg-surface-warning ring-warning/25',
    info: 'bg-surface-info ring-info/25',
  }[tone]

  return (
    <div className={`min-w-0 rounded-xl p-3 shadow-ios-sm ring-1 sm:p-4 ${surfaceClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={`size-4 shrink-0 ${accentClass}`} />
      </div>
      <p className={`mt-1 text-xl font-semibold ${accentClass}`}>{value}</p>
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
}) => (
  <section aria-label="Orders overview" className="space-y-4">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
            <Plus className="size-4" />
            <span>New order</span>
          </GuardedAction>
        </div>
      )}
    </header>

    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      <SummaryCard label="Active orders" value={orderCounts.active} tone="info" icon={Workflow} />
      <SummaryCard label="Completed" value={orderCounts.completed} tone="success" icon={CheckCircle2} />
      <SummaryCard label="Drafts" value={draftCount} tone="neutral" icon={FilePenLine} />
      <SummaryCard label="Needs attention" value={orderCounts.needsAttention} tone="warning" icon={AlertTriangle} />
    </div>
  </section>
)
