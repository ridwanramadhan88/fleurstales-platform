import { useCallback, useEffect, useState, type ChangeEvent, type FC } from 'react'
import { QrCode, Trash2, Upload } from 'lucide-react'
import type { BankAccountDetail, BranchSettings } from '../../types/settings'
import { bootstrapSharedData } from '../../data/shared/bootstrap'
import { browserSupabaseTokenProvider } from '../../data/shared/supabaseSession'
import { createBranchQrisRepository, type BranchQris } from '../../data/shared/repositories'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

/**
 * Static QRIS per branch (Owner). One QRIS per branch, a square image, linked
 * to one bank account: customers who pay by QRIS are reconciled against that
 * account. Saved immediately (not part of the Settings draft), because the
 * image upload has to happen first.
 */

const MAX_QRIS_SIDE = 1200
const SQUARE_TOLERANCE = 0.03

/** Loads the file, checks it is (nearly) square, re-encodes as PNG (keeps the QR crisp). */
export const prepareSquareQrisImage = async (file: File): Promise<Blob> => {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('IMAGE_UNREADABLE'))
      element.src = url
    })
    const { naturalWidth: width, naturalHeight: height } = image
    if (!width || !height) throw new Error('IMAGE_UNREADABLE')
    if (Math.abs(width - height) / Math.max(width, height) > SQUARE_TOLERANCE) throw new Error('IMAGE_NOT_SQUARE')
    const side = Math.min(MAX_QRIS_SIDE, Math.min(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const context = canvas.getContext('2d')
    if (!context) throw new Error('IMAGE_UNREADABLE')
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0, side, side)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('IMAGE_UNREADABLE'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  const repository = shared.enabled ? createBranchQrisRepository(shared.repositories.client) : null
  const linkableAccounts = bankAccounts.filter((account) => account.type === 'bank_transfer' && account.isActive)

  const refresh = useCallback(async () => {
    if (!repository) return
    setItems(await repository.list())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.enabled])

  useEffect(() => { void refresh().catch(() => undefined) }, [refresh])

  const errorText = (cause: unknown): string => {
    const code = cause instanceof Error ? cause.message : ''
    if (code.includes('IMAGE_NOT_SQUARE')) return tr('The QRIS image must be square (1:1).', 'Gambar QRIS harus persegi (1:1).')
    if (code.includes('IMAGE_UNREADABLE')) return tr('The image could not be read.', 'Gambar tidak bisa dibaca.')
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
      const image = await prepareSquareQrisImage(file)
      const imagePath = await repository.uploadImage(branch.id, image)
      await repository.save({ branchId: branch.id, imagePath, linkedAccountId: accountFor(branch.id, current), isActive: current?.isActive ?? true })
    }, tr('QRIS saved.', 'QRIS tersimpan.'))
  }

  if (!repository) return null

  return (
    <div className="space-y-3" data-testid="branch-qris-settings">
      <div className="flex items-start gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground"><QrCode className="size-4" /></span>
        <div>
          <p className="text-sm font-semibold text-foreground">{tr('QRIS per branch', 'QRIS per cabang')}</p>
          <p className="text-xs text-muted-foreground">{tr('One static QRIS per branch (square image). Customers who pay by QRIS still upload proof; Finance matches it to the linked bank account.', 'Satu QRIS statis per cabang (gambar persegi). Pelanggan yang bayar lewat QRIS tetap mengunggah bukti; Keuangan mencocokkannya ke rekening yang ditautkan.')}</p>
        </div>
      </div>
      {branches.filter((branch) => branch.isActive).map((branch) => {
        const current = items.find((item) => item.branchId === branch.id)
        const busy = busyBranch === branch.id
        return (
          <div key={branch.id} className="grid gap-3 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60 sm:grid-cols-[7rem_1fr]" data-testid={`branch-qris-${branch.id}`}>
            <div className="flex size-28 items-center justify-center overflow-hidden rounded-lg bg-background ring-1 ring-border/60">
              {current ? <img src={current.imageUrl} alt={`QRIS ${branch.name}`} className="size-full object-contain" /> : <QrCode className="size-8 text-muted-foreground" />}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{branch.name}</p>
                {current && <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${current.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{current.isActive ? tr('Active', 'Aktif') : tr('Off', 'Nonaktif')}</span>}
              </div>
              <label className="block space-y-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Paid into', 'Masuk ke rekening')}</span>
                <select
                  value={accountFor(branch.id, current)}
                  disabled={busy || linkableAccounts.length === 0}
                  onChange={(event) => {
                    const linkedAccountId = event.target.value
                    setPendingAccount((state) => ({ ...state, [branch.id]: linkedAccountId }))
                    if (current) void run(branch.id, () => repository.save({ branchId: branch.id, imagePath: current.imagePath, linkedAccountId, isActive: current.isActive }), tr('QRIS saved.', 'QRIS tersimpan.'))
                  }}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {linkableAccounts.map((account) => <option key={account.id} value={account.id}>{`${account.bankName} · ${account.accountNumber} · ${account.accountHolder}`}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium ${busy || linkableAccounts.length === 0 ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload className="size-3.5" />
                  {current ? tr('Replace QRIS image', 'Ganti gambar QRIS') : tr('Upload QRIS image', 'Unggah gambar QRIS')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={tr(`QRIS image for ${branch.name}`, `Gambar QRIS ${branch.name}`)} onChange={onUpload(branch, current)} />
                </label>
                {current && (
                  <button type="button" disabled={busy} onClick={() => void run(branch.id, () => repository.save({ branchId: branch.id, imagePath: current.imagePath, linkedAccountId: current.linkedAccountId, isActive: !current.isActive }), tr('QRIS saved.', 'QRIS tersimpan.'))} className="h-9 rounded-full border border-border bg-background px-3 text-xs font-medium disabled:opacity-60">
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
          </div>
        )
      })}
    </div>
  )
}
