import { useEffect, useMemo, useState, type FC } from 'react'
import { Check, Flower2, Image as ImageIcon, Ruler, Trash2 } from 'lucide-react'
import type { CatalogSizeGuideTemplate, CatalogVariantStatus } from '../../store/catalogStoreTypes'
import { generateId } from '../../lib/id'
import { useUserStore } from '../../store/userStore'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { CatalogProductImagesField } from './CatalogProductImagesField'
import type { VariantRow } from './CatalogItemFormSheet'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant: VariantRow
  variantLabel: string
  productName?: string
  sizeTemplate?: CatalogSizeGuideTemplate
  reservedSizeOptionIds: Set<string>
  onApply: (variant: VariantRow) => void
  onDelete?: () => void
}

const inputClass = 'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const labelClass = 'text-sm font-medium text-foreground'
type VariantStep = 'detail' | 'foto' | 'resep'
// The editor is a short linear flow: Detail -> Foto (optional) -> Resep -> Simpan.
const STEPS: Array<{ id: VariantStep; label: string }> = [
  { id: 'detail', label: 'Detail' },
  { id: 'foto', label: 'Foto · opsional' },
  { id: 'resep', label: 'Resep' },
]

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div className="space-y-1.5">
    <label className={labelClass}>{label}</label>
    {children}
    {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
  </div>
)

