/**
 * @file InventoryDialogs.tsx
 * @description Dialogs for the inventory screen: item, supplier, purchase and
 * waste. Every save goes through the server; the parent reloads afterwards.
 */

import { useEffect, useState, type FC, type ReactNode } from 'react'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { todayIsoDate } from '../../store/hrStore'
import { useSettingsStore } from '../../store/settingsStore'
import { recordInventoryPurchase, recordInventoryWaste, saveInventoryItem, saveInventorySupplier } from '../../data/inventorySupabase'
import {
  INVENTORY_CATEGORIES, WASTE_REASONS, computePurchaseTotal, formatRupiah, getInventoryCategoryLabel, getWasteReasonLabel, validatePurchaseDraft, validateWasteDraft,
  type InventoryCategory, type InventoryItem, type InventorySupplier, type WasteReason,
} from '../../domain/inventoryDomain'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

const inputClass = 'mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-primary/50'

const Field: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <label className="block text-xs font-semibold text-muted-foreground">{label}{children}</label>
)

const errorText = (caught: unknown, fallback: string): string => (caught instanceof Error && caught.message ? caught.message : fallback)

interface ShellProps { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; testId: string }
const Shell: FC<ShellProps> = ({ open, title, description, onClose, children, testId }) => (
  <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="sm:max-w-md" data-testid={testId}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
)

const Actions: FC<{ saving: boolean; disabled: boolean; onClose: () => void; onSave: () => void; error: string | null; saveLabel?: string }> = ({ saving, disabled, onClose, onSave, error, saveLabel }) => {
  const tr = useBilingualCopy()
  return (
    <>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>{tr('Cancel', 'Batal')}</Button>
        <Button type="button" onClick={onSave} disabled={saving || disabled}>{saving ? tr('Saving…', 'Menyimpan…') : (saveLabel ?? tr('Save', 'Simpan'))}</Button>
      </div>
    </>
  )
}

export interface DialogBase { open: boolean; onClose: () => void; onSaved: () => void }

export const InventoryItemDialog: FC<DialogBase & { item: InventoryItem | null; branchId: string }> = ({ open, onClose, onSaved, item, branchId }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<InventoryCategory>('flowers')
  const [unit, setUnit] = useState('tangkai')
  const [threshold, setThreshold] = useState('0')
  const [perishable, setPerishable] = useState(true)
  const [archived, setArchived] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(item?.name ?? ''); setCategory(item?.category ?? 'flowers'); setUnit(item?.unit ?? 'tangkai')
    setThreshold(String(item?.lowStockThreshold ?? 0)); setPerishable(item?.isPerishable ?? true); setArchived(item?.isArchived ?? false); setError(null)
  }, [open, item])

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await saveInventoryItem({ id: item?.id, branchId: item?.branchId ?? branchId, name, category, unit, lowStockThreshold: Number(threshold) || 0, isPerishable: perishable, isArchived: archived })
      onSaved(); onClose()
    } catch (caught) { setError(errorText(caught, tr('Could not save the item.', 'Item gagal disimpan.'))) } finally { setSaving(false) }
  }

  return (
    <Shell open={open} onClose={onClose} testId="inventory-item-dialog" title={item ? tr('Edit item', 'Ubah item') : tr('New item', 'Item baru')}
      description={tr('Stock quantity changes only through purchases and waste.', 'Jumlah stok hanya berubah lewat pembelian dan barang terbuang.')}>
      <Field label={tr('Name', 'Nama')}><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className={inputClass} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('Category', 'Kategori')}>
          <select value={category} onChange={(event) => setCategory(event.target.value as InventoryCategory)} className={inputClass}>
            {INVENTORY_CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{getInventoryCategoryLabel(entry.id, language)}</option>)}
          </select>
        </Field>
        <Field label={tr('Unit', 'Satuan')}><input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} className={inputClass} /></Field>
      </div>
      <Field label={tr('Low stock at or below', 'Stok menipis pada atau di bawah')}><input type="number" min={0} value={threshold} onChange={(event) => setThreshold(event.target.value)} className={inputClass} /></Field>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={perishable} onChange={(event) => setPerishable(event.target.checked)} />{tr('Perishable', 'Mudah layu / kedaluwarsa')}</label>
      {item && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />{tr('Archived (hidden from the list)', 'Diarsipkan (disembunyikan dari daftar)')}</label>}
      <Actions saving={saving} disabled={name.trim().length < 2 || unit.trim().length === 0} onClose={onClose} onSave={() => void save()} error={error} />
    </Shell>
  )
}

