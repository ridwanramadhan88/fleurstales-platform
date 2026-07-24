import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { AlertTriangle, Copy, Download, Ellipsis, LayoutList, Send, Sparkles, Table2 } from 'lucide-react'
import type { BranchFilter } from '../../types/orders'
import { useHrStore } from '../../store/hrStore'
import type { Employee, ScheduleShift } from '../../store/hrStoreTypes'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import {
  canEditScheduling,
  getEffectiveScheduleForDate,
  getMondayForDate,
  getShiftMode,
  getWeekDates,
  summarizeWeeklyCoverage,
  toIsoDate,
} from '../../domain/hrSchedulingDomain'
import { todayIsoDate } from '../../store/hrStore'
import { TimeSelectField } from '../ui/date-time-field'
import { PeoplePageHeader, PeopleSummaryCard } from './PeopleWorkspaceUI'
import { PeoplePeriodNavigation } from './PeoplePeriodControls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { downloadScheduleVectorPdf, type VectorScheduleCell } from '../../lib/vectorPdfExport'

interface Props { activeBranch: BranchFilter; searchQuery?: string }

const roleLabel = (value: string) => value === 'hr' ? 'HR' : value.charAt(0).toUpperCase() + value.slice(1)
const formatDay = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday:'short', day:'2-digit', month:'short' }).format(new Date(`${date}T00:00:00`))
const formatCompactDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'short' }).format(new Date(`${date}T00:00:00`))
const emptyShift = (): ScheduleShift => ({ mode:'off', isWorking:false, branchId:'', startTime:'00:00', endTime:'00:00' })

const weekContextLabel = (weekStart: string) => {
  const currentWeek = toIsoDate(getMondayForDate(todayIsoDate()))
  const current = new Date(`${currentWeek}T00:00:00Z`).getTime()
  const selected = new Date(`${weekStart}T00:00:00Z`).getTime()
  const diffWeeks = Math.round((selected - current) / (7 * 24 * 60 * 60 * 1000))
  if (diffWeeks === 0) return 'This week'
  if (diffWeeks === -1) return 'Last week'
  if (diffWeeks === 1) return 'Next week'
  return ''
}
const isWfhAssignment = (employee: Employee, item?: { shift: ScheduleShift; workMode?: 'onsite'|'wfh' } | null) => employee.systemRole === 'hr' && Boolean(item) && !item!.shift.isWorking && item!.workMode === 'wfh'
const branchTone = (branchId?: string) => branchId === 'Kedamaian'
  ? 'bg-success/15 text-success ring-success/30'
  : branchId === 'Pahoman'
    ? 'bg-info/15 text-info ring-info/30'
    : 'bg-muted/25 text-muted-foreground ring-border/50'

