import type { Dispatch, FC, SetStateAction } from 'react'
import type { StockCategory, StockSubCategory } from '../../store/stockStore'
import { DatePickerField } from '../ui/date-time-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { FieldLabel, FormSection } from '../ui/form-patterns'
import type { StockFormState } from './StockItemFormSheet'

interface Props { form:StockFormState; setForm:Dispatch<SetStateAction<StockFormState>>; showSubCategory:boolean }
const inputClass = 'h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'

export const StockItemFields: FC<Props> = ({ form, setForm, showSubCategory }) => {
  const update = <K extends keyof StockFormState>(field: K, value: StockFormState[K]) => setForm((previous) => ({ ...previous, [field]: value }))
  return <div className="space-y-4">
    <FormSection title="Item information" description="Use a clear item name and unit.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required><input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Red rose" className={inputClass} autoFocus /></Field>
        <Field label="Unit" required><input value={form.unit} onChange={(e) => update('unit', e.target.value)} placeholder="stems, pieces, rolls..." className={inputClass} /></Field>
        <Field label="Category" required><Select value={form.category} onValueChange={(value) => update('category', value as StockCategory)}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{(['Arrangement','Bouquet','Flowers','Supplies','Other'] as StockCategory[]).map((category)=><SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></Field>
        {showSubCategory ? <Field label="Flower type" required><Select value={form.subCategory} onValueChange={(value)=>update('subCategory', value as StockSubCategory)}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fresh_flower">Fresh flower</SelectItem><SelectItem value="artificial_flower">Artificial flower</SelectItem></SelectContent></Select></Field> : null}
      </div>
    </FormSection>

    <FormSection title="Quantity and alerts" description="Reserved stock is committed. Set the low-stock alert.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Available quantity" required><input type="number" min={0} value={form.availableQty} onChange={(e)=>update('availableQty',e.target.value)} placeholder="0" className={inputClass} /></Field>
        <Field label="Reserved quantity"><input type="number" min={0} value={form.reservedQty} onChange={(e)=>update('reservedQty',e.target.value)} placeholder="0" className={inputClass} /></Field>
        <Field label="Low-stock threshold"><input type="number" min={0} value={form.lowStockThreshold} onChange={(e)=>update('lowStockThreshold',e.target.value)} placeholder="0" className={inputClass} /></Field>
      </div>
    </FormSection>

    <FormSection title="Freshness" description="Add expiry only for perishable items." optional>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Perishable"><Select value={form.isPerishable} onValueChange={(value)=>update('isPerishable',value as 'yes'|'no')}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></Field>
        {form.isPerishable === 'yes' ? <Field label="Expiry date"><DatePickerField value={form.expiryDate} onChange={(value)=>update('expiryDate',value)} className="h-10 rounded-lg bg-card text-sm" /></Field> : <div className="flex items-end"><p className="w-full rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">No expiry date is required.</p></div>}
      </div>
    </FormSection>
  </div>
}

const Field: FC<{ label:string; required?:boolean; children:React.ReactNode }> = ({ label, required, children }) => <label className="space-y-1.5"><FieldLabel required={required}>{label}</FieldLabel>{children}</label>
