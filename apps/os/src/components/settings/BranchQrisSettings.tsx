import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FC } from 'react'
import { AlertTriangle, QrCode, Trash2, Upload } from 'lucide-react'
import type { BankAccountDetail, BranchSettings } from '../../types/settings'
import { bootstrapSharedData } from '../../data/shared/bootstrap'
import { browserSupabaseTokenProvider } from '../../data/shared/supabaseSession'
import { createBranchQrisRepository, type BranchQris } from '../../data/shared/repositories'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { merchantCriteriaLabel, parseStaticQris, qrisBankMismatch, readQrTextFromImage, StaticQrisReadError } from '../../domain/qrisStaticDomain'

/**
 * QRIS per branch (Owner). The static QRIS is only the source for the
 * amount-embedded QR made per order on the server: it is never shown to
 * customers. Uploading the image only lets this browser read the QR text;
 * the image itself is not stored. Saved immediately (not part of the
 * Settings draft).
 */

interface Props {
  branches: BranchSettings[]
  bankAccounts: BankAccountDetail[]
}

export const BranchQrisSettings: FC<Props> = ({ branches, bankAccounts }) => {
  const tr = useBilingualCopy()
  const [items, setItems] = useState<BranchQris[]>([])
  const [busyBranch, setBusyBranch] = useState<string | null>(null)
  const [message, setMessage] = useState<{ branchId: string; text: string; error: boolean } | null>(null)
  const [pendingAccount, setPendingAccount] = useState<Record<string, string>>({})
  const cleanedLegacy = useRef(false)
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  const repository = shared.enabled ? createBranchQrisRepository(shared.repositories.client) : null
  const linkableAccounts = bankAccounts.filter((account) => account.type === 'bank_transfer' && account.isActive)

  const refresh = useCallback(async () => {
    if (!repository) return
    const rows = await repository.list()
    setItems(rows)
    // Static QRIS images from before 25 Nov 2026 sat in public storage:
    // remove them (once per visit) when every branch has a saved source.
    if (!cleanedLegacy.current && rows.every((row) => !row.legacyImagePath || row.nmid)) {
      cleanedLegacy.current = true
      const withImage = rows.filter((row) => row.legacyImagePath).map((row) => row.branchId)
      void repository.removeLegacyImages(withImage).catch(() => { cleanedLegacy.current = false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.enabled])

  useEffect(() => { void refresh().catch(() => undefined) }, [refresh])

  const errorText = (cause: unknown): string => {
    const code = cause instanceof StaticQrisReadError ? cause.code : cause instanceof Error ? cause.message : ''
    if (code.includes('QRIS_NOT_FOUND')) return tr('No QR code found in this image. Use a clear, uncropped QRIS image.', 'QR tidak ditemukan di gambar ini. Gunakan gambar QRIS yang jelas dan tidak terpotong.')
    if (code.includes('QRIS_NOT_STATIC')) return tr('This is not a static QRIS. Upload the static QRIS of this branch.', 'Ini bukan QRIS statis. Unggah QRIS statis cabang ini.')
    if (code.includes('QRIS_INVALID')) return tr('This QR is not a valid QRIS.', 'QR ini bukan QRIS yang valid.')
    if (code.includes('QRIS_NMID_IN_USE')) return tr('This QRIS is already used by another branch.', 'QRIS ini sudah dipakai cabang lain.')
    if (code.includes('QRIS_DYNAMIC_NOT_READY')) return tr('QRIS can be turned on once the amount-embedded QR is released.', 'QRIS bisa diaktifkan setelah QR bernominal dirilis.')
    if (code.includes('QRIS_LINKED_ACCOUNT_INVALID')) return tr('Choose an active bank account (save new accounts first).', 'Pilih rekening bank yang aktif (simpan rekening baru terlebih dahulu).')
    if (code.includes('OWNER_REQUIRED')) return tr('Only the Owner can change QRIS.', 'Hanya Pemilik yang bisa mengubah QRIS.')
    return tr('QRIS could not be saved. Try again.', 'QRIS tidak bisa disimpan. Coba lagi.')
  }

  const run = async (branchId: string, action: () => Promise<void>, done: string) => {
    if (busyBranch) return
    setBusyBranch(branchId)
    setMessage(null)
    try {
      await action()
      await refresh()
      setMessage({ branchId, text: done, error: false })
    } catch (cause) {
      setMessage({ branchId, text: errorText(cause), error: true })
    } finally {
      setBusyBranch(null)
    }
  }

  const accountFor = (branchId: string, current?: BranchQris) =>
    pendingAccount[branchId] ?? current?.linkedAccountId ?? linkableAccounts[0]?.id ?? ''

  const onUpload = (branch: BranchSettings, current?: BranchQris) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !repository) return
    await run(branch.id, async () => {
      const payload = (await readQrTextFromImage(file)).trim()
      parseStaticQris(payload)
      await repository.saveSource({ branchId: branch.id, payload, linkedAccountId: accountFor(branch.id, current) })
    }, tr('QRIS read and saved.', 'QRIS terbaca dan tersimpan.'))
  }

  if (!repository) return null

  return (
    <div className="space-y-3" data-testid="branch-qris-settings">
      <div className="flex items-start gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground"><QrCode className="size-4" /></span>
        <div>
          <p className="text-sm font-semibold text-foreground">{tr('QRIS per branch', 'QRIS per cabang')}</p>
          <p className="text-xs text-muted-foreground">{tr('Source static QRIS, not shown to customers. Each order gets its own QR with the exact amount.', 'QRIS statis sebagai sumber, tidak ditampilkan ke pelanggan. Setiap pesanan mendapat QR sendiri dengan nominal pas.')}</p>
        </div>
      </div>
      {branches.filter((branch) => branch.isActive).map((branch) => {
        const current = items.find((item) => item.branchId === branch.id)
        const hasSource = Boolean(current?.nmid)
        const busy = busyBranch === branch.id
        const linkedAccount = linkableAccounts.find((account) => account.id === accountFor(branch.id, current))
        const mismatch = hasSource && qrisBankMismatch(current?.acquirer, linkedAccount?.bankName)
        return (
          <div key={branch.id} className="space-y-2 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60" data-testid={`branch-qris-${branch.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{branch.name}</p>
              {current && <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${current.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{current.isActive ? tr('Active', 'Aktif') : tr('Off', 'Nonaktif')}</span>}
            </div>
            {hasSource && current ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs" data-testid={`branch-qris-details-${branch.id}`}>
                <dt className="text-muted-foreground">{tr('Name in QR', 'Nama di QR')}</dt><dd className="min-w-0 truncate font-medium text-foreground">{current.merchantName}</dd>
                <dt className="text-muted-foreground">NMID</dt><dd className="font-medium tabular-nums text-foreground">{current.nmid}</dd>
                <dt className="text-muted-foreground">{tr('Category', 'Kategori')}</dt><dd className="text-foreground">{merchantCriteriaLabel(current.merchantCriteria)}</dd>
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">{tr('No QRIS yet.', 'Belum ada QRIS.')}</p>
            )}
            <label className="block space-y-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Paid into', 'Masuk ke rekening')}</span>
              <select
                value={accountFor(branch.id, current)}
                disabled={busy || linkableAccounts.length === 0}
                onChange={(event) => {
                  const linkedAccountId = event.target.value
                  setPendingAccount((state) => ({ ...state, [branch.id]: linkedAccountId }))
                  if (current && hasSource) void run(branch.id, () => repository.save({ branchId: branch.id, linkedAccountId, isActive: current.isActive }), tr('QRIS saved.', 'QRIS tersimpan.'))
                }}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                {linkableAccounts.map((account) => <option key={account.id} value={account.id}>{`${account.bankName} · ${account.accountNumber} · ${account.accountHolder}`}</option>)}
              </select>
            </label>
            {mismatch && (
              <p className="flex items-start gap-1.5 text-xs text-warning" data-testid={`branch-qris-bank-mismatch-${branch.id}`}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {tr('The QRIS bank and this account bank differ. Choose the account that receives this QRIS.', 'Bank QRIS dan bank rekening ini berbeda. Pilih rekening yang menerima QRIS ini.')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium ${busy || linkableAccounts.length === 0 ? 'pointer-events-none opacity-60' : ''}`}>
                <Upload className="size-3.5" />
                {hasSource ? tr('Replace static QRIS', 'Ganti QRIS statis') : tr('Upload static QRIS', 'Unggah QRIS statis')}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={tr(`Static QRIS for ${branch.name}`, `QRIS statis ${branch.name}`)} onChange={onUpload(branch, current)} />
              </label>
              {current && hasSource && (
                <button type="button" disabled={busy} onClick={() => void run(branch.id, () => repository.save({ branchId: branch.id, linkedAccountId: current.linkedAccountId, isActive: !current.isActive }), tr('QRIS saved.', 'QRIS tersimpan.'))} className="h-9 rounded-full border border-border bg-background px-3 text-xs font-medium disabled:opacity-60">
                  {current.isActive ? tr('Turn off', 'Nonaktifkan') : tr('Turn on', 'Aktifkan')}
                </button>
              )}
              {current && (
                <button type="button" disabled={busy} onClick={() => void run(branch.id, () => repository.remove(branch.id), tr('QRIS removed.', 'QRIS dihapus.'))} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/30 px-3 text-xs font-medium text-destructive disabled:opacity-60">
                  <Trash2 className="size-3.5" />{tr('Remove', 'Hapus')}
                </button>
              )}
            </div>
            {linkableAccounts.length === 0 && <p className="text-xs text-warning">{tr('Add and save an active bank account first.', 'Tambahkan dan simpan rekening bank aktif terlebih dahulu.')}</p>}
            {message?.branchId === branch.id && <p role={message.error ? 'alert' : 'status'} className={`text-xs ${message.error ? 'text-destructive' : 'text-success'}`}>{message.text}</p>}
          </div>
        )
      })}
    </div>
  )
}
