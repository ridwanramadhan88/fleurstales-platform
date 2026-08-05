import { useMemo, useState } from 'react'
import type { Employee } from '../../store/hrStoreTypes'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { useOrdersStore } from '../../store/ordersStore'
import { usePayrollStore } from '../../store/payrollStore'
import { useUserStore } from '../../store/userStore'
import { getEmployeeRemovalBlockers } from '../../domain/hrEmployeeLifecycleDomain'
import { removeStaffEmployeeSupabase } from '../../data/staffLifecycleSupabase'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'

export const EmployeeRemovalControl = ({
  employee,
  onRemoved,
}: {
  employee: Employee
  onRemoved: () => void
}) => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const attendance = useHrStore((state) => state.attendance)
  const attendanceReviews = useHrStore((state) => state.attendanceReviewCases)
  const points = useHrStore((state) => state.employeePointEntries)
  const scheduleOverrides = useHrStore((state) => state.scheduleOverrides)
  const scheduleRevisions = useHrStore((state) => state.scheduleRevisions)
  const schedulePublications = useHrStore((state) => state.weeklySchedulePublications)
  const removeUnusedEmployee = useHrStore((state) => state.removeUnusedEmployee)
  const orders = useOrdersStore((state) => state.orders)
  const payrollDrafts = usePayrollStore((state) => state.employeePayrolls)
  const compensations = usePayrollStore((state) => state.compensations)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [nameConfirmation, setNameConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const blockers = useMemo(() => getEmployeeRemovalBlockers({
    employeeId:employee.id,
    attendance,
    attendanceReviews,
    points,
    scheduleOverrides,
    scheduleRevisions,
    schedulePublications,
    orders,
    payrollDrafts,
    compensations,
    today:todayIsoDate(),
  }), [attendance, attendanceReviews, compensations, employee.id, orders, payrollDrafts, points, scheduleOverrides, schedulePublications, scheduleRevisions])

  const canRemove = role === 'owner'
    ? employee.systemRole !== 'owner'
    : role === 'hr' && ['admin', 'florist'].includes(employee.systemRole)
  if (!canRemove) return null

  const close = () => {
    setOpen(false)
    setReason('')
    setNameConfirmation('')
    setError(null)
  }

  const confirm = async () => {
    setError(null)
    if (blockers.length) {
      setError('This employee has operational history and cannot be permanently removed. Deactivate the employee instead.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Add a removal reason.')
      return
    }
    if (nameConfirmation.trim() !== employee.name) {
      setError(`Type ${employee.name} exactly to confirm permanent removal.`)
      return
    }
    try {
      await removeStaffEmployeeSupabase(employee.id, reason.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove the employee account.')
      return
    }
    const result = removeUnusedEmployee({
      employeeId:employee.id,
      reason:reason.trim(),
      actor:{ name:actorName, role },
    })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    close()
    onRemoved()
  }

  return <>
    <section className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
      <h3 className="text-sm font-semibold text-destructive">Remove account / employee</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Only unused, mistaken, duplicate, or test records can be removed. Employees with attendance, orders, payroll, points, or published schedule history must be deactivated.</p>
      <button type="button" onClick={()=>setOpen(true)} className="mt-3 h-11 rounded-full border border-destructive/40 px-[18px] text-sm font-semibold text-destructive hover:bg-destructive/10">Remove permanently</button>
    </section>

    <AlertDialog open={open} onOpenChange={(next)=>{ if (!next) close() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {employee.name} permanently?</AlertDialogTitle>
          <AlertDialogDescription>This deletes the Supabase login, staff access profile, employee profile, and unpublished future schedules. The action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {blockers.length > 0 && <div className="rounded-lg bg-warning/10 p-3 text-sm text-warning"><p className="font-semibold">Permanent removal is blocked:</p><ul className="mt-1 space-y-1">{blockers.map((blocker)=><li key={blocker.key}>• {blocker.count} {blocker.label}</li>)}</ul></div>}
        <label className="space-y-1.5"><span className="text-xs font-medium">Removal reason</span><input value={reason} onChange={(event)=>setReason(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
        <label className="space-y-1.5"><span className="text-xs font-medium">Type {employee.name} to confirm</span><input value={nameConfirmation} onChange={(event)=>setNameConfirmation(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={Boolean(blockers.length) || reason.trim().length < 3 || nameConfirmation.trim() !== employee.name} onClick={(event)=>{ event.preventDefault(); void confirm() }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove permanently</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