export const InventorySupplierDialog: FC<DialogBase & { supplier: InventorySupplier | null }> = ({ open, onClose, onSaved, supplier }) => {
  const tr = useBilingualCopy()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(supplier?.name ?? ''); setPhone(supplier?.phone ?? ''); setNote(supplier?.note ?? ''); setActive(supplier?.isActive ?? true); setError(null)
  }, [open, supplier])

  const save = async () => {
    setSaving(true); setError(null)
    try { await saveInventorySupplier({ id: supplier?.id, name, phone, note, isActive: active }); onSaved(); onClose() }
    catch (caught) { setError(errorText(caught, tr('Could not save the supplier.', 'Pemasok gagal disimpan.'))) } finally { setSaving(false) }
  }

  return (
    <Shell open={open} onClose={onClose} testId="inventory-supplier-dialog" title={supplier ? tr('Edit supplier', 'Ubah pemasok') : tr('New supplier', 'Pemasok baru')}>
      <Field label={tr('Name', 'Nama')}><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className={inputClass} /></Field>
      <Field label={tr('Phone', 'Telepon')}><input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} className={inputClass} /></Field>
      <Field label={tr('Note', 'Catatan')}><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} className={inputClass} /></Field>
      {supplier && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />{tr('Active', 'Aktif')}</label>}
      <Actions saving={saving} disabled={name.trim().length < 2} onClose={onClose} onSave={() => void save()} error={error} />
    </Shell>
  )
}

export const InventoryPurchaseDialog: FC<DialogBase & { items: InventoryItem[]; suppliers: InventorySupplier[]; presetItemId?: string }> = ({ open, onClose, onSaved, items, suppliers, presetItemId }) => {
  const tr = useBilingualCopy()
  const bankAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const today = todayIsoDate()
  const [itemId, setItemId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [accountId, setAccountId] = useState('cash:main')
  const [purchasedOn, setPurchasedOn] = useState(today)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accounts = [{ id: 'cash:main', label: tr('Cash', 'Kas') }, ...bankAccounts.filter((account) => account.isActive).map((account) => ({ id: account.id, label: `${account.bankName} · ${account.accountHolder}` }))]

  useEffect(() => {
    if (!open) return
    setItemId(presetItemId ?? ''); setSupplierId(''); setQuantity(''); setUnitCost(''); setAccountId('cash:main'); setPurchasedOn(today); setNote(''); setError(null)
  }, [open, presetItemId, today])

  const draft = { itemId, quantity: Number(quantity), unitCostIdr: Number(unitCost), fundingAccountId: accountId, purchasedOn }
  const problem = validatePurchaseDraft(draft, today)
  const total = problem ? 0 : computePurchaseTotal(draft.quantity, draft.unitCostIdr)

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await recordInventoryPurchase({ itemId, supplierId: supplierId || null, quantity: draft.quantity, unitCostIdr: draft.unitCostIdr, fundingAccountId: accountId, purchasedOn, note })
      onSaved(); onClose()
    } catch (caught) { setError(errorText(caught, tr('Could not record the purchase.', 'Pembelian gagal dicatat.'))) } finally { setSaving(false) }
  }

  return (
    <Shell open={open} onClose={onClose} testId="inventory-purchase-dialog" title={tr('Record a purchase', 'Catat pembelian')}
      description={tr('Stock is added now. Finance confirms the expense afterwards.', 'Stok langsung bertambah. Keuangan mengonfirmasi pengeluarannya setelah itu.')}>
      <Field label={tr('Item', 'Item')}>
        <select value={itemId} onChange={(event) => setItemId(event.target.value)} className={inputClass}>
          <option value="">{tr('Choose an item', 'Pilih item')}</option>
          {items.filter((item) => !item.isArchived).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
        </select>
      </Field>
      <Field label={tr('Supplier (optional)', 'Pemasok (opsional)')}>
        <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={inputClass}>
          <option value="">—</option>
          {suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('Quantity', 'Jumlah')}><input type="number" min={0} step="any" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} /></Field>
        <Field label={tr('Price per unit (Rp)', 'Harga per satuan (Rp)')}><input type="number" min={0} inputMode="numeric" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className={inputClass} /></Field>
      </div>
      <Field label={tr('Paid from', 'Dibayar dari')}>
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
      </Field>
      <Field label={tr('Purchase date', 'Tanggal pembelian')}><input type="date" max={today} value={purchasedOn} onChange={(event) => setPurchasedOn(event.target.value)} className={inputClass} /></Field>
      <Field label={tr('Note', 'Catatan')}><input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} className={inputClass} /></Field>
      {total > 0 && <p className="text-sm font-semibold">{tr('Total', 'Total')}: {formatRupiah(total)}</p>}
      <Actions saving={saving} disabled={problem !== null} onClose={onClose} onSave={() => void save()} error={error} saveLabel={tr('Record purchase', 'Catat pembelian')} />
    </Shell>
  )
}

