/**
 * @file ReportOrderIssueDialog.tsx
 * @description Lets Admin, Florist, Manager and Owner report a problem on an
 * order. The Manager reviews and closes reported issues on Home.
 */

import { useEffect, useState, type FC } from 'react'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { reportOrderIssue } from '../../data/orderIssuesSupabase'
import { ORDER_ISSUE_KINDS, ORDER_ISSUE_NOTE_MAX, getIssueKindLabel, isValidIssueNote, type OrderIssueKind } from '../../domain/orderIssueDomain'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

export const ReportOrderIssueDialog: FC<{ open: boolean; orderId: string; orderNumber: string; onClose: () => void }> = ({ open, orderId, orderNumber, onClose }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const [kind, setKind] = useState<OrderIssueKind>('late_production')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind('late_production')
    setNote('')
    setError(null)
    setSent(false)
  }, [open])

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await reportOrderIssue(orderId, kind, note)
      setSent(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not send the report. Try again.', 'Laporan gagal dikirim. Coba lagi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md" data-testid="report-order-issue-dialog">
        <DialogHeader>
          <DialogTitle>{tr('Report an issue', 'Laporkan kendala')}</DialogTitle>
          <DialogDescription>{tr(`Order ${orderNumber}. The manager will see this and follow up.`, `Pesanan ${orderNumber}. Manajer akan melihat dan menindaklanjuti.`)}</DialogDescription>
        </DialogHeader>

        {sent ? (
          <>
            <p role="status" className="text-sm">{tr('Report sent to the manager.', 'Laporan terkirim ke manajer.')}</p>
            <div className="flex justify-end"><Button type="button" onClick={onClose}>{tr('Close', 'Tutup')}</Button></div>
          </>
        ) : (
          <>
            <div role="radiogroup" aria-label={tr('Kind of issue', 'Jenis kendala')} className="flex flex-wrap gap-1.5">
              {ORDER_ISSUE_KINDS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={kind === item.id} onClick={() => setKind(item.id)}
                  className={`min-h-10 rounded-full px-3.5 text-sm font-medium ${kind === item.id ? 'bg-primary text-primary-foreground' : 'bg-surface-panel text-foreground hover:bg-accent'}`}>
                  {getIssueKindLabel(item.id, language)}
                </button>
              ))}
            </div>
            <label className="block text-xs font-semibold text-muted-foreground">
              {tr('What happened?', 'Apa yang terjadi?')}
              <textarea value={note} maxLength={ORDER_ISSUE_NOTE_MAX} rows={4} onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary/50" />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>{tr('Cancel', 'Batal')}</Button>
              <Button type="button" onClick={() => void submit()} disabled={saving || !isValidIssueNote(note)}>{saving ? tr('Sending…', 'Mengirim…') : tr('Send report', 'Kirim laporan')}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
