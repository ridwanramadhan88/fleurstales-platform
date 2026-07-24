/** Occasion management for the Catalog workspace. */
import type { FC } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import type {
  CatalogCategoriesDialogViewModel,
  CatalogCategoryRow,
} from './CatalogCategoriesDialogController'

export interface CatalogCategoriesDialogProps {
  open: boolean
  onClose: () => void
}

const fieldClass =
  'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'

const DisabledDeleteExplanation: FC<{ row: CatalogCategoryRow }> = ({ row }) => {
  const message = row.isProtected
    ? 'Uncategorized is the protected fallback occasion and cannot be removed.'
    : `This occasion cannot be removed because it is still used by ${row.activeProductCount} active product${row.activeProductCount === 1 ? '' : 's'}.`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Why ${row.name} cannot be removed`}
          className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground/45 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Trash2 className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm leading-5">
        {message}
      </PopoverContent>
    </Popover>
  )
}

export const CatalogCategoriesDialog: FC<CatalogCategoriesDialogViewModel> = ({
  open,
  onClose,
  rows,
  newName,
  newPrefix,
  editingId,
  editingName,
  editingPrefix,
  onNewNameChange,
  onNewPrefixChange,
  onEditingNameChange,
  onEditingPrefixChange,
  onAdd,
  onStartEditing,
  onCancelEditing,
  onCommitEditing,
  onDelete,
}) => (
  <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="flex max-h-[88vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b border-border/70 px-6 py-5">
        <DialogTitle>Manage occasions</DialogTitle>
        <DialogDescription>
          Edit names and SKU prefixes. Occasions with active products cannot be removed.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 space-y-3 overflow-y-auto px-6 py-5">
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No occasions yet.</p>
        )}
        {rows.map((row) => {
          const isEditing = editingId === row.id
          const total = row.activeProductCount + row.inactiveProductCount
          return (
            <article key={row.id} className="rounded-2xl border border-border/75 bg-card p-4">
              {isEditing ? (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Occasion name · Required</label>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => onEditingNameChange(event.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">SKU prefix · Required</label>
                    <input
                      value={editingPrefix}
                      onChange={(event) => onEditingPrefixChange(event.target.value)}
                      maxLength={5}
                      className={fieldClass}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onCommitEditing}
                      aria-label="Save occasion"
                      className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEditing}
                      aria-label="Cancel occasion edit"
                      className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-foreground">{row.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Prefix {row.prefix} · {row.activeProductCount} active product{row.activeProductCount === 1 ? '' : 's'}
                      {row.inactiveProductCount > 0 ? ` · ${row.inactiveProductCount} inactive` : ''}
                    </p>
                    {total === 0 && <p className="mt-1 text-xs text-muted-foreground">Unused occasion</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartEditing(row.id, row.name, row.prefix)}
                    aria-label={`Edit ${row.name}`}
                    className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  {row.activeProductCount > 0 || row.isProtected ? (
                    <DisabledDeleteExplanation row={row} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onDelete(row)}
                      aria-label={`Remove ${row.name}`}
                      className="inline-flex size-11 items-center justify-center rounded-full text-destructive transition hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="border-t border-border bg-card px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Occasion name · Required</label>
            <input
              value={newName}
              onChange={(event) => onNewNameChange(event.target.value)}
              placeholder="Example: Anniversary"
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">SKU prefix</label>
            <input
              value={newPrefix}
              onChange={(event) => onNewPrefixChange(event.target.value)}
              placeholder="Auto"
              maxLength={5}
              className={fieldClass}
            />
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            Add occasion
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
)

export default CatalogCategoriesDialog
