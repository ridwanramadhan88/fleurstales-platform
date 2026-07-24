import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHrStore } from '../../store/hrStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { isHrManagedEmployee } from '../../domain/hrManagedEmployeeDomain'
import { useSettingsStore } from '../../store/settingsStore'
import type { EmployeePointEntry } from '../../store/hrStoreTypes'
import {
  buildEmployeePointSummaries,
  MONTHLY_POINT_BONUS_CAP_IDR,
  type OrderContributionRules,
} from '../../domain/orderContributionPointsDomain'
import { PeopleMonthPeriodFields } from './PeoplePeriodControls'
import { PeoplePageHeader, PeopleSummaryCard, PeopleSummaryGrid } from './PeopleWorkspaceUI'
import { settingsTabButtonClass, settingsTabTrackClass } from '../settings/SettingsPrimitives'

const categoryLabel: Record<EmployeePointEntry['category'], string> = {
  attendance_penalty: 'Attendance penalty',
  florist_assignment: 'Legacy florist assignment',
  admin_order_handled: 'Admin-handled order',
  florist_order_completed: 'Florist-completed order',
  manual_reward: 'Manual reward',
  manual_penalty: 'Manual penalty',
  reversal: 'Reversal',
}

const formatIdr = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`
const formatCompletedDate = (value?: string) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}
const currentPeriodKey = () => new Date().toISOString().slice(0, 7)

type View = 'overview' | 'rules'

export const HrPointsSection = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const hrManagedRoles = useSettingsStore((state) => state.staffRoles.hrManagedRoles)
  const entries = useHrStore((state) => state.employeePointEntries)
  const allEmployees = useHrStore((state) => state.employees)
  const managedEmployees = useMemo(() => allEmployees.filter((employee) => role === 'owner' ? employee.systemRole !== 'owner' : isHrManagedEmployee(employee, 'points', hrManagedRoles)), [allEmployees, role, hrManagedRoles])
  const employees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return managedEmployees
    return managedEmployees.filter((employee) => [employee.name, employee.systemRole, employee.phone].some((value) => value?.toLowerCase().includes(query)))
  }, [managedEmployees, searchQuery])
  const rules = useHrStore((state) => state.pointRules)
  const payrollSettings = useSettingsStore((state) => state.payroll)
  const updateRules = useHrStore((state) => state.updatePointRules)
  const syncOrderPoints = useHrStore((state) => state.syncOrderContributionPoints)
  const createAdjustment = useHrStore((state) => state.createManualPointAdjustment)
  const approve = useHrStore((state) => state.approvePointEntry)
  const reject = useHrStore((state) => state.rejectPointEntry)
  const reverse = useHrStore((state) => state.reversePointEntry)
  const orders = useOrdersStore((state) => state.orders)

  const periodOptions = useMemo(() => {
    const values = new Set<string>([currentPeriodKey()])
    orders.forEach((order) => {
      const raw = order.completedAt ?? order.financeVerifiedAt
      if (raw && /^\d{4}-\d{2}/.test(raw)) values.add(raw.slice(0, 7))
    })
    entries.forEach((entry) => entry.periodKey && values.add(entry.periodKey))
    return [...values].sort().reverse()
  }, [orders, entries])

  const [view, setView] = useState<View>('overview')
  const [periodKey, setPeriodKey] = useState(periodOptions[0] ?? currentPeriodKey())
  const [tab, setTab] = useState<'pending' | 'approved' | 'all'>('pending')
  const [selected, setSelected] = useState<EmployeePointEntry | null>(null)
  const [action, setAction] = useState<'approve' | 'reject' | 'reverse'>('approve')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState(employees.find((employee) => employee.status === 'active')?.id ?? '')
  const [points, setPoints] = useState('10')
  const [adjustmentDirection, setAdjustmentDirection] = useState<'positive' | 'negative' | null>(null)
  const [reason, setReason] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [ruleDraft, setRuleDraft] = useState<OrderContributionRules>(rules)
  const [ruleErrors, setRuleErrors] = useState<Partial<Record<keyof OrderContributionRules, string>>>({})
  const [ruleMessage, setRuleMessage] = useState<string | null>(null)

  useEffect(() => setRuleDraft(rules), [rules])
  useEffect(() => {
    if (!periodOptions.includes(periodKey)) setPeriodKey(periodOptions[0] ?? currentPeriodKey())
  }, [periodOptions, periodKey])

  const visible = useMemo(
    () =>
      entries
        .filter((entry) => (entry.payrollPeriodId?.replace('payroll-', '') ?? entry.periodKey ?? entry.effectiveDate?.slice(0, 7) ?? entry.createdAt.slice(0, 7)) === periodKey)
        .filter((entry) => tab === 'all' || (tab === 'pending' ? entry.status === 'pending' : entry.status === 'approved' || entry.status === 'reversed'))
        .filter((entry) => {
          const query = searchQuery.trim().toLowerCase()
          if (!query) return true
          const employee = managedEmployees.find((item) => item.id === entry.employeeId)
          return [employee?.name, categoryLabel[entry.category], entry.reason, entry.orderNumber]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries, tab, periodKey, searchQuery, managedEmployees],
  )

  const summaries = useMemo(
    () => buildEmployeePointSummaries({ orders, employees, entries, rules, periodKey, payrollSettings }),
    [orders, employees, entries, rules, periodKey],
  )

  const periodEntries = entries.filter((entry) => (entry.payrollPeriodId?.replace('payroll-', '') ?? entry.periodKey ?? entry.effectiveDate?.slice(0, 7) ?? entry.createdAt.slice(0, 7)) === periodKey)
  const approvedNet = periodEntries.filter((entry) => entry.status === 'approved').reduce((total, entry) => total + entry.points, 0)
  const pendingCount = periodEntries.filter((entry) => entry.status === 'pending').length

  const submitReview = () => {
    if (!selected) return
    const actor = { name: actorName, role }
    const result = action === 'approve'
      ? approve({ entryId: selected.id, note, actor })
      : action === 'reject'
        ? reject({ entryId: selected.id, note, actor })
        : reverse({ entryId: selected.id, reason: note, actor })
    if (!result.ok) { setError(result.reason); return }
    setSelected(null); setNote(''); setError(null)
  }

  const submitAdjustment = () => {
    const signedPoints = adjustmentDirection === 'negative' ? -Number(points) : Number(points)
    if (!adjustmentDirection) { setError('Choose + Points or − Points.'); return }
    const result = createAdjustment({ employeeId, points: signedPoints, reason, actor: { name: actorName, role } })
    if (!result.ok) { setError(result.reason); return }
    setShowAdd(false); setReason(''); setPoints('10'); setAdjustmentDirection(null); setError(null)
  }

  const saveRules = () => {
    setRuleErrors({}); setRuleMessage(null)
    const result = updateRules({ rules: ruleDraft, actor: { name: actorName, role } })
    if (!result.ok) {
      if (result.field) setRuleErrors({ [result.field]: result.reason })
      else setError(result.reason)
      return
    }
    const sync = syncOrderPoints({ orders, actor: { name: actorName, role } })
    if (!sync.ok) { setError(sync.reason); return }
    setRuleMessage(`Rules saved. ${sync.created} automatic contribution entries created and ${sync.reversed} approved entries reversed.`)
    setError(null)
  }

  const setRule = (field: keyof OrderContributionRules, value: string) => {
    setRuleDraft((current) => ({ ...current, [field]: Number(value.replace(/\D/g, '')) }))
    setRuleErrors((current) => ({ ...current, [field]: undefined }))
    setRuleMessage(null)
  }

  return <section className="space-y-5 pb-24 md:pb-0">
    <PeoplePageHeader section="points" />

    <div className="space-y-3">
      <nav aria-label="Point sections" className={settingsTabTrackClass({ level:'primary', className:'-mx-4 gap-4 px-4 scroll-px-4 sm:mx-0 sm:gap-5 sm:px-0 sm:scroll-px-0' })}>
        {(['overview', 'rules'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            aria-current={view === item ? 'page' : undefined}
            className={settingsTabButtonClass({ active:view === item, level:'primary', className:'h-9 scroll-mx-1 px-0.5 text-sm capitalize' })}
          >
            {item}
          </button>
        ))}
      </nav>
      <PeopleMonthPeriodFields month={periodKey} onMonthChange={setPeriodKey} settings={payrollSettings} />
    </div>

    <PeopleSummaryGrid className="grid-cols-3 gap-3">
      <PeopleSummaryCard className="md:min-h-[76px]" label="Pending review" value={pendingCount} tone={pendingCount ? 'warning' : 'default'} />
      <PeopleSummaryCard className="md:min-h-[76px]" label="Approved points" value={approvedNet} tone="success" />
      <PeopleSummaryCard className="md:min-h-[76px]" label="Point value" value={formatIdr(payrollSettings.pointValueIdr)} helper={`Cap ${formatIdr(MONTHLY_POINT_BONUS_CAP_IDR)}`} valueClassName="text-lg font-semibold leading-none text-foreground" />
    </PeopleSummaryGrid>

    {view === 'overview' && <>
    <section className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/60">
      <div><h2 className="text-sm font-semibold leading-5">Employee point progress</h2><p className="text-xs text-muted-foreground">Approved points and estimated bonus for {periodKey}.</p></div>
      {summaries.length === 0 ? <p className="rounded-lg bg-surface-panel p-4 text-xs text-muted-foreground">No eligible employee or point activity in this period.</p> : <div className="grid gap-3 lg:grid-cols-2">{summaries.map((summary) => <article key={summary.employeeId} className="rounded-xl border border-border/60 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold leading-5">{summary.employeeName}</p><p className="text-xs capitalize text-muted-foreground">{summary.role}</p></div><div className="text-right"><p className="text-sm font-semibold leading-5">{summary.approvedNetPoints} approved</p><p className="text-xs text-muted-foreground">Est. bonus {formatIdr(summary.estimatedBonusIdr)}</p></div></div>
        {summary.role === 'admin' && <ProgressBlock label="Eligible collect orders" completed={summary.adminEligibleOrders} minimum={summary.adminMinimumIncluded} eligible={summary.adminPointEligibleOrders} pointsEach={rules.collectOrderPoints} />}
        <div className="mt-3 grid grid-cols-3 divide-x divide-border/60 rounded-lg bg-surface-panel px-2 py-2 text-center text-2xs"><div><p className="text-muted-foreground">Pending</p><p className="font-semibold">{summary.pendingPoints}</p></div><div><p className="text-success">Positive</p><p className="font-semibold text-success">+{summary.approvedPositivePoints}</p></div><div><p className="text-destructive">Minus</p><p className="font-semibold text-destructive">-{summary.approvedNegativePoints}</p></div></div>
      </article>)}</div>}
    </section>

    <section className="rounded-xl bg-card p-4 ring-1 ring-border/60">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold leading-5">Point reviews</h2><p className="text-xs text-muted-foreground">Review pending point entries and create manual adjustments when needed.</p></div><button onClick={() => setShowAdd(true)} className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground">Manual adjustment</button></div>
      <div className="mt-3 inline-flex rounded-full bg-surface-track p-1">{(['pending', 'approved', 'all'] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-3 py-1.5 text-xs capitalize ${tab === item ? 'bg-surface-selected text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}>{item}</button>)}</div>
      <div className="mt-3 space-y-2">{visible.length === 0 ? <p className="rounded-lg bg-surface-panel p-4 text-xs text-muted-foreground">No point entries in this view.</p> : visible.map((entry) => {
        const employee = employees.find((item) => item.id === entry.employeeId)
        const isAutomaticOrderEntry = entry.sourceType === 'order'
        const completedDate = formatCompletedDate(entry.sourceCompletedAt)
        return <article key={entry.id} className="rounded-xl border border-border/60 p-4"><div className="flex flex-wrap justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold leading-5">{employee?.name ?? 'Unknown employee'} · {entry.points > 0 ? '+' : ''}{entry.points} points</p>{isAutomaticOrderEntry && <span className="rounded-full bg-info/10 px-2 py-1 text-2xs font-medium text-info">Automatic</span>}</div><p className="text-xs text-muted-foreground">{categoryLabel[entry.category]} · {entry.reason}</p></div><span className="rounded-full bg-surface-neutral px-2 py-1 text-xs text-foreground ring-1 ring-border/80">{entry.status}</span></div><p className="mt-2 text-2xs text-muted-foreground">Source: {entry.sourceType}{entry.orderNumber ? ` · ${entry.orderNumber}` : ''} · Created by {entry.createdBy}</p>{isAutomaticOrderEntry && (entry.sourceAmountIdr !== undefined || completedDate) && <p className="mt-1 text-2xs text-muted-foreground">{entry.sourceAmountIdr !== undefined ? `Product subtotal ${formatIdr(entry.sourceAmountIdr)}` : ''}{entry.sourceAmountIdr !== undefined && completedDate ? ' · ' : ''}{completedDate ? `Completed ${completedDate}` : ''}</p>}{entry.reviewNote && <p className="mt-2 rounded-lg bg-surface-panel p-2 text-xs">{entry.reviewedBy}: {entry.reviewNote}</p>}<div className="mt-3 flex gap-2">{entry.status === 'pending' && <><button onClick={() => { setSelected(entry); setAction('approve'); setNote(''); setError(null) }} className="h-11 rounded-full bg-foreground px-[18px] text-sm text-background">Approve</button><button onClick={() => { setSelected(entry); setAction('reject'); setNote(''); setError(null) }} className="rounded-full border border-border px-3 py-1.5 text-xs">Reject</button></>}{entry.status === 'approved' && <button onClick={() => { setSelected(entry); setAction('reverse'); setNote(''); setError(null) }} className="rounded-full border border-border px-3 py-1.5 text-xs">Reverse</button>}</div></article>
      })}</div>
    </section>
    </>}

    {view === 'rules' && <section className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/60">
      <div><h2 className="text-sm font-semibold leading-5">Points rules</h2><p className="text-xs text-muted-foreground">Rules apply to contribution synchronization. Existing approved entries are never edited; changed values are reversed and recalculated as pending.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RuleGroup title="Completed order reward"><RuleField label="Minimum verified product subtotal (Rp)" field="collectOrderMinimumProductSubtotalIdr" value={ruleDraft.collectOrderMinimumProductSubtotalIdr} error={ruleErrors.collectOrderMinimumProductSubtotalIdr} onChange={setRule} /><RuleField label="Points per eligible order" field="collectOrderPoints" value={ruleDraft.collectOrderPoints} error={ruleErrors.collectOrderPoints} onChange={setRule} /><div className="rounded-lg bg-surface-panel p-3 text-xs text-muted-foreground">Each eligible completed order rewards the assigned Admin and Florist. One reward per person per order.</div></RuleGroup>
        <RuleGroup title="Attendance penalty suggestions"><RuleField label="Late 1–15 minutes" field="late1To15PenaltyPoints" value={ruleDraft.late1To15PenaltyPoints} error={ruleErrors.late1To15PenaltyPoints} onChange={setRule} /><RuleField label="Late 16–30 minutes" field="late16To30PenaltyPoints" value={ruleDraft.late16To30PenaltyPoints} error={ruleErrors.late16To30PenaltyPoints} onChange={setRule} /><RuleField label="Late over 30 minutes" field="lateOver30PenaltyPoints" value={ruleDraft.lateOver30PenaltyPoints} error={ruleErrors.lateOver30PenaltyPoints} onChange={setRule} /><RuleField label="Missing checkout" field="missingCheckoutPenaltyPoints" value={ruleDraft.missingCheckoutPenaltyPoints} error={ruleErrors.missingCheckoutPenaltyPoints} onChange={setRule} /></RuleGroup>
        <RuleGroup title="Safeguard"><RuleField label="Maximum minus points per payroll period" field="maximumMinusPointsPerPeriod" value={ruleDraft.maximumMinusPointsPerPeriod} error={ruleErrors.maximumMinusPointsPerPeriod} onChange={setRule} /><div className="rounded-lg bg-surface-panel p-3 text-xs text-muted-foreground">Minus points reduce bonus only. They must never reduce the employee's base salary.</div></RuleGroup>
      </div>
      {ruleMessage && <p className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{ruleMessage}</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      <div className="flex justify-end"><button type="button" onClick={saveRules} className="bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Save rules and recalculate</button></div>
    </section>}

    {showAdd && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"><div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-5">
      <h3 className="text-lg font-semibold">Manual point adjustment</h3>
      <label className="space-y-1"><span className="text-xs font-medium">Employee</span><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm">{employees.filter((employee) => employee.status === 'active').map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
      <fieldset className="space-y-2"><legend className="text-xs font-medium">Adjustment type</legend><div className="grid grid-cols-2 gap-2 rounded-full bg-surface-track p-1"><button type="button" onClick={() => setAdjustmentDirection('positive')} className={`h-10 rounded-full text-sm font-semibold ${adjustmentDirection === 'positive' ? 'bg-success/15 text-success shadow-sm' : 'text-muted-foreground'}`}>+ Points</button><button type="button" onClick={() => setAdjustmentDirection('negative')} className={`h-10 rounded-full text-sm font-semibold ${adjustmentDirection === 'negative' ? 'bg-destructive/10 text-destructive shadow-sm' : 'text-muted-foreground'}`}>− Points</button></div></fieldset>
      <label className="space-y-1"><span className="text-xs font-medium">Points</span><input value={points} inputMode="numeric" onChange={(event) => setPoints(event.target.value.replace(/\D/g, ''))} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm"/><span className="block text-2xs text-muted-foreground">Enter a positive whole number. The selected type sets the sign.</span></label>
      <label className="space-y-1"><span className="text-xs font-medium">Reason · Required</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"/></label>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><button onClick={() => { setShowAdd(false); setAdjustmentDirection(null); setError(null) }} className="h-11 rounded-full border border-border px-[18px] text-sm">Cancel</button><button disabled={!adjustmentDirection || !Number(points) || !reason.trim()} onClick={submitAdjustment} className="h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground">{adjustmentDirection && Number(points) ? `Create ${adjustmentDirection === 'positive' ? '+' : '−'}${Number(points)} point entry` : 'Create pending entry'}</button></div>
    </div></div>}

    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"><div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-5"><h3 className="font-semibold capitalize">{action} point entry</h3><p className="text-xs text-muted-foreground">{selected.points > 0 ? '+' : ''}{selected.points} points · {selected.reason}</p><label className="space-y-1"><span className="text-xs">{action === 'approve' ? 'Review note · Optional' : action === 'reject' ? 'Rejection reason · Required' : 'Reversal reason · Required'}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"/></label>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<div className="flex justify-end gap-2"><button onClick={() => setSelected(null)} className="h-11 rounded-full border border-border px-[18px] text-sm">Cancel</button><button onClick={submitReview} className="bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Confirm</button></div></div></div>}
  </section>
}

const ProgressBlock = ({ label, completed, minimum, eligible, pointsEach }: { label: string; completed: number; minimum: number; eligible: number; pointsEach: number }) => {
  const progress = minimum > 0 ? Math.min(100, (completed / minimum) * 100) : 0
  return <div className="mt-3 space-y-1.5"><div className="flex justify-between gap-3 text-xs"><span className="font-medium">{label}</span><span className="text-muted-foreground">{completed} completed · {minimum} included</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><p className="text-2xs text-muted-foreground">{eligible > 0 ? `${eligible} additional × ${pointsEach} points` : `${Math.max(0, minimum - completed)} more before points begin`}</p></div>
}

const RuleGroup = ({ title, children }: { title: string; children: ReactNode }) => <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="text-sm font-semibold leading-5">{title}</h3>{children}</section>

const RuleField = ({ label, field, value, error, onChange }: { label: string; field: keyof OrderContributionRules; value: number; error?: string; onChange: (field: keyof OrderContributionRules, value: string) => void }) => <label className="block space-y-1"><span className="text-xs font-medium">{label}</span><input aria-label={label} inputMode="numeric" value={value} onChange={(event) => onChange(field, event.target.value)} className={`h-10 w-full rounded-lg border bg-background px-3 text-sm ${error ? 'border-destructive ring-1 ring-destructive/30' : 'border-border'}`} />{error && <span className="text-2xs text-destructive">{error}</span>}</label>
