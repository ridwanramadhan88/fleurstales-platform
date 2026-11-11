/**
 * @file InventoryScreen.tsx
 * @description Server-backed inventory: stock lines per branch, purchases
 * (confirmed by Finance) and waste with a period report and Excel export.
 * Independent of the product catalog.
 */

import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Download, Plus, RefreshCw } from 'lucide-react'
import type { BranchFilter } from '../../types/orders'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { todayIsoDate } from '../../store/hrStore'
import { hasActionPermission } from '../../config/actionPermissions'
import { downloadTableXlsx, tableSheet, wibDateTime } from '../../lib/excelTableExport'
import { fetchInventoryOverview, fetchInventoryPurchases, fetchWasteReport } from '../../data/inventorySupabase'
import {
  formatRupiah, getInventoryCategoryLabel, getInventoryLevel, getWasteReasonLabel, summarizeInventory, wasteSharePercent,
  type InventoryItem, type InventoryOverview, type InventoryPurchase, type InventorySupplier, type WasteReport,
} from '../../domain/inventoryDomain'
import { StatusChip } from '../ui/chip'
import { surfaceCardClass } from '../ui/card'
import { InventoryItemDialog, InventoryPurchaseDialog, InventorySupplierDialog, InventoryWasteDialog } from './InventoryDialogs'

type Tab = 'stock' | 'purchases' | 'waste'

