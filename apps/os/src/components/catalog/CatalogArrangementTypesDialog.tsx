import { useMemo, useState, type FC } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCatalogStore } from '../../store/catalogStore'
import { toast } from '../../hooks/use-toast'
import { requestAppConfirmation } from '../ui/app-confirm'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
}

const fieldClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const iconButton = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground'

export const CatalogArrangementTypesDialog: FC<Props> = ({ open, onClose }) => {
  const arrangementTypes = useCatalogStore((state) => state.arrangementTypes)
  const products = useCatalogStore((state) => state.products)
  const addArrangementType = useCatalogStore((state) => state.addArrangementType)
  const renameArrangementType = useCatalogStore((state) => state.renameArrangementType)
  const deleteArrangementType = useCatalogStore((state) => state.deleteArrangementType)
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const rows = useMemo(() => arrangementTypes.map((name) => ({
    name,
    productCount: products.filter((product) => product.productType === name).length,
  })), [arrangementTypes, products])

  const showResult = (result: ReturnType<typeof addArrangementType>): boolean => {
    if (result.ok) return true
    toast({ description: result.reason })
    return false
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="grid h-[min(720px,calc(100dvh-2rem))] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 lg:max-w-2xl">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>Manage arrangement types</DialogTitle>
          <DialogDescription>
            Keep product types consistent across Catalog, Storefront, and size guides.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            {rows.map((row) => (
              <article key={row.name} className="rounded-2xl border border-border/75 bg-card p-4">
                {editingName === row.name ? (
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <label className="text-sm font-medium">Arrangement type name</label>
                      <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} className={fieldClass} />
                    </div>
                    <button type="button" aria-label="Save arrangement type" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" onClick={() => {
                      if (showResult(renameArrangementType(row.name, draftName))) setEditingName(null)
                    }}><Check className="size-4" /></button>
                    <button type="button" aria-label="Cancel arrangement type edit" className={iconButton} onClick={() => setEditingName(null)}><X className="size-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold">{row.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{row.productCount} product{row.productCount === 1 ? '' : 's'}</p>
                    </div>
                    <button type="button" aria-label={`Edit ${row.name}`} className={iconButton} onClick={() => { setEditingName(row.name); setDraftName(row.name) }}><Pencil className="size-4" /></button>
                    <button type="button" aria-label={`Remove ${row.name}`} disabled={row.productCount > 0} className={`${iconButton} text-destructive disabled:cursor-not-allowed disabled:text-muted-foreground/35 disabled:hover:bg-transparent`} onClick={async () => {
                      if (row.productCount > 0) return
                      const confirmed = await requestAppConfirmation({
                        title: `Remove “${row.name}”?`,
                        description: 'This unused arrangement type will also be removed from size-guide assignments.',
                        confirmLabel: 'Remove type',
                        destructive: true,
                      })
                      if (confirmed) showResult(deleteArrangementType(row.name))
                    }}><Trash2 className="size-4" /></button>
                  </div>
                )}
              </article>
            ))}
            {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No arrangement types yet.</p>}
          </div>
        </div>

        <div className="border-t border-border bg-card px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="text-sm font-medium">New arrangement type</label>
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Example: Hand bouquet" className={fieldClass} />
            </div>
            <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground" onClick={() => {
              if (showResult(addArrangementType(newName))) setNewName('')
            }}><Plus className="size-4" />Add type</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
