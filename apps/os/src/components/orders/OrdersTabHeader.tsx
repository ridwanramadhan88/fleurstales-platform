/**
 * @file OrdersTabHeader.tsx
 * @description Orders page header with the primary action and operational summary.
 */

import type { FC } from 'react'
import { AlertTriangle, CheckCircle2, FilePenLine, Plus, Workflow } from 'lucide-react'
import { Button } from '../ui/button'
import type { OrdersSubTabId } from './OrdersSubTabs'

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
  <section
    aria-label="Orders overview"
    className="space-y-3"
  >
    <header className="space-y-3 sm:flex sm:min-h-20 sm:items-start sm:justify-between sm:gap-4 sm:space-y-0">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
          {TITLE_BY_SUB_TAB[activeOrdersSubTab]}
        </h1>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Track workload, drafts, and orders that need attention.
        </p>
      </div>

      {(canCreateOrder || createOrderBlockedReason) && (
        <div
          data-testid="new-order-action-area"
          className="w-full space-y-1.5 sm:flex sm:min-h-20 sm:w-72 lg:w-[22rem] sm:flex-col sm:items-end"
        >
          <Button
            type="button"
            variant={canCreateOrder ? "default" : "outline"}
            className="h-10 w-full sm:w-[10.25rem]"
            onClick={onNewOrder}
            disabled={!canCreateOrder}
            aria-describedby={createOrderBlockedReason ? 'new-order-blocked-reason' : undefined}
          >
            <Plus className="size-4" />
            <span>New order</span>
          </Button>
          <p
            id={createOrderBlockedReason ? 'new-order-blocked-reason' : undefined}
            data-testid="new-order-helper-row"
            aria-hidden={createOrderBlockedReason ? undefined : true}
            className={`text-xs leading-4 text-muted-foreground sm:h-8 sm:max-w-full sm:text-right ${
              createOrderBlockedReason ? '' : 'hidden sm:block sm:invisible'
            }`}
          >
            {createOrderBlockedReason || 'Branch selection helper'}
          </p>
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
