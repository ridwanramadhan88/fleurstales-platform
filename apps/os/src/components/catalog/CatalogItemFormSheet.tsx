/**
 * @file CatalogItemFormSheet.tsx
 * @description Focused create/edit sheet for essential Catalog product data.
 * Promo, featured placement, and inventory recipes are intentionally managed
 * outside this form so creating a sellable product stays fast and readable.
 */

import type { FC, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type {
  CatalogCategory,
  CatalogMaterial,
  CatalogProduct,
  CatalogProductImage,
  CatalogVariantStatus,
} from '../../store/catalogStoreTypes'
import type {
  NewCatalogProductInput,
  NewCatalogVariantInput,
} from '../../store/catalogStore'
import { CatalogProductDetailsSection } from './CatalogProductDetailsSection'
import { CatalogVariantsSection } from './CatalogVariantsSection'
import { AppSheet } from '../ui/app-sheet'
import { ActionFooter } from '../ui/action-footer'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { FormSection, ValidationSummary } from '../ui/form-patterns'
import { getCatalogProductImageAliases, normalizeCatalogProductImages } from '../../domain/catalogImageDomain'

export interface CatalogItemFormSheetProps {
  open: boolean
  onClose: () => void
  product?: CatalogProduct | null
  categoryOptions: CatalogCategory[]
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
  size: string
  price: string
  cost: string
  status: CatalogVariantStatus
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
  price: '',
  cost: '',
  status: 'active',
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
  variants: [emptyVariantRow()],
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
    size: variant.size,
    price: variant.price.toString(),
    cost: variant.cost?.toString() ?? '',
    status: variant.status,
  })),
})

const readOnlyInputClass =
  'h-11 w-full rounded-xl border border-border bg-muted px-3.5 text-sm text-muted-foreground'
const labelClass = 'text-sm font-medium text-foreground'

export const CatalogItemFormSheet: FC<CatalogItemFormSheetProps> = ({
  open,
  onClose,
  product,
  categoryOptions,
  onCreate,
  onUpdate,
}) => {
  const isEditMode = Boolean(product)
  const defaultCategory = categoryOptions[0] ?? ''
  const initialForm = useMemo(
    () => (product ? formFromProduct(product) : emptyForm(defaultCategory)),
    [product, defaultCategory],
  )
  const [form, setForm] = useState<CatalogFormState>(initialForm)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initialForm)
    setErrors([])
    setConfirmClose(false)
  }, [open, initialForm])

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm)
  const handleClose = () => (isDirty ? setConfirmClose(true) : onClose())

  if (!open) return null

  const updateVariant = (index: number, patch: Partial<VariantRow>) => {
    setForm((previous) => ({
      ...previous,
      variants: previous.variants.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }))
  }

  const addVariantRow = () => {
    setForm((previous) => ({
      ...previous,
      variants: [...previous.variants, emptyVariantRow()],
    }))
  }

  const removeVariantRow = (index: number) => {
    setForm((previous) => ({
      ...previous,
      variants: previous.variants.filter((_, rowIndex) => rowIndex !== index),
    }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: string[] = []
    if (!form.name.trim()) nextErrors.push('Product name is required.')
    if (!form.category) nextErrors.push('Main occasion is required.')
    if (form.variants.length === 0) nextErrors.push('Add at least one product variant.')

    const parsedVariants: NewCatalogVariantInput[] = []
    form.variants.forEach((row, index) => {
      if (!row.size.trim()) nextErrors.push(`Variant ${index + 1} needs a size name.`)
      const price = Number.parseInt(row.price, 10)
      if (!Number.isFinite(price) || price <= 0) {
        nextErrors.push(`Variant ${index + 1} needs a selling price above Rp0.`)
      }
      const costParsed = row.cost.trim() ? Number.parseInt(row.cost, 10) : undefined
      if (costParsed !== undefined && (!Number.isFinite(costParsed) || costParsed < 0)) {
        nextErrors.push(`Variant ${index + 1} has an invalid cost.`)
      }
      if (row.size.trim() && Number.isFinite(price) && price > 0) {
        parsedVariants.push({
          size: row.size.trim(),
          price,
          cost: costParsed,
          status: row.status,
          ...(row.id ? { id: row.id } : {}),
          ...(row.sku ? { sku: row.sku } : {}),
        })
      }
    })

    if (!parsedVariants.some((variant) => variant.status === 'active')) {
      nextErrors.push('At least one variant must be active.')
    }

    setErrors([...new Set(nextErrors)])
    if (nextErrors.length) return

    const collection = form.collectionSeries.trim()
    const typedName = form.name.trim()
    const unprefixedName = collection && typedName.toLowerCase().startsWith(`${collection.toLowerCase()} - `)
      ? typedName.slice(collection.length + 3).trim()
      : typedName
    const customerFacingName = collection ? `${collection} - ${unprefixedName}` : typedName

    const normalizedImages = form.images
      .slice(0, 6)
      .map((image, index) => ({ ...image, altText: customerFacingName, sortOrder: index, isPrimary: index === 0 }))
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

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose()
        }}
        title={isEditMode ? 'Edit product' : 'New product'}
        description={
          isEditMode
            ? 'Update the essential product information customers and staff use.'
            : 'Add product information and at least one sellable size.'
        }
        contentClassName="h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[88vh] sm:max-w-5xl"
        headerClassName="shrink-0 border-b border-border/70 pb-4"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-0.5 py-4 sm:px-1">
            <ValidationSummary errors={errors} />
            <FormSection
              title="Product information"
              description="Core product details used throughout the Catalog and Orders."
            >
              <CatalogProductDetailsSection
                form={form}
                product={product}
                categoryOptions={categoryOptions}
                setForm={setForm}
                readOnlyInputClass={readOnlyInputClass}
                labelClass={labelClass}
              />
            </FormSection>

            <FormSection
              title="Variants"
              description="Add at least one active sellable size and selling price."
            >
              <CatalogVariantsSection
                variants={form.variants}
                updateVariant={updateVariant}
                addVariant={addVariantRow}
                removeVariant={removeVariantRow}
              />
            </FormSection>
          </div>

          <ActionFooter className="shrink-0 border-t border-border bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-11 items-center rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90"
            >
              {isEditMode ? 'Save changes' : 'Add product'}
            </button>
          </ActionFooter>
        </form>
      </AppSheet>
      <ConfirmActionDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard unsaved changes?"
        description="Unsaved product changes will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Continue editing"
        destructive
        onConfirm={onClose}
      />
    </>
  )
}

export default CatalogItemFormSheet
