/**
 * @file StockItemRow.tsx
 * @description Compact single-line row for a stock item in the Inventory
 * list. Replaces the previous full detail card in the list itself — detail
 * and mutating controls now live in StockItemDetailSheet, opened on tap.
 */

import type { FC } from 'react'
import { ChevronRight } from 'lucide-react'
import type { StockItem, StockTransfer } from '../../store/stockStore'
import {
  getActiveTransferForItem,
  getStockRiskLevel,
  getStockStatusGroup,
} from '../../domain/stockDomain'

export interface StockItemRowProps {
  item: StockItem
  transfers: StockTransfer[]
  /** Whether bulk-manage mode is active (shows the selection checkbox). */
  manageMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
}

const subCategoryLabelMap: Record<
  NonNullable<StockItem['subCategory']>,
  string
> = {
  fresh_flower: 'Fresh flower',
  artificial_flower: 'Artificial flower',
}

const statusLabelMap: Record<
  ReturnType<typeof getStockStatusGroup>,
  string
> = {
  active: 'Active',
  low: 'Low stock',
  expired: 'Expired',
  in_transit: 'In transit',
}

/**
 * @description One compact, tappable row per stock item.
 */
export const StockItemRow: FC<StockItemRowProps> = ({
  item,
  transfers,
  manageMode,
  selected,
  onToggleSelect,
  onOpenDetail,
}) => {
  const statusGroup = getStockStatusGroup(item, transfers)
  const riskLevel = getStockRiskLevel(item, transfers)
  const activeTransfer = getActiveTransferForItem(item.id, transfers)

  const riskDotClass =
    riskLevel === 'red'
      ? 'bg-destructive'
      : riskLevel === 'yellow'
        ? 'bg-warning'
        : 'bg-success'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (manageMode ? onToggleSelect() : onOpenDetail())}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          manageMode ? onToggleSelect() : onOpenDetail()
        }
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-xs border border-border/70 bg-card px-3 py-2.5 shadow-ios-sm transition hover:bg-accent/40 ${
        item.isArchived ? 'opacity-60' : ''
      }`}
    >
      {manageMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => {
            event.stopPropagation()
            onToggleSelect()
          }}
          onClick={(event) => event.stopPropagation()}
          className="size-4 shrink-0 rounded-xs accent-foreground"
        />
      )}

      <span className={`h-2 w-2 shrink-0 rounded-full ${riskDotClass}`} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.category}
          {item.subCategory && ` · ${subCategoryLabelMap[item.subCategory]}`}
          {' · '}
          {item.branch}
          {item.isArchived && ' · Archived'}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold leading-5 text-foreground">
          {item.availableQty} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {activeTransfer ? 'In transit' : statusLabelMap[statusGroup]}
        </p>
      </div>

      {!manageMode && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  )
}

export default StockItemRow
