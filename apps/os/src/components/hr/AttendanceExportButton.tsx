import { useState, type FC } from 'react'
import { AppDialog } from '../ui/app-dialog'
import { Button } from '../ui/button'
import { ExcelDownloadButton } from '../ui/excel-export-dialog'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useHrStore } from '../../store/hrStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { buildHrMonthlyReport } from '../../domain/hrMonthlyReportDomain'
import { attendanceExportFilename, buildAttendanceExportSheets } from '../../domain/attendanceExportDomain'
import { downloadTableXlsx, todayWib } from '../../lib/excelTableExport'
import type { BranchFilter } from '../../types/orders'

const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

/** Kehadiran → Unduh Excel: monthly summary, daily attendance and warnings/overtime. */
export const AttendanceExportButton: FC<{ activeBranch: BranchFilter }> = ({ activeBranch }) => {
  const tr = useBilingualCopy()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(todayWib().slice(0, 7))
  const employees = useHrStore((state) => state.employees)
  const attendance = useHrStore((state) => state.attendance)
  const reviewCases = useHrStore((state) => state.attendanceReviewCases)
  const defaults = useHrStore((state) => state.employeeDefaultSchedules)
  const overrides = useHrStore((state) => state.scheduleOverrides)
  const settings = useSettingsStore()
  const userName = useUserStore((state) => state.name)

  const download = () => {
    const params = { month, employees, attendance, reviewCases, defaults, overrides, settings }
    const summaryRows = buildHrMonthlyReport({ ...params, branchId: activeBranch })
    downloadTableXlsx(attendanceExportFilename(month, activeBranch), buildAttendanceExportSheets({
      ...params, branchId: activeBranch, summaryRows, summary: { exportedBy: userName, exportedAt: new Date().toISOString() },
    }))
    setOpen(false)
  }

  return (
    <>
      <ExcelDownloadButton onClick={() => setOpen(true)} />
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={tr('Download attendance', 'Unduh absensi')}
        description={tr(
          'Monthly summary per employee, every day against the schedule, and all warnings and approved overtime.',
          'Ringkasan bulanan per karyawan, absensi harian dibandingkan jadwal, serta semua peringatan dan lembur yang disetujui.',
        )}
      >
        <div className="space-y-4" data-testid="attendance-export-dialog">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">{tr('Month', 'Bulan')}</span>
            <input type="month" aria-label={tr('Month', 'Bulan')} value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass} />
          </label>
          <p className="text-xs text-muted-foreground">{activeBranch === 'All' ? tr('All branches.', 'Semua cabang.') : tr(`Branch ${activeBranch}.`, `Cabang ${activeBranch}.`)}</p>
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" onClick={download} disabled={!/^\d{4}-\d{2}$/.test(month)}>{tr('Download', 'Unduh')}</Button>
          </div>
        </div>
      </AppDialog>
    </>
  )
}
