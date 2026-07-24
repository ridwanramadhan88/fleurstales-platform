/**
 * @file StockItemDetailSheet.tsx
 * @description Detail popup for a single stock item, opened by tapping a row
 * in the Inventory list. Shows full item info plus transfer / loss controls
 * (previously inline on the list card), and an Edit button that opens
 * StockItemFormSheet. Read-only when the role can't edit Stock.
 */

import type { FC } from 'react'
import { Pencil, Archive, ArchiveRestore, X } from 'lucide-react'
import type {
  StockItem,
  StockTransfer,
  StockTransferStatus,
  StockEvent,
  StockEventKind,
} from '../../store/stockStore'
import {
  getActiveTransferForItem,
  getFreshnessStateForItem,
  getStockRiskLevel,
  getStockStatusGroup,
} from '../../domain/stockDomain'
import { useDismissableModal } from '../../hooks/useDismissableModal'
import { StockTransferLossSection } from './StockTransferLossSection'

export interface StockItemDetailSheetProps {
  open: boolean
  item: StockItem | null
  transfers: StockTransfer[]
  events: StockEvent[]
  onClose: () => void
  onRequestTransfer: (params: {
    itemId: string
    fromBranch: StockItem['branch']
    toBranch: StockItem['branch']
    quantity: number
  }) => void
  onAdvanceTransferStatus: (transferId: string, status: StockTransferStatus) => void
  onRecordLoss: (params: {
    itemId: string
    quantity: number
    kind: StockEventKind
    reason: string
  }) => void
  onEditRequest: () => void
  onToggleArchive: (isArchived: boolean) => void
  canEdit?: boolean
}

const subCategoryLabelMap: Record<
  NonNullable<StockItem['subCategory']>,
  string
> = {
  fresh_flower: 'Fresh flower',
  artificial_flower: 'Artificial flower',
}

/**
 * @description Full detail view + mutating controls for one stock item.
 */
export const StockItemDetailSheet: FC<StockItemDetailSheetProps> = ({
  open,
  item,
  transfers,
  events,
  onClose,
  onRequestTransfer,
  onAdvanceTransferStatus,
  onRecordLoss,
  onEditRequest,
  onToggleArchive,
  canEdit = true,
}) => {
  useDismissableModal(open, onClose)

  if (!open || !item) return null

  const freshness = getFreshnessStateForItem(item)
  const statusGroup = getStockStatusGroup(item, transfers)
  const riskLevel = getStockRiskLevel(item, transfers)
  const activeTransfer = getActiveTransferForItem(item.id, transfers)

  const riskBadgeClass =
    riskLevel === 'red'
      ? 'bg-destructive/10 text-destructive ring-destructive/15'
      : riskLevel === 'yellow'
        ? 'bg-warning/10 text-warning ring-warning/15'
        : 'bg-success/10 text-success ring-success/15'

  const statusLabelMap: Record<typeof statusGroup, string> = {
    active: 'Active',
    low: 'Low stock',
    expired: 'Expired',
    in_transit: 'In transit',
  }
  const freshnessLabelMap: Record<typeof freshness, string> = {
    fresh: 'Fresh',
    near_expiry: 'Near expiry',
    expired: 'Expired',
  }
  const availableLabel = `${item.availableQty} ${item.unit}`
  const reservedLabel =
    item.reservedQty > 0 ? `${item.reservedQty} reserved` : 'No reservations'

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/32 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card shadow-lg ring-1 ring-border/60 sm:max-h-[90vh] sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-border/70 px-5 py-3.5">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold leading-6 text-foreground">
              {item.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {item.category}
              {item.subCategory && ` · ${subCategoryLabelMap[item.subCategory]}`}
              {' · '}
              {item.branch}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground rounded-full p-0 size-11 rounded-full p-0 whitespace-nowrap"
            aria-label="Close item detail"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {/* Status */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-medium ${riskBadgeClass} ring-1`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {statusLabelMap[statusGroup]}
            </span>
            <span className="text-2xs text-muted-foreground">
              Freshness: {freshnessLabelMap[freshness]}
            </span>
          </div>

          {/* Quantities */}
          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-xs bg-muted px-3 py-2">
              <p className="text-2xs font-semibold text-muted-foreground">
                Available
              </p>
              <p className="text-sm font-semibold leading-5 text-foreground">
                {availableLabel}
              </p>
              <p className={item.reservedQty > 0 ? 'text-2xs text-muted-foreground' : 'text-2xs text-muted-foreground/40'}>{reservedLabel}</p>
            </div>
            <div className="rounded-xs bg-muted px-3 py-2">
              <p className="text-2xs font-semibold text-muted-foreground">
                Threshold
              </p>
              <p className="text-sm font-semibold leading-5 text-foreground">
                {item.lowStockThreshold} {item.unit}
              </p>
              {item.isPerishable && item.expiryDate && (
                <p className="text-2xs text-muted-foreground">
                  Expiry: {item.expiryDate}
                </p>
              )}
            </div>
          </section>

          <StockTransferLossSection
            item={item}
            activeTransfer={activeTransfer}
            canEdit={canEdit}
            onRequestTransfer={onRequestTransfer}
            onAdvanceTransferStatus={onAdvanceTransferStatus}
            onRecordLoss={onRecordLoss}
          />

          <p className="text-2xs text-muted-foreground">
            {events.length} audit event{events.length === 1 ? '' : 's'} on record.
          </p>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 z-10 flex flex-row flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-footer px-5 pb-3 pt-2 sm:pb-3">
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => onToggleArchive(!item.isArchived)}
                className="inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:min-h-0 sm:text-xs"
              >
                {item.isArchived ? (
                  <>
                    <ArchiveRestore className="size-3.5" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="size-3.5" />
                    Archive
                  </>
                )}
              </button>
            )}
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex cursor-pointer items-center justify-center text-sm font-medium text-muted-foreground transition hover:text-foreground sm:min-h-0 sm:text-xs rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              Close
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={onEditRequest}
                className="inline-flex cursor-pointer items-center justify-center rounded-full bg-primary text-sm font-medium text-white shadow-ios-sm transition hover:bg-primary/90 sm:min-h-0 sm:text-xs rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
              >
                <Pencil className="size-3.5" />
                Edit item
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default StockItemDetailSheet