export const InventoryWasteDialog: FC<DialogBase & { item: InventoryItem | null }> = ({ open, onClose, onSaved, item }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<WasteReason>('wilted')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) { setQuantity(''); setReason('wilted'); setNote(''); setError(null) } }, [open, item])

  const problem = item ? validateWasteDraft({ quantity: Number(quantity), reason, note }, item.quantity) : 'quantity'
  const value = item && !problem ? Math.round(Number(quantity) * (item.avgUnitCostIdr ?? 0)) : 0

  const save = async () => {
    if (!item) return
    setSaving(true); setError(null)
    try { await recordInventoryWaste({ itemId: item.id, quantity: Number(quantity), reason, note }); onSaved(); onClose() }
    catch (caught) { setError(errorText(caught, tr('Could not record the waste.', 'Barang terbuang gagal dicatat.'))) } finally { setSaving(false) }
  }

  return (
    <Shell open={open && item !== null} onClose={onClose} testId="inventory-waste-dialog" title={tr('Record waste', 'Catat barang terbuang')}
      description={item ? `${item.name} · ${tr('on hand', 'tersedia')} ${item.quantity} ${item.unit}` : undefined}>
      <Field label={tr('Quantity', 'Jumlah')}><input type="number" min={0} step="any" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} /></Field>
      <div role="radiogroup" aria-label={tr('Reason', 'Alasan')} className="flex flex-wrap gap-1.5">
        {WASTE_REASONS.map((entry) => (
          <button key={entry.id} type="button" role="radio" aria-checked={reason === entry.id} onClick={() => setReason(entry.id)}
            className={`min-h-10 rounded-full px-3.5 text-sm font-medium ${reason === entry.id ? 'bg-primary text-primary-foreground' : 'bg-surface-panel text-foreground hover:bg-accent'}`}>
            {getWasteReasonLabel(entry.id, language)}
          </button>
        ))}
      </div>
      <Field label={reason === 'other' ? tr('Note (required)', 'Catatan (wajib)') : tr('Note', 'Catatan')}><input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} className={inputClass} /></Field>
      {value > 0 && <p className="text-sm font-semibold">{tr('Value lost', 'Nilai terbuang')}: {formatRupiah(value)}</p>}
      <Actions saving={saving} disabled={problem !== null} onClose={onClose} onSave={() => void save()} error={error} />
    </Shell>
  )
}
