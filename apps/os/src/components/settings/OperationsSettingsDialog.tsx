/**
 * @file OperationsSettingsDialog.tsx
 * @description Manager (and Owner) editor for the operational settings only:
 * per-branch opening and pickup/delivery hours, delivery fees, and minimum
 * staff coverage. Names, addresses, payment, roles and payroll live in the
 * Owner-only Settings Center and are not reachable from here.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import type { BranchSettings } from '../../types/settings'
import { saveBranchOperations } from '../../data/branchOperationsSupabase'
import { saveOperationsSettings } from '../../data/internalSettingsSupabaseSync'
import { changedBranchOperations, clampCoverage } from '../../domain/branchOperationsDomain'
import { validateDeliveryTariff } from '../../domain/deliveryTariffDomain'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { BranchDeliveryTariffEditor } from './BranchDeliveryTariffEditor'
import { FulfillmentHoursEditor, OpeningHoursEditor } from './BranchSettingsPanel'

const FIELD_CLASS = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50'

export interface OperationsSettingsDialogProps {
  open: boolean
  onClose: () => void
}

export const OperationsSettingsDialog: FC<OperationsSettingsDialogProps> = ({ open, onClose }) => {
  const tr = useBilingualCopy()
  const savedBranches = useSettingsStore((state) => state.branches)
  const savedCoverage = useSettingsStore((state) => state.scheduling.minimumCoverage) ?? { admin: 1, florist: 2 }
  const [draft, setDraft] = useState<BranchSettings[]>([])
  const [coverage, setCoverage] = useState(savedCoverage)
  const [branchId, setBranchId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    const active = savedBranches.filter((branch) => branch.isActive)
    setDraft(structuredClone(active))
    setCoverage(savedCoverage)
    setBranchId((current) => (active.some((branch) => branch.id === current) ? current : (active[0]?.id ?? '')))
    setError(null)
    setSaved(false)
    // Reset only when the dialog opens; edits must not be overwritten by store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const branch = draft.find((item) => item.id === branchId)
  const changedBranches = useMemo(() => changedBranchOperations(savedBranches, draft), [savedBranches, draft])
  const coverageChanged = coverage.admin !== savedCoverage.admin || coverage.florist !== savedCoverage.florist
  const dirty = changedBranches.length > 0 || coverageChanged

  const updateBranch = (id: string, patch: Partial<BranchSettings>) => {
    setSaved(false)
    setDraft((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const handleSave = async () => {
    for (const item of changedBranches) {
      const tariffError = validateDeliveryTariff(item.deliveryTariff)
      if (tariffError) { setError(`${item.name}: ${tariffError}`); return }
    }
    setSaving(true)
    setError(null)
    try {
      for (const item of changedBranches) {
        await saveBranchOperations(item)
        useSettingsStore.setState((state) => ({
          branches: state.branches.map((existing) => (existing.id === item.id
            ? { ...existing, openingHours: item.openingHours, deliveryFeeIdr: item.deliveryFeeIdr, deliveryTariff: item.deliveryTariff }
            : existing)),
        }))
      }
      if (coverageChanged) await saveOperationsSettings({ minimumCoverage: { admin: clampCoverage(coverage.admin), florist: clampCoverage(coverage.florist) } })
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not save. Try again.', 'Gagal menyimpan. Coba lagi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="operations-settings-dialog">
        <DialogHeader>
          <DialogTitle>{tr('Operational settings', 'Pengaturan operasional')}</DialogTitle>
          <DialogDescription>
            {tr('Hours, delivery fees and minimum staffing. Store details, payments, roles and payroll stay with the Owner.', 'Jam buka, ongkir, dan jumlah staf minimum. Profil toko, pembayaran, peran, dan gaji tetap dikelola Owner.')}
          </DialogDescription>
        </DialogHeader>

        {draft.length > 1 && (
          <div role="tablist" aria-label={tr('Branch', 'Cabang')} className="flex flex-wrap gap-1.5">
            {draft.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={item.id === branchId} onClick={() => setBranchId(item.id)}
                className={`min-h-10 rounded-full px-4 text-sm font-medium ${item.id === branchId ? 'bg-primary text-primary-foreground' : 'bg-surface-panel text-foreground hover:bg-accent'}`}>
                {item.name}
              </button>
            ))}
          </div>
        )}

        {branch ? (
          <div className="space-y-4">
            <OpeningHoursEditor branch={branch} onUpdateBranch={updateBranch} />
            <FulfillmentHoursEditor branch={branch} onUpdateBranch={updateBranch} />
            <label className="block text-xs font-semibold text-muted-foreground">
              {tr('Flat delivery fee (Rp)', 'Ongkir tetap (Rp)')}
              <input type="number" min={0} step={1000} inputMode="numeric" value={branch.deliveryFeeIdr ?? 0}
                onChange={(event) => updateBranch(branch.id, { deliveryFeeIdr: Math.max(0, Number(event.target.value) || 0) })}
                className={`${FIELD_CLASS} mt-1 font-normal text-foreground`} />
              <span className="mt-1 block font-normal">{tr('Used when the distance tariff below is off.', 'Dipakai bila tarif per jarak di bawah mati.')}</span>
            </label>
            <BranchDeliveryTariffEditor branch={branch} isEditing onUpdateBranch={updateBranch} />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{tr('No active branch.', 'Tidak ada cabang aktif.')}</p>
        )}

        <fieldset className="space-y-2 rounded-xl bg-surface-panel p-3">
          <legend className="px-1 text-xs font-semibold text-foreground">{tr('Minimum staff per open branch and day', 'Staf minimum per cabang buka per hari')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['admin', 'florist'] as const).map((role) => (
              <label key={role} className="text-xs font-semibold text-muted-foreground">
                {role === 'admin' ? 'Admin' : 'Florist'}
                <input type="number" min={0} max={50} inputMode="numeric" value={coverage[role]}
                  onChange={(event) => { setSaved(false); setCoverage((current) => ({ ...current, [role]: clampCoverage(Number(event.target.value)) })) }}
                  className={`${FIELD_CLASS} mt-1 font-normal text-foreground`} />
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {saved && !dirty && <p role="status" className="text-xs font-medium text-success">{tr('Saved', 'Tersimpan')}</p>}
          <Button type="button" variant="outline" onClick={onClose}>{tr('Close', 'Tutup')}</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !dirty}>{saving ? tr('Saving…', 'Menyimpan…') : tr('Save', 'Simpan')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