export const CatalogVariantEditorDialog: FC<Props> = ({
  open,
  onOpenChange,
  variant,
  variantLabel,
  productName,
  sizeTemplate,
  reservedSizeOptionIds,
  onApply,
  onDelete,
}) => {
  const role = useUserStore((state) => state.role)
  const canViewCost = role === 'owner' || role === 'finance'
  const [draft, setDraft] = useState<VariantRow>(variant)
  const [step, setStep] = useState<VariantStep>('detail')
  const [furthestStep, setFurthestStep] = useState(0)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setDraft(structuredClone(variant))
    setStep('detail')
    // An existing size can jump straight to any step; a new one walks through them.
    setFurthestStep(variant.id ? STEPS.length - 1 : 0)
    setErrors([])
  }, [open, variant])

  const templateSizes = useMemo(
    () => [...(sizeTemplate?.sizes ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [sizeTemplate],
  )
  const selectedSize = templateSizes.find((size) => size.id === draft.sizeOptionId)
  const selectedSizeArchived = selectedSize?.isActive === false

  const update = (patch: Partial<VariantRow>) => setDraft((current) => ({ ...current, ...patch }))
  const selectSize = (sizeId: string) => {
    const size = templateSizes.find((item) => item.id === sizeId)
    if (!size || size.isActive === false || reservedSizeOptionIds.has(size.id)) return
    update({ sizeOptionId: size.id, size: size.name })
  }

  const updateFlower = (recipeIndex: number, patch: Partial<VariantRow['flowerRecipe'][number]>) => {
    update({
      flowerRecipe: draft.flowerRecipe.map((item, index) => index === recipeIndex ? { ...item, ...patch } : item),
    })
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step)
  const isLastStep = stepIndex === STEPS.length - 1

  const detailErrors = (): string[] => {
    const nextErrors: string[] = []
    if (!draft.size.trim()) nextErrors.push('Nama ukuran wajib tersedia.')
    const price = Number.parseInt(draft.price, 10)
    if (!Number.isFinite(price) || price <= 0) nextErrors.push('Harga jual harus lebih dari Rp0.')
    if (draft.sizeOptionId && reservedSizeOptionIds.has(draft.sizeOptionId)) nextErrors.push('Ukuran template ini sudah digunakan varian lain.')
    if (draft.status === 'active' && selectedSizeArchived) nextErrors.push('Ukuran yang diarsipkan tidak dapat dijual.')
    if (draft.status === 'active' && sizeTemplate && !draft.sizeOptionId) nextErrors.push('Varian aktif harus memakai ukuran dari Size Template.')
    const cost = draft.cost.trim() ? Number.parseInt(draft.cost, 10) : undefined
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) nextErrors.push('Cost tidak valid.')
    return nextErrors
  }

  const recipeErrors = (): string[] => {
    const nextErrors: string[] = []
    if (draft.status === 'active' && draft.flowerRecipe.length === 0) nextErrors.push('Varian aktif wajib memiliki minimal 1 item Resep Bunga.')
    draft.flowerRecipe.forEach((item, index) => {
      const quantity = Number.parseFloat(item.quantity)
      if (!item.flowerName.trim()) nextErrors.push('Bunga ' + (index + 1) + ': nama bunga wajib diisi.')
      if (!Number.isFinite(quantity) || quantity <= 0) nextErrors.push('Bunga ' + (index + 1) + ': jumlah harus lebih dari 0.')
    })
    return nextErrors
  }

  const goToStep = (index: number) => {
    setErrors([])
    setStep(STEPS[index].id)
    setFurthestStep((current) => Math.max(current, index))
  }

  const goNext = () => {
    if (step === 'detail') {
      const nextErrors = detailErrors()
      setErrors([...new Set(nextErrors)])
      if (nextErrors.length > 0) return
    }
    goToStep(stepIndex + 1)
  }

  const goBack = () => {
    if (stepIndex === 0) onOpenChange(false)
    else goToStep(stepIndex - 1)
  }

  const save = () => {
    const invalidDetail = detailErrors()
    if (invalidDetail.length > 0) {
      setStep('detail')
      setErrors([...new Set(invalidDetail)])
      return
    }
    const invalidRecipe = recipeErrors()
    if (invalidRecipe.length > 0) {
      setStep('resep')
      setErrors([...new Set(invalidRecipe)])
      return
    }
    onApply(draft)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:rounded-2xl sm:border">
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 pb-4 pt-5 sm:px-6">
          <DialogTitle>{variantLabel}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Isi detail, foto (opsional), lalu resep. Perubahan hanya masuk ke draft produk setelah memilih Simpan ukuran.
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <ol className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-surface-card px-4 py-3 sm:px-6" aria-label="Langkah varian">
            {STEPS.map((item, index) => {
              const current = index === stepIndex
              const done = index < stepIndex
              const reachable = index <= furthestStep
              return (
                <li key={item.id} className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => goToStep(index)}
                    aria-current={current ? 'step' : undefined}
                    className="flex min-w-0 items-center gap-2 text-left disabled:cursor-not-allowed"
                  >
                    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      current ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                    >
                      {done ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className={`truncate text-xs font-medium sm:text-sm ${current ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
                  </button>
                  {index < STEPS.length - 1 ? <span className="h-px min-w-3 flex-1 bg-border" aria-hidden="true" /> : null}
                </li>
              )
            })}
          </ol>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
            {errors.length > 0 ? (
              <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3" role="alert">
                <p className="text-sm font-semibold text-destructive">Periksa varian ini</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
                  {errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            ) : null}

            {step === 'detail' ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={draft.sizeOptionId ? 'Ukuran template' : 'Tautkan ke ukuran template · Opsional'}
                    hint={draft.sizeOptionId
                      ? 'Identitas ukuran tersimpan menggunakan ID template, bukan nama bebas.'
                      : 'Varian lama tetap dipertahankan tanpa tautan sampai Anda memilih ukuran secara eksplisit.'}
                  >
                    <Select value={draft.sizeOptionId} onValueChange={selectSize}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder={sizeTemplate ? 'Pilih dari ' + sizeTemplate.name : 'Belum ada template ukuran'} />
                      </SelectTrigger>
                      <SelectContent>
                        {templateSizes.map((size) => {
                          const unavailable = size.isActive === false || reservedSizeOptionIds.has(size.id)
                          return (
                            <SelectItem key={size.id} value={size.id} disabled={unavailable}>
                              {size.name}{size.isActive === false ? ' · Diarsipkan' : reservedSizeOptionIds.has(size.id) ? ' · Sudah digunakan' : ''}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Nama ukuran tersimpan">
                    <input value={draft.size} disabled={Boolean(draft.sizeOptionId)} onChange={(event) => update({ size: event.target.value })} className={draft.sizeOptionId ? inputClass + ' bg-muted text-muted-foreground' : inputClass} />
                  </Field>

                  <Field label="Harga jual · Wajib">
                    <input type="number" min={1} inputMode="numeric" value={draft.price} onChange={(event) => update({ price: event.target.value })} placeholder="Rp0" className={inputClass} />
                  </Field>

                  <Field label="Status">
                    <Select value={draft.status} onValueChange={(value) => update({ status: value as CatalogVariantStatus })}>
                      <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active" disabled={selectedSizeArchived}>Dijual</SelectItem>
                        <SelectItem value="inactive">Tidak tersedia</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {canViewCost ? (
                    <Field label="Cost · Owner/Finance">
                      <input type="number" min={0} value={draft.cost} onChange={(event) => update({ cost: event.target.value })} placeholder="Opsional" className={inputClass} />
                    </Field>
                  ) : null}

                  {draft.sku ? (
                    <Field label="SKU">
                      <input value={draft.sku} disabled className={inputClass + ' bg-muted text-muted-foreground'} />
                    </Field>
                  ) : null}
                </div>

                <aside className="space-y-3 rounded-2xl bg-muted/45 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Ruler className="size-4 text-primary" /> Panduan ukuran</p>
                  {selectedSize?.guideImageUrl ? (
                    <img src={selectedSize.guideImageUrl} alt={'Panduan ' + selectedSize.name} className="aspect-square w-full rounded-xl object-cover ring-1 ring-border" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
                      {draft.sizeOptionId ? 'Belum ada gambar panduan untuk ukuran ini.' : 'Tautkan varian ke ukuran untuk melihat panduan.'}
                    </div>
                  )}
                  <p className="text-xs leading-5 text-muted-foreground">
                    Referensi saja. Panduan dikelola dari Template ukuran dan tidak dapat diedit dari produk.
                  </p>
                </aside>
              </div>
            ) : null}

            {step === 'detail' && onDelete ? (
              <button type="button" onClick={onDelete} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-destructive hover:bg-destructive/10">
                <Trash2 className="size-4" /> Hapus ukuran ini dari produk
              </button>
            ) : null}

            {step === 'foto' ? (
              <div className="space-y-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="size-4 text-primary" /> Foto varian</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Opsional. Setiap ukuran dapat memiliki maksimal 1 foto sendiri yang dipakai saat ukuran ini dipilih di Storefront. Tanpa foto, Storefront memakai foto katalog produk.</p>
                </div>
                <CatalogProductImagesField
                  images={draft.images}
                  onChange={(images) => update({ images })}
                  productName={(productName ?? 'Produk') + ' ' + draft.size}
                  kind="variant"
                />
              </div>
            ) : null}

            {step === 'resep' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold"><Flower2 className="size-4 text-primary" /> Resep bunga ukuran ini</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Resep tersimpan khusus untuk ukuran ini dan digunakan oleh Storefront serta produksi.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => update({ flowerRecipe: [...draft.flowerRecipe, { id: generateId('flower_recipe'), flowerName: '', quantity: '1', unit: 'stem' }] })}
                    className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted"
                  >
                    Tambah bunga
                  </button>
                </div>

                {draft.flowerRecipe.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Belum ada resep bunga.</div>
                ) : (
                  <div className="space-y-3">
                    {draft.flowerRecipe.map((item, recipeIndex) => (
                      <div key={item.id} className="grid gap-3 rounded-xl bg-muted/45 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_2.75rem] sm:items-end">
                        <Field label="Bunga"><input value={item.flowerName} onChange={(event) => updateFlower(recipeIndex, { flowerName: event.target.value })} placeholder="Contoh: Mawar Merah" className={inputClass} /></Field>
                        <Field label="Jumlah"><input type="number" min={0.01} step={0.01} value={item.quantity} onChange={(event) => updateFlower(recipeIndex, { quantity: event.target.value })} className={inputClass} /></Field>
                        <Field label="Satuan">
                          <Select value={item.unit} onValueChange={(value) => updateFlower(recipeIndex, { unit: value as 'stem' | 'bunch' })}>
                            <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="stem">Tangkai</SelectItem><SelectItem value="bunch">Ikat</SelectItem></SelectContent>
                          </Select>
                        </Field>
                        <button type="button" aria-label="Hapus bunga" onClick={() => update({ flowerRecipe: draft.flowerRecipe.filter((_, index) => index !== recipeIndex) })} className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center gap-3 bg-surface-footer px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <button type="button" onClick={goBack} className="mr-auto h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">
            {stepIndex === 0 ? 'Batal' : 'Kembali'}
          </button>
          {isLastStep ? (
            <button type="button" onClick={save} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Check className="size-4" /> Simpan ukuran
            </button>
          ) : (
            <button type="button" onClick={goNext} className="inline-flex h-11 items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              {step === 'foto' && draft.images.length === 0 ? 'Lewati' : 'Lanjut'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CatalogVariantEditorDialog
