import type { Dispatch, FC, SetStateAction } from 'react'
import type { CatalogCategory, CatalogMaterial, CatalogProduct } from '../../store/catalogStoreTypes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { CatalogFormState } from './CatalogItemFormSheet'
import { CatalogProductImagesField } from './CatalogProductImagesField'

interface Props {
  form: CatalogFormState
  product?: CatalogProduct | null
  categoryOptions: CatalogCategory[]
  arrangementTypeOptions: string[]
  setForm: Dispatch<SetStateAction<CatalogFormState>>
  readOnlyInputClass: string
  labelClass: string
  fieldErrors?: Partial<Record<'name' | 'category' | 'productType', string>>
}

const inputClass = 'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const selectClass = 'h-11 rounded-xl border border-border bg-card px-3.5 text-sm shadow-none'

export const CatalogProductDetailsSection: FC<Props> = ({
  form,
  product,
  categoryOptions,
  arrangementTypeOptions,
  setForm,
  readOnlyInputClass,
  labelClass,
  fieldErrors = {},
}) => {
  const update = <K extends keyof CatalogFormState>(field: K, value: CatalogFormState[K]) =>
    setForm((previous) => ({ ...previous, [field]: value }))

  const toggleOccasion = (occasion: CatalogCategory) => {
    setForm((previous) => {
      const current = new Set(previous.occasionTags)
      if (current.has(occasion)) current.delete(occasion)
      else current.add(occasion)
      current.add(previous.category)
      return { ...previous, occasionTags: [...current] }
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <CatalogProductImagesField
        images={form.images}
        onChange={(images) => update('images', images)}
        productName={form.name}
        kind="catalog"
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {product ? (
          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelClass}>Product ID</label>
            <input value={product.productId} disabled className={readOnlyInputClass} />
            <p className="text-xs text-muted-foreground">Generated automatically by the system and never changes.</p>
          </div>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <label className={labelClass}>Product name · Required</label>
          <input
            id="catalog-product-name"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="Example: Omakase - Bridal Bouquet"
            className={inputClass + (fieldErrors.name ? ' border-destructive focus:border-destructive focus:ring-destructive/20' : '')}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'catalog-product-name-error' : undefined}
          />
          {fieldErrors.name ? <p id="catalog-product-name-error" className="text-xs text-destructive" role="alert">{fieldErrors.name}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Primary moment · Required</label>
          <Select
            value={form.category}
            onValueChange={(value) => setForm((previous) => ({
              ...previous,
              category: value,
              occasionTags: [...new Set([value, ...previous.occasionTags])],
            }))}
          >
            <SelectTrigger
              id="catalog-product-category"
              className={selectClass + (fieldErrors.category ? ' border-destructive focus:ring-destructive/20' : '')}
              aria-invalid={Boolean(fieldErrors.category)}
              aria-describedby={fieldErrors.category ? 'catalog-product-category-error' : undefined}
            ><SelectValue placeholder="Select moment" /></SelectTrigger>
            <SelectContent>{categoryOptions.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
          </Select>
          {fieldErrors.category ? <p id="catalog-product-category-error" className="text-xs text-destructive" role="alert">{fieldErrors.category}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Material · Required</label>
          <Select value={form.material} onValueChange={(value) => update('material', value as CatalogMaterial)}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fresh">Fresh</SelectItem>
              <SelectItem value="artificial">Artificial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Arrangement type · Required</label>
          <Select value={form.productType} onValueChange={(value) => update('productType', value)}>
            <SelectTrigger
              id="catalog-product-type"
              className={selectClass + (fieldErrors.productType ? ' border-destructive focus:ring-destructive/20' : '')}
              aria-invalid={Boolean(fieldErrors.productType)}
              aria-describedby={fieldErrors.productType ? 'catalog-product-type-error' : undefined}
            ><SelectValue placeholder="Select arrangement type" /></SelectTrigger>
            <SelectContent>{arrangementTypeOptions.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
          </Select>
          {fieldErrors.productType ? <p id="catalog-product-type-error" className="text-xs text-destructive" role="alert">{fieldErrors.productType}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Collection / Series</label>
          <input value={form.collectionSeries} onChange={(event) => update('collectionSeries', event.target.value)} placeholder="Example: Omakase" className={inputClass} />
          <p className="text-xs text-muted-foreground">Stored separately; Storefront name follows Collection / Series - Product Name.</p>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Pricing type</label>
          <Select value={form.pricingType} onValueChange={(value) => update('pricingType', value as CatalogFormState['pricingType'])}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Fixed">Fixed price</SelectItem>
              <SelectItem value="Starts From">Starts from</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Order type</label>
          <Select value={form.orderType} onValueChange={(value) => update('orderType', value as CatalogFormState['orderType'])}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Catalog">Catalog</SelectItem>
              <SelectItem value="Custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <label className={labelClass}>Moment tags</label>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((occasion) => {
              const checked = form.occasionTags.includes(occasion)
              return (
                <button
                  key={occasion}
                  type="button"
                  onClick={() => toggleOccasion(occasion)}
                  className={'min-h-11 rounded-full border px-4 text-sm font-medium transition ' + (checked
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted')}
                >
                  {occasion}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">Products can appear in multiple moments. The primary moment is always included.</p>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Availability · Required</label>
          <Select value={form.availability} onValueChange={(value) => update('availability', value as 'active' | 'inactive')}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Customization</label>
          <Select value={form.isCustomizable} onValueChange={(value) => update('isCustomizable', value as 'yes' | 'no')}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">Not customizable</SelectItem>
              <SelectItem value="yes">Customizable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className={labelClass}>Description</label>
          <textarea
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Write information customers and staff should know about this product."
            rows={4}
            className={inputClass + ' h-auto resize-y py-3 leading-5'}
          />
        </div>
      </div>
    </div>
  )
}
