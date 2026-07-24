import type { FC, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { BranchId } from '../../types/orders'
import type { StockCategory, StockItem, StockSubCategory } from '../../store/stockStore'
import { StockItemFields } from './StockItemFields'
import { AppSheet } from '../ui/app-sheet'
import { ActionFooter } from '../ui/action-footer'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { ValidationSummary } from '../ui/form-patterns'

export interface StockItemFormSheetProps {
  open: boolean
  onClose: () => void
  activeBranch: BranchId
  item?: StockItem | null
  onCreate: (params: { name:string; branch:BranchId; category:StockCategory; subCategory?:StockSubCategory; availableQty:number; reservedQty:number; unit:string; lowStockThreshold:number; isPerishable:boolean; expiryDate?:string }) => void
  onUpdate: (params: { itemId:string; name:string; availableQty:number; reservedQty:number; lowStockThreshold:number; unit:string; category:StockCategory; subCategory?:StockSubCategory; isPerishable:boolean; expiryDate?:string }) => void
}

export const FLOWER_PRODUCT_CATEGORIES: StockCategory[] = ['Arrangement', 'Bouquet']

export interface StockFormState {
  name:string; category:StockCategory; subCategory:StockSubCategory; availableQty:string; reservedQty:string; unit:string; lowStockThreshold:string; isPerishable:'yes'|'no'; expiryDate:string
}

const emptyFormState = (category: StockCategory = 'Arrangement'): StockFormState => ({ name:'', category, subCategory:'fresh_flower', availableQty:'', reservedQty:'', unit:'stems', lowStockThreshold:'', isPerishable:'yes', expiryDate:'' })
const formStateFromItem = (item: StockItem): StockFormState => ({ name:item.name, category:item.category, subCategory:item.subCategory ?? 'fresh_flower', availableQty:item.availableQty.toString(), reservedQty:item.reservedQty.toString(), unit:item.unit, lowStockThreshold:item.lowStockThreshold.toString(), isPerishable:item.isPerishable ? 'yes' : 'no', expiryDate:item.expiryDate ?? '' })

export const StockItemFormSheet: FC<StockItemFormSheetProps> = ({ open, onClose, activeBranch, item, onCreate, onUpdate }) => {
  const isEditMode = Boolean(item)
  const initialForm = useMemo(() => item ? formStateFromItem(item) : emptyFormState(), [item])
  const [form, setForm] = useState<StockFormState>(initialForm)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initialForm)
    setErrors([])
    setConfirmClose(false)
  }, [open, initialForm])

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm)
  const requestClose = () => isDirty ? setConfirmClose(true) : onClose()
  const showSubCategory = FLOWER_PRODUCT_CATEGORIES.includes(form.category)

  const validate = () => {
    const next: string[] = []
    if (!form.name.trim()) next.push('Product name is required.')
    const available = Number.parseInt(form.availableQty, 10)
    if (!Number.isFinite(available) || available < 0) next.push('Available quantity must be 0 or more.')
    const reserved = Number.parseInt(form.reservedQty || '0', 10)
    if (!Number.isFinite(reserved) || reserved < 0) next.push('Reserved quantity must be 0 or more.')
    if (Number.isFinite(available) && Number.isFinite(reserved) && reserved > available) next.push('Reserved quantity cannot exceed available quantity.')
    const threshold = Number.parseInt(form.lowStockThreshold || '0', 10)
    if (!Number.isFinite(threshold) || threshold < 0) next.push('Low-stock threshold must be 0 or more.')
    if (!form.unit.trim()) next.push('Unit is required.')
    setErrors(next)
    return next.length === 0
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    const availableQty = Number.parseInt(form.availableQty, 10)
    const reservedQty = Number.parseInt(form.reservedQty || '0', 10)
    const lowStockThreshold = Number.parseInt(form.lowStockThreshold || '0', 10)
    const isPerishable = form.isPerishable === 'yes'
    const expiryDate = isPerishable && form.expiryDate.trim() ? form.expiryDate.trim() : undefined
    const subCategory = showSubCategory ? form.subCategory : undefined
    if (isEditMode && item) onUpdate({ itemId:item.id, name:form.name.trim(), availableQty, reservedQty, lowStockThreshold, unit:form.unit.trim(), category:form.category, subCategory, isPerishable, expiryDate })
    else onCreate({ name:form.name.trim(), branch:activeBranch, category:form.category, subCategory, availableQty, reservedQty, unit:form.unit.trim(), lowStockThreshold, isPerishable, expiryDate })
    onClose()
  }

  return <>
    <AppSheet
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}
      title={isEditMode ? 'Edit stock item' : 'New stock item'}
      description={`${activeBranch} · Required fields are marked with *.`}
      contentClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4">
          <ValidationSummary errors={errors} />
          <StockItemFields form={form} setForm={setForm} showSubCategory={showSubCategory} />
        </div>
        <ActionFooter className="border-t border-border bg-surface-footer py-3">
          <button type="button" onClick={requestClose} className="rounded-full text-sm font-medium text-muted-foreground hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Cancel</button>
          <button type="submit" className="rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-ios-sm hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">{isEditMode ? 'Save changes' : 'Add stock item'}</button>
        </ActionFooter>
      </form>
    </AppSheet>
    <ConfirmActionDialog open={confirmClose} onOpenChange={setConfirmClose} title="Discard unsaved changes?" description="Unsaved stock changes will be lost." confirmLabel="Discard changes" cancelLabel="Continue editing" destructive onConfirm={onClose} />
  </>
}

export default StockItemFormSheet
