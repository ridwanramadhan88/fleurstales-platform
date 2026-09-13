import { useMemo, useState } from 'react'
import type { Employee } from '../../store/hrStoreTypes'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { useOrdersStore } from '../../store/ordersStore'
import { usePayrollStore } from '../../store/payrollStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getEmployeeRemovalBlockers } from '../../domain/hrEmployeeLifecycleDomain'
import { isHrManagedEmployeeRole } from '../../domain/hrManagedEmployeeDomain'
import { removeStaffEmployeeSupabase } from '../../data/staffLifecycleSupabase'
import { isSupabaseConfigured } from '../../data/shared/supabaseConfig'
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
  const hrManagedRoles = useSettingsStore((state) => state.staffRoles.hrManagedRoles)
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
  const [forceResolve, setForceResolve] = useState(false)
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
    : role === 'hr' && isHrManagedEmployeeRole(employee.systemRole, 'employees', hrManagedRoles)
  if (!canRemove) return null

  const close = () => {
    setOpen(false)
    setReason('')
    setNameConfirmation('')
    setForceResolve(false)
    setError(null)
  }

  const forceResolveLocalState = () => {
    useHrStore.setState((state) => ({
      employees: state.employees.filter((item) => item.id !== employee.id),
      attendance: state.attendance.filter((item) => item.employeeId !== employee.id),
      attendanceReviewCases: state.attendanceReviewCases.filter((item) => item.employeeId !== employee.id),
      employeePointEntries: state.employeePointEntries.filter((item) => item.employeeId !== employee.id),
      employeeDefaultSchedules: state.employeeDefaultSchedules.filter((item) => item.employeeId !== employee.id),
      scheduleOverrides: state.scheduleOverrides.filter((item) => item.employeeId !== employee.id),
      scheduleRevisions: state.scheduleRevisions.filter((item) => item.employeeId !== employee.id),
    }))
    usePayrollStore.setState((state) => ({
      employeePayrolls: state.employeePayrolls.filter((item) => item.employeeId !== employee.id),
      compensations: state.compensations.filter((item) => item.employeeId !== employee.id),
    }))
    useOrdersStore.setState((state) => ({
      orders: state.orders.map((order) => ({
        ...order,
        floristAssignedEmployeeId: order.floristAssignedEmployeeId === employee.id ? undefined : order.floristAssignedEmployeeId,
        floristAssignedByEmployeeId: order.floristAssignedByEmployeeId === employee.id ? undefined : order.floristAssignedByEmployeeId,
        adminHandledEmployeeId: order.adminHandledEmployeeId === employee.id ? undefined : order.adminHandledEmployeeId,
      })),
    }))
  }

  const confirm = async () => {
    setError(null)
    if (blockers.length && !forceResolve) {
      setError('Linked operational records must be resolved first, or enable Force resolve below.')
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
      await removeStaffEmployeeSupabase(employee.id, reason.trim(), forceResolve)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove the employee account.')
      return
    }

    if (forceResolve) {
      // Supabase is authoritative in production. Realtime will hydrate the
      // resolved snapshot; local-only/test mode needs the same cleanup here.
      if (!isSupabaseConfigured()) forceResolveLocalState()
    } else {
      const result = removeUnusedEmployee({
        employeeId:employee.id,
        reason:reason.trim(),
        actor:{ name:actorName, role },
      })
      if (!result.ok) {
        setError(result.reason)
        return
      }
    }
    close()
    onRemoved()
  }

  const blocked = blockers.length > 0
  const ready = reason.trim().length >= 3 && nameConfirmation.trim() === employee.name && (!blocked || forceResolve)

  return <>
    <section className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
      <h3 className="text-sm font-semibold text-destructive">Remove account / employee</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Permanent removal deletes the staff login and employee profile. If linked operational history exists, review it first or use Force resolve.</p>
      <button type="button" onClick={()=>setOpen(true)} className="mt-3 h-11 rounded-full border border-destructive/40 px-[18px] text-sm font-semibold text-destructive hover:bg-destructive/10">Remove permanently</button>
    </section>

    <AlertDialog open={open} onOpenChange={(next)=>{ if (!next) close() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {employee.name} permanently?</AlertDialogTitle>
          <AlertDialogDescription>This deletes the Supabase login, staff access profile, employee profile, and future staff scheduling. The action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {blocked && <div className="rounded-lg bg-warning/10 p-3 text-sm text-warning"><p className="font-semibold">Linked records found:</p><ul className="mt-1 space-y-1">{blockers.map((blocker)=><li key={blocker.key}>• {blocker.count} {blocker.label}</li>)}</ul></div>}
        {blocked && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3"><input type="checkbox" checked={forceResolve} onChange={(event)=>setForceResolve(event.target.checked)} className="mt-0.5 size-4" /><span><span className="block text-sm font-semibold text-destructive">Force resolve linked records</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Remove the linked attendance, review, points, schedule and payroll records, and detach this employee from existing orders before deleting the account.</span></span></label>}
        <label className="space-y-1.5"><span className="text-xs font-medium">Removal reason</span><input value={reason} onChange={(event)=>setReason(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
        <label className="space-y-1.5"><span className="text-xs font-medium">Type {employee.name} to confirm</span><input value={nameConfirmation} onChange={(event)=>setNameConfirmation(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!ready} onClick={(event)=>{ event.preventDefault(); void confirm() }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{forceResolve ? 'Force resolve & remove' : 'Remove permanently'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
