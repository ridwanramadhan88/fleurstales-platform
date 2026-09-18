/**
 * @file CatalogItemFormSheet.tsx
 * @description Create/edit Catalog products with size-template-aware variants.
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
import { CATALOG_IMAGE_MAX_COUNT, getCatalogProductImageAliases, normalizeCatalogProductImages } from '../../domain/catalogImageDomain'
import { parseCatalogVariantLabel } from '../../domain/catalogVariantLabelDomain'

export interface CatalogItemFormSheetProps {
  open: boolean
  onClose: () => void
  product?: CatalogProduct | null
  categoryOptions: CatalogCategory[]
  arrangementTypeOptions: string[]
  onCreate: (params: NewCatalogProductInput) => void
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
  }) => void
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
  /** Legacy/base gallery retained until Batch 2 migration is complete. */
  images: CatalogProductImage[]
  variants: VariantRow[]
}

export const emptyVariantRow = (): VariantRow => ({ size: '', images: [], price: '', cost: '', status: 'active', flowerRecipe: [] })

const emptyForm = (defaultCategory: CatalogCategory): CatalogFormState => ({
  name: '', description: '', category: defaultCategory, material: 'fresh',
  occasionTags: defaultCategory ? [defaultCategory] : [], productType: '', collectionSeries: '',
  pricingType: 'Fixed', orderType: 'Catalog', isCustomizable: 'no', availability: 'active',
  images: [], variants: [emptyVariantRow()],
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
    flowerRecipe: (variant.flowerRecipe ?? []).map((item) => ({ id: item.id, flowerName: item.flowerName, quantity: String(item.quantity), unit: item.unit })),
  })),
})

const readOnlyInputClass = 'h-11 w-full rounded-xl border border-border bg-muted px-3.5 text-sm text-muted-foreground'
const labelClass = 'text-sm font-medium text-foreground'

