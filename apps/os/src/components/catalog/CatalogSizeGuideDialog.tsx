import type { FC } from 'react'
import { useMemo, useState } from 'react'
import { Link2, Plus, Ruler, Trash2 } from 'lucide-react'
import { useCatalogStore } from '../../store/catalogStore'
import { getDataUrlByteSize } from '../../domain/catalogImageDomain'
import { toast } from '../../hooks/use-toast'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { ImageDropInput } from './ImageDropInput'

interface CatalogSizeGuideDialogProps {
  open: boolean
  onClose: () => void
}

type AssignmentScope = 'product_type' | 'product'

const selectClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground'
const inputClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20'

export const CatalogSizeGuideDialog: FC<CatalogSizeGuideDialogProps> = ({ open, onClose }) => {
  const products = useCatalogStore((state) => state.products)
  const templates = useCatalogStore((state) => state.sizeGuideTemplates)
  const targets = useCatalogStore((state) => state.sizeGuideTargets)
  const saveTemplate = useCatalogStore((state) => state.saveSizeGuideTemplate)
  const addTemplateSize = useCatalogStore((state) => state.addSizeGuideTemplateSize)
  const deleteTemplate = useCatalogStore((state) => state.deleteSizeGuideTemplate)
  const assignSizeGuide = useCatalogStore((state) => state.assignSizeGuide)
  const removeTarget = useCatalogStore((state) => state.removeSizeGuideTarget)
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState<string>()
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [newSizeName, setNewSizeName] = useState('')
  const [scope, setScope] = useState<AssignmentScope>('product_type')
  const [targetValue, setTargetValue] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const productTypes = useMemo(
    () => [...new Set(products.map((product) => product.productType?.trim()).filter((value): value is string => Boolean(value)))].sort(),
    [products],
  )
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  )
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)

  const resetTemplateForm = () => {
    setName('')
    setImageUrl(undefined)
  }

  const handleSaveTemplate = () => {
    if (!name.trim()) {
      toast({ description: 'Add a template category name.' })
      return
    }
    const id = saveTemplate({
      name,
      imageUrl: imageUrl ?? '',
      byteSize: imageUrl ? getDataUrlByteSize(imageUrl) : 0,
    })
    setSelectedTemplateId(id)
    resetTemplateForm()
    toast({ description: 'Size template category saved. Add its sizes next.' })
  }

  const handleAddSize = () => {
    if (!selectedTemplateId || !newSizeName.trim()) {
      toast({ description: 'Select a template category and enter a size name.' })
      return
    }
    if (!addTemplateSize(selectedTemplateId, newSizeName)) {
      toast({ description: 'That size already exists or could not be added.' })
      return
    }
    setNewSizeName('')
    toast({ description: 'Template size added.' })
  }

  const handleAssign = () => {
    if (!selectedTemplateId || !targetValue) {
      toast({ description: 'Choose a template and assignment target.' })
      return
    }
    if (scope === 'product') {
      assignSizeGuide({ templateId: selectedTemplateId, scope, productId: targetValue })
    } else {
      assignSizeGuide({ templateId: selectedTemplateId, scope, productType: targetValue })
    }
    setTargetValue('')
    toast({ description: 'Size guide assigned.' })
  }

  const confirmDeleteTemplate = () => {
    if (pendingDeleteId) deleteTemplate(pendingDeleteId)
    setPendingDeleteId(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ruler className="size-5" /> Panduan ukuran</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <section className="space-y-4 rounded-xl bg-muted/45 p-4">
              <div>
                <h3 className="text-sm font-semibold">Tambah template category</h3>
                <p className="mt-1 text-xs text-muted-foreground">Contoh: Bouquet Standard. Setelah dibuat, tambahkan sub-size seperti Small, Medium, Large.</p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Template category</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Bouquet Standard" className={inputClass} />
              </label>
              <ImageDropInput value={imageUrl} onChange={setImageUrl} label="Size guide image · Optional" editorTitle="Crop size guide" dropHint="Square 1:1 guide" previewAlt="Size guide preview" />
              <Button type="button" className="w-full" onClick={handleSaveTemplate}>Save template category</Button>
            </section>

            <div className="space-y-5">
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Template categories</h3>
                  <p className="mt-1 text-xs text-muted-foreground">A category owns reusable sizes. Select one to add sizes or assign it.</p>
                </div>
                {templates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No size templates yet.</div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {templates.map((template) => {
                      const selected = selectedTemplateId === template.id
                      const assignmentCount = targets.filter((target) => target.templateId === template.id).length
                      const hasImage = template.byteSize > 0
                      return (
                        <div key={template.id} className={`rounded-xl p-2.5 ring-1 ${selected ? 'bg-primary/5 ring-primary/50' : 'bg-card ring-border'}`}>
                          <button type="button" onClick={() => setSelectedTemplateId(template.id)} className="flex w-full items-start gap-3 text-left">
                            {hasImage ? <img src={template.imageUrl} alt="" className="size-16 rounded-lg object-cover ring-1 ring-border" /> : <span className="inline-flex size-16 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border"><Ruler className="size-6" /></span>}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{template.name}</span>
                              <span className="mt-1 block text-2xs text-muted-foreground">{template.sizes.length} size{template.sizes.length === 1 ? '' : 's'} · {assignmentCount} assignment{assignmentCount === 1 ? '' : 's'}</span>
                              {template.sizes.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{template.sizes.map((size) => <span key={size.id} className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-foreground">{size.name}</span>)}</span>}
                            </span>
                          </button>
                          <button type="button" onClick={() => setPendingDeleteId(template.id)} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /> Delete</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {selectedTemplate && (
                <section className="space-y-3 rounded-xl border border-border p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Sizes · {selectedTemplate.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">These become the dropdown options for Nama ukuran in Catalog.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.sizes.length > 0 ? selectedTemplate.sizes.map((size) => <span key={size.id} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{size.name}</span>) : <span className="text-xs text-muted-foreground">No sizes yet.</span>}
                  </div>
                  <div className="flex gap-2">
                    <input value={newSizeName} onChange={(event) => setNewSizeName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddSize() } }} placeholder="e.g. XL" className={inputClass} />
                    <Button type="button" variant="secondary" onClick={handleAddSize} className="shrink-0"><Plus className="mr-1.5 size-4" /> Add size</Button>
                  </div>
                </section>
              )}

              <section className="space-y-3 rounded-xl border border-border p-4">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" /> Assign template</h3>
                  <p className="mt-1 text-xs text-muted-foreground">A product assignment overrides its arrangement type guide.</p>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">Template category</span>
                  <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className={selectClass}>
                    <option value="">Select template</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">Apply to</span>
                    <select value={scope} onChange={(event) => { setScope(event.target.value as AssignmentScope); setTargetValue('') }} className={selectClass}>
                      <option value="product_type">Arrangement type</option>
                      <option value="product">Specific product</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">{scope === 'product' ? 'Product' : 'Arrangement type'}</span>
                    <select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className={selectClass}>
                      <option value="">Select {scope === 'product' ? 'product' : 'type'}</option>
                      {scope === 'product' ? sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>) : productTypes.map((productType) => <option key={productType} value={productType}>{productType}</option>)}
                    </select>
                  </label>
                </div>
                <Button type="button" variant="secondary" onClick={handleAssign}>Assign size guide</Button>
              </section>

              {targets.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Current assignments</h3>
                  {targets.map((target) => {
                    const template = templates.find((item) => item.id === target.templateId)
                    const product = target.scope === 'product' ? products.find((item) => item.id === target.productId) : undefined
                    const targetLabel = target.scope === 'product' ? product?.name ?? 'Deleted product' : target.productType
                    return (
                      <div key={target.id} className="flex items-center gap-3 rounded-xl bg-muted/45 px-3 py-2.5">
                        <span className="min-w-0 flex-1 text-xs"><span className="font-semibold">{template?.name ?? 'Missing template'}</span><span className="text-muted-foreground"> → {target.scope === 'product' ? 'Product' : 'Arrangement'}: {targetLabel}</span></span>
                        <button type="button" onClick={() => removeTarget(target.id)} aria-label={`Remove assignment for ${targetLabel}`} className="inline-flex size-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
                      </div>
                    )
                  })}
                </section>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog open={pendingDeleteId !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDeleteId(null) }} title="Delete size guide template?" description="The template category and all of its product or arrangement assignments will be removed." confirmLabel="Delete template" destructive onConfirm={confirmDeleteTemplate} />
    </>
  )
}

export default CatalogSizeGuideDialog
