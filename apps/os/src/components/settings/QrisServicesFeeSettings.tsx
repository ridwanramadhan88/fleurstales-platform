import { useEffect, useState, type FC } from 'react'
import { Receipt } from 'lucide-react'
import type { BankAccountDetail } from '../../types/settings'
import { bootstrapSharedData } from '../../data/shared/bootstrap'
import { browserSupabaseTokenProvider } from '../../data/shared/supabaseSession'
import { createBranchQrisRepository, type QrisServicesFeeSettingsInput } from '../../data/shared/repositories'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

/**
 * Services Fee for QRIS (Owner, 25 Nov 2026): website service & feature
 * maintenance fee subsidised by the business per paid QRIS order. Never
 * charged to the customer; recorded automatically as a Finance expense.
 * Saved immediately (not part of the Settings draft).
 */

const digits = (value: string): number => Number(value.replace(/[^\d]/g, '') || '0')
const rupiah = (value: number): string => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)

export const QrisServicesFeeSettings: FC<{ bankAccounts: BankAccountDetail[] }> = ({ bankAccounts }) => {
  const tr = useBilingualCopy()
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  const repository = shared.enabled ? createBranchQrisRepository(shared.repositories.client) : null
  const [draft, setDraft] = useState<QrisServicesFeeSettingsInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const accounts = bankAccounts.filter((account) => account.isActive)

  useEffect(() => {
    if (!repository) return
    let active = true
    repository.getServicesFeeSettings()
      .then((settings) => {
        if (active) setDraft({ isEnabled: settings.isEnabled, thresholdIdr: settings.thresholdIdr, feeBelowIdr: settings.feeBelowIdr, feeAtOrAboveIdr: settings.feeAtOrAboveIdr, accountId: settings.accountId })
      })
      .catch(() => { if (active) setMessage({ text: tr('Services Fee settings could not be loaded.', 'Pengaturan Services Fee tidak bisa dimuat.'), error: true }) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.enabled])

  if (!repository || !draft) return message ? <p role="alert" className="text-xs text-destructive">{message.text}</p> : null

  const update = (patch: Partial<QrisServicesFeeSettingsInput>) => { setDraft({ ...draft, ...patch }); setMessage(null) }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const saved = await repository.saveServicesFeeSettings(draft)
      setDraft({ isEnabled: saved.isEnabled, thresholdIdr: saved.thresholdIdr, feeBelowIdr: saved.feeBelowIdr, feeAtOrAboveIdr: saved.feeAtOrAboveIdr, accountId: saved.accountId })
      setMessage({ text: tr('Services Fee saved.', 'Services Fee tersimpan.'), error: false })
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ''
      setMessage({
        text: code.includes('OWNER_REQUIRED')
          ? tr('Only the Owner can change the Services Fee.', 'Hanya Pemilik yang bisa mengubah Services Fee.')
          : code.includes('ACCOUNT')
            ? tr('Choose an active account.', 'Pilih rekening yang aktif.')
            : tr('Services Fee could not be saved. Check the amounts.', 'Services Fee tidak bisa disimpan. Periksa nominalnya.'),
        error: true,
      })
    } finally {
      setBusy(false)
    }
  }

  const fieldClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm tabular-nums disabled:opacity-60'

  return (
    <div className="space-y-3 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60" data-testid="qris-services-fee-settings">
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Receipt className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Services Fee</p>
          <p className="text-xs text-muted-foreground">{tr('Website service & feature maintenance fee per paid QRIS order. Not charged to customers; recorded as an expense automatically.', 'Biaya layanan & maintenance fitur website per pesanan QRIS yang lunas. Tidak dibebankan ke pelanggan; dicatat otomatis sebagai pengeluaran.')}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-foreground">
          <input type="checkbox" checked={draft.isEnabled} onChange={(event) => update({ isEnabled: event.target.checked })} className="size-4 rounded border-border" />
          {tr('On', 'Aktif')}
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Order total threshold (Rp)', 'Batas total pesanan (Rp)')}</span>
          <input inputMode="numeric" value={rupiah(draft.thresholdIdr)} disabled={!draft.isEnabled || busy} onChange={(event) => update({ thresholdIdr: digits(event.target.value) })} className={fieldClass} aria-label={tr('Order total threshold', 'Batas total pesanan')} />
        </label>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Fee below threshold (Rp)', 'Biaya di bawah batas (Rp)')}</span>
          <input inputMode="numeric" value={rupiah(draft.feeBelowIdr)} disabled={!draft.isEnabled || busy} onChange={(event) => update({ feeBelowIdr: digits(event.target.value) })} className={fieldClass} aria-label={tr('Fee below threshold', 'Biaya di bawah batas')} />
        </label>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Fee from threshold (Rp)', 'Biaya mulai batas (Rp)')}</span>
          <input inputMode="numeric" value={rupiah(draft.feeAtOrAboveIdr)} disabled={!draft.isEnabled || busy} onChange={(event) => update({ feeAtOrAboveIdr: digits(event.target.value) })} className={fieldClass} aria-label={tr('Fee from threshold', 'Biaya mulai batas')} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Paid from', 'Dibayar dari')}</span>
        <select value={draft.accountId ?? ''} disabled={!draft.isEnabled || busy} onChange={(event) => update({ accountId: event.target.value || null })} className={fieldClass} aria-label={tr('Services Fee paid from', 'Services Fee dibayar dari')}>
          <option value="">{tr("Branch QRIS account", 'Rekening QRIS cabang')}</option>
          <option value="cash:main">{tr('Cash', 'Kas tunai')}</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{`${account.bankName} · ${account.accountNumber}`}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground" data-testid="qris-services-fee-summary">
        {draft.isEnabled
          ? tr(
            `Order under Rp${rupiah(draft.thresholdIdr)}: Rp${rupiah(draft.feeBelowIdr)}. From Rp${rupiah(draft.thresholdIdr)}: Rp${rupiah(draft.feeAtOrAboveIdr)}. Based on the order total before the unique-code discount.`,
            `Pesanan di bawah Rp${rupiah(draft.thresholdIdr)}: Rp${rupiah(draft.feeBelowIdr)}. Mulai Rp${rupiah(draft.thresholdIdr)}: Rp${rupiah(draft.feeAtOrAboveIdr)}. Dihitung dari total pesanan sebelum potongan kode unik.`,
          )
          : tr('Off: no Services Fee is recorded.', 'Nonaktif: Services Fee tidak dicatat.')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy} className="h-9 rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-60">
          {busy ? tr('Saving…', 'Menyimpan…') : tr('Save Services Fee', 'Simpan Services Fee')}
        </button>
        {message && <p role={message.error ? 'alert' : 'status'} className={`text-xs ${message.error ? 'text-destructive' : 'text-success'}`}>{message.text}</p>}
      </div>
    </div>
  )
}
