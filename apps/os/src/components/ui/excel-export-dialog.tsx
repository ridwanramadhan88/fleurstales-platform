import { type FC, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { AppDialog } from './app-dialog'
import { Button } from './button'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

/** Outline "Unduh Excel" button used by every table download. */
export const ExcelDownloadButton: FC<{ onClick: () => void; disabled?: boolean; label?: string }> = ({ onClick, disabled, label }) => {
  const tr = useBilingualCopy()
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-accent disabled:opacity-40">
      <Download className="size-4" /> {label ?? tr('Download Excel', 'Unduh Excel')}
    </button>
  )
}

interface ExcelExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  /** Text for the record count, e.g. "12 ulasan". */
  countLabel: string
  canDownload: boolean
  loading?: boolean
  error?: string | null
  onDownload: () => void
  children?: ReactNode
  testId?: string
}

/** Date-range dialog shared by the table downloads. */
export const ExcelExportDialog: FC<ExcelExportDialogProps> = ({
  open, onOpenChange, title, description, from, to, onFromChange, onToChange, countLabel, canDownload, loading, error, onDownload, children, testId,
}) => {
  const tr = useBilingualCopy()
  const invalidRange = Boolean(from && to && from > to)
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-4" data-testid={testId}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium">{tr('From date', 'Dari tanggal')}</span>
            <input type="date" aria-label={tr('From date', 'Dari tanggal')} value={from} onChange={(event) => onFromChange(event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium">{tr('To date', 'Sampai tanggal')}</span>
            <input type="date" aria-label={tr('To date', 'Sampai tanggal')} value={to} onChange={(event) => onToChange(event.target.value)} className={inputClass} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{tr('Leave both dates empty to include every date.', 'Kosongkan kedua tanggal untuk semua tanggal.')}</p>
        {invalidRange && <p className="text-xs text-destructive">{tr('The start date is after the end date.', 'Tanggal awal setelah tanggal akhir.')}</p>}
        {children}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm" role="status">{loading ? tr('Loading…', 'Memuat…') : countLabel}</p>
          <Button type="button" onClick={onDownload} disabled={!canDownload || loading || invalidRange}>
            <Download className="size-4" /> {tr('Download', 'Unduh')}
          </Button>
        </div>
      </div>
    </AppDialog>
  )
}
