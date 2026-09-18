import type { Dispatch, FC, SetStateAction } from 'react'
import type { KatalogCategory, KatalogMaterial, KatalogProduct } from '../../store/catalogStoreTypes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { KatalogFormState } from './KatalogItemFormSheet'
import { KatalogProductImagesField } from './KatalogProductImagesField'

interface Props {
  form: KatalogFormState
  product?: KatalogProduct | null
  categoryOptions: KatalogCategory[]
  arrangementTypeOptions: string[]
  setForm: Dispatch<SetStateAction<KatalogFormState>>
  readOnlyInputClass: string
  labelClass: string
}

const inputClass = 'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const selectClass = 'h-11 rounded-xl border border-border bg-card px-3.5 text-sm shadow-none'

export const KatalogProductDetailsSection: FC<Props> = ({ form, product, categoryOptions, arrangementTypeOptions, setForm, readOnlyInputClass, labelClass }) => {
  const update = <K extends keyof KatalogFormState>(field: K, value: KatalogFormState[K]) =>
    setForm((previous) => ({ ...previous, [field]: value }))

  const toggleOccasion = (occasion: KatalogCategory) => {
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
      <KatalogProductImagesField images={form.images} onChange={(images) => update('images', images)} productName={form.name} />
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {product && <div className="space-y-1.5 sm:col-span-2"><label className={labelClass}>ID Produk</label><input value={product.productId} disabled className={readOnlyInputClass} /><p className="text-xs text-muted-foreground">Dibuat otomatis oleh sistem dan tidak berubah.</p></div>}

        <div className="space-y-1.5 sm:col-span-2"><label className={labelClass}>Nama produk · Wajib</label><input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Contoh: Omakase - Bridal Bouquet" className={inputClass} /></div>

        <div className="space-y-1.5"><label className={labelClass}>Occasion utama · Wajib</label><Select value={form.category} onValueChange={(value) => setForm((previous) => ({ ...previous, category: value, occasionTags: [...new Set([value, ...previous.occasionTags])] }))}><SelectTrigger className={selectClass}><SelectValue placeholder="Pilih occasion" /></SelectTrigger><SelectContent>{categoryOptions.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>

        <div className="space-y-1.5"><label className={labelClass}>Jenis material · Wajib</label><Select value={form.material} onValueChange={(value) => update('material', value as KatalogMaterial)}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fresh">Segar</SelectItem><SelectItem value="artificial">Artifisial</SelectItem></SelectContent></Select></div>

        <div className="space-y-1.5"><label className={labelClass}>Jenis rangkaian · Wajib</label><Select value={form.productType} onValueChange={(value) => update('productType', value)}><SelectTrigger className={selectClass}><SelectValue placeholder="Pilih jenis rangkaian" /></SelectTrigger><SelectContent>{arrangementTypeOptions.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><label className={labelClass}>Koleksi / Seri</label><input value={form.collectionSeries} onChange={(event) => update('collectionSeries', event.target.value)} placeholder="Contoh: Omakase" className={inputClass} /><p className="text-xs text-muted-foreground">Saved separately; the storefront name follows Koleksi / Seri - Product Name.</p></div>

        <div className="space-y-1.5"><label className={labelClass}>Jenis harga</label><Select value={form.pricingType} onValueChange={(value) => update('pricingType', value as KatalogFormState['pricingType'])}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Fixed">Fixed</SelectItem><SelectItem value="Mulai dari">Mulai dari</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><label className={labelClass}>Jenis pesanan</label><Select value={form.orderType} onValueChange={(value) => update('orderType', value as KatalogFormState['orderType'])}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Katalog">Katalog</SelectItem><SelectItem value="Kustom">Kustom</SelectItem></SelectContent></Select></div>

        <div className="space-y-2 sm:col-span-2"><label className={labelClass}>Tag occasion</label><div className="flex flex-wrap gap-2">{categoryOptions.map((occasion) => { const checked=form.occasionTags.includes(occasion); return <button key={occasion} type="button" onClick={() => toggleOccasion(occasion)} className={`min-h-10 rounded-full border px-4 text-sm font-medium transition ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}>{occasion}</button> })}</div><p className="text-xs text-muted-foreground">Produk dapat tampil di beberapa occasion. Occasion utama selalu ikut disertakan.</p></div>

        <div className="space-y-1.5"><label className={labelClass}>Ketersediaan · Wajib</label><Select value={form.availability} onValueChange={(value) => update('availability', value as 'active' | 'inactive')}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Aktif</SelectItem><SelectItem value="inactive">Nonaktif</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><label className={labelClass}>Kustomization</label><Select value={form.isKustomizable} onValueChange={(value) => update('isKustomizable', value as 'yes' | 'no')}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">Tidak dapat dikustomisasi</SelectItem><SelectItem value="yes">Kustomizable</SelectItem></SelectContent></Select></div>

        <div className="space-y-1.5 sm:col-span-2"><label className={labelClass}>Deskripsi</label><textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Tulis informasi yang perlu diketahui pelanggan dan staf tentang produk ini." rows={4} className={`${inputClass} h-auto resize-y py-3 leading-5`} /></div>
      </div>
    </div>
  )
}
