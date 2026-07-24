import type { FC } from 'react'
import { FilePenLine, Trash2 } from 'lucide-react'
import type { SavedOrderDraft } from './orderDraftStore'

interface OrderDraftsListProps {
  drafts: SavedOrderDraft[]
  onResume: (id: string) => void
  onDelete: (id: string) => void
}

const draftItemLabel = (draft: SavedOrderDraft) => {
  if (draft.values.orderItemMode === 'custom') {
    return draft.values.orderItemCustomName.trim() || 'Custom order item'
  }
  return draft.values.orderItemCatalogId ? 'Catalog product selected' : 'No item selected'
}

export const OrderDraftsList: FC<OrderDraftsListProps> = ({ drafts, onResume, onDelete }) => {
  if (drafts.length === 0) {
    return (
      <div className="rounded-lg bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
        No saved order drafts yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xs bg-card ring-1 ring-border/60">
      {drafts.map((draft) => (
        <div
          key={draft.id}
          className="flex items-center gap-3 border-t border-border/70 px-4 py-3 first:border-t-0 sm:px-5"
        >
          <FilePenLine className="size-4 shrink-0 text-muted-foreground" />
          <button
            type="button"
            onClick={() => onResume(draft.id)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate font-semibold text-foreground">
              {draft.values.customerName.trim() || 'Unnamed customer'}
            </div>
            <div className="truncate text-xs text-foreground">{draftItemLabel(draft)}</div>
            <div className="text-2xs text-muted-foreground">
              {draft.branch} · Updated {new Date(draft.updatedAt).toLocaleString()}
            </div>
          </button>
          <button
            type="button"
            aria-label={`Delete draft for ${draft.values.customerName || 'unnamed customer'}`}
            onClick={() => onDelete(draft.id)}
            className="rounded-full p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