const shiftDate = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const InventoryScreen: FC<{ activeBranch: BranchFilter; searchQuery?: string }> = ({ activeBranch, searchQuery = '' }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const role = useUserStore((state) => state.role)
  const branches = useSettingsStore((state) => state.branches)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const permissions = useSettingsStore((state) => state.permissions)
  const canManage = hasActionPermission(role, 'inventory.manage', actionPermissions, permissions)
  const activeBranches = branches.filter((branch) => branch.isActive)
  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name ?? id

  const [tab, setTab] = useState<Tab>('stock')
  const [overview, setOverview] = useState<InventoryOverview>({ items: [], suppliers: [] })
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([])
  const [report, setReport] = useState<WasteReport | null>(null)
  const [rangeDays, setRangeDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [newItemBranch, setNewItemBranch] = useState('')
  const [itemDialog, setItemDialog] = useState<{ item: InventoryItem | null } | null>(null)
  const [supplierDialog, setSupplierDialog] = useState<{ supplier: InventorySupplier | null } | null>(null)
  const [purchaseDialog, setPurchaseDialog] = useState<{ itemId?: string } | null>(null)
  const [wasteItem, setWasteItem] = useState<InventoryItem | null>(null)

  const branchId = activeBranch === 'All' ? undefined : activeBranch
  const today = todayIsoDate()
  const reload = useCallback(() => setReloadKey((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const [stock, bought, waste] = await Promise.all([
          fetchInventoryOverview(branchId),
          fetchInventoryPurchases(),
          fetchWasteReport(shiftDate(today, -(rangeDays - 1)), today, branchId),
        ])
        if (cancelled) return
        setOverview(stock); setPurchases(bought.filter((purchase) => !branchId || purchase.branchId === branchId)); setReport(waste); setError(null)
      } catch {
        if (!cancelled) setError(tr('Inventory could not be loaded. Try again.', 'Inventori tidak bisa dimuat. Coba lagi.'))
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, rangeDays, reloadKey, today])

  const query = searchQuery.trim().toLowerCase()
  const items = useMemo(
    () => overview.items.filter((item) => (showArchived ? item.isArchived : !item.isArchived) && (!query || item.name.toLowerCase().includes(query))),
    [overview.items, showArchived, query],
  )
  const summary = useMemo(() => summarizeInventory(overview.items), [overview.items])
  const createBranch = branchId ?? (newItemBranch || activeBranches[0]?.id || '')

  const exportWaste = () => {
    if (!report) return
    downloadTableXlsx(`waste-${report.from}-${report.to}.xlsx`, [
      tableSheet('Waste', [
        { header: 'Tanggal', value: (row) => wibDateTime(row.createdAt) },
        { header: 'Cabang', value: (row) => row.branchName ?? row.branchId },
        { header: 'Item', value: (row) => row.itemName },
        { header: 'Jumlah', kind: 'number', value: (row) => row.quantity },
        { header: 'Satuan', value: (row) => row.unit },
        { header: 'Alasan', value: (row) => getWasteReasonLabel(row.reason, 'id') },
        { header: 'Catatan', value: (row) => row.note },
        { header: 'Nilai (Rp)', kind: 'money', value: (row) => row.valueIdr },
        { header: 'Dicatat oleh', value: (row) => row.recordedByName },
      ], report.rows),
    ])
  }

  return (
    <section data-testid="inventory-screen" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: tr('Items', 'Item'), value: String(summary.total) },
          { label: tr('Low stock', 'Stok menipis'), value: String(summary.low) },
          { label: tr('Out of stock', 'Habis'), value: String(summary.out) },
          { label: tr('Stock value', 'Nilai stok'), value: formatRupiah(summary.valueIdr) },
        ].map((card) => (
          <div key={card.label} className={surfaceCardClass('standard')}>
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-lg font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['stock', 'purchases', 'waste'] as const).map((id) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
            className={`min-h-10 rounded-full px-4 text-sm font-medium ${tab === id ? 'bg-primary text-primary-foreground' : 'bg-surface-panel text-foreground'}`}>
            {id === 'stock' ? tr('Stock', 'Stok') : id === 'purchases' ? tr('Purchases', 'Pembelian') : 'Waste'}
          </button>
        ))}
        <button type="button" onClick={reload} disabled={loading} aria-label={tr('Refresh', 'Muat ulang')} className="ml-auto flex size-10 items-center justify-center rounded-full border border-border disabled:opacity-50">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {tab === 'stock' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {canManage && activeBranch === 'All' && (
              <select aria-label={tr('Branch for the new item', 'Cabang untuk item baru')} value={createBranch} onChange={(event) => setNewItemBranch(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
                {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            )}
            {canManage && <button type="button" onClick={() => setItemDialog({ item: null })} disabled={!createBranch} className="flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"><Plus className="size-4" />{tr('New item', 'Item baru')}</button>}
            {canManage && <button type="button" onClick={() => setPurchaseDialog({})} className="min-h-10 rounded-full border border-border px-4 text-sm font-medium">{tr('Record purchase', 'Catat pembelian')}</button>}
            <label className="ml-auto flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />{tr('Archived', 'Diarsipkan')}</label>
          </div>
          {!loading && items.length === 0 && <p className="text-sm text-muted-foreground">{tr('No items yet.', 'Belum ada item.')}</p>}
          <ul className="space-y-2">
            {items.map((item) => {
              const level = getInventoryLevel(item)
              return (
                <li key={item.id} className={`${surfaceCardClass('standard')} flex flex-wrap items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[getInventoryCategoryLabel(item.category, language), activeBranch === 'All' ? branchName(item.branchId) : null, item.avgUnitCostIdr != null ? `${tr('avg', 'rata-rata')} ${formatRupiah(item.avgUnitCostIdr)}/${item.unit}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip tone={level === 'out' ? 'danger' : level === 'low' ? 'warning' : 'success'}>{item.quantity} {item.unit}</StatusChip>
                    {canManage && !item.isArchived && (
                      <>
                        <button type="button" onClick={() => setPurchaseDialog({ itemId: item.id })} className="min-h-10 px-2 text-sm font-medium text-primary underline">{tr('Buy', 'Beli')}</button>
                        <button type="button" onClick={() => setWasteItem(item)} disabled={item.quantity <= 0} className="min-h-10 px-2 text-sm font-medium text-primary underline disabled:opacity-40">Waste</button>
                      </>
                    )}
                    {canManage && <button type="button" onClick={() => setItemDialog({ item })} className="min-h-10 px-2 text-sm text-muted-foreground underline">{tr('Edit', 'Ubah')}</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {tab === 'purchases' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Suppliers', 'Supplier')}</h3>
              {canManage && <button type="button" onClick={() => setSupplierDialog({ supplier: null })} className="min-h-10 text-sm font-medium text-primary underline">{tr('Add supplier', 'Tambah supplier')}</button>}
            </div>
            {overview.suppliers.length === 0 && <p className="text-sm text-muted-foreground">{tr('No suppliers yet.', 'Belum ada supplier.')}</p>}
            <ul className="flex flex-wrap gap-2">
              {overview.suppliers.map((supplier) => (
                <li key={supplier.id}>
                  <button type="button" disabled={!canManage} onClick={() => setSupplierDialog({ supplier })} className={`min-h-10 rounded-full border border-border px-3 text-sm ${supplier.isActive ? '' : 'opacity-50'}`}>{supplier.name}</button>
                </li>
              ))}
            </ul>
          </div>
          <ul className="space-y-2">
            {purchases.length === 0 && !loading && <li className="text-sm text-muted-foreground">{tr('No purchases recorded.', 'Belum ada pembelian.')}</li>}
            {purchases.map((purchase) => (
              <li key={purchase.id} className={surfaceCardClass('standard')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{purchase.itemName} · {purchase.quantity} {purchase.unit}</p>
                  <StatusChip tone={purchase.status === 'confirmed' ? 'success' : purchase.status === 'rejected' ? 'danger' : 'warning'}>
                    {purchase.status === 'confirmed' ? tr('Confirmed', 'Dikonfirmasi') : purchase.status === 'rejected' ? tr('Rejected', 'Ditolak') : tr('Waiting for Finance', 'Menunggu Finance')}
                  </StatusChip>
                </div>
                <p className="text-xs text-muted-foreground">{formatRupiah(purchase.totalIdr)} · {branchName(purchase.branchId)}{purchase.supplierName ? ` · ${purchase.supplierName}` : ''} · {purchase.purchasedOn}</p>
                {purchase.status === 'rejected' && purchase.decisionNote && <p className="mt-1 text-xs text-destructive">{purchase.decisionNote}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'waste' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={tr('Period', 'Periode')} value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
              <option value={7}>{tr('Last 7 days', '7 hari terakhir')}</option>
              <option value={30}>{tr('Last 30 days', '30 hari terakhir')}</option>
              <option value={90}>{tr('Last 90 days', '90 hari terakhir')}</option>
            </select>
            <button type="button" onClick={exportWaste} disabled={!report || report.rows.length === 0} className="flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium disabled:opacity-50"><Download className="size-4" />Excel</button>
          </div>
          {report && (
            <>
              <p className="text-sm"><span className="font-semibold">{formatRupiah(report.totalValueIdr)}</span> <span className="text-muted-foreground">{tr('lost in this period', 'terbuang pada periode ini')}</span></p>
              {report.byReason.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {report.byReason.map((entry) => <li key={entry.reason} className="flex justify-between gap-2"><span>{getWasteReasonLabel(entry.reason, language)}</span><span className="text-muted-foreground">{entry.count}× · {formatRupiah(entry.valueIdr)} · {wasteSharePercent(entry.valueIdr, report.totalValueIdr)}%</span></li>)}
                </ul>
              )}
              {activeBranch === 'All' && report.byBranch.length > 1 && (
                <ul className="space-y-1 text-sm">
                  {report.byBranch.map((entry) => <li key={entry.branchId} className="flex justify-between gap-2"><span>{entry.branchName ?? entry.branchId}</span><span className="text-muted-foreground">{entry.count}× · {formatRupiah(entry.valueIdr)}</span></li>)}
                </ul>
              )}
              {report.rows.length === 0 && !loading && <p className="text-sm text-muted-foreground">{tr('No waste recorded in this period.', 'Tidak ada waste pada periode ini.')}</p>}
              <ul className="space-y-2">
                {report.rows.map((row) => (
                  <li key={row.id} className={surfaceCardClass('standard')}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{row.itemName} · {row.quantity} {row.unit}</p>
                      <StatusChip tone="warning">{getWasteReasonLabel(row.reason, language)}</StatusChip>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatRupiah(row.valueIdr)} · {row.branchName ?? row.branchId} · {row.recordedByName} · {wibDateTime(row.createdAt)}</p>
                    {row.note && <p className="mt-1 text-xs">{row.note}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <InventoryItemDialog open={itemDialog !== null} item={itemDialog?.item ?? null} branchId={createBranch} onClose={() => setItemDialog(null)} onSaved={reload} />
      <InventorySupplierDialog open={supplierDialog !== null} supplier={supplierDialog?.supplier ?? null} onClose={() => setSupplierDialog(null)} onSaved={reload} />
      <InventoryPurchaseDialog open={purchaseDialog !== null} items={overview.items} suppliers={overview.suppliers} presetItemId={purchaseDialog?.itemId} onClose={() => setPurchaseDialog(null)} onSaved={reload} />
      <InventoryWasteDialog open={wasteItem !== null} item={wasteItem} onClose={() => setWasteItem(null)} onSaved={reload} />
    </section>
  )
}
