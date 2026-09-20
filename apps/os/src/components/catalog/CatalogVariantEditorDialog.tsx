import { useEffect, useMemo, useState, type FC } from 'react'
import { Flower2, Image as ImageIcon, Link2, Ruler, Trash2 } from 'lucide-react'
import type { CatalogSizeGuideTemplate, CatalogVariantStatus } from '../../store/catalogStoreTypes'
import { generateId } from '../../lib/id'
import { useUserStore } from '../../store/userStore'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
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
  const [tab, setTab] = useState('detail')
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setDraft(structuredClone(variant))
    setTab('detail')
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

  const apply = () => {
    const nextErrors: string[] = []
    if (!draft.size.trim()) nextErrors.push('Nama ukuran wajib tersedia.')
    const price = Number.parseInt(draft.price, 10)
    if (!Number.isFinite(price) || price <= 0) nextErrors.push('Harga jual harus lebih dari Rp0.')
    if (draft.sizeOptionId && reservedSizeOptionIds.has(draft.sizeOptionId)) nextErrors.push('Ukuran template ini sudah digunakan varian lain.')
    if (draft.status === 'active' && selectedSizeArchived) nextErrors.push('Ukuran yang diarsipkan tidak dapat dijual.')
    const cost = draft.cost.trim() ? Number.parseInt(draft.cost, 10) : undefined
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) nextErrors.push('Cost tidak valid.')

    draft.flowerRecipe.forEach((item, index) => {
      const quantity = Number.parseFloat(item.quantity)
      if (!item.flowerName.trim()) nextErrors.push('Bunga ' + (index + 1) + ': nama bunga wajib diisi.')
      if (!Number.isFinite(quantity) || quantity <= 0) nextErrors.push('Bunga ' + (index + 1) + ': jumlah harus lebih dari 0.')
    })

    setErrors([...new Set(nextErrors)])
    if (nextErrors.length > 0) return
    onApply(draft)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:rounded-2xl sm:border">
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 pb-4 pt-5 sm:px-6">
          <DialogTitle>{variantLabel}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Perubahan di jendela ini hanya masuk ke draft produk setelah memilih Terapkan.
          </p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border/70 bg-surface-card px-4 py-2 sm:px-6">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="detail">Detail</TabsTrigger>
              <TabsTrigger value="foto">Foto</TabsTrigger>
              <TabsTrigger value="resep">Resep</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
            {errors.length > 0 ? (
              <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3" role="alert">
                <p className="text-sm font-semibold text-destructive">Periksa varian ini</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
                  {errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            ) : null}

            <TabsContent value="detail" className="mt-0">
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
            </TabsContent>

            <TabsContent value="foto" className="mt-0">
              <div className="space-y-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="size-4 text-primary" /> Foto varian</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Setiap ukuran memiliki maksimal 1 foto sendiri. Foto ini akan dipakai saat ukuran ini dipilih di Storefront.</p>
                </div>
                <CatalogProductImagesField
                  images={draft.images}
                  onChange={(images) => update({ images })}
                  productName={(productName ?? 'Produk') + ' ' + draft.size}
                  kind="variant"
                />
              </div>
            </TabsContent>

            <TabsContent value="resep" className="mt-0">
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
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="shrink-0 bg-surface-footer px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="mr-auto inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-destructive hover:bg-destructive/10">
              <Trash2 className="size-4" /> Hapus varian
            </button>
          ) : <span className="mr-auto" />}
          <button type="button" onClick={() => onOpenChange(false)} className="h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Batal</button>
          <button type="button" onClick={apply} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Link2 className="size-4" /> Terapkan
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CatalogVariantEditorDialog