export const HrSchedulingSection: FC<Props> = ({ activeBranch, searchQuery = '' }) => {
  const role = useUserStore((state)=>state.role)
  const actorName = useUserStore((state)=>state.name)
  const employees = useHrStore((state)=>state.employees)
  const overrides = useHrStore((state)=>state.scheduleOverrides)
  const publications = useHrStore((state)=>state.weeklySchedulePublications)
  const revisions = useHrStore((state)=>state.scheduleRevisions ?? [])
  const setOverride = useHrStore((state)=>state.setScheduleOverride)
  const generateWeek = useHrStore((state)=>state.generateWeekFromDefaults)
  const copyPreviousWeek = useHrStore((state)=>state.copyPreviousScheduleWeek)
  const publishWeek = useHrStore((state)=>state.publishScheduleWeek)
  const permissions = useSettingsStore((state)=>state.permissions)
  const branches = useSettingsStore((state)=>state.branches).filter((branch)=>branch.isActive)
  const getSchedulingSettingsForDate = useSettingsStore((state)=>state.getSchedulingSettingsForDate)
  const allBranches = useSettingsStore((state)=>state.branches)
  const canEdit = canEditScheduling(role, permissions)

  const [weekStart,setWeekStart] = useState(()=>toIsoDate(getMondayForDate(todayIsoDate())))
  const [editor,setEditor] = useState<{employee:Employee;date:string;shift:ScheduleShift}|null>(null)
  const [note,setNote] = useState('')
  const [workMode,setWorkMode] = useState<'onsite'|'wfh'>('onsite')
  const [message,setMessage] = useState<string|null>(null)
  const [error,setError] = useState<string|null>(null)
  const [confirmShortage,setConfirmShortage] = useState(false)
  const [isMoreOpen,setIsMoreOpen] = useState(false)
  const [mobileMode,setMobileMode] = useState<'day'|'week'>('day')
  const [selectedDate,setSelectedDate] = useState(()=>todayIsoDate())
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const dayScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isMoreOpen) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node
      if (!moreMenuRef.current?.contains(target) && !moreButtonRef.current?.contains(target)) setIsMoreOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [isMoreOpen])

  const weekDates = useMemo(()=>getWeekDates(weekStart),[weekStart])
  const weekLabel = weekContextLabel(weekStart)

  useEffect(() => {
    const monday = getWeekDates(weekStart)[0]
    setSelectedDate(monday)
    if (typeof dayScrollRef.current?.scrollTo === 'function') dayScrollRef.current.scrollTo({ left: 0, behavior: 'auto' })
    else if (dayScrollRef.current) dayScrollRef.current.scrollLeft = 0
  }, [weekStart])
  const staff = useMemo(()=>employees.filter((employee)=>employee.status==='active' && ['admin','florist','hr'].includes(employee.systemRole) && (!searchQuery.trim() || employee.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))),[employees,searchQuery])
  const settingsForDate = (date:string)=>({ scheduling:getSchedulingSettingsForDate(date), branches:allBranches })
  const publication = publications.find((item)=>item.weekStart===weekStart && item.branchId===activeBranch)

  const employeeSummaries = useMemo(()=>staff.map((employee)=>{
    const cells = weekDates.map((date)=>overrides.find((item)=>item.employeeId===employee.id && item.date===date))
    const work = cells.filter((item)=>item?.shift.isWorking)
    const off = cells.filter((item)=>item && !item.shift.isWorking)
    return { employee, workdays:work.length, offDays:off.length, unassigned:cells.filter((item)=>!item).length,
      kedamaian:work.filter((item)=>item?.shift.branchId==='Kedamaian').length,
      pahoman:work.filter((item)=>item?.shift.branchId==='Pahoman').length }
  }),[staff,weekDates,overrides])

  const coverage = useMemo(()=>summarizeWeeklyCoverage({ employees, dates:weekDates, defaults:[], overrides, settingsForDate, branchIds:activeBranch==='All'?branches.map((b)=>b.id):[activeBranch] }),[employees,weekDates,overrides,activeBranch,branches,getSchedulingSettingsForDate,allBranches])
  const coverageWarnings = coverage.filter((item)=>item.hasShortage)
  const totalOff = employeeSummaries.filter((item)=>item.employee.systemRole!=='hr').reduce((sum,item)=>sum+item.offDays,0)
  const totalUnassigned = employeeSummaries.filter((item)=>item.employee.systemRole!=='hr').reduce((sum,item)=>sum+item.unassigned,0)
  const invalidRest = employeeSummaries.filter((item)=>item.employee.systemRole!=='hr' && item.offDays!==1)
  const hrVisitIssues = employeeSummaries.filter((item)=>item.employee.systemRole==='hr' && item.workdays<3)

  const suggestions = useMemo(()=>coverageWarnings.slice(0,10).map((warning)=>{
    const roleNeeded = warning.adminScheduled < warning.adminRequired ? 'admin' : 'florist'
    const candidates = employeeSummaries
      .filter((item)=>item.employee.systemRole===roleNeeded)
      .filter((item)=>!overrides.some((override)=>override.employeeId===item.employee.id && override.date===warning.date))
      .sort((a,b)=>a.workdays-b.workdays || a.employee.name.localeCompare(b.employee.name)).slice(0,3)
    return { warning, roleNeeded, candidates }
  }),[coverageWarnings,employeeSummaries,overrides])

  const openEditor = (employee:Employee,date:string) => {
    const existing = overrides.find((item)=>item.employeeId===employee.id && item.date===date)
    setEditor({ employee,date,shift:existing?.shift ?? emptyShift() })
    setNote(existing?.note ?? '')
    setWorkMode(existing?.workMode === 'wfh' ? 'wfh' : 'onsite')
  }
  const save = () => {
    if (!editor) return
    const result = setOverride({ employeeId:editor.employee.id,date:editor.date,shift:editor.shift,note,workMode,actor:{name:actorName,role} })
    if (!result.ok) { setError(result.reason); return }
    setEditor(null); setNote(''); setWorkMode('onsite'); setError(null); setMessage('Schedule updated.')
  }
  const generate = () => {
    const result=generateWeek({weekStart,branchId:activeBranch,actor:{name:actorName,role}})
    if(!result.ok){setError(result.reason);return}
    setMessage(`Generated ${result.affected} schedule assignments. Review coverage and adjust exceptions before publishing.`);setError(null)
  }
  const copyPrevious = () => {
    const result=copyPreviousWeek({weekStart,branchId:activeBranch,actor:{name:actorName,role}})
    if(!result.ok){setError(result.reason);return}
    setMessage(`Copied ${result.affected} assignments from the previous week.`);setError(null)
  }
  const publish = (allowCoverageShortage=false) => {
    const result=publishWeek({weekStart,branchId:activeBranch,actor:{name:actorName,role},allowCoverageShortage})
    if(!result.ok){
      if(result.code==='coverage_warning'){setConfirmShortage(true);setError(null);return}
      setError(result.reason);return
    }
    setConfirmShortage(false);setMessage(`Published schedule for ${result.affected} employees.`);setError(null)
  }
  const moveWeek=(days:number)=>{const date=new Date(`${weekStart}T00:00:00`);date.setDate(date.getDate()+days);setWeekStart(toIsoDate(date))}

  const exportPdf = () => {
    try {
      setError(null)
      const status = publication?.status === 'published'
        ? 'Published'
        : publication?.status === 'changed_after_publish'
          ? 'Revision needed'
          : 'Draft'
      const rows = staff.map((employee) => {
        const summary = employeeSummaries.find((item) => item.employee.id === employee.id)!
        const cells: VectorScheduleCell[] = weekDates.map((date) => {
          const explicit = overrides.find((item) => item.employeeId === employee.id && item.date === date)
          if (!explicit) return { kind: 'unassigned' }
          const effective = getEffectiveScheduleForDate({
            employee,
            date,
            defaults: [],
            overrides,
            settings: settingsForDate(date),
          })
          if (!effective.shift.isWorking) {
            return { kind: 'off', label: isWfhAssignment(employee, explicit) ? 'WFH' : 'OFF' }
          }
          return {
            kind: 'shift',
            branch: effective.shift.branchId,
            startTime: effective.shift.startTime,
            endTime: effective.shift.endTime,
          }
        })
        return {
          name: employee.name,
          role: roleLabel(employee.systemRole),
          cells,
          summaryPrimary: employee.systemRole === 'hr'
            ? `${summary.workdays} visits`
            : `${summary.workdays} work · ${summary.offDays} OFF`,
          summarySecondary: `KDM ${summary.kedamaian} · PHM ${summary.pahoman}`,
          warning: employee.systemRole === 'hr' && summary.workdays < 3
            ? 'Needs 3 visits'
            : summary.unassigned > 0 && employee.systemRole !== 'hr'
              ? `${summary.unassigned} unassigned`
              : undefined,
        }
      })
      downloadScheduleVectorPdf({
        title: 'Weekly scheduling',
        subtitle: `${formatDay(weekDates[0])} - ${formatDay(weekDates[6])} · ${activeBranch === 'All' ? 'All branches' : activeBranch}`,
        status,
        dateLabels: weekDates.map(formatDay),
        rows,
        stats: [
          { label: 'Staff', value: staff.length },
          { label: 'OFF', value: totalOff },
          { label: 'Unassigned', value: totalUnassigned },
          { label: 'Coverage warnings', value: coverageWarnings.length },
          { label: 'Rest issues', value: invalidRest.length },
          { label: 'HR visit issues', value: hrVisitIssues.length },
        ],
        coverageWarnings: coverageWarnings.map((item) => ({
          title: `${formatDay(item.date)} · ${item.branchName}`,
          detail: `Admin ${item.adminScheduled}/${item.adminRequired} · Florist ${item.floristScheduled}/${item.floristRequired}`,
        })),
        suggestions: suggestions.map(({ warning, roleNeeded, candidates }) => ({
          title: `${warning.branchName} needs another ${roleLabel(roleNeeded)} on ${formatDay(warning.date)}`,
          detail: candidates.length
            ? `Suggested: ${candidates.map((item) => `${item.employee.name} (${item.workdays} days)`).join(', ')}`
            : 'No conflict-free candidate',
        })),
        revisions: revisions.slice(0, 8).map((revision) => {
          const employee = employees.find((item) => item.id === revision.employeeId)
          return {
            title: `${employee?.name ?? 'Employee'} · ${formatDay(revision.date)}`,
            detail: `${revision.nextShift?.isWorking
              ? `${revision.nextShift.branchId} · ${revision.nextShift.startTime}-${revision.nextShift.endTime}`
              : employee?.systemRole === 'hr' && revision.nextWorkMode === 'wfh'
                ? 'WFH'
                : 'OFF'} · ${revision.reason}`,
            actor: revision.changedBy,
          }
        }),
      }, `fleurstales-schedule-${weekStart}.pdf`)
    } catch {
      setError('Could not create the PDF. Please try again.')
    }
  }

  return <div className="space-y-5 pb-28 md:space-y-6 md:pb-0">
    <PeoplePageHeader
      section="scheduling"
      action={<span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${publication?.status==='published'?'bg-success/10 text-success':publication?.status==='changed_after_publish'?'bg-warning/10 text-warning':'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{publication?.status==='published'?'Published':publication?.status==='changed_after_publish'?'Revision needed':'Draft'}</span>}
    />

    <div className="flex flex-col gap-5 md:gap-4">
      <div className="order-1 no-scrollbar -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-6 md:order-2">
        <PeopleSummaryCard className="w-[112px] min-w-[112px] snap-start sm:w-auto sm:min-w-0 md:min-h-[76px]" label="Staff" value={staff.length} />
        <PeopleSummaryCard className="w-[112px] min-w-[112px] snap-start sm:w-auto sm:min-w-0 md:min-h-[76px]" label="OFF" value={totalOff} />
        <PeopleSummaryCard className="w-[112px] min-w-[112px] snap-start sm:w-auto sm:min-w-0 md:min-h-[76px]" label="Unassigned" value={totalUnassigned} tone={totalUnassigned ? 'warning' : 'default'} />
        <PeopleSummaryCard className="w-[148px] min-w-[148px] snap-start sm:w-auto sm:min-w-0 md:min-h-[76px]" label="Coverage" value={coverageWarnings.length} tone={coverageWarnings.length ? 'warning' : 'default'} />
        <PeopleSummaryCard className="w-[140px] min-w-[140px] snap-start sm:w-auto sm:min-w-0 md:min-h-[76px]" label="Rest issues" value={invalidRest.length} tone={invalidRest.length ? 'warning' : 'default'} />
        <PeopleSummaryCard className="w-[148px] min-w-[148px] snap-start sm:w-auto sm:min-w-0 md:min-h-[76px]" label="HR visits" value={hrVisitIssues.length} tone={hrVisitIssues.length ? 'warning' : 'default'} />
      </div>

      <div className="order-2 space-y-2 md:order-3">
        {message&&<p className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{message}</p>}
        {error&&<p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      </div>

      <section className="order-3 relative space-y-3 border-y border-border/60 py-3 md:order-1 md:grid md:grid-cols-[minmax(0,520px)_auto] md:items-center md:justify-between md:gap-4 md:space-y-0">
        <PeoplePeriodNavigation
          onPrevious={()=>moveWeek(-7)}
          onNext={()=>moveWeek(7)}
          previousLabel="Previous week"
          nextLabel="Next week"
        >
          <button
            type="button"
            onClick={()=>setWeekStart(toIsoDate(getMondayForDate(todayIsoDate())))}
            className="flex h-11 min-w-0 items-center justify-center gap-2 overflow-hidden rounded-full border border-border/90 bg-muted/60 px-3 text-sm font-medium shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:gap-3 sm:px-4"
          >
            {weekLabel && <span className="shrink-0 font-semibold">{weekLabel}</span>}
            {weekLabel && <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border/80" />}
            <span className={`truncate whitespace-nowrap text-xs font-medium sm:text-sm ${weekLabel ? 'text-muted-foreground' : 'text-foreground'}`}>{formatCompactDate(weekDates[0])} – {formatCompactDate(weekDates[6])}</span>
          </button>
        </PeoplePeriodNavigation>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2 md:flex md:w-auto md:shrink-0 md:justify-end">
          {canEdit ? <>
            <button aria-label="Generate new pattern" onClick={generate} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold ring-1 ring-border/70 hover:bg-accent sm:px-[18px] sm:text-sm"><Sparkles className="size-4 shrink-0"/><span className="whitespace-nowrap">Generate pattern</span></button>
            <button onClick={()=>publish(false)} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-[18px]"><Send className="size-4 shrink-0"/><span>Publish</span></button>
          </> : <div className="col-span-2" />}
          <div className="relative">
            <button
              ref={moreButtonRef}
              type="button"
              aria-expanded={isMoreOpen}
              onClick={()=>setIsMoreOpen((open)=>!open)}
              aria-label="More scheduling actions"
              className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border/70 hover:bg-accent hover:text-foreground"
            >
              <Ellipsis className="size-5" />
            </button>
            {isMoreOpen && (
              <div ref={moreMenuRef} className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-xl bg-surface-popover p-1.5 shadow-lg ring-1 ring-border">
                <button onClick={()=>{exportPdf();setIsMoreOpen(false)}} className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-accent"><Download className="size-4"/>Export PDF</button>
                {canEdit && <button onClick={()=>{copyPrevious();setIsMoreOpen(false)}} className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-accent"><Copy className="size-4"/>Copy previous week</button>}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>

    <section className="space-y-4 md:hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div ref={dayScrollRef} className="no-scrollbar flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto">
          {weekDates.map((date)=><button key={date} type="button" onClick={(event)=>{setSelectedDate(date);event.currentTarget.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'})}} className={`inline-flex h-10 w-[104px] shrink-0 snap-start items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-semibold ${selectedDate===date?'bg-foreground text-background':'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{formatDay(date)}</button>)}
        </div>
        <button
          type="button"
          onClick={()=>setMobileMode((current)=>current==='day'?'week':'day')}
          aria-label={mobileMode==='day'?'Show weekly grid':'Show day view'}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-card px-3 text-xs font-semibold text-foreground ring-1 ring-border/70 hover:bg-accent"
        >
          {mobileMode==='day'?<Table2 className="size-4"/>:<LayoutList className="size-4"/>}
          {mobileMode==='day'?'Grid':'Day'}
        </button>
      </div>
      {mobileMode==='day'&&<div className="space-y-2">{staff.map((employee)=>{const explicit=overrides.find((item)=>item.employeeId===employee.id&&item.date===selectedDate);const effective=getEffectiveScheduleForDate({employee,date:selectedDate,defaults:[],overrides,settings:settingsForDate(selectedDate)});const shift=effective.shift;const wfh=isWfhAssignment(employee,explicit);return <button key={employee.id} type="button" disabled={!canEdit} onClick={()=>openEditor(employee,selectedDate)} className="flex min-h-20 w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-left ring-1 ring-border/60"><div className="min-w-0"><p className="truncate text-sm font-semibold">{employee.name}</p><p className="text-xs text-muted-foreground">{roleLabel(employee.systemRole)}</p></div><div className={`shrink-0 rounded-lg px-3 py-2 text-right ring-1 ${!explicit?'bg-muted/45 text-muted-foreground ring-border/50':shift.isWorking?branchTone(shift.branchId):wfh?'bg-accent/70 text-accent-foreground ring-border/60':'bg-secondary/80 text-secondary-foreground ring-border/60'}`}>{!explicit?<><p className="text-xs font-semibold">Not assigned</p></>:shift.isWorking?<><p className="text-xs font-semibold">{shift.branchId}</p><p className="text-[11px]">{shift.startTime}–{shift.endTime}</p></>:<p className="text-xs font-semibold">{wfh?'WFH':'OFF'}</p>}</div></button>})}</div>}
    </section>

    <div className={`${mobileMode === 'week' ? 'block' : 'hidden'} relative w-full min-w-0 overflow-hidden rounded-xl bg-card ring-1 ring-border/60 md:block`}>
      <div className="no-scrollbar w-full overscroll-x-contain overflow-x-auto pb-3">
        <table className="w-[1042px] min-w-[1042px] table-fixed border-separate border-spacing-0 text-[10px] xl:w-full xl:min-w-0">
          <colgroup>
            <col className="w-[148px]" />
            {weekDates.map((date)=><col key={date} className="w-[112px]" />)}
            <col className="w-[110px]" />
          </colgroup>
          <thead className="sticky top-0 z-20"><tr className="h-[52px] bg-surface-panel text-muted-foreground"><th className="sticky left-0 top-0 z-30 w-[148px] bg-muted px-3 text-left text-xs font-semibold text-foreground shadow-[1px_0_0_hsl(var(--border))]">Employee</th>{weekDates.map((date)=><th key={date} className="w-[112px] px-2 text-left text-[11px] font-medium">{formatDay(date)}</th>)}<th className="w-[110px] px-2 text-left text-[11px] font-medium">Summary</th></tr></thead>
          <tbody>{staff.map((employee)=>{const summary=employeeSummaries.find((item)=>item.employee.id===employee.id)!;return <tr key={employee.id} className="h-[68px]"><td className="sticky left-0 z-10 w-[148px] bg-card px-3 py-1.5 shadow-[1px_0_0_hsl(var(--border))]"><p className="truncate text-[13px] font-semibold leading-tight">{employee.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{roleLabel(employee.systemRole)}</p></td>{weekDates.map((date)=>{const explicit=overrides.find((item)=>item.employeeId===employee.id&&item.date===date);const effective=getEffectiveScheduleForDate({employee,date,defaults:[],overrides,settings:settingsForDate(date)});const shift=effective.shift;const wfh=isWfhAssignment(employee,explicit);return <td key={date} className="w-[112px] p-1"><button disabled={!canEdit} onClick={()=>openEditor(employee,date)} className={`h-[56px] w-full overflow-hidden rounded-lg px-2.5 py-1.5 text-left leading-tight ring-1 transition-colors ${!explicit?'bg-muted/45 text-muted-foreground ring-border/50':shift.isWorking?branchTone(shift.branchId):wfh?'bg-accent/70 text-accent-foreground ring-border/60':'bg-secondary/80 text-secondary-foreground ring-border/60'}`}>{!explicit?<strong className="block truncate text-xs">Not assigned</strong>:shift.isWorking?<><strong className="block truncate text-xs leading-tight">{shift.branchId}</strong><span className="mt-1 block whitespace-nowrap text-[11px] font-medium leading-tight opacity-80">{shift.startTime}-{shift.endTime}</span></>:<strong className="text-xs">{wfh?'WFH':'OFF'}</strong>}</button></td>})}<td className="w-[110px] px-2 py-1.5"><p className="truncate whitespace-nowrap text-[11px] font-semibold">{employee.systemRole==='hr'?`${summary.workdays} visits`:`${summary.workdays} work · ${summary.offDays} OFF`}</p><p className="mt-1 truncate text-2xs text-muted-foreground">KDM {summary.kedamaian} · PHM {summary.pahoman}</p>{summary.unassigned>0&&employee.systemRole!=='hr'&&<p className="mt-1 truncate text-2xs font-medium text-warning">{summary.unassigned} unassigned</p>}{employee.systemRole==='hr'&&summary.workdays<3&&<p className="mt-1 truncate text-2xs font-medium text-destructive">Needs 3 visits</p>}</td></tr>})}</tbody>
        </table>
      </div>
    </div>

    <section className={`grid gap-3 ${coverageWarnings.length ? 'lg:grid-cols-2' : ''}`}>
      {coverageWarnings.length > 0 && <div className="rounded-xl bg-card p-4 ring-1 ring-border/60"><h3 className="text-sm font-semibold leading-5">Coverage warnings</h3><div className="mt-2 space-y-1.5">{coverageWarnings.slice(0,10).map((item)=><div key={`${item.date}-${item.branchId}`} className="flex items-start gap-2 rounded-lg bg-warning/10 p-2 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0"/><div><strong>{formatDay(item.date)} · {item.branchName}</strong><p>Admin {item.adminScheduled}/{item.adminRequired} · Florist {item.floristScheduled}/{item.floristRequired}</p></div></div>)}</div></div>}
      <div className="rounded-xl bg-card p-4 ring-1 ring-border/60"><h3 className="text-sm font-semibold leading-5">Assignment suggestions</h3><div className="mt-2 space-y-2">{suggestions.length===0?<p className="text-xs text-muted-foreground">Generated roster currently meets minimum staffing.</p>:suggestions.map(({warning,roleNeeded,candidates})=><div key={`${warning.date}-${warning.branchId}-${roleNeeded}`} className="rounded-lg bg-muted/35 p-2 text-xs"><p className="font-semibold">{warning.branchName} needs another {roleLabel(roleNeeded)} on {formatDay(warning.date)}</p><p className="mt-0.5 text-muted-foreground">Suggested: {candidates.length?candidates.map((item)=>`${item.employee.name} (${item.workdays} days)`).join(', '):'No conflict-free candidate'}</p></div>)}</div></div>
    </section>

    {revisions.length>0&&<section className="rounded-xl bg-card p-4 ring-1 ring-border/60"><h3 className="text-sm font-semibold leading-5">Schedule revision history</h3><div className="mt-2 space-y-1.5">{revisions.slice(0,8).map((revision)=>{const employee=employees.find((item)=>item.id===revision.employeeId);return <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/35 px-3 py-2 text-xs"><div><p className="font-semibold">{employee?.name ?? 'Employee'} · {formatDay(revision.date)}</p><p className="text-muted-foreground">{revision.nextShift?.isWorking?`${revision.nextShift.branchId} · ${revision.nextShift.startTime}-${revision.nextShift.endTime}`:(employee?.systemRole==='hr'&&revision.nextWorkMode==='wfh'?'WFH':'OFF')} · {revision.reason}</p></div><p className="text-2xs text-muted-foreground">{revision.changedBy}</p></div>})}</div></section>}

    <Dialog open={Boolean(editor)} onOpenChange={(open)=>{if(!open)setEditor(null)}}><DialogContent>{editor&&<><DialogHeader><DialogTitle>{editor.employee.name} · {formatDay(editor.date)}</DialogTitle><DialogDescription>{editor.employee.systemRole==='hr'?'Choose a branch visit and time, or set the day to WFH. HR needs at least 3 visit days each week.':'Choose one branch or set this day as weekly OFF.'}</DialogDescription></DialogHeader><ShiftEditor employee={editor.employee} shift={editor.shift} setShift={(shift)=>setEditor((current)=>current?{...current,shift}:current)} branches={branches} note={note} setNote={setNote} workMode={workMode} setWorkMode={setWorkMode} revisionReasonRequired={Boolean(publication)}/><DialogFooter><button onClick={()=>setEditor(null)} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium hover:bg-accent">Cancel</button><button onClick={save} className="bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Save assignment</button></DialogFooter></>}</DialogContent></Dialog>

    <Dialog open={confirmShortage} onOpenChange={setConfirmShortage}><DialogContent><DialogHeader><DialogTitle>Publish with coverage warnings?</DialogTitle><DialogDescription>{coverageWarnings.length} branch-day assignment(s) are below the minimum of 1 Admin and 2 Florists. HR may continue, but the shortage will remain visible.</DialogDescription></DialogHeader><div className="max-h-48 space-y-1 overflow-auto rounded-lg bg-warning/10 p-3 text-xs text-warning">{coverageWarnings.map((item)=><p key={`${item.date}-${item.branchId}`}>{formatDay(item.date)} · {item.branchName}: Admin {item.adminScheduled}/{item.adminRequired}, Florist {item.floristScheduled}/{item.floristRequired}</p>)}</div><DialogFooter><button onClick={()=>setConfirmShortage(false)} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium hover:bg-accent">Review schedule</button><button onClick={()=>publish(true)} className="h-11 rounded-full bg-warning px-[18px] text-sm font-semibold text-warning-foreground hover:bg-warning">Publish anyway</button></DialogFooter></DialogContent></Dialog>
  </div>
}


const ShiftEditor:FC<{employee:Employee;shift:ScheduleShift;setShift:(shift:ScheduleShift)=>void;branches:Array<{id:string;name:string}>;note:string;setNote:(value:string)=>void;workMode:'onsite'|'wfh';setWorkMode:(value:'onsite'|'wfh')=>void;revisionReasonRequired:boolean}>=({employee,shift,setShift,branches,note,setNote,workMode,setWorkMode,revisionReasonRequired})=>{
  const mode=getShiftMode(shift)
  const hasBranch=(branchId:string)=>branches.some((branch)=>branch.id===branchId)
  const selectBranch=(branchId:string)=>{
    const isKedamaian=branchId==='Kedamaian'; const isAdmin=employee.systemRole==='admin'; const isHr=employee.systemRole==='hr'
    const startTime=isHr ? (isKedamaian?'12:00':'14:00') : isKedamaian ? (isAdmin?'07:30':'07:00') : '10:00'
    const endTime=isHr ? (isKedamaian?'13:00':'15:00') : isKedamaian ? (isAdmin?'16:30':'16:00') : '19:00'
    setShift({...shift,mode:'custom',isWorking:true,branchId,startTime,endTime})
  }
  return <div className="space-y-4"><div className="grid grid-cols-3 gap-2">
    <button type="button" disabled={!hasBranch('Kedamaian')} onClick={()=>selectBranch('Kedamaian')} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${shift.isWorking&&shift.branchId==='Kedamaian'?'bg-success text-success-foreground':'bg-success/10 text-success ring-1 ring-success/20'}`}>Kedamaian</button>
    <button type="button" disabled={!hasBranch('Pahoman')} onClick={()=>selectBranch('Pahoman')} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${shift.isWorking&&shift.branchId==='Pahoman'?'bg-info text-info-foreground':'bg-info/10 text-info ring-1 ring-info/20'}`}>Pahoman</button>
    {employee.systemRole==='hr'?<button type="button" onClick={()=>{setShift(emptyShift());setWorkMode(workMode==='wfh'?'onsite':'wfh')}} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${!shift.isWorking&&workMode==='wfh'?'bg-secondary text-secondary-foreground':'bg-muted text-foreground ring-1 ring-border'}`}>WFH {workMode==='wfh'?'On':'Off'}</button>:<button type="button" onClick={()=>{setShift(emptyShift());setNote('Weekly rest')}} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${!shift.isWorking?'bg-secondary text-secondary-foreground':'bg-muted text-foreground ring-1 ring-border'}`}>OFF</button>}
  </div>
  {mode!=='off'&&<div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs text-muted-foreground">Start</span><TimeSelectField value={shift.startTime} onChange={(startTime)=>setShift({...shift,mode:'custom',startTime})}/></label><label className="space-y-1"><span className="text-xs text-muted-foreground">End</span><TimeSelectField value={shift.endTime} onChange={(endTime)=>setShift({...shift,mode:'custom',endTime})}/></label></div>}
  <label className="block space-y-1"><span className="text-xs text-muted-foreground">{revisionReasonRequired ? 'Revision reason · Required' : 'Note · Optional'}</span><input value={note} onChange={(event)=>setNote(event.target.value)} className="h-10 w-full rounded-lg bg-background px-3 text-sm ring-1 ring-border"/></label></div>
}
