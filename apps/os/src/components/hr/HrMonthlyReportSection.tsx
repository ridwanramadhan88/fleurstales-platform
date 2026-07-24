import { useMemo, useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import type { BranchFilter } from '../../types/orders'
import { useHrStore } from '../../store/hrStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { useHrProblemStore } from '../../store/hrProblemStore'
import { buildHrMonthlyReport, monthlyReportToCsv } from '../../domain/hrMonthlyReportDomain'
import { buildHrProblems, getHrProblemStatus, type HrProblemRecord, type HrProblemSource, type HrProblemStatus } from '../../domain/hrProblemDomain'
import { PeoplePageHeader, PeopleSummaryCard, PeopleSummaryGrid } from './PeopleWorkspaceUI'
import { PeopleMonthPeriodFields } from './PeoplePeriodControls'
import { ChipRow, FilterChip } from '../ui/chip'
import { settingsTabButtonClass, settingsTabTrackClass } from '../settings/SettingsPrimitives'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'

const jakartaMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit' }).format(new Date()).slice(0,7)
type ReportView = 'overview' | 'problems' | 'history'

const REPORT_LABELS: Record<ReportView, string> = {
  overview: 'Overview',
  problems: 'Problem List',
  history: 'History',
}

const SOURCE_LABELS: Record<'all' | HrProblemSource, string> = {
  all: 'All',
  attendance: 'Attendance',
  orders: 'Orders',
  finance: 'Finance',
  scheduling: 'Scheduling',
}

const STATUS_LABELS: Record<HrProblemStatus, string> = {
  open: 'open',
  under_review: 'under review',
  solved: 'completed',
}

export const HrMonthlyReportSection = ({ activeBranch, searchQuery = '', onOpenOrder }: { activeBranch: BranchFilter; searchQuery?: string; onOpenOrder?: (orderNumber:string)=>void }) => {
  const [month, setMonth] = useState(jakartaMonth)
  const [view, setView] = useState<ReportView>('overview')
  const [problemSource, setProblemSource] = useState<'all' | HrProblemSource>('all')
  const [problemStatus, setProblemStatus] = useState<HrProblemStatus>('open')
  const [selectedProblem, setSelectedProblem] = useState<HrProblemRecord | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [problemActionError, setProblemActionError] = useState<string | null>(null)
  const employees = useHrStore((state) => state.employees)
  const attendance = useHrStore((state) => state.attendance)
  const reviewCases = useHrStore((state) => state.attendanceReviewCases)
  const defaults = useHrStore((state) => state.employeeDefaultSchedules)
  const overrides = useHrStore((state) => state.scheduleOverrides)
  const orders = useOrdersStore((state) => state.orders)
  const settings = useSettingsStore()
  const actor = useUserStore((state) => state.name)
  const actorRole = useUserStore((state) => state.role)
  const reviews = useHrProblemStore((state) => state.reviews)
  const reviewAttendanceCase = useHrStore((state) => state.reviewAttendanceCase)
  const setProblemStatusAction = useHrProblemStore((state) => state.setProblemStatus)
  const rows = useMemo(() => buildHrMonthlyReport({ month, employees, attendance, reviewCases, defaults, overrides, settings, branchId:activeBranch }), [month, employees, attendance, reviewCases, defaults, overrides, settings, activeBranch])
  const allProblems = useMemo(() => buildHrProblems({ employees, attendanceCases:reviewCases, orders }), [employees, reviewCases, orders])
  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => [row.employeeName, row.role].some((value) => value.toLowerCase().includes(query)))
  }, [rows, searchQuery])
  const currentProblems = useMemo(() => allProblems.filter((problem) => {
    const status = getHrProblemStatus(problem, reviews[problem.id]?.status)
    const sourceMatches = problemSource === 'all' || problem.source === problemSource
    const statusMatches = view === 'history' ? status === 'solved' : status === problemStatus
    const searchMatches = !searchQuery.trim() || [problem.employeeName, problem.title, problem.relatedOrderNumber].filter(Boolean).some((value)=>String(value).toLowerCase().includes(searchQuery.toLowerCase()))
    return sourceMatches && statusMatches && searchMatches
  }), [allProblems, reviews, problemSource, problemStatus, view, searchQuery])
  const openCount = allProblems.filter((problem) => getHrProblemStatus(problem, reviews[problem.id]?.status) !== 'solved').length
  const totals = useMemo(() => visibleRows.reduce((sum, row) => ({ scheduled:sum.scheduled+row.scheduledDays, present:sum.present+row.presentDays, problems:sum.problems+row.openProblems, missing:sum.missing+row.missingCheckInTasks+row.missingCheckOutTasks }), { scheduled:0, present:0, problems:0, missing:0 }), [visibleRows])
  const selectedEmployee = selectedEmployeeId ? visibleRows.find((row)=>row.employeeId===selectedEmployeeId) ?? null : null

  const exportCsv = () => {
    const blob = new Blob([monthlyReportToCsv(visibleRows)], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fleurstales-hr-${month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const updateProblem = (status:HrProblemStatus) => {
    if (!selectedProblem) return
    setProblemActionError(null)

    if (selectedProblem.source === 'attendance') {
      if (status !== 'solved') return
      const caseId = selectedProblem.id.startsWith('attendance:')
        ? selectedProblem.id.slice('attendance:'.length)
        : ''
      if (!caseId) {
        setProblemActionError('The linked attendance case could not be identified.')
        return
      }
      const result = reviewAttendanceCase({
        caseId,
        decision: 'resolved',
        note: reviewNote,
        actor: { name: actor, role: actorRole },
      })
      if (!result.ok) {
        setProblemActionError(result.reason)
        return
      }
    } else {
      setProblemStatusAction(selectedProblem.id, status, reviewNote, actor)
    }

    setSelectedProblem(null)
    setReviewNote('')
  }

  const resultStatus = view === 'history' ? 'completed' : STATUS_LABELS[problemStatus]

  return <section className="space-y-5 pb-4">
    <PeoplePageHeader section="reports" />

    <nav aria-label="Report sections" className={settingsTabTrackClass({ level:'primary', className:'-mx-4 gap-4 px-4 scroll-px-4 sm:mx-0 sm:gap-5 sm:px-0 sm:scroll-px-0' })}>
      {(['overview','problems','history'] as ReportView[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setView(item)}
          aria-current={view === item ? 'page' : undefined}
          className={settingsTabButtonClass({ active:view===item, level:'primary', className:'h-9 scroll-mx-1 px-0.5 text-sm' })}
        >
          {REPORT_LABELS[item]}{item === 'problems' ? ` · ${openCount}` : ''}
        </button>
      ))}
    </nav>

    {view === 'overview' ? <>
      <div className="flex flex-col gap-3 border-y border-border/60 py-3 md:flex-row md:items-center md:justify-between">
        <PeopleMonthPeriodFields month={month} onMonthChange={setMonth} settings={settings.payroll} className="md:flex-1" />
        <button type="button" onClick={exportCsv} className="h-11 self-end rounded-full bg-foreground px-[18px] text-sm font-semibold text-background md:shrink-0 md:self-auto">Export CSV</button>
      </div>
      <PeopleSummaryGrid className="grid-cols-2 gap-3 sm:grid-cols-4">
        <PeopleSummaryCard className="md:min-h-[76px]" label="Scheduled days" value={totals.scheduled} />
        <PeopleSummaryCard className="md:min-h-[76px]" label="Present days" value={totals.present} tone="success" />
        <PeopleSummaryCard className="md:min-h-[76px]" label="Missing records" value={totals.missing} tone={totals.missing ? 'warning' : 'default'} />
        <PeopleSummaryCard className="md:min-h-[76px]" label="Open problems" value={openCount} tone={openCount ? 'warning' : 'default'} />
      </PeopleSummaryGrid>

      <div className="space-y-3 md:hidden">
        {visibleRows.map((row) => <article key={row.employeeId} className="rounded-xl bg-card p-3.5 ring-1 ring-border/60">
          <button type="button" onClick={()=>setExpandedEmployeeId((current)=>current===row.employeeId?null:row.employeeId)} className="flex w-full items-start justify-between gap-3 text-left">
            <div><h3 className="font-semibold text-foreground">{row.employeeName}</h3><p className="text-sm capitalize text-muted-foreground">{row.role}</p></div>
            <ChevronDown className={`size-5 text-muted-foreground transition ${expandedEmployeeId===row.employeeId?'rotate-180':''}`} />
          </button>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Scheduled</dt><dd className="font-semibold">{row.scheduledDays}</dd></div><div><dt className="text-muted-foreground">Present</dt><dd className="font-semibold">{row.presentDays}</dd></div><div><dt className="text-muted-foreground">Late tasks</dt><dd className="font-semibold">{row.lateTasks}</dd></div><div><dt className="text-muted-foreground">Open problems</dt><dd className="font-semibold">{row.openProblems}</dd></div></dl>
          {expandedEmployeeId===row.employeeId && <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-surface-panel p-3 text-center text-xs"><div>Kedamaian<strong className="mt-1 block text-sm">{row.kedamaianDays}</strong></div><div>Pahoman<strong className="mt-1 block text-sm">{row.pahomanDays}</strong></div><div>OFF<strong className="mt-1 block text-sm">{row.offDays}</strong></div></div>}
          <button type="button" onClick={()=>setSelectedEmployeeId(row.employeeId)} className="mt-3 h-11 rounded-full border border-border px-[18px] text-sm font-medium">View details</button>
        </article>)}
      </div>

      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border/60 md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed text-sm">
            <colgroup>
              <col className="w-[180px]" />
              <col className="w-[92px]" />
              <col className="w-[132px]" />
              <col className="w-[82px]" />
              <col className="w-[72px]" />
              <col className="w-[72px]" />
              <col className="w-[92px]" />
              <col className="w-[132px]" />
              <col className="w-[108px]" />
            </colgroup>
            <thead className="h-11 bg-surface-panel/80 text-left text-xs text-muted-foreground">
              <tr>{['Employee','Scheduled','Branch split','Present','Leave','OFF','Late tasks','Missing punches','Open problems'].map((label)=><th key={label} className={`whitespace-nowrap px-3 py-2 font-medium ${label === 'Employee' ? 'sticky left-0 z-10 bg-surface-panel font-semibold text-foreground' : ''}`}>{label}</th>)}</tr>
            </thead>
            <tbody>{visibleRows.map((row)=><tr key={row.employeeId} onClick={()=>setSelectedEmployeeId(row.employeeId)} className="h-14 cursor-pointer border-t border-border/50 hover:bg-surface-panel/60">
              <td className="sticky left-0 z-10 bg-card px-3 py-2"><p className="font-semibold text-foreground">{row.employeeName}</p><p className="mt-0.5 text-xs capitalize text-muted-foreground">{row.role}</p></td>
              <td className="px-3 py-2 font-medium tabular-nums">{row.scheduledDays}</td>
              <td className="px-3 py-2"><p className="whitespace-nowrap text-xs font-medium text-foreground">KDM {row.kedamaianDays} · PHM {row.pahomanDays}</p></td>
              <td className="px-3 py-2 tabular-nums">{row.presentDays}</td>
              <td className="px-3 py-2 tabular-nums">{row.leaveDays}</td>
              <td className="px-3 py-2 tabular-nums">{row.offDays}</td>
              <td className={`px-3 py-2 tabular-nums ${row.lateTasks ? 'font-medium text-warning' : 'text-muted-foreground'}`}>{row.lateTasks}</td>
              <td className="px-3 py-2"><p className={`whitespace-nowrap text-xs ${row.missingCheckInTasks || row.missingCheckOutTasks ? 'font-medium text-warning' : 'text-muted-foreground'}`}>In {row.missingCheckInTasks} · Out {row.missingCheckOutTasks}</p></td>
              <td className="px-3 py-2"><span className={row.openProblems ? 'rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning' : 'text-muted-foreground'}>{row.openProblems}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </> : <>
      <div className="space-y-2.5">
        {view === 'problems' && <ChipRow activeKey={problemStatus} edge="page">
          <FilterChip active={problemStatus==='open'} onClick={()=>setProblemStatus('open')}>Open</FilterChip>
          <FilterChip active={problemStatus==='under_review'} onClick={()=>setProblemStatus('under_review')}>Under review</FilterChip>
          <FilterChip active={problemStatus==='solved'} onClick={()=>setProblemStatus('solved')}>Completed</FilterChip>
        </ChipRow>}
        <ChipRow activeKey={problemSource} edge="page">
          {(['all','attendance','orders','finance','scheduling'] as const).map((source)=><FilterChip key={source} active={problemSource===source} onClick={()=>setProblemSource(source)}>{SOURCE_LABELS[source]}</FilterChip>)}
        </ChipRow>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
        <p className="text-xs font-medium text-muted-foreground">{currentProblems.length} {resultStatus} {currentProblems.length === 1 ? 'problem' : 'problems'}</p>
      </div>

      <div className="space-y-3">{currentProblems.length ? currentProblems.map((problem)=>{
        const status = getHrProblemStatus(problem, reviews[problem.id]?.status)
        return <article key={problem.id} className="rounded-xl bg-card p-3.5 ring-1 ring-border/60"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{problem.employeeName}</h3><span className={`rounded-full px-2 py-1 text-xs font-medium ${problem.severity==='critical'?'bg-destructive/10 text-destructive':'bg-warning/10 text-warning'}`}>{SOURCE_LABELS[problem.source]}</span></div><p className="mt-1 text-sm text-muted-foreground">{problem.employeeRole} · {problem.title}</p></div><span className="text-xs capitalize text-muted-foreground">{status.replace('_',' ')}</span></div><p className="mt-3 text-sm text-muted-foreground">{problem.description}</p>{problem.relatedOrderNumber && <p className="mt-2 text-xs font-medium">Order {problem.relatedOrderNumber}</p>}<button type="button" onClick={()=>setSelectedProblem(problem)} className="mt-3 h-11 rounded-full border border-border px-[18px] text-sm font-medium">View details</button></article>
      }) : <div className="py-8 text-center"><p className="text-sm font-medium text-foreground">No problems in this view</p><p className="mt-1 text-xs text-muted-foreground">Change the status or type filter to review another group.</p></div>}</div>
    </>}

    <Dialog open={Boolean(selectedProblem)} onOpenChange={(open)=>{if(!open){setSelectedProblem(null);setReviewNote('');setProblemActionError(null)}}}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Problem details</DialogTitle><DialogDescription>{selectedProblem?.employeeName} · {selectedProblem?.employeeRole}</DialogDescription></DialogHeader>{selectedProblem && <div className="space-y-4"><div className="rounded-xl bg-surface-panel p-4"><p className="font-semibold">{selectedProblem.title}</p><p className="mt-2 text-sm text-muted-foreground">{selectedProblem.description}</p></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Source</dt><dd className="font-medium capitalize">{selectedProblem.source}</dd></div><div><dt className="text-muted-foreground">Branch</dt><dd className="font-medium">{selectedProblem.branchId ?? '—'}</dd></div></dl>{selectedProblem.relatedOrderNumber && <button type="button" onClick={()=>onOpenOrder?.(selectedProblem.relatedOrderNumber!)} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-[18px] text-sm font-medium"><ExternalLink className="size-4" />Open related order</button>}<label className="block text-sm font-medium">HR review note · Optional<textarea value={reviewNote} onChange={(event)=>setReviewNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl bg-surface-panel p-3 ring-1 ring-border" /></label>{problemActionError && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{problemActionError}</p>}</div>}<DialogFooter className={`grid gap-2 sm:flex ${selectedProblem?.source === 'attendance' ? 'grid-cols-1' : 'grid-cols-2'}`}>{selectedProblem?.source !== 'attendance' && <button type="button" onClick={()=>updateProblem('under_review')} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium">Under review</button>}<button type="button" onClick={()=>updateProblem('solved')} className="h-11 rounded-full bg-success px-[18px] text-sm font-semibold text-white">Mark solved</button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog open={Boolean(selectedEmployee)} onOpenChange={(open)=>{if(!open)setSelectedEmployeeId(null)}}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Employee monthly report</DialogTitle><DialogDescription>{selectedEmployee?.employeeName} · {selectedEmployee?.role}</DialogDescription></DialogHeader>{selectedEmployee && <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-panel p-4 text-sm"><div>Scheduled<strong className="block text-lg">{selectedEmployee.scheduledDays}</strong></div><div>Present<strong className="block text-lg">{selectedEmployee.presentDays}</strong></div><div>Missing in<strong className="block text-lg">{selectedEmployee.missingCheckInTasks}</strong></div><div>Open problems<strong className="block text-lg">{selectedEmployee.openProblems}</strong></div></dl>}</DialogContent></Dialog>
  </section>
}
