/**
 * @file OrdersTabHeader.tsx
 * @description Orders page header with the primary action and operational summary.
 */

import type { FC } from 'react'
import { Plus, Store } from 'lucide-react'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import type { OrdersSubTabId } from './OrdersSubTabs'
import { GuardedAction } from '../ui/guarded-action'
import { InfoHint } from '../ui/info-hint'

const TITLE_BY_SUB_TAB: Record<OrdersSubTabId, [string, string]> = {
  action: ['Orders', 'Pesanan'],
  waiting: ['Orders', 'Pesanan'],
  done: ['Orders', 'Pesanan'],
  custom: ['Orders', 'Pesanan'],
}

export interface OrderCounts {
  active: number
  completed: number
  needsAttention: number
}

export interface OrdersTabHeaderBranchPicker {
  options: Array<{ id: string; label: string }>
  onSelect: (branchId: string) => void
}

export interface OrdersTabHeaderProps {
  activeOrdersSubTab: OrdersSubTabId
  /** @deprecated The work tabs carry the counts now; kept so callers need not change. */
  orderCounts?: OrderCounts
  /** @deprecated See orderCounts. */
  draftCount?: number
  canCreateOrder: boolean
  createOrderBlockedReason?: string
  /** Shown in place of the blocked reason when picking a branch unblocks New order. */
  branchPicker?: OrdersTabHeaderBranchPicker
  onNewOrder: () => void
}

export const OrdersTabHeader: FC<OrdersTabHeaderProps> = ({
  activeOrdersSubTab,
  canCreateOrder,
  createOrderBlockedReason,
  branchPicker,
  onNewOrder,
}) => {
  const copy = useBilingualCopy()
  const needsBranchSelection = Boolean(
    !canCreateOrder && createOrderBlockedReason?.includes('Select a specific branch'),
  )
  const blockedActionLabel = needsBranchSelection ? 'Select branch first' : 'New order unavailable'
  const BlockedIcon = needsBranchSelection ? Store : Plus
  const showBranchPicker = needsBranchSelection && Boolean(branchPicker?.options.length)

  return (
  <section aria-label="Orders overview" className="space-y-3 sm:space-y-4">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
            {copy(...TITLE_BY_SUB_TAB[activeOrdersSubTab])}
          </h1>
          <InfoHint label={copy('How this list is ordered', 'Cara daftar ini diurutkan')}>
            {copy(
              'Orders are ranked by how soon they are due and which step they are on. Orders that still have to be made count from 90 minutes before pickup or delivery.',
              'Pesanan diurutkan dari waktu yang paling mepet dan tahapnya. Pesanan yang belum dirangkai dihitung dari 90 menit sebelum jam ambil atau antar.',
            )}
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
          {!canCreateOrder && showBranchPicker && branchPicker && (
            <label className="mt-2 block text-xs font-semibold text-muted-foreground">
              <span className="block">Choose a branch to create an order</span>
              <select
                value=""
                onChange={(event) => { if (event.target.value) branchPicker.onSelect(event.target.value) }}
                className="mt-1 h-11 w-full rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10 sm:w-64"
              >
                <option value="" disabled>Choose branch</option>
                {branchPicker.options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          {!canCreateOrder && !showBranchPicker && createOrderBlockedReason && (
            <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground sm:max-w-64">
              {createOrderBlockedReason}
            </p>
          )}
        </div>
      )}
    </header>

  </section>
  )
}
