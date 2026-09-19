import type { FC } from 'react'
import { useMemo, useState } from 'react'
import { Archive, Image as ImageIcon, Link2, Plus, Ruler, Trash2 } from 'lucide-react'
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
type ViewTab = 'templates' | 'assignments'

const selectClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground'
const inputClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20'

export const CatalogSizeGuideDialog: FC<CatalogSizeGuideDialogProps> = ({ open, onClose }) => {
  const products = useCatalogStore((state) => state.products)
  const templates = useCatalogStore((state) => state.sizeGuideTemplates)
  const targets = useCatalogStore((state) => state.sizeGuideTargets)
  const saveTemplate = useCatalogStore((state) => state.saveSizeGuideTemplate)
  const addTemplateSize = useCatalogStore((state) => state.addSizeGuideTemplateSize)
  const updateTemplateSize = useCatalogStore((state) => state.updateSizeGuideTemplateSize)
  const archiveTemplateSize = useCatalogStore((state) => state.archiveSizeGuideTemplateSize)
  const deleteTemplate = useCatalogStore((state) => state.deleteSizeGuideTemplate)
  const assignSizeGuide = useCatalogStore((state) => state.assignSizeGuide)
  const removeTarget = useCatalogStore((state) => state.removeSizeGuideTarget)

  const [tab, setTab] = useState<ViewTab>('templates')
  const [name, setName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [newSizeName, setNewSizeName] = useState('')
  const [scope, setScope] = useState<AssignmentScope>('product_type')
  const [targetValue, setTargetValue] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const productTypes = useMemo(
    () => [...new Set(products.map((product) => product.productType?.trim()).filter((value): value is string => Boolean(value)))].sort(),
    [products],
  )
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products])
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0]
  const activeTemplateId = selectedTemplate?.id ?? ''

  const sizeUsageCount = (sizeId: string): number => products.reduce(
    (count, product) => count + product.variants.filter((variant) => variant.sizeOptionId === sizeId).length,
    0,
  )
  const activeSizeUsageCount = (sizeId: string): number => products.reduce(
    (count, product) => count + product.variants.filter((variant) => variant.sizeOptionId === sizeId && variant.status === 'active').length,
    0,
  )

  const handleSaveTemplate = () => {
    if (!name.trim()) return void toast({ description: 'Masukkan nama template ukuran.' })
    const id = saveTemplate({ name })
    setSelectedTemplateId(id)
    setName('')
    toast({ description: 'Template dibuat. Tambahkan ukuran dan panduan gambarnya.' })
  }

  const handleAddSize = () => {
    if (!activeTemplateId || !newSizeName.trim()) return void toast({ description: 'Pilih template dan masukkan nama ukuran.' })
    if (!addTemplateSize(activeTemplateId, newSizeName)) return void toast({ description: 'Ukuran tersebut sudah ada atau tidak dapat ditambahkan.' })
    setNewSizeName('')
    toast({ description: 'Ukuran ditambahkan. Sekarang tambahkan gambar panduannya.' })
  }

  const handleGuideImage = (sizeId: string, imageUrl?: string) => {
    const ok = updateTemplateSize(activeTemplateId, sizeId, imageUrl ? {
      guideImageUrl: imageUrl,
      guideByteSize: getDataUrlByteSize(imageUrl),
      guideWidth: 800,
      guideHeight: 800,
    } : {
      guideImageUrl: undefined,
      guideStoragePath: undefined,
      guideByteSize: undefined,
      guideWidth: undefined,
      guideHeight: undefined,
    })
    if (!ok) toast({ description: 'Panduan ukuran tidak dapat diperbarui.' })
  }

  const handleAssign = () => {
    if (!activeTemplateId || !targetValue) return void toast({ description: 'Pilih template dan target penetapan.' })
    if (scope === 'product') assignSizeGuide({ templateId: activeTemplateId, scope, productId: targetValue })
    else assignSizeGuide({ templateId: activeTemplateId, scope, productType: targetValue })
    setTargetValue('')
    toast({ description: 'Template ukuran ditetapkan.' })
  }

  const templateDeleteBlocked = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return true
    const ids = new Set(template.sizes.map((size) => size.id))
    return targets.some((target) => target.templateId === templateId)
      || products.some((product) => product.variants.some((variant) => variant.sizeOptionId && ids.has(variant.sizeOptionId)))
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ruler className="size-5" /> Panduan ukuran</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 rounded-xl bg-muted p-1">
            <button type="button" onClick={() => setTab('templates')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'templates' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Template ukuran</button>
            <button type="button" onClick={() => setTab('assignments')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'assignments' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Penetapan</button>
          </div>

          {tab === 'templates' ? (
            <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="space-y-4 rounded-xl bg-muted/45 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Buat template</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Template hanya menyimpan kelompok ukuran. Gambar panduan ditambahkan pada setiap ukuran.</p>
                </div>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Bouquet Standard" className={inputClass} />
                <Button type="button" className="w-full" onClick={handleSaveTemplate}>Buat template</Button>

                <div className="space-y-2 border-t border-border/70 pt-4">
                  {templates.map((template) => {
                    const selected = activeTemplateId === template.id
                    const configured = template.sizes.filter((size) => Boolean(size.guideImageUrl)).length
                    return (
                      <button key={template.id} type="button" onClick={() => setSelectedTemplateId(template.id)} className={`w-full rounded-xl p-3 text-left ring-1 ${selected ? 'bg-primary/5 ring-primary/50' : 'bg-card ring-border'}`}>
                        <span className="block truncate text-sm font-semibold">{template.name}</span>
                        <span className="mt-1 block text-2xs text-muted-foreground">{template.sizes.length} ukuran · {configured} panduan siap</span>
                      </button>
                    )
                  })}
                  {templates.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Belum ada template ukuran.</p>}
                </div>
              </aside>

              <section className="space-y-4">
                {selectedTemplate ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">{selectedTemplate.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Setiap ukuran memiliki gambar panduan sendiri dan dapat dipakai ulang oleh banyak produk.</p>
                      </div>
                      <button type="button" disabled={templateDeleteBlocked(selectedTemplate.id)} onClick={() => setPendingDeleteId(selectedTemplate.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40" title={templateDeleteBlocked(selectedTemplate.id) ? 'Template sedang dipakai dan tidak dapat dihapus.' : undefined}><Trash2 className="size-3.5" /> Hapus</button>
                    </div>

                    <div className="space-y-3">
                      {[...selectedTemplate.sizes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((size) => {
                        const usage = sizeUsageCount(size.id)
                        const activeUsage = activeSizeUsageCount(size.id)
                        const active = size.isActive !== false
                        return (
                          <div key={size.id} className={`grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_360px] ${active ? '' : 'opacity-60'}`}>
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <input value={size.name} onChange={(event) => updateTemplateSize(selectedTemplate.id, size.id, { name: event.target.value })} className={`${inputClass} max-w-[220px]`} aria-label="Nama ukuran" />
                                <span className="rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">{usage} varian · {activeUsage} dijual</span>
                                {!active && <span className="rounded-full bg-muted px-2 py-1 text-2xs font-semibold">Diarsipkan</span>}
                              </div>
                              <p className="text-xs text-muted-foreground">Panduan ini diwarisi semua product variant yang memakai {size.name}.</p>
                              {active ? (
                                <button type="button" disabled={activeUsage > 0} onClick={() => {
                                  if (!archiveTemplateSize(selectedTemplate.id, size.id)) toast({ description: 'Ukuran yang sedang dipakai varian aktif tidak dapat diarsipkan.' })
                                }} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><Archive className="size-3.5" /> Arsipkan</button>
                              ) : (
                                <button type="button" onClick={() => updateTemplateSize(selectedTemplate.id, size.id, { isActive: true })} className="inline-flex h-9 items-center rounded-full px-3 text-xs font-medium text-primary hover:bg-primary/10">Aktifkan lagi</button>
                              )}
                            </div>
                            <div>
                              <ImageDropInput value={size.guideImageUrl} onChange={(value) => handleGuideImage(size.id, value)} label={`Panduan ${size.name}`} editorTitle={`Potong panduan ${size.name}`} dropHint="JPEG 1:1 · maks 100 KB" previewAlt={`Panduan ukuran ${size.name}`} />
                            </div>
                          </div>
                        )
                      })}
                      {selectedTemplate.sizes.length === 0 && <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-2 size-5" />Belum ada ukuran pada template ini.</div>}
                    </div>

                    <div className="flex gap-2 rounded-xl bg-muted/45 p-3">
                      <input value={newSizeName} onChange={(event) => setNewSizeName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddSize() } }} placeholder="Contoh: XL" className={inputClass} />
                      <Button type="button" variant="secondary" onClick={handleAddSize} className="shrink-0"><Plus className="mr-1.5 size-4" /> Tambah ukuran</Button>
                    </div>
                  </>
                ) : <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Buat atau pilih template ukuran.</div>}
              </section>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-4 rounded-xl border border-border p-4">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" /> Tetapkan template</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Gunakan jenis rangkaian sebagai default. Penetapan khusus produk akan menimpa default tersebut.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block space-y-1.5"><span className="text-xs font-medium">Template ukuran</span><select value={activeTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className={selectClass}><option value="">Pilih template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                  <label className="block space-y-1.5"><span className="text-xs font-medium">Terapkan ke</span><select value={scope} onChange={(event) => { setScope(event.target.value as AssignmentScope); setTargetValue('') }} className={selectClass}><option value="product_type">Jenis rangkaian</option><option value="product">Produk tertentu</option></select></label>
                  <label className="block space-y-1.5"><span className="text-xs font-medium">{scope === 'product' ? 'Produk' : 'Jenis rangkaian'}</span><select value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className={selectClass}><option value="">Pilih</option>{scope === 'product' ? sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>) : productTypes.map((productType) => <option key={productType} value={productType}>{productType}</option>)}</select></label>
                </div>
                <Button type="button" variant="secondary" onClick={handleAssign}>Tetapkan template</Button>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Penetapan saat ini</h3>
                {targets.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Belum ada penetapan.</div>}
                {targets.map((target) => {
                  const template = templates.find((item) => item.id === target.templateId)
                  const product = target.scope === 'product' ? products.find((item) => item.id === target.productId) : undefined
                  const targetLabel = target.scope === 'product' ? product?.name ?? 'Produk dihapus' : target.productType
                  return <div key={target.id} className="flex items-center gap-3 rounded-xl bg-muted/45 px-3 py-2.5"><span className="min-w-0 flex-1 text-xs"><span className="font-semibold">{template?.name ?? 'Template hilang'}</span><span className="text-muted-foreground"> → {target.scope === 'product' ? 'Produk' : 'Jenis rangkaian'}: {targetLabel}</span></span><button type="button" onClick={() => removeTarget(target.id)} className="inline-flex size-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button></div>
                })}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={pendingDeleteId !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDeleteId(null) }}
        title="Hapus template ukuran?"
        description="Template hanya dapat dihapus bila tidak lagi dipakai oleh penetapan atau product variant."
        confirmLabel="Hapus template"
        destructive
        onConfirm={() => { if (pendingDeleteId) deleteTemplate(pendingDeleteId); setPendingDeleteId(null) }}
      />
    </>
  )
}

export default CatalogSizeGuideDialog
