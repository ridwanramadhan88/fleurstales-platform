import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Archive, Image as ImageIcon, Plus, Ruler, Trash2 } from 'lucide-react'
import { useCatalogStore } from '../../store/catalogStore'
import type { CatalogSizeGuideSize, CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from '../../store/catalogStoreTypes'
import { generateId } from '../../lib/id'
import { getDataUrlByteSize } from '../../domain/catalogImageDomain'
import { flushBusinessOsSizeGuideSync, getCatalogBridgeStatus } from '../../data/shared/catalogBridge'
import { toast } from '../../hooks/use-toast'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { ImageDropInput } from './ImageDropInput'

interface CatalogSizeGuideDialogProps {
  open: boolean
  onClose: () => void
}

type ViewTab = 'templates' | 'assignments'

const selectClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground'
const inputClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const fingerprint = (templates: CatalogSizeGuideTemplate[], targets: CatalogSizeGuideTarget[]) =>
  JSON.stringify({ templates, targets })

export const CatalogSizeGuideDialog: FC<CatalogSizeGuideDialogProps> = ({ open, onClose }) => {
  const products = useCatalogStore((state) => state.products)
  const sourceTemplates = useCatalogStore((state) => state.sizeGuideTemplates)
  const sourceTargets = useCatalogStore((state) => state.sizeGuideTargets)
  const arrangementTypes = useCatalogStore((state) => state.arrangementTypes)
  const applyDraft = useCatalogStore((state) => state.applySizeGuideLibraryDraft)

  const [tab, setTab] = useState<ViewTab>('templates')
  const [draftTemplates, setDraftTemplates] = useState<CatalogSizeGuideTemplate[]>([])
  const [draftTargets, setDraftTargets] = useState<CatalogSizeGuideTarget[]>([])
  const [baselineFingerprint, setBaselineFingerprint] = useState('')
  const [sourceAtOpen, setSourceAtOpen] = useState('')
  const [initializedOpen, setInitializedOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newSizeName, setNewSizeName] = useState('')
  const [overrideProductId, setOverrideProductId] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const sourceFingerprint = useMemo(
    () => fingerprint(sourceTemplates, sourceTargets),
    [sourceTargets, sourceTemplates],
  )

  useEffect(() => {
    if (open && !initializedOpen) {
      const templates = structuredClone(sourceTemplates)
      const targets = structuredClone(sourceTargets)
      const currentFingerprint = fingerprint(templates, targets)
      setDraftTemplates(templates)
      setDraftTargets(targets)
      setBaselineFingerprint(currentFingerprint)
      setSourceAtOpen(sourceFingerprint)
      setSelectedTemplateId((current) => templates.some((template) => template.id === current)
        ? current
        : templates[0]?.id ?? '')
      setNewTemplateName('')
      setNewSizeName('')
      setOverrideProductId('')
      setPendingDeleteId(null)
      setConfirmClose(false)
      setIsSaving(false)
      setTab('templates')
      setInitializedOpen(true)
    } else if (!open && initializedOpen) {
      setInitializedOpen(false)
    }
  }, [initializedOpen, open, sourceFingerprint, sourceTargets, sourceTemplates])

  const draftFingerprint = useMemo(
    () => fingerprint(draftTemplates, draftTargets),
    [draftTargets, draftTemplates],
  )
  const isDirty = initializedOpen && draftFingerprint !== baselineFingerprint
  const sourceChanged = initializedOpen && sourceAtOpen !== sourceFingerprint

  useEffect(() => {
    if (!open || !isDirty || typeof window === 'undefined') return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, open])

  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products])
  const selectedTemplate = draftTemplates.find((template) => template.id === selectedTemplateId) ?? draftTemplates[0]
  const activeTemplateId = selectedTemplate?.id ?? ''

  const sizeUsageCount = (sizeId: string): number => products.reduce(
    (count, product) => count + product.variants.filter((variant) => variant.sizeOptionId === sizeId).length,
    0,
  )
  const activeSizeUsageCount = (sizeId: string): number => products.reduce(
    (count, product) => count + product.variants.filter((variant) => variant.sizeOptionId === sizeId && variant.status === 'active').length,
    0,
  )

  const updateTemplate = (templateId: string, patch: Partial<CatalogSizeGuideTemplate>) => {
    setDraftTemplates((current) => current.map((template) => template.id === templateId
      ? { ...template, ...patch, updatedAt: new Date().toISOString() }
      : template))
  }

  const updateSize = (templateId: string, sizeId: string, patch: Partial<CatalogSizeGuideSize>) => {
    setDraftTemplates((current) => current.map((template) => template.id === templateId
      ? {
          ...template,
          sizes: template.sizes.map((size) => size.id === sizeId ? { ...size, ...patch } : size),
          updatedAt: new Date().toISOString(),
        }
      : template))
  }

  const handleCreateTemplate = () => {
    const cleanName = newTemplateName.trim()
    if (!cleanName) return void toast({ description: 'Masukkan nama template ukuran.' })
    if (draftTemplates.some((template) => template.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      return void toast({ description: 'Nama template ukuran sudah digunakan.' })
    }
    const now = new Date().toISOString()
    const template: CatalogSizeGuideTemplate = {
      id: generateId('guide'),
      name: cleanName,
      sizes: [],
      imageUrl: '',
      byteSize: 0,
      width: 800,
      height: 800,
      createdAt: now,
      updatedAt: now,
    }
    setDraftTemplates((current) => [...current, template])
    setSelectedTemplateId(template.id)
    setNewTemplateName('')
  }

  const handleAddSize = () => {
    if (!selectedTemplate || !newSizeName.trim()) return void toast({ description: 'Pilih template dan masukkan nama ukuran.' })
    const cleanName = newSizeName.trim()
    if (selectedTemplate.sizes.some((size) => size.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      return void toast({ description: 'Ukuran tersebut sudah ada pada template ini.' })
    }
    updateTemplate(selectedTemplate.id, {
      sizes: [
        ...selectedTemplate.sizes,
        { id: generateId('guide_size'), name: cleanName, sortOrder: selectedTemplate.sizes.length, isActive: true },
      ],
    })
    setNewSizeName('')
  }

  const handleGuideImage = (templateId: string, sizeId: string, imageUrl?: string) => {
    updateSize(templateId, sizeId, imageUrl ? {
      guideImageUrl: imageUrl,
      guideStoragePath: undefined,
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
  }

  const templateDeleteBlocked = (templateId: string) => {
    const template = draftTemplates.find((item) => item.id === templateId)
    if (!template) return true
    const ids = new Set(template.sizes.map((size) => size.id))
    return draftTargets.some((target) => target.templateId === templateId)
      || products.some((product) => product.variants.some((variant) => variant.sizeOptionId && ids.has(variant.sizeOptionId)))
  }

  const deleteTemplateDraft = (templateId: string) => {
    if (templateDeleteBlocked(templateId)) return
    const nextTemplates = draftTemplates.filter((template) => template.id !== templateId)
    setDraftTemplates(nextTemplates)
    setSelectedTemplateId(nextTemplates[0]?.id ?? '')
  }

  const setArrangementDefault = (productType: string, templateId: string) => {
    setDraftTargets((current) => {
      const withoutCurrent = current.filter((target) => !(target.scope === 'product_type' && target.productType === productType))
      if (!templateId) return withoutCurrent
      return [...withoutCurrent, {
        id: generateId('guide_target'),
        templateId,
        scope: 'product_type' as const,
        productType,
      }]
    })
  }

  const setProductOverride = (productId: string, templateId: string) => {
    setDraftTargets((current) => {
      const withoutCurrent = current.filter((target) => !(target.scope === 'product' && target.productId === productId))
      if (!templateId) return withoutCurrent
      return [...withoutCurrent, {
        id: generateId('guide_target'),
        templateId,
        scope: 'product' as const,
        productId,
      }]
    })
  }

  const selectedProduct = products.find((product) => product.id === overrideProductId)
  const selectedProductOverride = selectedProduct
    ? draftTargets.find((target) => target.scope === 'product' && target.productId === selectedProduct.id)
    : undefined
  const selectedProductDefault = selectedProduct?.productType
    ? draftTargets.find((target) => target.scope === 'product_type' && target.productType === selectedProduct.productType)
    : undefined
  const selectedEffectiveTemplateId = selectedProductOverride?.templateId ?? selectedProductDefault?.templateId
  const selectedEffectiveTemplate = draftTemplates.find((template) => template.id === selectedEffectiveTemplateId)
  const productOverrides = draftTargets.filter((target): target is Extract<CatalogSizeGuideTarget, { scope: 'product' }> => target.scope === 'product')

  const validateDraft = (): string | undefined => {
    if (draftTemplates.some((template) => !template.name.trim())) return 'Nama template ukuran tidak boleh kosong.'
    const templateNames = draftTemplates.map((template) => template.name.trim().toLowerCase())
    if (new Set(templateNames).size !== templateNames.length) return 'Nama template ukuran harus unik.'
    for (const template of draftTemplates) {
      const sizeNames = template.sizes.map((size) => size.name.trim().toLowerCase())
      if (sizeNames.some((name) => !name)) return 'Nama ukuran tidak boleh kosong.'
      if (new Set(sizeNames).size !== sizeNames.length) return 'Nama ukuran dalam satu template harus unik.'
      const duplicateIds = template.sizes.map((size) => size.id)
      if (new Set(duplicateIds).size !== duplicateIds.length) return 'ID ukuran dalam satu template harus unik.'
      const blockedArchived = template.sizes.some((size) => size.isActive === false && activeSizeUsageCount(size.id) > 0)
      if (blockedArchived) return 'Ukuran yang masih dipakai varian aktif tidak dapat diarsipkan.'
    }
    const templateIds = new Set(draftTemplates.map((template) => template.id))
    if (draftTargets.some((target) => !templateIds.has(target.templateId))) return 'Ada penetapan yang mengarah ke template yang sudah tidak tersedia.'
    return undefined
  }

  const handleSave = async () => {
    if (!isDirty || isSaving) return
    if (sourceChanged) {
      toast({ description: 'Data Template ukuran berubah di sesi lain. Tutup dan buka ulang sebelum menyimpan.' })
      return
    }
    const validationError = validateDraft()
    if (validationError) return void toast({ description: validationError })

    const input = {
      sizeGuideTemplates: structuredClone(draftTemplates),
      sizeGuideTargets: structuredClone(draftTargets),
    }

    setIsSaving(true)
    try {
      if (!getCatalogBridgeStatus().remoteConfigured) {
        if (!applyDraft({ templates: input.sizeGuideTemplates, targets: input.sizeGuideTargets })) {
          toast({ description: 'Template ukuran tidak dapat disimpan.' })
          return
        }
      } else {
        const saved = await flushBusinessOsSizeGuideSync(input)
        if (!saved) {
          toast({ description: getCatalogBridgeStatus().message ?? 'Template ukuran belum tersimpan ke server.' })
          return
        }
      }
      toast({ description: 'Template ukuran tersimpan.' })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (isSaving) return
    if (isDirty) setConfirmClose(true)
    else onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose() }}>
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(860px,calc(100dvh-2rem))] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-6xl sm:rounded-2xl sm:border">
          <DialogHeader className="shrink-0 border-b border-border/70 px-5 pb-4 pt-5 sm:px-6">
            <DialogTitle className="flex items-center gap-2">
              <Ruler className="size-5" />
              Template ukuran
              {isDirty ? <span className="rounded-full bg-warning/10 px-2 py-1 text-2xs font-semibold text-warning">Belum disimpan</span> : null}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Kelola ukuran yang dapat dipakai ulang, gambar panduan, default Jenis rangkaian, dan template khusus produk.
            </p>
          </DialogHeader>

          <div className="shrink-0 border-b border-border/70 bg-surface-card px-4 py-2 sm:px-6">
            <div className="flex gap-2 rounded-xl bg-muted p-1">
              <button type="button" onClick={() => setTab('templates')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'templates' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Template & ukuran</button>
              <button type="button" onClick={() => setTab('assignments')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'assignments' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Penetapan</button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {sourceChanged ? (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-semibold">Data berubah di sesi lain</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Draft ini tidak ditimpa otomatis. Tutup dan buka ulang pengelola Template ukuran sebelum menyimpan.</p>
                </div>
              </div>
            ) : null}

            {tab === 'templates' ? (
              <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="space-y-4 rounded-2xl bg-muted/45 p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Buat template</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Template adalah kelompok ukuran yang dapat dipakai ulang oleh banyak produk.</p>
                  </div>
                  <input value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="Contoh: Bouquet Standard" className={inputClass} />
                  <Button type="button" className="w-full" onClick={handleCreateTemplate}>Buat template</Button>

                  <div className="space-y-2 border-t border-border/70 pt-4">
                    {draftTemplates.map((template) => {
                      const selected = activeTemplateId === template.id
                      const configured = template.sizes.filter((size) => Boolean(size.guideImageUrl)).length
                      return (
                        <button key={template.id} type="button" onClick={() => setSelectedTemplateId(template.id)} className={`w-full rounded-xl p-3 text-left ring-1 ${selected ? 'bg-primary/5 ring-primary/50' : 'bg-card ring-border'}`}>
                          <span className="block truncate text-sm font-semibold">{template.name || 'Template tanpa nama'}</span>
                          <span className="mt-1 block text-2xs text-muted-foreground">{template.sizes.length} ukuran · {configured} panduan siap</span>
                        </button>
                      )
                    })}
                    {draftTemplates.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Belum ada template ukuran.</p> : null}
                  </div>
                </aside>

                <section className="space-y-4">
                  {selectedTemplate ? (
                    <>
                      <div className="flex flex-col gap-3 rounded-2xl border border-border/75 bg-card p-4 sm:flex-row sm:items-end">
                        <label className="min-w-0 flex-1 space-y-1.5">
                          <span className="text-sm font-medium">Nama template</span>
                          <input value={selectedTemplate.name} onChange={(event) => updateTemplate(selectedTemplate.id, { name: event.target.value })} className={inputClass} />
                        </label>
                        <button type="button" disabled={templateDeleteBlocked(selectedTemplate.id)} onClick={() => setPendingDeleteId(selectedTemplate.id)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40" title={templateDeleteBlocked(selectedTemplate.id) ? 'Template sedang ditetapkan atau masih direferensikan varian.' : undefined}><Trash2 className="size-4" /> Hapus template</button>
                      </div>

                      <div className="space-y-3">
                        {[...selectedTemplate.sizes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((size) => {
                          const usage = sizeUsageCount(size.id)
                          const activeUsage = activeSizeUsageCount(size.id)
                          const active = size.isActive !== false
                          return (
                            <div key={size.id} className={`grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_360px] ${active ? '' : 'opacity-65'}`}>
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <input value={size.name} onChange={(event) => updateSize(selectedTemplate.id, size.id, { name: event.target.value })} className={`${inputClass} max-w-[240px]`} aria-label="Nama ukuran" />
                                  <span className="rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">{usage} varian tertaut · {activeUsage} dijual</span>
                                  {!active ? <span className="rounded-full bg-muted px-2 py-1 text-2xs font-semibold">Diarsipkan</span> : null}
                                </div>
                                <p className="text-xs leading-5 text-muted-foreground">ID ukuran stabil: <span className="font-mono">{size.id}</span>. Mengubah nama tidak mengubah identitas varian yang sudah tertaut.</p>
                                {active ? (
                                  <button type="button" disabled={activeUsage > 0} onClick={() => {
                                    if (activeUsage > 0) return
                                    updateSize(selectedTemplate.id, size.id, { isActive: false })
                                  }} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><Archive className="size-3.5" /> Arsipkan ukuran</button>
                                ) : (
                                  <button type="button" onClick={() => updateSize(selectedTemplate.id, size.id, { isActive: true })} className="inline-flex h-9 items-center rounded-full px-3 text-xs font-medium text-primary hover:bg-primary/10">Aktifkan lagi</button>
                                )}
                              </div>
                              <ImageDropInput value={size.guideImageUrl} onChange={(value) => handleGuideImage(selectedTemplate.id, size.id, value)} label={`Panduan ${size.name}`} editorTitle={`Potong panduan ${size.name}`} dropHint="JPEG 1:1 · maksimal 100 KB" previewAlt={`Panduan ukuran ${size.name}`} />
                            </div>
                          )
                        })}
                        {selectedTemplate.sizes.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-2 size-5" />Belum ada ukuran pada template ini.</div>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2 rounded-2xl bg-muted/45 p-3 sm:flex-row">
                        <input value={newSizeName} onChange={(event) => setNewSizeName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddSize() } }} placeholder="Contoh: XL" className={inputClass} />
                        <Button type="button" variant="secondary" onClick={handleAddSize} className="shrink-0"><Plus className="mr-1.5 size-4" /> Tambah ukuran</Button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Buat atau pilih template ukuran.</div>
                  )}
                </section>
              </div>
            ) : (
              <div className="space-y-6">
                <section className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold">Default Jenis rangkaian</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Setiap Jenis rangkaian dapat memiliki satu template default. Ini berlaku untuk produk yang tidak memiliki override sendiri.</p>
                  </div>

                  {arrangementTypes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Belum ada Jenis rangkaian. Tambahkan dari pengelola Jenis rangkaian.</div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {arrangementTypes.map((productType) => {
                        const target = draftTargets.find((item) => item.scope === 'product_type' && item.productType === productType)
                        const productCount = products.filter((product) => product.productType === productType).length
                        return (
                          <article key={productType} className="rounded-2xl border border-border/75 bg-card p-4">
                            <div className="mb-3">
                              <p className="font-semibold">{productType}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{productCount} produk</p>
                            </div>
                            <label className="space-y-1.5">
                              <span className="text-xs font-medium">Template default</span>
                              <select value={target?.templateId ?? ''} onChange={(event) => setArrangementDefault(productType, event.target.value)} className={selectClass}>
                                <option value="">Belum ditetapkan</option>
                                {draftTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                              </select>
                            </label>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-4 border-t border-border/70 pt-5">
                  <div>
                    <h3 className="text-base font-semibold">Template khusus produk</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Gunakan hanya untuk produk yang membutuhkan struktur ukuran berbeda dari default Jenis rangkaiannya.</p>
                  </div>

                  <div className="grid gap-4 rounded-2xl bg-muted/45 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium">Produk</span>
                      <select value={overrideProductId} onChange={(event) => setOverrideProductId(event.target.value)} className={selectClass}>
                        <option value="">Pilih produk</option>
                        {sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.productId}</option>)}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-medium">Template khusus</span>
                      <select
                        value={selectedProductOverride?.templateId ?? ''}
                        disabled={!selectedProduct}
                        onChange={(event) => { if (selectedProduct) setProductOverride(selectedProduct.id, event.target.value) }}
                        className={selectClass}
                      >
                        <option value="">Gunakan default Jenis rangkaian</option>
                        {draftTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                    </label>

                    {selectedProduct ? (
                      <div className="rounded-xl border border-border bg-card p-3 lg:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground">Template efektif</p>
                        <p className="mt-1 text-sm font-semibold">{selectedEffectiveTemplate?.name ?? 'Belum ada template ukuran'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedProductOverride
                            ? 'Menggunakan template khusus untuk produk ini.'
                            : selectedProductDefault
                              ? 'Mengikuti default Jenis rangkaian: ' + (selectedProduct.productType ?? '-')
                              : 'Tidak ada template khusus dan Jenis rangkaian belum memiliki default.'}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <details className="rounded-2xl border border-border/75 bg-card">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Template khusus saat ini · {productOverrides.length}</summary>
                    <div className="max-h-72 space-y-2 overflow-y-auto border-t border-border/70 p-3">
                      {productOverrides.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Belum ada template khusus produk.</p> : null}
                      {productOverrides.map((target) => {
                        const product = products.find((item) => item.id === target.productId)
                        const template = draftTemplates.find((item) => item.id === target.templateId)
                        return (
                          <div key={target.id} className="flex items-center gap-3 rounded-xl bg-muted/45 px-3 py-2.5">
                            <span className="min-w-0 flex-1 text-xs">
                              <span className="block truncate font-semibold">{product?.name ?? 'Produk tidak ditemukan'}</span>
                              <span className="text-muted-foreground">Template khusus → {template?.name ?? 'Template tidak ditemukan'}</span>
                            </span>
                            <button type="button" aria-label="Hapus template khusus produk" onClick={() => setProductOverride(target.productId, '')} className="inline-flex size-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                </section>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-border bg-surface-footer px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            <p className="mr-auto hidden text-xs text-muted-foreground sm:block">{sourceChanged ? 'Muat ulang sebelum menyimpan.' : isDirty ? 'Ada perubahan yang belum disimpan.' : 'Tidak ada perubahan.'}</p>
            <button type="button" onClick={handleClose} disabled={isSaving} className="h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">Batal</button>
            <button type="button" onClick={handleSave} disabled={!isDirty || isSaving || sourceChanged} className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? 'Menyimpan…' : 'Simpan perubahan'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={pendingDeleteId !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDeleteId(null) }}
        title="Hapus template ukuran?"
        description="Template hanya dapat dihapus bila tidak lagi ditetapkan dan tidak direferensikan oleh varian historis."
        confirmLabel="Hapus template"
        destructive
        onConfirm={() => {
          if (pendingDeleteId) deleteTemplateDraft(pendingDeleteId)
          setPendingDeleteId(null)
        }}
      />

      <ConfirmActionDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Buang perubahan?"
        description="Perubahan Template ukuran dan gambar panduan yang belum disimpan akan hilang."
        confirmLabel="Buang perubahan"
        cancelLabel="Lanjut edit"
        destructive
        onConfirm={onClose}
      />
    </>
  )
}

export default CatalogSizeGuideDialog
