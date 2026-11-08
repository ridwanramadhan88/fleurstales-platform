import type { FC } from 'react'
import { ExcelDownloadButton } from '../ui/excel-export-dialog'
import { useUserStore } from '../../store/userStore'
import type { EmployeePayrollDraft, PayrollPeriod } from '../../store/payrollStore'
import { buildPayrollExportSheets, payrollExportFilename } from '../../domain/payrollExportDomain'
import { downloadTableXlsx } from '../../lib/excelTableExport'

/** Rekap gaji for one payroll period (HR Penggajian and Finance review). */
export const PayrollExportButton: FC<{ period: PayrollPeriod; drafts: EmployeePayrollDraft[]; label?: string }> = ({ period, drafts, label }) => {
  const userName = useUserStore((state) => state.name)
  const active = drafts.filter((draft) => draft.status !== 'resolved')
  return (
    <ExcelDownloadButton
      label={label}
      disabled={active.length === 0}
      onClick={() => downloadTableXlsx(payrollExportFilename(period), buildPayrollExportSheets({
        period,
        drafts,
        summary: { exportedBy: userName, exportedAt: new Date().toISOString() },
      }))}
    />
  )
}
