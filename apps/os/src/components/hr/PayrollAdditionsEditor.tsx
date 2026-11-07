import { useState, type FC } from 'react'
import { Clock3, Trash2 } from 'lucide-react'
import { usePayrollStore } from '../../store/payrollStore'
import { useUserStore } from '../../store/userStore'
import {
  MANUAL_PAYROLL_ADDITION_KINDS,
  PAYROLL_ADDITION_LABELS,
  formatOvertimeDuration,
  payrollAdditionLines,
  sumPayrollAdditions,
  type PayrollAdditionKind,
  type PayrollAdditionLine,
} from '../../domain/payrollAdditionsDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

const formatIdr = (value: number): string => `${value < 0 ? '-' : ''}Rp ${Math.abs(Math.round(value)).toLocaleString('id-ID')}`

/** Read-only list of payroll additions/deductions (HR detail, Finance review). */
export const PayrollAdditionsList: FC<{ lines: PayrollAdditionLine[]; onRemove?: (line: PayrollAdditionLine) => void }> = ({ lines, onRemove }) => {
  const tr = useBilingualCopy()
  if (lines.length === 0) return <p className="text-xs text-muted-foreground">{tr('No additions or deductions.', 'Belum ada tambahan atau potongan.')}</p>
  return (
    <ul className="space-y-2" aria-label={tr('Payroll additions and deductions', 'Tambahan dan potongan gaji')}>
      {lines.map((line) => {
        const label = PAYROLL_ADDITION_LABELS[line.kind]
        return (
          <li key={line.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3 text-xs">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold">
                {line.kind === 'overtime' && <Clock3 className="size-3.5" aria-hidden="true" />}
                {tr(label.en, label.id)}
                {line.kind === 'overtime' && line.overtimeMinutes ? ` · ${formatOvertimeDuration(line.overtimeMinutes)}` : ''}
              </p>
              <p className="mt-0.5 text-muted-foreground">{line.reason}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className={`font-semibold tabular-nums ${line.amountIdr < 0 ? 'text-destructive' : ''}`}>{formatIdr(line.amountIdr)}</span>
              {onRemove && line.kind !== 'overtime' && (
                <button type="button" onClick={() => onRemove(line)} aria-label={tr(`Remove ${label.en}`, `Hapus ${label.id}`)} className="inline-flex size-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** HR editor: overtime arrives from attendance review; other lines are added here. */
export const PayrollAdditionsEditor: FC<{ payrollDraftId: string; onDone: () => void }> = ({ payrollDraftId, onDone }) => {
  const tr = useBilingualCopy()
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const draft = usePayrollStore((state) => state.employeePayrolls.find((item) => item.id === payrollDraftId))
  const addLine = usePayrollStore((state) => state.addEmployeePayrollAdditionLine)
  const removeLine = usePayrollStore((state) => state.removeEmployeePayrollAdditionLine)
  const [kind, setKind] = useState<PayrollAdditionKind>('allowance')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!draft) return null
  const lines = payrollAdditionLines(draft)
  const actor = { name: actorName, role }

  const add = () => {
    const result = addLine({ payrollDraftId, kind, amountIdr: Number(amount.replace(/\D/g, '')), reason, actor })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    setAmount('')
    setReason('')
    setError(null)
  }

  const remove = (line: PayrollAdditionLine) => {
    const result = removeLine({ payrollDraftId, lineId: line.id, actor })
    setError(result.ok ? null : result.reason)
  }

  return (
    <div className="space-y-4" data-testid="payroll-additions-editor">
      <p className="text-xs text-muted-foreground">
        {tr('Overtime comes from attendance: it appears here once HR approves it in attendance review.', 'Lembur berasal dari absensi: muncul di sini setelah HR menyetujuinya di tinjauan absensi.')}
      </p>
      <PayrollAdditionsList lines={lines} onRemove={remove} />
      <div className="flex justify-between rounded-lg bg-surface-panel px-3 py-2 text-sm">
        <span>{tr('Total additions', 'Total tambahan')}</span>
        <span className="font-semibold tabular-nums">{formatIdr(sumPayrollAdditions(lines))}</span>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold">{tr('Add a line', 'Tambah baris')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">{tr('Type', 'Jenis')}</span>
            <select aria-label={tr('Line type', 'Jenis baris')} value={kind} onChange={(event) => setKind(event.target.value as PayrollAdditionKind)} className="h-11 w-full rounded-full border border-border bg-background px-3 text-sm">
              {MANUAL_PAYROLL_ADDITION_KINDS.map((item) => <option key={item} value={item}>{tr(PAYROLL_ADDITION_LABELS[item].en, PAYROLL_ADDITION_LABELS[item].id)}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">{kind === 'deduction' ? tr('Deduction (IDR)', 'Potongan (Rp)') : tr('Amount (IDR)', 'Nominal (Rp)')}</span>
            <input aria-label={tr('Line amount', 'Nominal baris')} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">{tr('Reason · Required', 'Alasan · Wajib')}</span>
            <input aria-label={tr('Line reason', 'Alasan baris')} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={kind === 'deduction' ? tr('e.g. cash advance 1 Nov', 'mis. kasbon 1 Nov') : tr('e.g. installation fee Hotel X', 'mis. fee instalasi Hotel X')} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm" />
          </label>
        </div>
        {kind === 'deduction' && <p className="text-xs text-muted-foreground">{tr('Deductions cannot bring pay below the base salary.', 'Potongan tidak bisa membuat gaji di bawah gaji pokok.')}</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <button type="button" onClick={add} className="h-11 w-full rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">{tr('Add line', 'Tambah')}</button>
      </fieldset>

      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="h-11 rounded-full border border-border px-5 text-sm font-medium">{tr('Done', 'Selesai')}</button>
      </div>
    </div>
  )
}
