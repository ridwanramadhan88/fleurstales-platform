/**
 * @file CatalogItemFormSheet.tsx
 * @description Product editor with local draft semantics and size-template-backed variants.
 */

import type { FC, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { CatalogCategory, CatalogMaterial, CatalogProduct, CatalogProductImage, CatalogVariantStatus } from '../../store/catalogStoreTypes'
import type { NewCatalogProductInput, NewCatalogVariantInput } from '../../store/catalogStore'
import { useCatalogStore } from '../../store/catalogStore'
import { resolveCatalogSizeGuide } from '../../store/catalogStoreSizeGuideActions'
import { CatalogProductDetailsSection } from './CatalogProductDetailsSection'
import { CatalogVariantsSection } from './CatalogVariantsSection'
import { AppSheet } from '../ui/app-sheet'
import { ActionFooter } from '../ui/action-footer'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { FormSection, ValidationSummary } from '../ui/form-patterns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { CATALOG_IMAGE_MAX_COUNT, getCatalogProductImageAliases, normalizeCatalogProductImages } from '../../domain/catalogImageDomain'

type SaveResult = boolean | void | Promise<boolean | void>

export interface CatalogItemFormSheetProps {
  open: boolean
  onClose: () => void
  product?: CatalogProduct | null
  categoryOptions: CatalogCategory[]
  arrangementTypeOptions: string[]
  onCreate: (params: NewCatalogProductInput) => SaveResult
  onUpdate: (params: {
    productId: string
    name: string
    description?: string
    category: CatalogCategory
    material: CatalogMaterial
    occasionTags: CatalogCategory[]
    productType?: string
    collectionSeries?: string
    pricingType?: 'Fixed' | 'Starts From'
    orderType?: 'Catalog' | 'Custom'
    images: CatalogProductImage[]
    thumbnail?: string
    gallery?: string[]
    isCustomizable: boolean
    isActive: boolean
    variants: NewCatalogVariantInput[]
  }) => SaveResult
}

export interface VariantRow {
  id?: string
  sku?: string
  sizeOptionId?: string
  size: string
  images: CatalogProductImage[]
  price: string
  cost: string
  status: CatalogVariantStatus
  flowerRecipe: Array<{ id: string; flowerName: string; quantity: string; unit: 'stem' | 'bunch' }>
}

export interface CatalogFormState {
  name: string
  description: string
  category: CatalogCategory
  material: CatalogMaterial
  occasionTags: CatalogCategory[]
  productType: string
  collectionSeries: string
  pricingType: 'Fixed' | 'Starts From'
  orderType: 'Catalog' | 'Custom'
  isCustomizable: 'yes' | 'no'
  availability: 'active' | 'inactive'
  images: CatalogProductImage[]
  variants: VariantRow[]
}

export const emptyVariantRow = (): VariantRow => ({
  size: '',
  images: [],
  price: '',
  cost: '',
  status: 'active',
  flowerRecipe: [],
})

const emptyForm = (defaultCategory: CatalogCategory): CatalogFormState => ({
  name: '',
  description: '',
  category: defaultCategory,
  material: 'fresh',
  occasionTags: defaultCategory ? [defaultCategory] : [],
  productType: '',
  collectionSeries: '',
  pricingType: 'Fixed',
  orderType: 'Catalog',
  isCustomizable: 'no',
  availability: 'active',
  images: [],
  variants: [],
})

const formFromProduct = (product: CatalogProduct): CatalogFormState => ({
  name: product.name,
  description: product.description ?? '',
  category: product.category,
  material: product.material,
  occasionTags: product.occasionTags?.length ? product.occasionTags : [product.category],
  productType: product.productType ?? '',
  collectionSeries: product.collectionSeries ?? '',
  pricingType: product.pricingType ?? 'Fixed',
  orderType: product.orderType ?? 'Catalog',
  isCustomizable: product.isCustomizable ? 'yes' : 'no',
  availability: product.isActive ? 'active' : 'inactive',
  images: normalizeCatalogProductImages(product),
  variants: product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    sizeOptionId: variant.sizeOptionId,
    size: variant.size,
    images: (variant.images ?? []).map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 })),
    price: variant.price.toString(),
    cost: variant.cost?.toString() ?? '',
    status: variant.status,
    flowerRecipe: (variant.flowerRecipe ?? []).map((item) => ({
      id: item.id,
      flowerName: item.flowerName,
      quantity: String(item.quantity),
      unit: item.unit,
    })),
  })),
})

