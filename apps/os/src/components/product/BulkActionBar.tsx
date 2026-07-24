/** Shared readable bulk-management toolbar. */
import type { FC } from 'react'
import { Archive, ArchiveRestore, Trash2, X } from 'lucide-react'

export interface BulkActionBarProps {
  selectedCount: number
  totalCount: number
  allSelected: boolean
  onToggleSelectAll: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete: () => void
  onDone: () => void
}

const actionClass =
  'inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40'

export const BulkActionBar: FC<BulkActionBarProps> = ({
  selectedCount,
  totalCount,
  allSelected,
  onToggleSelectAll,
  onArchive,
  onUnarchive,
  onDelete,
  onDone,
}) => (
  <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-foreground shadow-lg">
    <div className="flex min-w-0 items-center gap-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleSelectAll}
          className="size-5 rounded accent-foreground"
        />
        <span>Select all ({totalCount})</span>
      </label>
      <span className="border-l border-border pl-3 text-sm text-muted-foreground">
        {selectedCount} selected
      </span>
    </div>

    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {onArchive && (
        <button
          type="button"
          onClick={onArchive}
          disabled={selectedCount === 0}
          className={`${actionClass} text-foreground hover:bg-muted`}
        >
          <Archive className="size-4" /> Archive
        </button>
      )}
      {onUnarchive && (
        <button
          type="button"
          onClick={onUnarchive}
          disabled={selectedCount === 0}
          className={`${actionClass} text-foreground hover:bg-muted`}
        >
          <ArchiveRestore className="size-4" /> Restore
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={selectedCount === 0}
        className={`${actionClass} bg-destructive text-destructive-foreground hover:bg-destructive/90`}
      >
        <Trash2 className="size-4" /> Delete
      </button>
      <button
        type="button"
        onClick={onDone}
        aria-label="Cancel selection"
        className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  </div>
)

export default BulkActionBar
