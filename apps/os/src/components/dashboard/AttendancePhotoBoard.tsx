/**
 * @file AttendancePhotoBoard.tsx
 * @description Manager view of the day's attendance: who checked in, when, at
 * which branch, with the check-in selfie. View only.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { Camera, ChevronDown, RefreshCw } from 'lucide-react'
import { todayIsoDate } from '../../store/hrStore'
import { toJakarta } from '../../domain/orderTimingDomain'
import { fetchAttendanceBoard, signAttendancePhotos } from '../../data/attendanceBoardSupabase'
import { getAttendanceBoardState, groupAttendanceBoard, summarizeAttendanceBoard, type AttendanceBoardEntry, type AttendanceBoardState } from '../../domain/attendanceBoardDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { StatusChip, type ChipTone } from '../ui/chip'
import { surfaceCardClass } from '../ui/card'

const clock = (iso: string | null): string => {
  if (!iso) return ''
  const date = toJakarta(new Date(iso))
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const STATE_TONE: Record<AttendanceBoardState, ChipTone> = {
  on_time: 'success', late: 'warning', not_checked_in: 'danger', off: 'neutral', leave: 'info', absent: 'danger', unscheduled: 'neutral',
}

const ROLE_LABEL: Partial<Record<AttendanceBoardEntry['role'], string>> = { admin: 'Admin', florist: 'Florist', courier: 'Kurir', manager: 'Manajer' }

export const AttendancePhotoBoard: FC = () => {
  const tr = useBilingualCopy()
  const today = todayIsoDate()
  const [date, setDate] = useState(today)
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<AttendanceBoardEntry[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const rows = await fetchAttendanceBoard(date)
        if (cancelled) return
        setEntries(rows)
        const signed = await signAttendancePhotos(rows.flatMap((row) => [row.checkInPhotoPath, row.checkOutPhotoPath]).filter((path): path is string => Boolean(path)))
        if (!cancelled) setPhotos(signed)
      } catch {
        if (!cancelled) {
          setEntries([])
          setError(tr('Attendance could not be loaded. Try again.', 'Absensi tidak bisa dimuat. Coba lagi.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reloadKey])

  const groups = useMemo(() => groupAttendanceBoard(entries), [entries])
  const summary = useMemo(() => summarizeAttendanceBoard(entries), [entries])

  const stateLabel = (state: AttendanceBoardState): string => ({
    on_time: tr('On time', 'Tepat waktu'),
    late: tr('Late', 'Terlambat'),
    not_checked_in: tr('Not checked in', 'Belum absen'),
    off: tr('Day off', 'Libur'),
    leave: tr('Leave', 'Izin'),
    absent: tr('Absent', 'Tidak hadir'),
    unscheduled: tr('No schedule', 'Tanpa jadwal'),
  })[state]

  const summaryLine = loading
    ? tr('Loading…', 'Memuat…')
    : summary.expected === 0 && summary.checkedIn === 0
      ? tr('No one is scheduled', 'Tidak ada yang dijadwalkan')
      : `${summary.checkedIn} ${tr('checked in', 'sudah absen')} · ${summary.notCheckedIn} ${tr('not yet', 'belum')}${summary.late ? ` · ${summary.late} ${tr('late', 'terlambat')}` : ''}`

  return (
    <section aria-label={tr('Staff attendance', 'Absen karyawan')} data-testid="attendance-photo-board" className={surfaceCardClass('standard')}>
      <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Camera className="size-5 shrink-0 text-primary" />
            <h2 className="text-sm font-semibold leading-5">{date === today ? tr('Staff attendance today', 'Absen karyawan hari ini') : tr('Staff attendance', 'Absen karyawan')}</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{summaryLine}</p>
        </div>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-t border-border/70 pt-3">
          <div className="flex items-center gap-2">
            <input type="date" aria-label={tr('Date', 'Tanggal')} value={date} max={today} onChange={(event) => { if (event.target.value) setDate(event.target.value) }} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" />
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} aria-label={tr('Refresh', 'Muat ulang')} className="flex size-11 items-center justify-center rounded-full border border-border disabled:opacity-50">
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          {!loading && !error && entries.length === 0 && <p className="text-sm text-muted-foreground">{tr('No staff to show for this date.', 'Tidak ada karyawan untuk tanggal ini.')}</p>}

          {groups.map((group) => (
            <div key={group.branch || 'none'}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.branch || tr('No branch today', 'Tanpa cabang hari ini')}</h3>
              <ul className="mt-2 space-y-2">
                {group.entries.map((entry) => {
                  const state = getAttendanceBoardState(entry)
                  const photoUrl = entry.checkInPhotoPath ? photos[entry.checkInPhotoPath] : undefined
                  const checkOutUrl = entry.checkOutPhotoPath ? photos[entry.checkOutPhotoPath] : undefined
                  const shift = entry.scheduled && entry.isWorking && entry.shiftStart ? `${entry.shiftStart}–${entry.shiftEnd ?? ''}` : ''
                  return (
                    <li key={entry.employeeId} className="flex items-center gap-3 rounded-xl border border-border p-2">
                      {photoUrl ? (
                        <button type="button" onClick={() => setPreview({ url: photoUrl, label: `${entry.displayName} · ${tr('check-in', 'masuk')} ${clock(entry.checkInAt)}` })} className="size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-border" aria-label={`${tr('Open check-in photo of', 'Buka foto masuk')} ${entry.displayName}`}>
                          <img src={photoUrl} alt="" loading="lazy" className="size-full object-cover" />
                        </button>
                      ) : (
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface-panel text-muted-foreground"><Camera className="size-5" /></div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{entry.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[ROLE_LABEL[entry.role] ?? entry.role, shift && `Shift ${shift}`].filter(Boolean).join(' · ')}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.checkInAt
                            ? [`${tr('In', 'Masuk')} ${clock(entry.checkInAt)}`, entry.checkOutAt && `${tr('Out', 'Pulang')} ${clock(entry.checkOutAt)}`, entry.checkInBranchName && entry.checkInBranchName !== group.branch && `${tr('at', 'di')} ${entry.checkInBranchName}`, entry.source === 'manual' && tr('recorded by HR', 'dicatat HR')].filter(Boolean).join(' · ')
                            : ''}
                        </p>
                        {checkOutUrl && (
                          <button type="button" onClick={() => setPreview({ url: checkOutUrl, label: `${entry.displayName} · ${tr('check-out', 'pulang')} ${clock(entry.checkOutAt)}` })} className="mt-1 text-xs font-medium text-primary underline">
                            {tr('Check-out photo', 'Foto pulang')}
                          </button>
                        )}
                      </div>
                      <StatusChip tone={STATE_TONE[state]}>{stateLabel(state)}</StatusChip>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div role="dialog" aria-modal="true" aria-label={preview.label} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-background" onClick={(event) => event.stopPropagation()}>
            <img src={preview.url} alt={preview.label} className="aspect-square w-full object-cover" />
            <div className="flex items-center justify-between gap-3 p-3">
              <p className="min-w-0 truncate text-sm font-medium">{preview.label}</p>
              <button type="button" onClick={() => setPreview(null)} className="h-11 shrink-0 rounded-full border border-border px-4 text-sm font-medium">{tr('Close', 'Tutup')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
