import { useState } from 'react'
import { AlertTriangle, Cloud, RefreshCw } from 'lucide-react'
import { usePersistenceHealthStore, type PersistenceHealthReason } from '../../store/persistenceHealthStore'
import { useUiLanguage, type UiLanguage } from '../../i18n/uiLanguage'
import { backupAndReloadDomain, retryDomainSave } from '../../data/operationalSupabaseSync'

const SECTION_LABELS: Record<string, Record<UiLanguage, string>> = {
  hr: { id: 'Data SDM', en: 'HR data' },
  payroll: { id: 'Data penggajian', en: 'Payroll data' },
  finance: { id: 'Data Keuangan', en: 'Finance data' },
  stock: { id: 'Data Stok', en: 'Stock data' },
  vouchers: { id: 'Data Voucher', en: 'Voucher data' },
  order_drafts: { id: 'Draf pesanan', en: 'Order drafts' },
}

const sectionLabel = (domain: string | undefined, language: UiLanguage): string =>
  (domain && SECTION_LABELS[domain]?.[language]) || (language === 'id' ? 'Data' : 'Data')

const COPY = {
  id: {
    conflictTitle: 'Ada data yang lebih baru',
    errorTitle: 'Perubahan belum tersimpan',
    saving: 'Menyimpan perubahan',
    savingBody: 'Perubahan Anda sedang disinkronkan.',
    genericError: 'Perubahan belum tersimpan. Coba simpan lagi atau muat ulang data terbaru.',
    reloadLatest: 'Muat ulang data terbaru',
    retry: 'Coba simpan lagi',
    reloadPage: 'Muat ulang halaman',
    working: 'Memproses…',
    reloadFailed: 'Data terbaru belum dapat dimuat. Periksa koneksi lalu coba lagi.',
    discardNote: 'Perubahan Anda yang belum tersimpan di bagian ini akan diganti dengan versi terbaru (salinannya disimpan di browser ini).',
  },
  en: {
    conflictTitle: 'Newer data is available',
    errorTitle: 'Changes were not saved',
    saving: 'Saving changes',
    savingBody: 'Your update is being synchronized.',
    genericError: 'Your changes were not saved. Try saving again or reload the latest data.',
    reloadLatest: 'Reload latest data',
    retry: 'Try saving again',
    reloadPage: 'Reload page',
    working: 'Working…',
    reloadFailed: 'The latest data could not be loaded. Check your connection and try again.',
    discardNote: 'Your unsaved changes in this section will be replaced by the latest version (a copy is kept in this browser).',
  },
} as const

const reasonMessage = (
  reason: PersistenceHealthReason | undefined,
  domain: string | undefined,
  language: UiLanguage,
  fallback: string | undefined,
): string => {
  const label = sectionLabel(domain, language)
  const id = language === 'id'
  switch (reason) {
    case 'conflict':
      return id
        ? `${label} baru saja diubah di perangkat atau sesi lain. Perubahan Anda belum menimpa apa pun. Muat ulang data terbaru sebelum melanjutkan.`
        : `${label} was just changed on another device or session. Nothing was overwritten. Reload the latest data before continuing.`
    case 'conflict_locked':
      return id
        ? `${label} terus berbenturan dengan perubahan lain, jadi penyimpanan otomatis dijeda demi keamanan data. Muat ulang data terbaru sebelum mengedit lagi.`
        : `${label} kept conflicting with other changes, so auto-save is paused to protect the data. Reload the latest data before editing again.`
    case 'finance_server_owned':
      return id
        ? 'Catatan keuangan otomatis dikelola dari alurnya masing-masing. Muat ulang data Keuangan, lalu ubah pesanan, refund, atau penggajian terkait.'
        : 'Automatic finance entries are managed from their source workflow. Reload Finance and update the related order, refund, or payroll record.'
    case 'finance_delete_blocked':
      return id
        ? 'Riwayat keuangan tidak dapat dihapus. Ubah transaksi manual atau koreksi dari alur aslinya.'
        : 'Finance history cannot be deleted. Edit a manual transaction or correct the original workflow instead.'
    case 'save_failed':
      return id
        ? `${label} belum tersimpan. Periksa koneksi, lalu coba simpan lagi.`
        : `${label} was not saved. Check your connection, then try again.`
    default:
      if (fallback && /SESSION_REQUIRED/.test(fallback)) {
        return id
          ? 'Sesi Anda sudah berakhir. Muat ulang halaman lalu masuk kembali.'
          : 'Your session has ended. Reload the page and sign in again.'
      }
      return fallback ?? (id ? COPY.id.genericError : COPY.en.genericError)
  }
}

export const PersistenceHealthNotice = () => {
  const status = usePersistenceHealthStore((state) => state.status)
  const message = usePersistenceHealthStore((state) => state.message)
  const domain = usePersistenceHealthStore((state) => state.domain)
  const reason = usePersistenceHealthStore((state) => state.reason)
  const language = useUiLanguage((state) => state.language)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  if (status !== 'error' && status !== 'conflict' && status !== 'saving') return null

  const copy = COPY[language]
  const failed = status === 'error' || status === 'conflict'
  const title = status === 'conflict' ? copy.conflictTitle : status === 'error' ? copy.errorTitle : copy.saving
  const needsReload = status === 'conflict' || reason === 'finance_server_owned' || reason === 'finance_delete_blocked'
  const canRetry = status === 'error' && reason === 'save_failed' && Boolean(domain)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setFailure(null)
    try {
      const result = await action()
      if (result === false) setFailure(copy.reloadFailed)
    } catch {
      setFailure(copy.reloadFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
      className={`fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 mx-auto flex max-w-xl items-start gap-3 rounded-2xl border p-3.5 shadow-ios-lg md:bottom-5 md:left-auto md:right-5 md:mx-0 md:max-w-md ${
        failed
          ? 'border-warning/35 bg-surface-popover text-foreground'
          : 'border-border/70 bg-surface-popover text-foreground'
      }`}
    >
      <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
        failed ? 'bg-warning/12 text-warning' : 'bg-primary/10 text-primary'
      }`}>
        {failed
          ? <AlertTriangle className="size-4" aria-hidden="true" />
          : <Cloud className="size-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {failed ? reasonMessage(reason, domain, language, message) : copy.savingBody}
        </p>
        {needsReload && domain ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.discardNote}</p> : null}
        {failure ? <p role="status" className="mt-1 text-xs leading-5 text-destructive">{failure}</p> : null}
        {failed && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {canRetry && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => retryDomainSave(domain!))}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {busy ? copy.working : copy.retry}
              </button>
            )}
            {domain && (needsReload || canRetry) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => backupAndReloadDomain(domain))}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  canRetry ? 'border border-border bg-card text-foreground' : 'bg-primary text-primary-foreground'
                }`}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {busy ? copy.working : copy.reloadLatest}
              </button>
            )}
            {!domain && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {copy.reloadPage}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
