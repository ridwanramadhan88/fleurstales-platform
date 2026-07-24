import type { FC } from 'react'
import { useMemo, useState } from 'react'
import { Link2, Ruler, Trash2 } from 'lucide-react'
import { useCatalogStore } from '../../store/catalogStore'
import { getDataUrlByteSize } from '../../domain/catalogImageDomain'
import { toast } from '../../hooks/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { ImageDropInput } from './ImageDropInput'
import { requestAppConfirmation } from '../ui/app-confirm'

interface CatalogSizeGuideDialogProps {
  open: boolean
  onClose: () => void
}

type AssignmentScope = 'product_type' | 'product'

const selectClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground'

export const CatalogSizeGuideDialog: FC<CatalogSizeGuideDialogProps> = ({ open, onClose }) => {
  const products = useCatalogStore((state) => state.products)
  const templates = useCatalogStore((state) => state.sizeGuideTemplates)
  const targets = useCatalogStore((state) => state.sizeGuideTargets)
  const saveTemplate = useCatalogStore((state) => state.saveSizeGuideTemplate)
  const deleteTemplate = useCatalogStore((state) => state.deleteSizeGuideTemplate)
  const assignSizeGuide = useCatalogStore((state) => state.assignSizeGuide)
  const removeTarget = useCatalogStore((state) => state.removeSizeGuideTarget)
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState<string>()
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [scope, setScope] = useState<AssignmentScope>('product_type')
  const [targetValue, setTargetValue] = useState('')

  const productTypes = useMemo(
    () => [...new Set(products.map((product) => product.productType?.trim()).filter((value): value is string => Boolean(value)))].sort(),
    [products],
  )
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  )

  const resetTemplateForm = () => {
    setName('')
    setImageUrl(undefined)
  }

  const handleSaveTemplate = () => {
    if (!name.trim() || !imageUrl) {
      toast({ description: 'Add a template name and size-guide image.' })
      return
    }
    const id = saveTemplate({
      name,
      imageUrl,
      byteSize: getDataUrlByteSize(imageUrl),
    })
    setSelectedTemplateId(id)
    resetTemplateForm()
    toast({ description: 'Size guide template saved.' })
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

  const handleDeleteTemplate = async (templateId: string) => {
    const confirmed = await requestAppConfirmation({
      title: 'Delete size guide template?',
      description: 'The template and all of its product or arrangement assignments will be removed.',
      confirmLabel: 'Delete template',
      destructive: true,
    })
    if (confirmed) deleteTemplate(templateId)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="size-5" />
            Size guides
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-4 rounded-xl bg-muted/45 p-4">
            <div>
              <h3 className="text-sm font-semibold">New template</h3>
              <p className="mt-1 text-xs text-muted-foreground">Reusable square guide for product dimensions and scale.</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">Template name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Standard bouquet sizes"
                className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm"
              />
            </label>
            <ImageDropInput
              value={imageUrl}
              onChange={setImageUrl}
              label="Size guide image"
              editorTitle="Crop size guide"
              dropHint="Square 1:1 guide"
              previewAlt="Size guide preview"
            />
            <Button type="button" className="w-full" onClick={handleSaveTemplate}>
              Save template
            </Button>
          </section>

          <div className="space-y-5">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Saved templates</h3>
                <p className="mt-1 text-xs text-muted-foreground">Select a template to assign it below.</p>
              </div>
              {templates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  No size guide templates yet.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {templates.map((template) => {
                    const selected = selectedTemplateId === template.id
                    const assignmentCount = targets.filter((target) => target.templateId === template.id).length
                    return (
                      <div
                        key={template.id}
                        className={`rounded-xl p-2.5 ring-1 ${selected ? 'bg-primary/5 ring-primary/50' : 'bg-card ring-border'}`}
                      >
                        <button type="button" onClick={() => setSelectedTemplateId(template.id)} className="flex w-full items-center gap-3 text-left">
                          <img src={template.imageUrl} alt="" className="size-16 rounded-lg object-cover ring-1 ring-border" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{template.name}</span>
                            <span className="mt-1 block text-2xs text-muted-foreground">
                              {Math.ceil(template.byteSize / 1024)} KB · {assignmentCount} assignment{assignmentCount === 1 ? '' : 's'}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTemplate(template.id)}
                          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-border p-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" /> Assign template</h3>
                <p className="mt-1 text-xs text-muted-foreground">A product assignment overrides its arrangement type guide.</p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Template</span>
                <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className={selectClass}>
                  <option value="">Select template</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">Apply to</span>
                  <select
                    value={scope}
                    onChange={(event) => { setScope(event.target.value as AssignmentScope); setTargetValue('') }}
                    className={selectClass}
                  >
                    <option value="product_type">Arrangement type</option>
                    <option value="product">Specific product</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">{scope === 'product' ? 'Product' : 'Arrangement type'}</span>
                  <select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className={selectClass}>
                    <option value="">Select {scope === 'product' ? 'product' : 'type'}</option>
                    {scope === 'product'
                      ? sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)
                      : productTypes.map((productType) => <option key={productType} value={productType}>{productType}</option>)}
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
                      <span className="min-w-0 flex-1 text-xs">
                        <span className="font-semibold">{template?.name ?? 'Missing template'}</span>
                        <span className="text-muted-foreground"> → {target.scope === 'product' ? 'Product' : 'Arrangement'}: {targetLabel}</span>
                      </span>
                      <button type="button" onClick={() => removeTarget(target.id)} aria-label={`Remove assignment for ${targetLabel}`} className="inline-flex size-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )
                })}
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CatalogSizeGuideDialog