const detailFingerprint = (form: CatalogFormState): string => {
  const { variants: _variants, ...detail } = form
  return JSON.stringify(detail)
}
const variantFingerprint = (form: CatalogFormState): string => JSON.stringify(form.variants)
const productFingerprint = (product?: CatalogProduct | null): string => JSON.stringify(product ?? null)

const readOnlyInputClass = 'h-11 w-full rounded-xl border border-border bg-muted px-3.5 text-sm text-muted-foreground'
const labelClass = 'text-sm font-medium text-foreground'

export const CatalogItemFormSheet: FC<CatalogItemFormSheetProps> = ({
  open,
  onClose,
  product,
  categoryOptions,
  arrangementTypeOptions,
  onCreate,
  onUpdate,
}) => {
  const sizeGuideTemplates = useCatalogStore((state) => state.sizeGuideTemplates)
  const sizeGuideTargets = useCatalogStore((state) => state.sizeGuideTargets)
  const isEditMode = Boolean(product)
  const defaultCategory = categoryOptions[0] ?? ''

  const initial = useMemo(
    () => product ? formFromProduct(product) : emptyForm(defaultCategory),
    [product?.id, defaultCategory],
  )
  const [baseline, setBaseline] = useState<CatalogFormState>(initial)
  const [form, setForm] = useState<CatalogFormState>(initial)
  const [sourceAtOpen, setSourceAtOpen] = useState(productFingerprint(product))
  const [errors, setErrors] = useState<string[]>([])
  const [confirmClose, setConfirmClose] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'variants'>('info')
  const [isSaving, setIsSaving] = useState(false)

  const assignedSizeTemplate = useMemo(
    () => resolveCatalogSizeGuide(
      { id: product?.id ?? '__new__', productType: form.productType || undefined },
      sizeGuideTemplates,
      sizeGuideTargets,
      { includeLogical: true },
    ),
    [form.productType, product?.id, sizeGuideTargets, sizeGuideTemplates],
  )
  const usableSizeTemplates = useMemo(
    () => sizeGuideTemplates.filter((template) => template.sizes.some((size) => size.isActive !== false)),
    [sizeGuideTemplates],
  )
  // A newly-created Product has no Product-specific target yet. When there is
  // exactly one usable template in the library, expose it as the draft
  // template instead of incorrectly presenting the library as unavailable.
  // Multiple usable templates remain explicit: the Arrangement Type must have
  // a default assignment so we never guess which size model applies.
  const sizeTemplate = assignedSizeTemplate
    ?? (!product && usableSizeTemplates.length === 1 ? usableSizeTemplates[0] : undefined)
  const usingUnassignedNewProductFallback = Boolean(!assignedSizeTemplate && !product && sizeTemplate)

  useEffect(() => {
    if (!open) return
    const next = product ? formFromProduct(product) : emptyForm(defaultCategory)
    setBaseline(structuredClone(next))
    setForm(structuredClone(next))
    setSourceAtOpen(productFingerprint(product))
    setErrors([])
    setConfirmClose(false)
    setActiveTab('info')
    setIsSaving(false)
  }, [open, product?.id, defaultCategory])

  const infoDirty = detailFingerprint(form) !== detailFingerprint(baseline)
  const variantsDirty = variantFingerprint(form) !== variantFingerprint(baseline)
  const isDirty = infoDirty || variantsDirty
  const sourceChanged = isEditMode && sourceAtOpen !== productFingerprint(product)

  useEffect(() => {
    if (!open || !isDirty || typeof window === 'undefined') return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, open])

  const handleClose = () => {
    if (isSaving) return
    if (isDirty) setConfirmClose(true)
    else onClose()
  }

  if (!open) return null

  const updateVariant = (index: number, patch: Partial<VariantRow>) => {
    setForm((previous) => ({
      ...previous,
      variants: previous.variants.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    }))
  }
  const addVariantRow = (variant: VariantRow = emptyVariantRow()) => {
    setForm((previous) => ({ ...previous, variants: [...previous.variants, variant] }))
  }
  const removeVariantRow = (index: number) => {
    setForm((previous) => ({ ...previous, variants: previous.variants.filter((_, rowIndex) => rowIndex !== index) }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isSaving) return

    if (sourceChanged) {
      setErrors(['Produk berubah dari sumber data setelah editor dibuka. Tutup editor, buka ulang produk, lalu terapkan perubahan pada versi terbaru.'])
      return
    }

    const nextErrors: string[] = []
    let hasVariantError = false

    if (!form.name.trim()) nextErrors.push('Nama produk wajib diisi.')
    if (!form.category) nextErrors.push('Occasion utama wajib dipilih.')
    if (!form.productType.trim()) nextErrors.push('Jenis rangkaian wajib dipilih.')
    if (form.variants.length === 0) {
      nextErrors.push('Tambahkan minimal satu varian produk.')
      hasVariantError = true
    }

    const seenSizeOptionIds = new Set<string>()
    const parsedVariants: NewCatalogVariantInput[] = []
    form.variants.forEach((row, index) => {
      const label = 'Varian ' + (index + 1)
      if (!row.size.trim()) {
        nextErrors.push(label + ': ukuran wajib tersedia.')
        hasVariantError = true
      }
      if (row.sizeOptionId) {
        if (seenSizeOptionIds.has(row.sizeOptionId)) {
          nextErrors.push(label + ': ukuran template yang sama tidak boleh dipakai dua kali.')
          hasVariantError = true
        }
        seenSizeOptionIds.add(row.sizeOptionId)
      }

      const price = Number.parseInt(row.price, 10)
      if (!Number.isFinite(price) || price <= 0) {
        nextErrors.push(label + ': harga jual harus lebih dari Rp0.')
        hasVariantError = true
      }

      const costParsed = row.cost.trim() ? Number.parseInt(row.cost, 10) : undefined
      if (costParsed !== undefined && (!Number.isFinite(costParsed) || costParsed < 0)) {
        nextErrors.push(label + ': cost tidak valid.')
        hasVariantError = true
      }

      const flowerRecipe = row.flowerRecipe.map((item, recipeIndex) => {
        const quantity = Number.parseFloat(item.quantity)
        if (!item.flowerName.trim()) {
          nextErrors.push(label + ', bunga ' + (recipeIndex + 1) + ': nama bunga wajib diisi.')
          hasVariantError = true
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          nextErrors.push(label + ', bunga ' + (recipeIndex + 1) + ': jumlah harus lebih dari 0.')
          hasVariantError = true
        }
        return { id: item.id, flowerName: item.flowerName.trim(), quantity, unit: item.unit }
      }).filter((item) => item.flowerName && Number.isFinite(item.quantity) && item.quantity > 0)

      const variantImages = row.images.slice(0, CATALOG_IMAGE_MAX_COUNT).map((image, imageIndex) => ({
        ...image,
        altText: (form.name.trim() || 'Produk') + ' ' + row.size.trim(),
        sortOrder: imageIndex,
        isPrimary: imageIndex === 0,
      }))

      if (row.size.trim() && Number.isFinite(price) && price > 0) {
        parsedVariants.push({
          sizeOptionId: row.sizeOptionId,
          size: row.size.trim(),
          images: variantImages,
          price,
          cost: costParsed,
          status: row.status,
          flowerRecipe,
          ...(row.id ? { id: row.id } : {}),
          ...(row.sku ? { sku: row.sku } : {}),
        })
      }
    })

    if (!parsedVariants.some((variant) => variant.status === 'active')) {
      nextErrors.push('Minimal satu varian harus berstatus Dijual.')
      hasVariantError = true
    }

    setErrors([...new Set(nextErrors)])
    if (nextErrors.length > 0) {
      if (hasVariantError) setActiveTab('variants')
      return
    }

    const collection = form.collectionSeries.trim()
    const typedName = form.name.trim()
    const unprefixedName = collection && typedName.toLowerCase().startsWith((collection + ' - ').toLowerCase())
      ? typedName.slice(collection.length + 3).trim()
      : typedName
    const customerFacingName = collection ? collection + ' - ' + unprefixedName : typedName
    const normalizedImages = form.images.slice(0, CATALOG_IMAGE_MAX_COUNT).map((image, index) => ({
      ...image,
      altText: customerFacingName,
      sortOrder: index,
      isPrimary: index === 0,
    }))
    const imageAliases = getCatalogProductImageAliases(normalizedImages)

    const common = {
      name: customerFacingName,
      description: form.description.trim() || undefined,
      category: form.category,
      occasionTags: [...new Set([form.category, ...form.occasionTags])],
      productType: form.productType.trim() || undefined,
      collectionSeries: collection || undefined,
      pricingType: form.pricingType,
      orderType: form.orderType,
      material: form.material,
      images: normalizedImages,
      ...imageAliases,
      isCustomizable: form.isCustomizable === 'yes',
      isActive: form.availability === 'active',
      variants: parsedVariants,
    }

    setIsSaving(true)
    try {
      const result = isEditMode && product
        ? await onUpdate({ productId: product.id, ...common })
        : await onCreate(common)
      if (result === false) {
        setErrors(['Perubahan belum tersimpan. Periksa pesan sinkronisasi Catalog, lalu coba lagi.'])
        return
      }
      onClose()
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Produk gagal disimpan. Coba lagi.'])
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={(nextOpen) => { if (!nextOpen) handleClose() }}
        size="workspace"
        title={
          <span className="inline-flex items-center gap-2">
            {isEditMode ? 'Edit produk' : 'Tambah produk'}
            {isDirty ? <span className="rounded-full bg-warning/10 px-2 py-1 text-2xs font-semibold text-warning">Belum disimpan</span> : null}
          </span>
        }
        description="Informasi umum dan varian ukuran diedit sebagai draft. Data baru tersimpan saat tombol Simpan dipilih."
        contentClassName="h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92vh]"
        headerClassName="shrink-0 border-b border-border/70 pb-4"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'info' | 'variants')} className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border/70 bg-surface-card px-0.5 py-2">
              <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                <TabsTrigger value="info">
                  Informasi Produk{infoDirty ? <span className="ml-2 size-2 rounded-full bg-warning" aria-label="Informasi produk berubah" /> : null}
                </TabsTrigger>
                <TabsTrigger value="variants">
                  Varian & Ukuran{variantsDirty ? <span className="ml-2 size-2 rounded-full bg-warning" aria-label="Varian berubah" /> : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-0.5 py-4 sm:px-1">
              {sourceChanged ? (
                <div className="mb-4 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">Data produk berubah di sesi lain</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Draft ini tidak ditimpa otomatis. Tutup dan buka ulang editor sebelum menyimpan agar perubahan terbaru tidak tertimpa.</p>
                </div>
              ) : null}
              <ValidationSummary errors={errors} />

              <TabsContent value="info" className="mt-0">
                <FormSection title="Informasi produk" description="Data umum produk dan foto utama. Foto varian diatur terpisah pada tab Varian & Ukuran.">
                  <CatalogProductDetailsSection
                    form={form}
                    product={product}
                    categoryOptions={categoryOptions}
                    arrangementTypeOptions={arrangementTypeOptions}
                    setForm={setForm}
                    readOnlyInputClass={readOnlyInputClass}
                    labelClass={labelClass}
                  />
                </FormSection>
              </TabsContent>

              <TabsContent value="variants" className="mt-0">
                <FormSection
                  title="Varian & ukuran"
                  description={sizeTemplate
                    ? 'Template: ' + sizeTemplate.name + '. Slot ukuran tidak membuat varian sampai dikonfigurasi.'
                    : usableSizeTemplates.length > 0
                      ? 'Template ukuran tersedia, tetapi belum ditetapkan untuk jenis rangkaian ini. Atur di Template ukuran → Penetapan.'
                      : 'Belum ada template ukuran yang memiliki ukuran aktif.'}
                >
                  {usingUnassignedNewProductFallback ? (
                    <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">Menggunakan {sizeTemplate?.name}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Ini satu-satunya template dengan ukuran aktif. Tetapkan sebagai default Jenis rangkaian di Template ukuran → Penetapan agar produk berikutnya memakai template yang sama secara eksplisit.</p>
                    </div>
                  ) : null}
                  <CatalogVariantsSection
                    variants={form.variants}
                    sizeTemplate={sizeTemplate}
                    updateVariant={updateVariant}
                    addVariant={addVariantRow}
                    removeVariant={removeVariantRow}
                    productName={form.name}
                  />
                </FormSection>
              </TabsContent>
            </div>
          </Tabs>

          <ActionFooter className="shrink-0 border-t border-border bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <button type="button" onClick={handleClose} disabled={isSaving} className="inline-flex h-11 items-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">Batal</button>
            <button type="submit" disabled={isSaving || sourceChanged} className="inline-flex h-11 items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? 'Menyimpan…' : isEditMode ? 'Simpan perubahan' : 'Simpan produk'}
            </button>
          </ActionFooter>
        </form>
      </AppSheet>

      <ConfirmActionDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Buang perubahan?"
        description="Perubahan draft produk yang belum disimpan akan hilang. Foto yang baru dipilih belum diunggah ke server."
        confirmLabel="Buang perubahan"
        cancelLabel="Lanjut edit"
        destructive
        onConfirm={onClose}
      />
    </>
  )
}

export default CatalogItemFormSheet
