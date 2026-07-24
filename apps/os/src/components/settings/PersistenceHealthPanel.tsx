import { useRef, useState, type ChangeEvent } from 'react'
import { AlertTriangle, Database, Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import { usePersistenceHealthStore } from '../../store/persistenceHealthStore'
import { exportOperationalBackup, resetOperationalDemoData, restoreOperationalBackup } from '../../store/operationalPersistence'
import { requestAppConfirmation } from '../ui/app-confirm'

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`

export const PersistenceHealthPanel = () => {
  const health = usePersistenceHealthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const downloadBackup = () => {
    const blob = new Blob([exportOperationalBackup()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fleurstales-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setFeedback('Backup exported.')
  }

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      await restoreOperationalBackup(await file.text())
      setFeedback('Backup restored successfully.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Backup could not be restored.')
    } finally {
      event.target.value = ''
    }
  }

  const resetData = async () => {
    const confirmed = await requestAppConfirmation({
      title: 'Reset all operational data?',
      description: 'Deletes all local data. Export a backup, then type DELETE.',
      confirmLabel: 'Reset all data',
      destructive: true,
      requiredText: 'DELETE',
    })
    if (!confirmed) return
    await resetOperationalDemoData()
    setFeedback('Local operational data cleared.')
  }

  const statusLabel = health.status === 'saved' ? 'Saved' : health.status === 'saving' ? 'Saving…' : health.status === 'conflict' ? 'Conflict detected' : health.status === 'error' ? 'Save failed' : 'Not saved yet'

  return (
    <section className="mt-5 rounded-xl border border-border/70 bg-muted/30 p-4" aria-label="Local data and backup">
      <div className="flex items-start gap-3">
        <Database className="mt-0.5 size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-5 text-foreground">Local Data & Backup</h3>
          <p className="mt-1 text-xs text-muted-foreground">Prototype only. Payroll, attendance evidence, PINs, and operational records are stored in this browser and are not suitable for production security.</p>
        </div>
      </div>

      {(health.status === 'error' || health.status === 'conflict') && (
        <div role="alert" className="mt-3 flex gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning ring-1 ring-warning/20">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{health.message ?? 'Local persistence requires attention.'}</span>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1 font-medium">{statusLabel}</dd></div>
        <div><dt className="text-muted-foreground">Last saved</dt><dd className="mt-1 font-medium">{health.lastSavedAt ? new Date(health.lastSavedAt).toLocaleString() : '—'}</dd></div>
        <div><dt className="text-muted-foreground">Schema / revision</dt><dd className="mt-1 font-medium">v{health.schemaVersion} / r{health.revision}</dd></div>
        <div><dt className="text-muted-foreground">Snapshot size</dt><dd className="mt-1 font-medium">{formatBytes(health.storageBytes)}</dd></div>
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={downloadBackup} className="inline-flex items-center justify-center rounded-full text-xs font-medium ring-1 ring-border rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"><Download className="size-3.5" /> Export backup</button>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-[18px] text-sm font-medium ring-1 ring-border"><Upload className="size-3.5" /> Restore backup</button>
        <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-[18px] text-sm font-medium ring-1 ring-border"><RefreshCw className="size-3.5" /> Reload latest</button>
        <button type="button" onClick={resetData} className="col-span-2 inline-flex items-center justify-center rounded-full text-xs font-medium text-destructive ring-1 ring-destructive/30 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"><Trash2 className="size-3.5" /> Reset operational data</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
      </div>
      {feedback && <p role="status" className="mt-3 text-xs text-muted-foreground">{feedback}</p>}
    </section>
  )
}
