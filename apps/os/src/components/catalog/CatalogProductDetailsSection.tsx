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
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {product ? (
          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelClass}>ID produk</label>
            <input value={product.productId} disabled className={readOnlyInputClass} />
            <p className="text-xs text-muted-foreground">Dibuat otomatis oleh sistem dan tidak berubah.</p>
          </div>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <label className={labelClass}>Nama produk · Wajib</label>
          <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Contoh: Omakase - Bridal Bouquet" className={inputClass} />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Occasion utama · Wajib</label>
          <Select
            value={form.category}
            onValueChange={(value) => setForm((previous) => ({
              ...previous,
              category: value,
              occasionTags: [...new Set([value, ...previous.occasionTags])],
            }))}
          >
            <SelectTrigger className={selectClass}><SelectValue placeholder="Pilih occasion" /></SelectTrigger>
            <SelectContent>{categoryOptions.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Jenis material · Wajib</label>
          <Select value={form.material} onValueChange={(value) => update('material', value as CatalogMaterial)}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fresh">Segar</SelectItem>
              <SelectItem value="artificial">Artifisial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Jenis rangkaian · Wajib</label>
          <Select value={form.productType} onValueChange={(value) => update('productType', value)}>
            <SelectTrigger className={selectClass}><SelectValue placeholder="Pilih jenis rangkaian" /></SelectTrigger>
            <SelectContent>{arrangementTypeOptions.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Koleksi / Seri</label>
          <input value={form.collectionSeries} onChange={(event) => update('collectionSeries', event.target.value)} placeholder="Contoh: Omakase" className={inputClass} />
          <p className="text-xs text-muted-foreground">Disimpan terpisah; nama Storefront mengikuti Koleksi / Seri - Nama Produk.</p>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Jenis harga</label>
          <Select value={form.pricingType} onValueChange={(value) => update('pricingType', value as CatalogFormState['pricingType'])}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Fixed">Harga tetap</SelectItem>
              <SelectItem value="Starts From">Mulai dari</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Jenis pesanan</label>
          <Select value={form.orderType} onValueChange={(value) => update('orderType', value as CatalogFormState['orderType'])}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Catalog">Katalog</SelectItem>
              <SelectItem value="Custom">Kustom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <label className={labelClass}>Tag occasion</label>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((occasion) => {
              const checked = form.occasionTags.includes(occasion)
              return (
                <button
                  key={occasion}
                  type="button"
                  onClick={() => toggleOccasion(occasion)}
                  className={'min-h-10 rounded-full border px-4 text-sm font-medium transition ' + (checked
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted')}
                >
                  {occasion}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">Produk dapat tampil di beberapa occasion. Occasion utama selalu ikut disertakan.</p>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Ketersediaan · Wajib</label>
          <Select value={form.availability} onValueChange={(value) => update('availability', value as 'active' | 'inactive')}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="inactive">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Kustomisasi</label>
          <Select value={form.isCustomizable} onValueChange={(value) => update('isCustomizable', value as 'yes' | 'no')}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">Tidak dapat dikustomisasi</SelectItem>
              <SelectItem value="yes">Dapat dikustomisasi</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className={labelClass}>Deskripsi</label>
          <textarea
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Tulis informasi yang perlu diketahui pelanggan dan staf tentang produk ini."
            rows={4}
            className={inputClass + ' h-auto resize-y py-3 leading-5'}
          />
        </div>
      </div>
    </div>
  )
}
