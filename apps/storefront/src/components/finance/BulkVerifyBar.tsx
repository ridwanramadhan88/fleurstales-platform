/**
 * @file BulkVerifyBar.tsx
 * @description "Select all" + bulk "Verify N selected" bar shown beneath the
 * status filter chips in OrderTransactionVerificationQueue once bulk-select
 * mode is toggled on. Only ever targets pending rows — the parent guarantees
 * `selectableCount`/`selectedCount` only ever reflect still-pending orders,
 * since verified/rejected rows have no direct-verify action left to take.
 */

import { useState, type FC } from 'react'
import { Checkbox } from '../ui/checkbox'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'

export interface BulkVerifyBarProps {
  /** Count of rows currently eligible for bulk selection (pending, under the active filters). */
  selectableCount: number
  /** Count of rows currently selected (pruned to only-selectable by the parent). */
  selectedCount: number
  /** Whether every selectable row is currently selected — drives the "select all" checkbox state. */
  allSelected: boolean
  onToggleSelectAll: (checked: boolean) => void
  onClearSelection: () => void
  onBulkVerify: () => void
}

/**
 * @description Renders nothing on its own — visibility (bulk-select mode on,
 * canVerify, selectableCount > 0) is decided by the parent, which only
 * mounts this component when all three hold.
 */
export const BulkVerifyBar: FC<BulkVerifyBarProps> = ({
  selectableCount,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onClearSelection,
  onBulkVerify,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
      <label className="flex cursor-pointer items-center gap-2 text-2xs font-medium text-muted-foreground">
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
        />
        {selectedCount > 0 ? `${selectedCount} selected` : `Select all (${selectableCount})`}
      </label>
      {selectedCount > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClearSelection}
            className="cursor-pointer rounded-full text-2xs font-medium text-muted-foreground hover:bg-card rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="cursor-pointer h-11 rounded-full bg-success px-[18px] text-sm font-medium text-white shadow-ios-sm hover:bg-success/90"
          >
            Verify {selectedCount} selected
          </button>
        </div>
      )}
    </div>
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Verify ${selectedCount} selected order${selectedCount === 1 ? '' : 's'}?`}
        description="Verify selected payments. Corrections require a reversal."
        confirmLabel={`Verify ${selectedCount}`}
        onConfirm={() => { setConfirmOpen(false); onBulkVerify() }}
        disabled={selectedCount < 1}
      />
    </>
  )
}

export default BulkVerifyBar
