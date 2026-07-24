import { AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { hasActionPermission } from '../../config/actionPermissions'
import { usePayrollStore, type EmployeePayrollDraft, type PayrollProposal } from '../../store/payrollStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { PayrollStatusBadge, type PayrollVisualStatus } from '../payroll/PayrollStatusBadge'
import { settingsTabButtonClass, settingsTabTrackClass } from '../settings/SettingsPrimitives'
import { DatePickerField } from '../ui/date-time-field'
import { InfoDisclosure } from '../ui/info-disclosure'

const formatIdr = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`
const formatPeriod = (start?: string, end?: string) => start && end ? `${start}–${end}` : ''
const roleLabel = (role: EmployeePayrollDraft['employeeRole']) => role === 'hr' ? 'HR' : role[0].toUpperCase() + role.slice(1)

const isOwnFinancePayroll = (
  draft: EmployeePayrollDraft,
  actor: { employeeId?: string; name: string; role: string },
) => actor.role === 'finance' && (
  Boolean(actor.employeeId && draft.employeeId === actor.employeeId)
  || draft.employeeName.trim().toLocaleLowerCase() === actor.name.trim().toLocaleLowerCase()
)

type View = 'pending' | 'approved' | 'rejected' | 'paid' | 'all'
type Decision = { kind: 'approve_all' } | { kind: 'approve_employee' | 'reject_employee'; draftId: string }

const viewLabels: Record<View, string> = {
  pending: 'Review',
  approved: 'Approved',
  rejected: 'Returned to HR',
  paid: 'Paid',
  all: 'All',
}

const getProposalVisualStatus = (
  proposal: PayrollProposal,
  approved: number,
  total: number,
): PayrollVisualStatus => {
  if (proposal.status === 'paid') return 'paid'
  if (proposal.status === 'finance_approved') return 'ready_for_payment'
  if (proposal.status === 'returned_to_hr') return 'returned_to_hr'
  if (proposal.status === 'submitted_to_finance' && approved > 0 && approved < total) return 'partially_approved'
  if (proposal.status === 'submitted_to_finance') return 'needs_attention'
  return proposal.status
}

const proposalStatusText = (proposal: PayrollProposal, approved: number, total: number, returned: number) => {
  if (proposal.status === 'paid') return 'Payment recorded'
  if (proposal.status === 'finance_approved') return 'Ready for payment'
  if (proposal.status === 'returned_to_hr') return `${approved} approved · ${returned} returned`
  if (approved > 0) return `${approved} approved · ${total - approved - returned} pending · ${returned} returned`
  return `${approved} of ${total} approved`
}

export const FinancePayrollReview = () => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const actorEmployeeId = useUserStore((state) => state.employeeId)
  const permissions = useSettingsStore((state) => state.permissions)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const canApproveEmployee = hasActionPermission(role, 'finance.approve_employee_payroll', actionPermissions, permissions)
  const canApproveAll = hasActionPermission(role, 'finance.approve_all_payroll', actionPermissions, permissions)
  const canRejectEmployee = hasActionPermission(role, 'finance.reject_employee_payroll', actionPermissions, permissions)
  const canRecordPayment = hasActionPermission(role, 'finance.record_final_payment', actionPermissions, permissions)
  const proposals = usePayrollStore((state) => state.payrollProposals)
  const drafts = usePayrollStore((state) => state.employeePayrolls)
  const periods = usePayrollStore((state) => state.periods)
  const proposalReviews = usePayrollStore((state) => state.payrollProposalReviews)
  const employeeReviews = usePayrollStore((state) => state.payrollReviews)
  const approveAll = usePayrollStore((state) => state.approvePayrollProposal)
  const approveEmployee = usePayrollStore((state) => state.verifyEmployeePayroll)
  const rejectEmployee = usePayrollStore((state) => state.rejectEmployeePayroll)
  const recordPayment = usePayrollStore((state) => state.recordPayrollProposalPayment)

  const [view, setView] = useState<View>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Bank transfer')
  const [paymentReference, setPaymentReference] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null)

  const selected = selectedId ? proposals.find((item) => item.id === selectedId) ?? null : null
  const filtered = proposals.filter((proposal) => {
    if (view === 'pending') return ['submitted_to_finance', 'returned_to_hr'].includes(proposal.status)
    if (view === 'approved') return proposal.status === 'finance_approved'
    if (view === 'rejected') return proposal.status === 'returned_to_hr'
    if (view === 'paid') return proposal.status === 'paid'
    return proposal.status !== 'draft'
  })
  const counts: Record<View, number> = {
    pending: proposals.filter((item) => ['submitted_to_finance', 'returned_to_hr'].includes(item.status)).length,
    approved: proposals.filter((item) => item.status === 'finance_approved').length,
    rejected: proposals.filter((item) => item.status === 'returned_to_hr').length,
    paid: proposals.filter((item) => item.status === 'paid').length,
    all: proposals.filter((item) => item.status !== 'draft').length,
  }
  const selectedDrafts = useMemo(() => selected ? drafts.filter((item) => selected.employeePayrollIds.includes(item.id)) : [], [selected, drafts])
  const selectedPeriod = selected ? periods.find((item) => item.id === selected.payrollPeriodId) : undefined
  const pendingRows = selectedDrafts.filter((draft) => draft.status === 'pending_finance_review')
  const rejectedRows = selectedDrafts.filter((draft) => draft.status === 'finance_rejected')
  const approvedRows = selectedDrafts.filter((draft) => ['finance_verified', 'paid'].includes(draft.status))
  const ownPendingPayroll = pendingRows.find((draft) => isOwnFinancePayroll(draft, { employeeId: actorEmployeeId, name: actorName, role }))

  const reset = () => {
    setDecision(null)
    setPaymentOpen(false)
    setNote('')
    setPaymentDate('')
    setPaymentReference('')
    setPaymentMethod('Bank transfer')
    setFieldErrors({})
    setError(null)
  }
  const close = () => { setSelectedId(null); setExpandedDraftId(null); reset() }
  const submitDecision = () => {
    if (!selected || !decision) return
    const actor = { employeeId: actorEmployeeId, name: actorName, role }
    const result = decision.kind === 'approve_all'
      ? approveAll({ payrollProposalId: selected.id, note, actor })
      : decision.kind === 'approve_employee'
        ? approveEmployee({ payrollDraftId: decision.draftId, note, actor })
        : rejectEmployee({ payrollDraftId: decision.draftId, note, actor })
    if (!result.ok) { setError(result.reason); return }
    const success = decision.kind === 'approve_all'
      ? 'All remaining employee payrolls approved.'
      : decision.kind === 'approve_employee'
        ? 'Employee payroll approved.'
        : 'Employee payroll returned to HR.'
    reset()
    setExpandedDraftId(null)
    setMessage(success)
  }
  const clearPaymentFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      setError(Object.keys(next).length ? 'Complete the payroll payment details.' : null)
      return next
    })
  }
  const submitPayment = () => {
    if (!selected) return
    const result = recordPayment({
      payrollProposalId: selected.id,
      paymentDate,
      paymentMethod,
      paymentReference,
      note,
      actor: { name: actorName, role },
    })
    if (!result.ok) { setError(result.reason); setFieldErrors(result.fieldErrors ?? {}); return }
    reset()
    setMessage('Final payroll payment recorded.')
  }

  return (
    <section aria-label="Finance payroll review" className="space-y-5">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Monthly payroll proposals</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review employee payrolls, return corrections to HR, and record final payment.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Metric label="Review" value={counts.pending} />
            <Metric label="Approved" value={counts.approved} />
            <Metric label="Returned" value={counts.rejected} />
            <Metric label="Paid" value={counts.paid} />
          </div>
        </div>

        <nav aria-label="Payroll proposal status" className={settingsTabTrackClass({ level: 'primary', className: 'gap-5 sm:gap-6' })}>
          {(Object.keys(viewLabels) as View[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              aria-label={viewLabels[item]}
              onClick={() => setView(item)}
              className={settingsTabButtonClass({ active: view === item, level: 'primary', className: 'h-9 gap-1.5 px-0.5 text-sm' })}
            >
              {viewLabels[item]} <span className="text-xs text-muted-foreground">· {counts[item]}</span>
            </button>
          ))}
        </nav>
      </header>

      {message && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{message}</p>}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-5 py-8 text-center">
          <p className="text-sm font-semibold">No payroll proposals in this view</p>
          <p className="mt-1 text-xs text-muted-foreground">Proposals matching the selected status will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((proposal) => {
            const period = periods.find((item) => item.id === proposal.payrollPeriodId)
            const rows = drafts.filter((item) => proposal.employeePayrollIds.includes(item.id))
            const approved = rows.filter((item) => ['finance_verified', 'paid'].includes(item.status)).length
            const returned = rows.filter((item) => item.status === 'finance_rejected').length
            const visualStatus = getProposalVisualStatus(proposal, approved, rows.length)
            const pendingState = proposal.status === 'submitted_to_finance'
            const returnedState = proposal.status === 'returned_to_hr'
            return (
              <article
                key={proposal.id}
                className={`rounded-xl border bg-card p-4 ${pendingState ? 'border-warning/30 bg-warning/[0.025]' : returnedState ? 'border-destructive/25 bg-destructive/[0.025]' : 'border-border/70'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Payroll proposal</h3>
                      <PayrollStatusBadge status={visualStatus} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{period ? formatPeriod(period.periodStart, period.periodEnd) : proposal.payrollPeriodId}</p>
                  </div>
                  <p className="shrink-0 text-base font-semibold">{formatIdr(proposal.totalPayrollIdr)}</p>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{approved} / {rows.length} approved</p>
                    <p className="text-xs text-muted-foreground">{proposalStatusText(proposal, approved, rows.length, returned)}</p>{proposal.warnings?.length ? <p className="mt-1 text-xs font-medium text-warning">{proposal.warnings.length} warning(s)</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedId(proposal.id); setMessage(null); reset() }}
                    className={`h-11 rounded-full px-[18px] text-sm font-semibold ${pendingState || returnedState ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-foreground'}`}
                  >
                    Review proposal
                  </button>
                </div>
                {proposal.status === 'paid' && (
                  <p className="mt-3 rounded-lg bg-success/10 p-2.5 text-xs text-success">Paid {proposal.paidAt} via {proposal.paymentMethod} · {proposal.paymentReference}</p>
                )}
              </article>
            )
          })}
        </div>
      )}

      {selected && (
        <div role="dialog" aria-modal="true" aria-label="Payroll proposal review" className="mobile-focus-workflow fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-card sm:max-h-[92vh] sm:rounded-2xl">
            <div className="shrink-0 border-b border-border bg-card px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">Monthly payroll proposal</h3>
                    <PayrollStatusBadge status={getProposalVisualStatus(selected, approvedRows.length, selectedDrafts.length)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedPeriod ? formatPeriod(selectedPeriod.periodStart, selectedPeriod.periodEnd) : selected.payrollPeriodId}</p>{selected.warnings?.length ? <p className="mt-1 text-xs font-medium text-warning">Submitted with {selected.warnings.length} warning(s)</p> : null}
                </div>
                <button aria-label="Close payroll proposal" onClick={close} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
              </div>
              <div className={`mt-4 rounded-xl border p-4 ${rejectedRows.length ? 'border-destructive/25 bg-destructive/[0.025]' : pendingRows.length ? 'border-info/25 bg-info/[0.025]' : 'border-border/70 bg-background/50'}`}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Final payroll</p>
                    <p className="mt-1 text-2xl font-semibold">{formatIdr(selected.totalPayrollIdr)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{approvedRows.length} / {selectedDrafts.length} approved</p>
                    <p className="text-xs text-muted-foreground">{pendingRows.length} pending · {rejectedRows.length} returned</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${selectedDrafts.length ? Math.round((approvedRows.length / selectedDrafts.length) * 100) : 0}%` }} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <Breakdown label="Base" value={formatIdr(selected.totalBaseSalaryIdr)} />
                  <Breakdown label="Bonus" value={formatIdr(selected.totalBonusIdr)} />
                  <Breakdown label="Adjustments" value={formatIdr(selected.totalAdjustmentsIdr)} />
                </dl>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-4">
              {selected.warnings?.length ? <div className="mb-4 rounded-xl border border-warning/25 bg-warning/10 p-3 text-xs text-warning"><p className="font-semibold">Payroll warnings</p>{selected.warnings.map((warning)=><p key={warning} className="mt-1">• {warning}</p>)}</div> : null}

              {rejectedRows.length > 0 && (
                <p className="mb-4 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Returned payrolls must be corrected by HR. Already approved employee payrolls remain locked and accepted.
                </p>
              )}

              <h4 className="text-base font-semibold">Employee reviews</h4>
              <div className="mt-2 space-y-2">
                {selectedDrafts.map((draft) => {
                  const lastReview = employeeReviews.filter((item) => item.payrollDraftId === draft.id).at(-1)
                  const expanded = expandedDraftId === draft.id
                  const ownPayroll = isOwnFinancePayroll(draft, { employeeId: actorEmployeeId, name: actorName, role })
                  return (
                    <article key={draft.id} className={`rounded-xl border bg-card ${draft.status === 'pending_finance_review' ? 'border-info/25' : draft.status === 'finance_rejected' ? 'border-destructive/25' : 'border-border/70'}`}>
                      <button type="button" onClick={() => setExpandedDraftId(expanded ? null : draft.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{draft.employeeName}</p>
                            <span className="text-xs text-muted-foreground">· {roleLabel(draft.employeeRole)}</span>
                            <PayrollStatusBadge status={draft.status} />
                          </div>
                          <p className="mt-1 text-sm font-semibold">{formatIdr(draft.finalPayrollIdr)}</p>
                        </div>
                        {expanded ? <ChevronUp className="size-5 text-muted-foreground" /> : <ChevronDown className="size-5 text-muted-foreground" />}
                      </button>
                      {expanded && (
                        <div className="border-t border-border/70 px-3 pb-3 pt-3">
                          <dl className="grid grid-cols-3 gap-2 text-xs">
                            <Breakdown label="Base" value={formatIdr(draft.baseSalaryIdr)} />
                            <Breakdown label="Bonus" value={formatIdr(draft.bonusIdr)} />
                            <Breakdown label="Adjustment" value={formatIdr(draft.hrAdjustmentIdr ?? 0)} />
                          </dl>
                          {draft.hrAdjustmentReason && <p className="mt-2 rounded-lg bg-surface-panel p-2 text-xs">HR adjustment: {draft.hrAdjustmentReason}</p>}
                          {draft.rejectionReason && <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">Finance rejection: {draft.rejectionReason}</p>}
                          {lastReview && <p className="mt-2 text-xs text-muted-foreground">Last Finance decision: {lastReview.decision}{lastReview.note ? ` · ${lastReview.note}` : ''}</p>}
                          <InfoDisclosure title="Review point evidence" className="mt-2"><div className="space-y-1">{draft.pointEntries.length === 0 ? <p>No approved points.</p> : draft.pointEntries.map((entry) => <p key={entry.id} className="rounded-lg bg-background p-2 ring-1 ring-border/60">{entry.points > 0 ? '+' : ''}{entry.points} · {entry.reason}{entry.orderNumber ? ` · ${entry.orderNumber}` : ''}</p>)}</div></InfoDisclosure>
                          {ownPayroll && draft.status === 'pending_finance_review' && <p className="mt-3 text-xs text-info">Another Finance reviewer or Owner must review your payroll.</p>}
                        </div>
                      )}
                      {draft.status === 'pending_finance_review' && !ownPayroll && (canApproveEmployee || canRejectEmployee) && (
                        <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-3">
                          {canApproveEmployee && <button onClick={() => { reset(); setDecision({ kind: 'approve_employee', draftId: draft.id }) }} className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground">Approve employee</button>}
                          {canRejectEmployee && <button aria-label="Reject employee" onClick={() => { reset(); setDecision({ kind: 'reject_employee', draftId: draft.id }) }} className="h-11 rounded-full border border-destructive/40 px-[18px] text-sm font-medium text-destructive">Return to HR</button>}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>

              <InfoDisclosure title="Proposal history" className="mt-5">
                <div className="space-y-2">
                  {proposalReviews.filter((item) => item.payrollProposalId === selected.id).length === 0
                    ? <p className="text-xs text-muted-foreground">No proposal-level decisions yet.</p>
                    : proposalReviews.filter((item) => item.payrollProposalId === selected.id).map((item) => <div key={item.id} className="rounded-lg border border-border p-3 text-xs"><p className="font-medium">{item.decision}</p>{item.note && <p className="text-muted-foreground">{item.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{item.actorName} · {new Date(item.createdAt).toLocaleString('id-ID')}</p></div>)}
                </div>
              </InfoDisclosure>

              {decision && (
                <div className="mt-4 rounded-xl border border-border p-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">{decision.kind === 'approve_all' ? 'Group approval note · Optional' : decision.kind === 'approve_employee' ? 'Employee approval note · Optional' : 'Employee rejection reason for HR · Required'}</span>
                    <textarea aria-label="Payroll decision note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </label>
                  {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
                  <Footer cancel={reset} confirm={submitDecision} label={decision.kind === 'approve_all' ? 'Approve all remaining' : decision.kind === 'approve_employee' ? 'Approve employee' : 'Return employee to HR'} />
                </div>
              )}

              {paymentOpen && (
                <div className="mt-4 rounded-2xl border border-border bg-card p-5">
                  <h4 className="text-base font-semibold">Record final payroll payment</h4>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Payment date" error={fieldErrors.paymentDate}><DatePickerField value={paymentDate} onChange={(value) => { setPaymentDate(value); clearPaymentFieldError('paymentDate') }} /></Field>
                    <Field label="Payment method" error={fieldErrors.paymentMethod}><select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); clearPaymentFieldError('paymentMethod') }} className="h-10 w-full rounded-full border border-border bg-background px-3 text-sm"><option>Bank transfer</option><option>Cash</option><option>Payroll provider</option><option>Other</option></select></Field>
                    <Field label="Payment reference" error={fieldErrors.paymentReference}><input value={paymentReference} onChange={(e) => { setPaymentReference(e.target.value); clearPaymentFieldError('paymentReference') }} className="h-10 w-full rounded-full border border-border bg-background px-3 text-sm" /></Field>
                    <Field label="Note · Optional"><input value={note} onChange={(e) => { setNote(e.target.value); setError(null) }} className="h-10 w-full rounded-full border border-border bg-background px-3 text-sm" /></Field>
                  </div>
                  {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
                  <Footer cancel={reset} confirm={submitPayment} label="Confirm final payment" />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border bg-card px-5 py-3">
              <div className="flex flex-wrap justify-end gap-2">
                {['submitted_to_finance', 'returned_to_hr'].includes(selected.status) && canApproveAll && pendingRows.length > 0 && (
                  <button
                    disabled={rejectedRows.length > 0 || Boolean(ownPendingPayroll)}
                    onClick={() => { reset(); setDecision({ kind: 'approve_all' }) }}
                    title={ownPendingPayroll ? 'Another Finance reviewer or Owner must approve your payroll first.' : rejectedRows.length ? 'Resolve and resubmit returned payrolls first.' : undefined}
                    className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    Approve all remaining payroll
                  </button>
                )}
                {selected.status === 'finance_approved' && canRecordPayment && <button onClick={() => { reset(); setPaymentOpen(true) }} className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground">Record final payment</button>}
              </div>
              {ownPendingPayroll && <p className="mt-2 text-right text-xs text-muted-foreground">Group approval waits for another reviewer to approve {ownPendingPayroll.employeeName}.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const Metric = ({ label, value }: { label: string; value: number }) => (
  <p className="text-muted-foreground"><span className="font-semibold text-foreground">{value}</span> {label.toLowerCase()}</p>
)

const Breakdown = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="truncate font-semibold text-foreground">{value}</dd></div>
)

const Field = ({ label, error, children }: { label: string; error?: string; children: ReactNode }) => (
  <label className="block space-y-1"><span className="text-xs font-medium">{label}</span>{children}{error && <span className="block text-xs text-destructive">{error}</span>}</label>
)

const Footer = ({ cancel, confirm, label }: { cancel: () => void; confirm: () => void; label: string }) => (
  <div className="mt-3 flex justify-end gap-2">
    <button onClick={cancel} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium">Cancel</button>
    <button onClick={confirm} className="h-11 rounded-full bg-foreground px-[18px] text-sm font-semibold text-background">{label}</button>
  </div>
)
