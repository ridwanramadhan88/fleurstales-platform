import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Archive, ChevronDown, ChevronLeft, ChevronRight, Image as ImageIcon, Plus, Ruler, Trash2 } from 'lucide-react'
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

const inputClass = 'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const fingerprint = (templates: CatalogSizeGuideTemplate[], targets: CatalogSizeGuideTarget[]) =>
  JSON.stringify({ templates, targets })

export const CatalogSizeGuideDialog: FC<CatalogSizeGuideDialogProps> = ({ open, onClose }) => {
  const products = useCatalogStore((state) => state.products)
  const sourceTemplates = useCatalogStore((state) => state.sizeGuideTemplates)
  const sourceTargets = useCatalogStore((state) => state.sizeGuideTargets)
  const applyDraft = useCatalogStore((state) => state.applySizeGuideLibraryDraft)

  const [draftTemplates, setDraftTemplates] = useState<CatalogSizeGuideTemplate[]>([])
  const [draftTargets, setDraftTargets] = useState<CatalogSizeGuideTarget[]>([])
  const [baselineFingerprint, setBaselineFingerprint] = useState('')
  const [sourceAtOpen, setSourceAtOpen] = useState('')
  const [initializedOpen, setInitializedOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newSizeName, setNewSizeName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // On phones the manager drills down: template list first, then one template.
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [expandedSizeId, setExpandedSizeId] = useState<string | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)

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
      setPendingDeleteId(null)
      setConfirmClose(false)
      setIsSaving(false)
      setMobileView('list')
      setExpandedSizeId(null)
      setCreatingTemplate(false)
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

  const selectedTemplate = draftTemplates.find((template) => template.id === selectedTemplateId) ?? draftTemplates[0]
  const activeTemplateId = selectedTemplate?.id ?? ''

  // Products pick their size chart in the product editor; the manager only shows usage.
  const templateProductCount = (templateId: string): number =>
    draftTargets.filter((target) => target.scope === 'product' && target.templateId === templateId).length

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
    setCreatingTemplate(false)
    setMobileView('detail')
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
    setMobileView('list')
  }

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
    if (draftTargets.some((target) => !templateIds.has(target.templateId))) return 'Ada produk yang memakai template yang sudah tidak tersedia.'
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

  const openTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setExpandedSizeId(null)
    setMobileView('detail')
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose() }}>
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(860px,calc(100dvh-2rem))] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:rounded-2xl sm:border">
          <DialogHeader className="shrink-0 border-b border-border/70 px-5 pb-4 pt-5 sm:px-6">
            <DialogTitle className="flex items-center gap-2">
              <Ruler className="size-5" />
              Template ukuran
              {isDirty ? <span className="rounded-full bg-warning/10 px-2 py-1 text-2xs font-semibold text-warning">Belum disimpan</span> : null}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Kelompok ukuran beserta gambar panduannya. Dipilih per produk di editor produk.</p>
          </DialogHeader>

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

            <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className={`space-y-3 ${mobileView === 'detail' ? 'hidden lg:block' : ''}`}>
                <div className="space-y-2">
                  {draftTemplates.map((template) => {
                    const selected = activeTemplateId === template.id
                    const configured = template.sizes.filter((size) => Boolean(size.guideImageUrl)).length
                    return (
                      <button key={template.id} type="button" onClick={() => openTemplate(template.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ${selected ? 'lg:bg-primary/5 lg:ring-primary/50 bg-card ring-border' : 'bg-card ring-border'}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{template.name || 'Template tanpa nama'}</span>
                          <span className="mt-1 block text-2xs text-muted-foreground">{template.sizes.length} ukuran · {configured} panduan · {templateProductCount(template.id)} produk</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground lg:hidden" />
                      </button>
                    )
                  })}
                  {draftTemplates.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Belum ada template ukuran.</p> : null}
                </div>

                {creatingTemplate ? (
                  <div className="space-y-2 rounded-xl bg-muted/45 p-3">
                    <input value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleCreateTemplate() } }} placeholder="Nama template, contoh: Bloom Box" className={inputClass} aria-label="Nama template baru" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setCreatingTemplate(false); setNewTemplateName('') }} className="h-10 flex-1 rounded-full text-sm font-medium text-muted-foreground hover:bg-muted">Batal</button>
                      <Button type="button" className="h-10 flex-1" onClick={handleCreateTemplate}>Buat</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCreatingTemplate(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-dashed border-border text-sm font-semibold text-foreground hover:bg-muted">
                    <Plus className="size-4" /> Buat template baru
                  </button>
                )}
              </aside>

              <section className={`space-y-4 ${mobileView === 'list' ? 'hidden lg:block' : ''}`}>
                {selectedTemplate ? (
                  <>
                    <button type="button" onClick={() => setMobileView('list')} className="inline-flex h-9 items-center gap-1 rounded-full pr-3 text-sm font-medium text-primary lg:hidden">
                      <ChevronLeft className="size-4" /> Semua template
                    </button>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">Nama template</span>
                      <input value={selectedTemplate.name} onChange={(event) => updateTemplate(selectedTemplate.id, { name: event.target.value })} className={inputClass} />
                    </label>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Ukuran</p>
                      {[...selectedTemplate.sizes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((size) => {
                        const activeUsage = activeSizeUsageCount(size.id)
                        const usage = sizeUsageCount(size.id)
                        const active = size.isActive !== false
                        const expanded = expandedSizeId === size.id
                        return (
                          <div key={size.id} className={`rounded-xl border border-border bg-card ${active ? '' : 'opacity-70'}`}>
                            <button type="button" aria-expanded={expanded} onClick={() => setExpandedSizeId(expanded ? null : size.id)} className="flex w-full items-center gap-3 p-3 text-left">
                              {size.guideImageUrl ? (
                                <img src={size.guideImageUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-border" />
                              ) : (
                                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ImageIcon className="size-4" /></span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{size.name || 'Tanpa nama'}</span>
                                <span className="block text-2xs text-muted-foreground">
                                  {!active ? 'Diarsipkan · ' : ''}{activeUsage} dijual{size.guideImageUrl ? '' : ' · belum ada panduan'}
                                </span>
                              </span>
                              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                            {expanded ? (
                              <div className="space-y-3 border-t border-border/70 p-3">
                                <label className="block space-y-1.5">
                                  <span className="text-xs font-medium">Nama ukuran</span>
                                  <input value={size.name} onChange={(event) => updateSize(selectedTemplate.id, size.id, { name: event.target.value })} className={inputClass} />
                                </label>
                                <div className="max-w-xs">
                                  <ImageDropInput value={size.guideImageUrl} onChange={(value) => handleGuideImage(selectedTemplate.id, size.id, value)} label="Gambar panduan" editorTitle={`Potong panduan ${size.name}`} previewAlt={`Panduan ukuran ${size.name}`} />
                                </div>
                                {active ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" disabled={activeUsage > 0} onClick={() => updateSize(selectedTemplate.id, size.id, { isActive: false })} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><Archive className="size-3.5" /> Arsipkan ukuran</button>
                                    {activeUsage > 0 ? <span className="text-2xs text-muted-foreground">Tidak bisa diarsipkan: masih dijual di {activeUsage} varian.</span> : null}
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => updateSize(selectedTemplate.id, size.id, { isActive: true })} className="inline-flex h-9 items-center rounded-full px-3 text-xs font-medium text-primary hover:bg-primary/10">Aktifkan lagi</button>
                                )}
                                {usage > activeUsage ? <p className="text-2xs text-muted-foreground">{usage - activeUsage} varian lain memakai ukuran ini tetapi tidak dijual.</p> : null}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      {selectedTemplate.sizes.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Belum ada ukuran. Tambahkan ukuran pertama di bawah.</p>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <input value={newSizeName} onChange={(event) => setNewSizeName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddSize() } }} placeholder="Ukuran baru, contoh: XL" className={inputClass} aria-label="Nama ukuran baru" />
                      <Button type="button" variant="secondary" onClick={handleAddSize} className="h-11 shrink-0"><Plus className="mr-1 size-4" /> Tambah</Button>
                    </div>

                    <div className="border-t border-border/70 pt-3">
                      <button type="button" disabled={templateDeleteBlocked(selectedTemplate.id)} onClick={() => setPendingDeleteId(selectedTemplate.id)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="size-4" /> Hapus template</button>
                      {templateDeleteBlocked(selectedTemplate.id) ? <p className="px-3 text-2xs text-muted-foreground">Tidak bisa dihapus selama masih dipakai produk atau varian.</p> : null}
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Buat atau pilih template ukuran.</div>
                )}
              </section>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-border bg-surface-footer px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
            <button type="button" onClick={handleClose} disabled={isSaving} className="mr-auto h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">Batal</button>
            <p className="hidden text-xs text-muted-foreground sm:block">{sourceChanged ? 'Muat ulang sebelum menyimpan.' : isDirty ? 'Ada perubahan yang belum disimpan.' : 'Tidak ada perubahan.'}</p>
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
        description="Template hanya dapat dihapus bila tidak lagi dipakai produk dan tidak direferensikan oleh varian historis."
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