export const CatalogItemFormSheet: FC<CatalogItemFormSheetProps> = ({ open, onClose, product, categoryOptions, arrangementTypeOptions, onCreate, onUpdate }) => {
  const sizeGuideTemplates = useCatalogStore((state) => state.sizeGuideTemplates)
  const sizeGuideTargets = useCatalogStore((state) => state.sizeGuideTargets)
  const isEditMode = Boolean(product)
  const defaultCategory = categoryOptions[0] ?? ''
  const initialForm = useMemo(() => product ? formFromProduct(product) : emptyForm(defaultCategory), [product, defaultCategory])
  const [form, setForm] = useState<CatalogFormState>(initialForm)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmClose, setConfirmClose] = useState(false)

  const sizeTemplate = useMemo(() => {
    const resolved = resolveCatalogSizeGuide(
      { id: product?.id ?? '__new__', productType: form.productType || undefined },
      sizeGuideTemplates,
      sizeGuideTargets,
      { includeLogical: true },
    )
    return resolved
  }, [form.productType, product?.id, sizeGuideTargets, sizeGuideTemplates])

  useEffect(() => {
    if (!open) return
    setForm(initialForm)
    setErrors([])
    setConfirmClose(false)
  }, [open, initialForm])

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm)
  const handleClose = () => (isDirty ? setConfirmClose(true) : onClose())
  if (!open) return null

  const updateVariant = (index: number, patch: Partial<VariantRow>) => setForm((previous) => ({ ...previous, variants: previous.variants.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }))
  const addVariantRow = () => setForm((previous) => ({ ...previous, variants: [...previous.variants, emptyVariantRow()] }))
  const removeVariantRow = (index: number) => setForm((previous) => ({ ...previous, variants: previous.variants.filter((_, rowIndex) => rowIndex !== index) }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: string[] = []
    if (!form.name.trim()) nextErrors.push('Nama produk wajib diisi.')
    if (!form.category) nextErrors.push('Occasion utama wajib dipilih.')
    if (!form.productType.trim()) nextErrors.push('Jenis rangkaian wajib dipilih.')
    if (form.variants.length === 0) nextErrors.push('Tambahkan minimal satu product variant.')

    const seenVariantIdentities = new Set<string>()
    const parsedVariants: NewCatalogVariantInput[] = []
    form.variants.forEach((row, index) => {
      const label = `Variant ${index + 1}`
      if (!row.size.trim()) nextErrors.push(`${label}: ukuran wajib dipilih.`)
      if (row.sizeOptionId) {
        const option = parseCatalogVariantLabel(row.size).option.trim().toLowerCase()
        const identity = `${row.sizeOptionId}::${option}`
        if (seenVariantIdentities.has(identity)) nextErrors.push(`${label}: kombinasi ukuran dan opsi yang sama tidak boleh dipakai dua kali.`)
        seenVariantIdentities.add(identity)
      }
      const price = Number.parseInt(row.price, 10)
      if (!Number.isFinite(price) || price <= 0) nextErrors.push(`${label}: harga jual harus lebih dari Rp0.`)
      const costParsed = row.cost.trim() ? Number.parseInt(row.cost, 10) : undefined
      if (costParsed !== undefined && (!Number.isFinite(costParsed) || costParsed < 0)) nextErrors.push(`${label}: cost tidak valid.`)
      const flowerRecipe = row.flowerRecipe.map((item, recipeIndex) => {
        const quantity = Number.parseFloat(item.quantity)
        if (!item.flowerName.trim()) nextErrors.push(`${label}, bunga ${recipeIndex + 1}: nama bunga wajib diisi.`)
        if (!Number.isFinite(quantity) || quantity <= 0) nextErrors.push(`${label}, bunga ${recipeIndex + 1}: jumlah harus lebih dari 0.`)
        return { id: item.id, flowerName: item.flowerName.trim(), quantity, unit: item.unit }
      }).filter((item) => item.flowerName && Number.isFinite(item.quantity) && item.quantity > 0)

      const variantImages = row.images.slice(0, CATALOG_IMAGE_MAX_COUNT).map((image, imageIndex) => ({
        ...image,
        altText: `${form.name.trim() || 'Product'} ${row.size.trim()}`,
        sortOrder: imageIndex,
        isPrimary: imageIndex === 0,
      }))
      if (row.size.trim() && Number.isFinite(price) && price > 0) parsedVariants.push({
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
    })
    if (!parsedVariants.some((variant) => variant.status === 'active')) nextErrors.push('Minimal satu variant harus berstatus Dijual.')
    setErrors([...new Set(nextErrors)])
    if (nextErrors.length) return

    const collection = form.collectionSeries.trim()
    const typedName = form.name.trim()
    const unprefixedName = collection && typedName.toLowerCase().startsWith(`${collection.toLowerCase()} - `) ? typedName.slice(collection.length + 3).trim() : typedName
    const customerFacingName = collection ? `${collection} - ${unprefixedName}` : typedName
    const normalizedImages = form.images.slice(0, CATALOG_IMAGE_MAX_COUNT).map((image, index) => ({ ...image, altText: customerFacingName, sortOrder: index, isPrimary: index === 0 }))
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
    if (isEditMode && product) onUpdate({ productId: product.id, ...common })
    else onCreate(common)
    onClose()
  }

  return <>
    <AppSheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose() }} size="workspace" title={isEditMode ? 'Edit product' : 'New product'} description="Data umum produk dan variant per ukuran." contentClassName="h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92vh]" headerClassName="shrink-0 border-b border-border/70 pb-4">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-0.5 py-4 sm:px-1">
          <ValidationSummary errors={errors} />
          <FormSection title="Informasi produk" description="Data umum produk. Foto produk lama tetap disimpan sebagai fallback selama transisi Batch 1.">
            <CatalogProductDetailsSection form={form} product={product} categoryOptions={categoryOptions} arrangementTypeOptions={arrangementTypeOptions} setForm={setForm} readOnlyInputClass={readOnlyInputClass} labelClass={labelClass} />
          </FormSection>
          <FormSection title="Ukuran & varian" description={`Template: ${sizeTemplate?.name ?? 'belum tersedia'}. Harga, foto dan resep disimpan per ukuran.`}>
            <CatalogVariantsSection variants={form.variants} sizeTemplateName={sizeTemplate?.name} updateVariant={updateVariant} addVariant={addVariantRow} removeVariant={removeVariantRow} productName={form.name} />
          </FormSection>
        </div>
        <ActionFooter className="shrink-0 border-t border-border bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={handleClose} className="inline-flex h-11 items-center rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Batal</button>
          <button type="submit" className="inline-flex h-11 items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm hover:bg-primary/90">{isEditMode ? 'Simpan perubahan' : 'Tambah produk'}</button>
        </ActionFooter>
      </form>
    </AppSheet>
    <ConfirmActionDialog open={confirmClose} onOpenChange={setConfirmClose} title="Buang perubahan?" description="Perubahan produk yang belum disimpan akan hilang." confirmLabel="Buang perubahan" cancelLabel="Lanjut edit" destructive onConfirm={onClose} />
  </>
}

export default CatalogItemFormSheet
