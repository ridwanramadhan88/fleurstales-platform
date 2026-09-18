import { useEffect, useMemo, useState, type FC } from 'react'
import { Flower2, Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import type { CatalogVariantStatus } from '../../store/catalogStoreTypes'
import { useCatalogStore } from '../../store/catalogStore'
import { formatCatalogVariantLabel, parseCatalogVariantLabel } from '../../domain/catalogVariantLabelDomain'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { VariantRow } from './CatalogItemFormSheet'
import { CatalogProductImagesField } from './CatalogProductImagesField'
import { generateId } from '../../lib/id'
import { useUserStore } from '../../store/userStore'

interface Props {
  variants: VariantRow[]
  sizeTemplateName?: string
  updateVariant: (index: number, patch: Partial<VariantRow>) => void
  addVariant: () => void
  removeVariant: (index: number) => void
  productName?: string
}

const inputClass = 'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const labelClass = 'text-sm font-medium text-foreground'
const VariantField = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="space-y-1.5"><label className={labelClass}>{label}</label>{children}</div>

export const CatalogVariantsSection: FC<Props> = ({ variants, sizeTemplateName, updateVariant, addVariant, removeVariant, productName }) => {
  const sizeGuideTemplates = useCatalogStore((state) => state.sizeGuideTemplates)
  const userRole = useUserStore((state) => state.role)
  const canViewCost = userRole === 'owner' || userRole === 'finance'
  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(variants.length - 1, 0))), [variants.length])

  const sizeTemplate = useMemo(() => {
    return sizeTemplateName ? sizeGuideTemplates.find((template) => template.name === sizeTemplateName) : undefined
  }, [sizeGuideTemplates, sizeTemplateName])
  const templateSizes = (sizeTemplate?.sizes ?? []).filter((size) => size.isActive !== false)
  const row = variants[activeIndex]
  if (!row) return null
  const parts = parseCatalogVariantLabel(row.size)
  const selectedSize = templateSizes.find((size) => size.id === row.sizeOptionId)
    ?? templateSizes.find((size) => size.name.toLowerCase() === parts.size.toLowerCase())

  const updateFlower = (recipeIndex: number, patch: Partial<VariantRow['flowerRecipe'][number]>) => updateVariant(activeIndex, {
    flowerRecipe: row.flowerRecipe.map((item, index) => index === recipeIndex ? { ...item, ...patch } : item),
  })

  const selectSize = (sizeId: string) => {
    const size = templateSizes.find((item) => item.id === sizeId)
    if (!size) return
    updateVariant(activeIndex, { sizeOptionId: size.id, size: formatCatalogVariantLabel(size.name, parts.option) })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Ukuran & varian</h3>
          <p className="text-xs text-muted-foreground">Harga, foto produk, resep, dan status disimpan per ukuran. Panduan ukuran diwarisi dari template.</p>
        </div>
        <button type="button" onClick={() => { addVariant(); setActiveIndex(variants.length) }} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="size-4" /> Tambah variant</button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {variants.map((variant, index) => {
          const label = parseCatalogVariantLabel(variant.size).size || `Variant ${index + 1}`
          const complete = Boolean(variant.size.trim() && Number(variant.price) > 0)
          return <button key={variant.id ?? `new-${index}`} type="button" onClick={() => setActiveIndex(index)} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 ${activeIndex === index ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-foreground ring-border'}`}>{complete ? '✓ ' : '! '}{label}</button>
        })}
      </div>

      <article className="rounded-2xl border border-border/80 bg-card p-4 shadow-ios-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{sizeTemplate?.name ?? 'Template ukuran'} · {parts.size || 'Pilih ukuran'}</p>
            <p className="text-xs text-muted-foreground">{row.sku || 'SKU dibuat saat disimpan'}</p>
          </div>
          {variants.length > 1 && <button type="button" onClick={() => removeVariant(activeIndex)} className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Hapus variant"><Trash2 className="size-4" /></button>}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <VariantField label="Ukuran · Wajib">
            <Select value={selectedSize?.id} onValueChange={selectSize}>
              <SelectTrigger className={inputClass}><SelectValue placeholder={sizeTemplate ? `Pilih dari ${sizeTemplate.name}` : 'Buat template ukuran dulu'} /></SelectTrigger>
              <SelectContent>{templateSizes.map((size) => <SelectItem key={size.id} value={size.id}>{size.name}</SelectItem>)}</SelectContent>
            </Select>
          </VariantField>
          <VariantField label="Opsi tambahan · Opsional"><input value={parts.option} onChange={(event) => updateVariant(activeIndex, { size: formatCatalogVariantLabel(parts.size, event.target.value) })} placeholder="Contoh: White" className={inputClass} /></VariantField>
          <VariantField label="Harga jual · Wajib"><input type="number" min={1} inputMode="numeric" value={row.price} onChange={(event) => updateVariant(activeIndex, { price: event.target.value })} placeholder="Rp0" className={inputClass} /></VariantField>
          <VariantField label="Status"><Select value={row.status} onValueChange={(value) => updateVariant(activeIndex, { status: value as CatalogVariantStatus })}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Dijual</SelectItem><SelectItem value="inactive">Tidak tersedia</SelectItem></SelectContent></Select></VariantField>
        </div>

        <div className="mt-5 grid gap-5 border-t border-border/70 pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div><p className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="size-4 text-primary" /> Foto produk variant</p><p className="mt-0.5 text-xs text-muted-foreground">Foto ini khusus {parts.size || 'ukuran ini'}. Jika kosong, storefront Batch 2 dapat memakai foto produk lama sebagai fallback.</p></div>
            <CatalogProductImagesField images={row.images} onChange={(images) => updateVariant(activeIndex, { images })} productName={`${productName ?? 'Product'} ${parts.size}`} />
          </div>
          <div className="space-y-3 rounded-xl bg-muted/40 p-3">
            <p className="text-sm font-semibold">Panduan ukuran</p>
            {selectedSize?.guideImageUrl ? <img src={selectedSize.guideImageUrl} alt={`Panduan ${selectedSize.name}`} className="aspect-square w-full max-w-[220px] rounded-xl object-cover ring-1 ring-border" /> : <div className="flex aspect-square w-full max-w-[220px] items-center justify-center rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">Belum ada panduan untuk {selectedSize?.name ?? 'ukuran ini'}.</div>}
            <p className="text-2xs text-muted-foreground">Dikelola dari Panduan ukuran · {sizeTemplate?.name ?? 'belum ditetapkan'}. Tidak dapat diubah dari produk.</p>
          </div>
        </div>

        <div className="mt-5 border-t border-border/70 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div><p className="flex items-center gap-2 text-sm font-semibold"><Flower2 className="size-4 text-primary" /> Resep bunga</p><p className="mt-0.5 text-xs text-muted-foreground">Komposisi produksi khusus variant ini.</p></div>
            <button type="button" onClick={() => updateVariant(activeIndex, { flowerRecipe: [...row.flowerRecipe, { id: generateId('flower_recipe'), flowerName: '', quantity: '1', unit: 'stem' }] })} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold hover:bg-muted"><Plus className="size-3.5" /> Tambah bunga</button>
          </div>
          {row.flowerRecipe.length === 0 ? <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Belum ada resep bunga.</div> : <div className="space-y-2">{row.flowerRecipe.map((item, recipeIndex) => <div key={item.id} className="grid gap-2 rounded-xl bg-muted/45 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_2.75rem] sm:items-end">
            <VariantField label="Bunga"><input value={item.flowerName} onChange={(event) => updateFlower(recipeIndex, { flowerName: event.target.value })} placeholder="Contoh: Mawar Merah" className={inputClass} /></VariantField>
            <VariantField label="Jumlah"><input type="number" min={0.01} step={0.01} value={item.quantity} onChange={(event) => updateFlower(recipeIndex, { quantity: event.target.value })} className={inputClass} /></VariantField>
            <VariantField label="Satuan"><Select value={item.unit} onValueChange={(value) => updateFlower(recipeIndex, { unit: value as 'stem' | 'bunch' })}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stem">Tangkai</SelectItem><SelectItem value="bunch">Ikat</SelectItem></SelectContent></Select></VariantField>
            <button type="button" onClick={() => updateVariant(activeIndex, { flowerRecipe: row.flowerRecipe.filter((_, index) => index !== recipeIndex) })} className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
          </div>)}</div>}
        </div>

        {canViewCost && <div className="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2"><VariantField label="Cost · Owner/Finance"><input type="number" min={0} value={row.cost} onChange={(event) => updateVariant(activeIndex, { cost: event.target.value })} placeholder="Opsional" className={inputClass} /></VariantField></div>}
      </article>
    </section>
  )
}
