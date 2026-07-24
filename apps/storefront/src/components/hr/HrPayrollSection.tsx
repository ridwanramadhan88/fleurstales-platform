import { Check, ChevronDown, CircleAlert, CircleCheck, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { validatePayrollForFinance } from '../../domain/payrollFinanceReviewDomain'
import { useHrStore } from '../../store/hrStore'
import { usePayrollStore, type EmployeePayrollDraft, type PayrollProposal } from '../../store/payrollStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { ActionFooter } from '../ui/action-footer'
import { AppDialog } from '../ui/app-dialog'
import { DatePickerField } from '../ui/date-time-field'
import { PayrollStatusBadge } from '../payroll/PayrollStatusBadge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { PeopleMonthPeriodFields } from './PeoplePeriodControls'
import { PeoplePageHeader, PeopleSummaryCard, PeopleSummaryGrid } from './PeopleWorkspaceUI'

const formatIdr = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`
const roleLabel = (role: EmployeePayrollDraft['employeeRole']) => role === 'hr' ? 'HR' : role[0].toUpperCase() + role.slice(1)

const proposalLabel: Record<PayrollProposal['status'], string> = {
  draft: 'Draft',
  submitted_to_finance: 'Finance review in progress',
  returned_to_hr: 'Returned to HR',
  finance_approved: 'Ready for payment',
  paid: 'Payment recorded',
  resolved: 'Resolved',
}

interface ReadinessItem { label:string; complete:boolean; detail:string; severity:'blocker'|'warning'|'ok'; icon?:LucideIcon }

const ReadinessRow = ({ item }: { item: ReadinessItem }) => {
  const Icon = item.icon ?? (item.complete ? CircleCheck : CircleAlert)
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${item.complete ? 'text-success' : item.severity==='blocker' ? 'text-destructive' : 'text-warning'}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{item.label}</p>
        <p className="text-xs text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  )
}

export const HrPayrollSection = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const payrollSettings = useSettingsStore((state) => state.payroll)
  const employees = useHrStore((state) => state.employees)
  const entries = useHrStore((state) => state.employeePointEntries)
  const attendanceReviews = useHrStore((state) => state.attendanceReviewCases)
  const periods = usePayrollStore((state) => state.periods)
  const drafts = usePayrollStore((state) => state.employeePayrolls)
  const proposals = usePayrollStore((state) => state.payrollProposals)
  const compensations = usePayrollStore((state) => state.compensations)
  const ensureCurrentPeriod = usePayrollStore((state) => state.ensureCurrentPeriod)
  const generate = usePayrollStore((state) => state.generateEmployeePayrollDrafts)
  const submit = usePayrollStore((state) => state.submitPayrollToFinance)
  const adjust = usePayrollStore((state) => state.adjustEmployeePayrollByHr)
  const resolveRejectedEmployee = usePayrollStore((state) => state.resolveRejectedEmployeePayroll)
  const setCompensation = usePayrollStore((state) => state.setEmployeeCompensation)

  const [selectedDraft, setSelectedDraft] = useState<EmployeePayrollDraft | null>(null)
  const [adjustDraft, setAdjustDraft] = useState<EmployeePayrollDraft | null>(null)
  const [adjustment, setAdjustment] = useState('0')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [resolveDraft, setResolveDraft] = useState<EmployeePayrollDraft | null>(null)
  const [resolutionReason, setResolutionReason] = useState('')
  const [salaryEmployeeId, setSalaryEmployeeId] = useState<string | null>(null)
  const [salary, setSalary] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [readinessOpen, setReadinessOpen] = useState(true)

  useEffect(() => { ensureCurrentPeriod() }, [ensureCurrentPeriod])
  const latestPeriod = useMemo(() => periods.slice().sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0], [periods])
  useEffect(() => { if (!selectedMonth && latestPeriod) setSelectedMonth(latestPeriod.paymentDate.slice(0, 7)) }, [latestPeriod, selectedMonth])

  const monthKey = selectedMonth ?? latestPeriod?.paymentDate.slice(0, 7) ?? new Date().toISOString().slice(0, 7)
  const period = periods.find((item) => item.paymentDate.slice(0, 7) === monthKey)
  const allPeriodDrafts = useMemo(
    () => period ? drafts.filter((draft) => draft.payrollPeriodId === period.id && draft.employeeRole !== 'owner') : [],
    [drafts, period],
  )
  const visibleDrafts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return allPeriodDrafts
    return allPeriodDrafts.filter((draft) => [draft.employeeName, draft.employeeRole, draft.status, draft.rejectionReason, draft.hrAdjustmentReason]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)))
  }, [allPeriodDrafts, searchQuery])

  const proposal = period ? proposals.find((item) => item.payrollPeriodId === period.id && item.status !== 'resolved') : undefined
  const activeDrafts = allPeriodDrafts.filter((draft) => draft.status !== 'resolved')
  const eligibleEmployees = period
    ? employees.filter((employee) => employee.status === 'active' && employee.systemRole !== 'owner' && employee.hireDate <= period.periodEnd)
    : []
  const missingSalaryEmployees = period
    ? eligibleEmployees.filter((employee) => {
      const effectiveCompensation = compensations.some((item) => item.employeeId === employee.id
        && item.effectiveFrom <= period.periodEnd
        && (!item.effectiveTo || item.effectiveTo >= period.periodEnd))
      return !effectiveCompensation && (!employee.baseSalaryIdr || employee.baseSalaryIdr <= 0)
    })
    : []
  const pendingPoints = period ? entries.filter((entry) => entry.status === 'pending'
    && (entry.payrollPeriodId === period.id || (!entry.payrollPeriodId
      && (entry.effectiveDate ?? entry.createdAt.slice(0, 10)) >= period.periodStart
      && (entry.effectiveDate ?? entry.createdAt.slice(0, 10)) <= period.periodEnd))) : []
  const pendingAttendance = period ? attendanceReviews.filter((item) => item.status === 'pending'
    && item.date >= period.periodStart && item.date <= period.periodEnd) : []
  const invalidCalculations = activeDrafts.filter((draft) => !validatePayrollForFinance(draft).ok)
  const total = activeDrafts.reduce((sum, draft) => sum + draft.finalPayrollIdr, 0)
  const approvedCount = activeDrafts.filter((draft) => ['finance_verified', 'paid'].includes(draft.status)).length
  const rejectedCount = activeDrafts.filter((draft) => draft.status === 'finance_rejected').length
  const locked = proposal ? ['submitted_to_finance', 'finance_approved', 'paid'].includes(proposal.status) : false
  const draftCoverageComplete = activeDrafts.length > 0 && activeDrafts.length === eligibleEmployees.length
  const readinessItems: ReadinessItem[] = [
    {
      label: 'Employee coverage', severity:'blocker',
      complete: draftCoverageComplete,
      detail: draftCoverageComplete
        ? `${activeDrafts.length} non-owner employees included.`
        : activeDrafts.length === 0
          ? `${eligibleEmployees.length} employees will be included after generation.`
          : `${activeDrafts.length} of ${eligibleEmployees.length} employees included. Regenerate the proposal.`,
    },
    {
      label: 'Salaries complete', severity:'blocker',
      complete: missingSalaryEmployees.length === 0,
      detail: missingSalaryEmployees.length === 0 ? 'Every included employee has an effective base salary.' : `${missingSalaryEmployees.length} employee(s) need a base salary.`,
    },
    {
      label: 'Attendance reviewed', severity:'warning',
      complete: pendingAttendance.length === 0,
      detail: pendingAttendance.length === 0 ? 'No attendance warnings are waiting for HR.' : `${pendingAttendance.length} attendance warning(s) require review.`,
    },
    {
      label: 'Points reviewed', severity:'warning',
      complete: pendingPoints.length === 0,
      detail: pendingPoints.length === 0 ? 'No point entries are waiting for review.' : `${pendingPoints.length} point entry/entries require review.`,
    },
    {
      label: 'Calculations valid', severity:'blocker',
      complete: activeDrafts.length > 0 && invalidCalculations.length === 0,
      detail: activeDrafts.length === 0 ? 'Generate the proposal to calculate payroll.' : invalidCalculations.length === 0 ? 'All payroll totals pass validation.' : `${invalidCalculations.length} payroll calculation(s) need correction.`,
    },
  ]
  const blockers = readinessItems.filter((item) => !item.complete && item.severity === 'blocker')
  const warnings = readinessItems.filter((item) => !item.complete && item.severity === 'warning')
  const readyToSubmit = blockers.length === 0 && !locked

  useEffect(() => {
    setReadinessOpen(blockers.length > 0 || warnings.length > 0)
  }, [period?.id, blockers.length, warnings.length])

  const handleGenerate = () => {
    if (!period) return
    const result = generate({ payrollPeriodId: period.id, actor: { name: actorName, role } })
    if (!result.ok) { setError(result.reason); setMessage(null); return }
    setError(null)
    setMessage(`${result.affected ?? 0} employee payroll drafts generated.`)
  }
  const handleSubmit = () => {
    if (!period) return
    if (warnings.length > 0 && typeof window !== 'undefined' && !window.confirm(`Submit payroll with ${warnings.length} warning(s)? Unresolved warnings will remain visible to Finance.`)) return
    const result = submit({ payrollPeriodId: period.id, actor: { name: actorName, role } })
    if (!result.ok) { setError(result.reason); setMessage(null); return }
    setError(null)
    setMessage(proposal?.status === 'returned_to_hr' ? 'Corrected employee payrolls resubmitted to Finance.' : 'Complete payroll proposal sent to Finance.')
  }
  const openAdjustment = (draft: EmployeePayrollDraft) => {
    setAdjustDraft(draft)
    setAdjustment(String(draft.hrAdjustmentIdr ?? 0))
    setAdjustmentReason(draft.hrAdjustmentReason ?? '')
    setError(null)
  }
  const saveAdjustment = () => {
    if (!adjustDraft) return
    const result = adjust({ payrollDraftId: adjustDraft.id, adjustmentIdr: Number(adjustment || 0), reason: adjustmentReason, actor: { name: actorName, role } })
    if (!result.ok) { setError(result.reason); return }
    setAdjustDraft(null)
    setError(null)
    setMessage('HR payroll adjustment saved.')
  }
  const handleResolveEmployee = () => {
    if (!resolveDraft) return
    const result = resolveRejectedEmployee({ payrollDraftId: resolveDraft.id, reason: resolutionReason, actor: { name: actorName, role } })
    if (!result.ok) { setError(result.reason); return }
    setResolveDraft(null)
    setResolutionReason('')
    setError(null)
    setMessage(`${resolveDraft.employeeName} removed from this payroll proposal. Other approved employees remain accepted.`)
  }
  const openSalary = (employeeId: string) => {
    const current = compensations.filter((item) => item.employeeId === employeeId && !item.effectiveTo).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
    setSalaryEmployeeId(employeeId)
    setSalary(String(current?.baseSalaryIdr ?? ''))
    setEffectiveFrom(new Date().toISOString().slice(0, 10))
    setError(null)
  }
  const saveSalary = () => {
    if (!salaryEmployeeId) return
    const result = setCompensation({ employeeId: salaryEmployeeId, baseSalaryIdr: Number(salary), effectiveFrom, actor: { name: actorName, role } })
    if (!result.ok) { setError(result.reason); return }
    setSalaryEmployeeId(null)
    setError(null)
    setMessage('Base salary version saved. Regenerate payroll to use it.')
  }

  if (!period) return (
    <section className="space-y-4 pb-24 md:pb-0">
      <PeoplePageHeader section="payroll" />
      <PeopleMonthPeriodFields month={monthKey} onMonthChange={setSelectedMonth} settings={payrollSettings} />
      <p className="rounded-xl bg-surface-panel p-4 text-sm text-muted-foreground ring-1 ring-border/70">No payroll period has been generated for this month.</p>
    </section>
  )

  const currentAction = proposal?.status === 'returned_to_hr'
    ? { label: 'Resubmit to Finance', disabled: !readyToSubmit, onClick: handleSubmit }
    : proposal?.status === 'submitted_to_finance'
      ? { label: 'Finance review in progress', disabled: true, onClick: handleSubmit }
      : proposal?.status === 'finance_approved'
        ? null
        : proposal?.status === 'paid'
          ? null
          : activeDrafts.length
            ? { label: 'Send to Finance', disabled: !readyToSubmit, onClick: handleSubmit }
            : null

  return (
    <section className="space-y-4 pb-24 md:space-y-5 md:pb-0">
      <PeoplePageHeader
        section="payroll"
        action={proposal ? <PayrollStatusBadge status={proposal.status} label={proposalLabel[proposal.status]} /> : undefined}
      />

      <div className="flex flex-col gap-3 border-y border-border/60 py-3 md:flex-row md:items-center md:justify-between">
        <PeopleMonthPeriodFields month={monthKey} onMonthChange={setSelectedMonth} settings={payrollSettings} className="md:flex-1" />
        <div className="flex flex-wrap gap-2 md:shrink-0 md:justify-end">
          {!activeDrafts.length && (
            <button type="button" onClick={handleGenerate} className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground">
              Generate proposal
            </button>
          )}
          {activeDrafts.length > 0 && !locked && (
            <button type="button" onClick={handleGenerate} className="h-11 rounded-full border border-border bg-background px-[18px] text-sm font-semibold text-foreground">
              Regenerate
            </button>
          )}
          {currentAction && (
            <button
              type="button"
              onClick={currentAction.onClick}
              disabled={currentAction.disabled}
              title={currentAction.disabled && blockers.length ? blockers.map((item) => item.detail).join(' ') : undefined}
              className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {warnings.length && !currentAction.disabled ? `${currentAction.label} with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : currentAction.label}
            </button>
          )}
        </div>
      </div>

      <section className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold leading-6">Monthly payroll proposal</h2>
            <p className="mt-1 text-sm text-muted-foreground">{period.periodStart}–{period.periodEnd} · {activeDrafts.length || eligibleEmployees.length} non-owner employees</p>
          </div>
          {proposal && <PayrollStatusBadge status={proposal.status} label={proposalLabel[proposal.status]} />}
        </div>

        <PeopleSummaryGrid className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PeopleSummaryCard className="min-h-[84px]" label="Employees" value={String(activeDrafts.length)} />
          <PeopleSummaryCard className="min-h-[84px]" label="Base salary" value={formatIdr(activeDrafts.reduce((sum, item) => sum + item.baseSalaryIdr, 0))} valueClassName="truncate text-lg font-semibold leading-none text-foreground" />
          <PeopleSummaryCard className="min-h-[84px]" label="Bonus + adjustments" value={formatIdr(activeDrafts.reduce((sum, item) => sum + item.bonusIdr + (item.hrAdjustmentIdr ?? 0), 0))} valueClassName="truncate text-lg font-semibold leading-none text-foreground" />
          <PeopleSummaryCard className="min-h-[84px]" label="Proposal total" value={formatIdr(total)} valueClassName="truncate text-lg font-semibold leading-none text-foreground" />
        </PeopleSummaryGrid>

        <div className={`rounded-xl border p-3.5 ${blockers.length ? 'border-destructive/25 bg-destructive/5' : warnings.length ? 'border-warning/25 bg-warning/5' : 'border-success/20 bg-success/5'}`}>
          <button
            type="button"
            aria-expanded={readinessOpen}
            onClick={() => setReadinessOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left md:cursor-default"
          >
            <div>
              <h3 className="text-sm font-semibold">Payroll readiness</h3>
              <p className="text-xs text-muted-foreground">{blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}` : warnings.length ? `Ready with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'Ready to send to Finance'}</p>
            </div>
            <span className="flex items-center gap-2">
              {blockers.length === 0 && <Check className="size-5 text-success" />}
              <ChevronDown className={`size-5 text-muted-foreground transition-transform md:hidden ${readinessOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>
          <div className={`${readinessOpen ? 'grid' : 'hidden'} mt-3 gap-2 sm:grid-cols-2 md:grid xl:grid-cols-5`}>
            {readinessItems.map((item) => <ReadinessRow key={item.label} item={item} />)}
          </div>
          {warnings.length > 0 && <p className={`${readinessOpen ? 'block' : 'hidden'} mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning md:block`}>{warnings.map((item) => item.detail).join(' · ')} These warnings do not block submission.</p>}
        </div>

        {proposal?.status === 'returned_to_hr' && (
          <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">Finance returned {rejectedCount} employee payroll(s). Correct or resolve those records, then resubmit. {approvedCount} approved payroll(s) remain locked and accepted.</p>
        )}
        {message && !message.toLowerCase().includes('sent to finance') && <p className="rounded-lg bg-success/10 p-3 text-xs text-success">{message}</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
      </section>

      <div className="space-y-2">
        {visibleDrafts.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">{activeDrafts.length ? 'No employee payrolls match the current search.' : 'Generate the payroll proposal to review salary, points, and HR adjustments.'}</p>
        ) : visibleDrafts.map((draft) => {
          const editable = ['draft', 'finance_rejected'].includes(draft.status) && !locked
          return (
            <article key={draft.id} className="rounded-xl bg-card p-3.5 ring-1 ring-border/60 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold">{draft.employeeName}</p>
                    <span className="text-sm text-muted-foreground">· {roleLabel(draft.employeeRole)}</span>
                    <PayrollStatusBadge status={draft.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Base {formatIdr(draft.baseSalaryIdr)} · Bonus {formatIdr(draft.bonusIdr)}{draft.hrAdjustmentIdr ? ` · Adj. ${formatIdr(draft.hrAdjustmentIdr)}` : ''}</p>
                </div>
                {(role === 'owner' && editable) && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`More payroll actions for ${draft.employeeName}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => openSalary(draft.employeeId)}>Set base salary</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
              </div>
              <p className="mt-3 text-xl font-semibold leading-none">{formatIdr(draft.finalPayrollIdr)}</p>
              {draft.rejectionReason && <p className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">Finance rejection: {draft.rejectionReason}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button onClick={() => setSelectedDraft(draft)} className="h-11 rounded-full border border-border px-4 text-sm font-medium">View points</button>
                {editable && <button onClick={() => openAdjustment(draft)} className="h-11 rounded-full border border-border px-4 text-sm font-medium">Edit adjustment</button>}
                {draft.status === 'finance_rejected' && <button onClick={() => { setResolveDraft(draft); setResolutionReason(''); setError(null) }} className="col-span-2 h-11 rounded-full border border-destructive/40 px-4 text-sm font-medium text-destructive sm:col-span-1">Resolve employee</button>}
              </div>
            </article>
          )
        })}
      </div>

      {selectedDraft && <Modal title={`${selectedDraft.employeeName} payroll`} onClose={() => setSelectedDraft(null)}><div className="space-y-2 text-sm"><Line label="Base salary" value={formatIdr(selectedDraft.baseSalaryIdr)} /><Line label="Point bonus" value={formatIdr(selectedDraft.bonusIdr)} /><Line label="HR adjustment" value={formatIdr(selectedDraft.hrAdjustmentIdr ?? 0)} /><Line label="Final payroll" value={formatIdr(selectedDraft.finalPayrollIdr)} strong /></div><h4 className="mt-5 text-sm font-semibold">Approved point evidence</h4><div className="mt-2 space-y-2">{selectedDraft.pointEntries.length === 0 ? <p className="text-xs text-muted-foreground">No approved point entries.</p> : selectedDraft.pointEntries.map((entry) => <div key={entry.id} className="rounded-lg bg-muted/50 p-3 text-xs"><p className="font-medium">{entry.points > 0 ? '+' : ''}{entry.points} points · {entry.category.replaceAll('_', ' ')}</p><p className="text-muted-foreground">{entry.reason}</p></div>)}</div></Modal>}
      {adjustDraft && <Modal title={`Adjust ${adjustDraft.employeeName}`} onClose={() => setAdjustDraft(null)}><p className="text-xs text-muted-foreground">HR owns proposal adjustments. Finance may approve or reject this employee inside the monthly group.</p><label className="mt-4 block space-y-1"><span className="text-xs font-medium">Adjustment amount (IDR)</span><input aria-label="HR payroll adjustment" value={adjustment} onChange={(e) => setAdjustment(e.target.value.replace(/[^\d-]/g, ''))} className="h-10 w-full rounded-full border border-border bg-background px-3 text-sm" /></label><label className="mt-3 block space-y-1"><span className="text-xs font-medium">Reason · Required when amount changes</span><textarea aria-label="HR payroll adjustment reason" value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>{error && <p className="mt-2 text-xs text-destructive">{error}</p>}<Footer cancel={() => setAdjustDraft(null)} confirm={saveAdjustment} label="Save adjustment" /></Modal>}
      {resolveDraft && <Modal title={`Resolve ${resolveDraft.employeeName}`} onClose={() => setResolveDraft(null)}><p className="text-xs text-muted-foreground">Remove only this rejected employee from the current monthly proposal. Other Finance-approved payrolls remain accepted.</p><textarea aria-label="Employee payroll resolution reason" value={resolutionReason} onChange={(e) => setResolutionReason(e.target.value)} className="mt-3 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Reason · Required" />{error && <p className="mt-2 text-xs text-destructive">{error}</p>}<Footer cancel={() => setResolveDraft(null)} confirm={handleResolveEmployee} label="Resolve employee" /></Modal>}
      {salaryEmployeeId && <Modal title="Set base salary" onClose={() => setSalaryEmployeeId(null)}><label className="block space-y-1"><span className="text-xs font-medium">Monthly base salary</span><input aria-label="Monthly base salary" inputMode="numeric" value={salary} onChange={(event) => setSalary(event.target.value.replace(/\D/g, ''))} className="h-10 w-full rounded-full border border-border bg-background px-3 text-sm" /></label><label className="mt-3 block space-y-1"><span className="text-xs font-medium">Effective from</span><DatePickerField value={effectiveFrom} onChange={setEffectiveFrom} /></label>{error && <p className="mt-2 text-xs text-destructive">{error}</p>}<Footer cancel={() => setSalaryEmployeeId(null)} confirm={saveSalary} label="Save salary" /></Modal>}
    </section>
  )
}

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => (
  <AppDialog open onOpenChange={(open) => { if (!open) onClose() }} title={title} contentClassName="sm:max-w-lg">
    <div className="space-y-4">{children}</div>
  </AppDialog>
)

const Footer = ({ cancel, confirm, label }: { cancel: () => void; confirm: () => void; label: string }) => (
  <ActionFooter className="mt-4">
    <button onClick={cancel} className="h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
    <button onClick={confirm} className="h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-primary-foreground shadow-ios-sm hover:bg-primary/90">{label}</button>
  </ActionFooter>
)

const Line = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-4 rounded-lg px-3 py-2 ${strong ? 'bg-foreground font-semibold text-background' : 'bg-muted/50'}`}>
    <span>{label}</span><span>{value}</span>
  </div>
)
